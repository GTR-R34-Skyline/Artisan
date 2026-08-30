import { supabase } from '../lib/supabase';
import { CraftsmanProfile, MarketplaceListing } from '../types/marketplace';

const PUBLIC_STATUSES = ['approved', 'published', 'synced'];
const PRODUCT_SELECT = `
  id,
  vendor_id,
  title,
  title_en,
  description_en,
  raw_description,
  category,
  material,
  original_image_url,
  studio_image_url,
  enhanced_image_url,
  final_price,
  suggested_price,
  quantity,
  stock_count,
  status,
  created_at,
  updated_at,
  artisan:profiles (
    id,
    full_name,
    location_state,
    preferred_language
  )
`;

const normalizeListing = (row: unknown): MarketplaceListing => {
  const source = row as Record<string, unknown>;
  const artisanValue = Array.isArray(source.artisan) ? source.artisan[0] : source.artisan;
  return { ...source, artisan: artisanValue || null } as unknown as MarketplaceListing;
};

export const getMarketplaceListings = async (): Promise<MarketplaceListing[]> => {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .in('status', PUBLIC_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeListing);
};

export const getMarketplaceListing = async (productId: string): Promise<MarketplaceListing | null> => {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', productId)
    .in('status', PUBLIC_STATUSES)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeListing(data) : null;
};

export const getCraftsmanProfile = async (craftsmanId: string): Promise<CraftsmanProfile | null> => {
  const [{ data: profile, error: profileError }, { data: vendor, error: vendorError }, { data: products, error: productsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, location_state, preferred_language')
      .eq('id', craftsmanId)
      .maybeSingle(),
    supabase
      .from('vendors')
      .select('craft_type, verification_status')
      .eq('id', craftsmanId)
      .maybeSingle(),
    supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('vendor_id', craftsmanId)
      .in('status', PUBLIC_STATUSES)
      .order('created_at', { ascending: false }),
  ]);

  if (profileError) throw profileError;
  if (vendorError) throw vendorError;
  if (productsError) throw productsError;
  if (!profile) return null;

  return {
    ...profile,
    craft_type: vendor?.craft_type || null,
    verification_status: vendor?.verification_status || null,
    products: (products || []).map(normalizeListing),
  } as CraftsmanProfile;
};
