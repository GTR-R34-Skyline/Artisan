import { MarketplaceProduct } from './marketplace';

export type RevenueRange = '7d' | '30d' | '90d' | 'all';
export type ProductPerformanceSort = 'best_selling' | 'highest_revenue' | 'lowest_stock' | 'highest_rated';
export type RecommendationKind = 'restock' | 'price' | 'offer' | 'visibility';

export interface RevenuePoint {
  key: string;
  label: string;
  revenue: number;
}

export interface ProductPerformanceRow {
  product: MarketplaceProduct;
  unitsSold: number;
  revenue: number;
  stock: number;
  averageRating: number | null;
  reviewCount: number;
  price: number | null;
}

export interface BusinessRecommendation {
  id: string;
  product: MarketplaceProduct;
  kind: RecommendationKind;
  title: string;
  message: string;
}

export interface ReviewEntry {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string | null;
  product: MarketplaceProduct | null;
  reviewerName: string | null;
}

export interface VendorAnalytics {
  products: MarketplaceProduct[];
  craftType: string | null;
  totalRevenue: number;
  productsSold: number;
  totalOrders: number;
  currentStock: number;
  averageRating: number | null;
  reviewCount: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  revenueByRange: Record<RevenueRange, RevenuePoint[]>;
  productRows: ProductPerformanceRow[];
  recommendations: BusinessRecommendation[];
  recentReviews: ReviewEntry[];
  warning: string | null;
}
