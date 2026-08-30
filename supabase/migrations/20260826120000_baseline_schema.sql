-- Create custom roles/types check if not exists
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('vendor', 'consumer', 'admin')),
  full_name text,
  phone_number text,
  preferred_language text CHECK (preferred_language IN ('hi', 'bn', 'ta', 'te', 'en', 'kn')),
  location_state text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  craft_type text,
  gi_certified boolean DEFAULT false,
  verification_status text NOT NULL CHECK (verification_status IN ('pending', 'verified', 'rejected')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Products table (combines Stage 1 and Stage 2/3 columns and constraints)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_image_url text,
  studio_image_url text,
  raw_audio_url text,
  language_used text,
  title_en text,
  title_hi text,
  description_en text,
  description_hi text,
  category text,
  materials_cost numeric,
  labor_days integer,
  suggested_price numeric,
  final_price numeric,
  stock_count integer DEFAULT 1,
  status text NOT NULL CHECK (status IN ('draft', 'processing', 'pending_review', 'approved', 'rejected', 'published', 'under_review', 'synced')) DEFAULT 'draft',
  gi_tag_number text,
  created_at timestamptz DEFAULT now(),
  
  -- Stage 2/3 extensions
  title text,
  material text,
  raw_description text,
  quantity integer DEFAULT 1,
  material_cost numeric,
  labour_days integer,
  updated_at timestamptz DEFAULT now(),
  enhanced_image_url text,
  enhancement_status text DEFAULT 'idle' CHECK (enhancement_status IN ('idle', 'processing', 'completed', 'failed')),
  last_transcript text,
  conversation_state jsonb,
  catalog_status text DEFAULT 'in_progress'
);

-- Profiles triggers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone_number, preferred_language, location_state)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'consumer'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.phone, new.raw_user_meta_data->>'phone_number', ''),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'en'),
    coalesce(new.raw_user_meta_data->>'location_state', '')
  );

  IF (coalesce(new.raw_user_meta_data->>'role', 'consumer')) = 'vendor' THEN
    INSERT INTO public.vendors (id, craft_type, gi_certified, verification_status)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'craft_type',
      coalesce((new.raw_user_meta_data->>'gi_certified')::boolean, false),
      'pending'
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Legacy / Application structural tables
CREATE TABLE IF NOT EXISTS public.vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('guide', 'marketplace')),
  description text,
  specialties text[],
  languages text[],
  experience_years integer,
  location text,
  cost_per_day numeric,
  cost_per_hour numeric,
  profile_image_url text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  type text,
  description text,
  image_path text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------
-- RLS Policies
-- ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Profiles
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY "Allow users to update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow users to insert own profile" ON public.profiles FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins have full access to profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Vendors
CREATE POLICY "Allow public read verified vendors" ON public.vendors FOR SELECT TO public USING (verification_status = 'verified');
CREATE POLICY "Allow vendors to read own vendor details" ON public.vendors FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Allow vendors to insert own vendor details" ON public.vendors FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow vendors to update own vendor details" ON public.vendors FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins have full access to vendors" ON public.vendors FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Anyone can register as vendor" ON public.vendors FOR INSERT TO public WITH CHECK (true);

-- Products
CREATE POLICY "Allow public read products" ON public.products FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert products" ON public.products FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update products" ON public.products FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Vendor Applications
CREATE POLICY "Anyone can create applications" ON public.vendor_applications FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can view their own applications" ON public.vendor_applications FOR SELECT TO public USING (email = (auth.jwt() ->> 'email'));
CREATE POLICY "Service role can manage applications" ON public.vendor_applications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins have full access to applications" ON public.vendor_applications FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Customer Reviews
CREATE POLICY "Anyone can view reviews" ON public.customer_reviews FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can create reviews" ON public.customer_reviews FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Service role can manage reviews" ON public.customer_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Marketplace
CREATE POLICY "Allow public read marketplace" ON public.marketplace FOR SELECT TO public USING (true);
CREATE POLICY "Admins have full access to marketplace" ON public.marketplace FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------
-- Storage Buckets & Policies Setup
-- ----------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('product-raw-media', 'product-raw-media', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-processed-media', 'product-processed-media', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('marketplace-images', 'marketplace-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vendor-images', 'vendor-images', true) ON CONFLICT DO NOTHING;

-- Storage policies (product-raw-media)
CREATE POLICY "Allow public read of product-raw-media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'product-raw-media');
CREATE POLICY "Allow authenticated upload of product-raw-media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-raw-media');
CREATE POLICY "Allow owners to delete raw media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-raw-media' AND owner = auth.uid());

-- Storage policies (product-processed-media)
CREATE POLICY "Allow public read of product-processed-media" ON storage.objects FOR SELECT TO public USING (bucket_id = 'product-processed-media');
CREATE POLICY "Allow authenticated upload of product-processed-media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-processed-media');
CREATE POLICY "Allow owners to delete processed media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-processed-media' AND owner = auth.uid());

-- Storage policies (marketplace-images)
CREATE POLICY "Allow public read of marketplace-images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'marketplace-images');
CREATE POLICY "Allow vendor uploads to own folder" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'marketplace-images' AND name LIKE 'originals/' || auth.uid()::text || '/%');
CREATE POLICY "Allow vendor update/delete own folder" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'marketplace-images' AND name LIKE 'originals/' || auth.uid()::text || '/%') WITH CHECK (bucket_id = 'marketplace-images' AND name LIKE 'originals/' || auth.uid()::text || '/%');
CREATE POLICY "Allow vendor uploads to own enhanced folder" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'marketplace-images' AND name LIKE 'enhanced/' || auth.uid()::text || '/%');
CREATE POLICY "Allow vendor update/delete own enhanced folder" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'marketplace-images' AND name LIKE 'enhanced/' || auth.uid()::text || '/%') WITH CHECK (bucket_id = 'marketplace-images' AND name LIKE 'enhanced/' || auth.uid()::text || '/%');
CREATE POLICY "Allow public upload to marketplace-images" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'marketplace-images');
CREATE POLICY "Allow public manage marketplace-images" ON storage.objects FOR ALL TO public USING (bucket_id = 'marketplace-images') WITH CHECK (bucket_id = 'marketplace-images');

-- Storage policies (vendor-images)
CREATE POLICY "Allow public read of vendor-images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'vendor-images');
CREATE POLICY "Allow public upload to vendor-images" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'vendor-images');
CREATE POLICY "Allow public manage vendor-images" ON storage.objects FOR ALL TO public USING (bucket_id = 'vendor-images') WITH CHECK (bucket_id = 'vendor-images');
