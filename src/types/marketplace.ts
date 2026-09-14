export type ProductStatus =
  | 'draft'
  | 'processing'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'under_review'
  | 'synced';

export interface MarketplaceProduct {
  id: string;
  vendor_id: string | null;
  title: string | null;
  title_en: string | null;
  description_en: string | null;
  raw_description: string | null;
  category: string | null;
  material: string | null;
  original_image_url: string | null;
  studio_image_url: string | null;
  enhanced_image_url: string | null;
  enhancement_status?: 'idle' | 'processing' | 'completed' | 'failed' | null;
  final_price: number | null;
  suggested_price: number | null;
  quantity: number | null;
  stock_count: number | null;
  material_cost?: number | null;
  labour_days?: number | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string | null;
}

export interface MarketplaceProfile {
  id: string;
  full_name: string | null;
  location_state: string | null;
  preferred_language: string | null;
}

export interface MarketplaceListing extends MarketplaceProduct {
  artisan: MarketplaceProfile | null;
}

export interface CraftsmanProfile extends MarketplaceProfile {
  craft_type: string | null;
  verification_status: string | null;
  products: MarketplaceListing[];
}

export const getProductTitle = (product: MarketplaceProduct) =>
  product.title_en || product.title || 'Untitled work';

export const getProductDescription = (product: MarketplaceProduct) =>
  product.description_en || product.raw_description || 'The maker has not added a description yet.';

export const getProductImage = (product: MarketplaceProduct) =>
  product.studio_image_url || product.enhanced_image_url || product.original_image_url;

export const getProductPrice = (product: MarketplaceProduct) =>
  product.final_price ?? product.suggested_price;
