import { RevenueRange } from './analytics';
import { MarketplaceProduct } from './marketplace';

export const ADMIN_LOW_STOCK_THRESHOLD = 5;

export type { RevenueRange };

export interface AdminSalesPoint {
  key: string;
  label: string;
  revenue: number;
  units: number;
  orders: number;
}

export interface NamedCount {
  key: string;
  label: string;
  count: number;
}

export interface AdminProductRow {
  product: MarketplaceProduct;
  unitsSold: number;
  revenue: number;
  stock: number;
  averageRating: number | null;
  reviewCount: number;
}

export interface AdminVendorRow {
  id: string;
  name: string;
  craftType: string | null;
  verificationStatus: string | null;
  productCount: number;
  unitsSold: number;
  revenue: number;
  completedOrders: number;
  averageRating: number | null;
  reviewCount: number;
}

export interface AdminCategoryRow {
  category: string;
  productCount: number;
  unitsSold: number;
  revenue: number;
}

export interface AdminReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string | null;
  productTitle: string | null;
  vendorName: string | null;
  reviewerName: string | null;
}

export interface AdminActivityItem {
  id: string;
  kind: 'order' | 'application' | 'product' | 'review' | 'payment';
  title: string;
  detail: string;
  createdAt: string | null;
}

export interface AdminAnalytics {
  users: {
    total: number;
    buyers: number;
    vendors: number;
    admins: number;
    byRole: NamedCount[];
  };
  vendors: {
    total: number;
    verified: number;
    pending: number;
    rejected: number;
  };
  applications: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  products: {
    total: number;
    published: number;
    draft: number;
    unpublished: number;
    pendingReview: number;
    totalStock: number;
    lowStock: number;
  };
  orders: {
    total: number;
    completed: number;
    processing: number;
    shipped: number;
    cancelled: number;
    byStatus: NamedCount[];
  };
  sales: {
    revenue: number;
    unitsSold: number;
    completedOrderCount: number;
    averageOrderValue: number;
    byRange: Record<RevenueRange, AdminSalesPoint[]>;
  };
  payments: {
    successful: number;
    failed: number;
    pending: number;
    cancelled: number;
    successfulAmount: number;
    pendingAmount: number;
    failedAmount: number;
    totalAmount: number;
    byStatus: NamedCount[];
    byMethod: NamedCount[];
  };
  reviews: {
    total: number;
    averageRating: number | null;
    recent: AdminReviewRow[];
  };
  productRows: AdminProductRow[];
  vendorRows: AdminVendorRow[];
  categoryRows: AdminCategoryRow[];
  lowStockProducts: AdminProductRow[];
  recentActivity: AdminActivityItem[];
  warning: string | null;
}
