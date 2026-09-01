import { supabase } from '../lib/supabase';
import {
  ADMIN_LOW_STOCK_THRESHOLD,
  AdminActivityItem,
  AdminAnalytics,
  AdminCategoryRow,
  AdminProductRow,
  AdminReviewRow,
  AdminSalesPoint,
  AdminVendorRow,
  NamedCount,
  RevenueRange,
} from '../types/adminAnalytics';
import { MarketplaceProduct } from '../types/marketplace';

const COMPLETED_ORDER_STATUSES = new Set(['delivered', 'completed', 'complete', 'fulfilled']);
const PUBLISHED_PRODUCT_STATUSES = new Set(['approved', 'published', 'synced']);

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asList = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asRecord(item));
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toStringValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toDate = (value: unknown): Date | null => {
  const raw = toStringValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const localDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date): Date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const formatDayLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);

const formatMonthLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' }).format(date);

const unique = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const isSuccessfulPayment = (status: string | null): boolean =>
  Boolean(status && ['success', 'succeeded', 'paid', 'completed'].includes(status.toLowerCase()));

const isCompletedStatus = (status: string | null): boolean =>
  Boolean(status && COMPLETED_ORDER_STATUSES.has(status.toLowerCase()));

const productStock = (product: Pick<MarketplaceProduct, 'stock_count' | 'quantity'>): number =>
  toNumber(product.stock_count ?? product.quantity);

const productTitle = (product: Pick<MarketplaceProduct, 'title' | 'title_en'> | undefined): string =>
  product?.title_en || product?.title || 'Untitled work';

const readErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return error instanceof Error ? error.message : 'Unknown error';
};

const fetchTable = async (table: string, run: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>) => {
  const { data, error } = await run();
  if (error) throw new Error(`${table}: ${error.message || readErrorMessage(error)}`);
  return asList(data);
};

const countBy = (values: Array<string | null>, labels?: Record<string, string>): NamedCount[] => {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const key = value || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, label: labels?.[key] || key, count }));
};

const hasSubtotalValue = (row: Record<string, unknown>): boolean =>
  row.subtotal !== null && row.subtotal !== undefined && String(row.subtotal).trim() !== '';

const lineRevenue = (row: Record<string, unknown>, quantity: number, unitPrice: number): number => {
  if (hasSubtotalValue(row)) return Math.max(0, toNumber(row.subtotal));
  return Math.max(0, quantity * unitPrice);
};

interface CompletedSaleLine {
  id: string | null;
  orderId: string;
  productId: string | null;
  vendorId: string | null;
  quantity: number;
  revenue: number;
  orderStatus: string | null;
  occurredAt: Date | null;
}

const buildSalesSeries = (items: CompletedSaleLine[]): Record<RevenueRange, AdminSalesPoint[]> => {
  const now = startOfDay(new Date());
  const dated = items
    .map((item) => item.occurredAt)
    .filter((date): date is Date => Boolean(date));
  const earliest = dated.length
    ? dated.reduce((min, date) => (date < min ? date : min), dated[0])
    : now;

  const ranges: Record<RevenueRange, { start: Date; end: Date; mode: 'day' | 'week' | 'month' }> = {
    '7d': { start: addDays(now, -6), end: now, mode: 'day' },
    '30d': { start: addDays(now, -29), end: now, mode: 'day' },
    '90d': { start: addDays(now, -89), end: now, mode: 'week' },
    all: {
      start: startOfDay(earliest),
      end: now,
      mode: (now.getTime() - startOfDay(earliest).getTime()) / 86400000 > 120
        ? 'month'
        : (now.getTime() - startOfDay(earliest).getTime()) / 86400000 > 45
          ? 'week'
          : 'day',
    },
  };

  const series = {} as Record<RevenueRange, AdminSalesPoint[]>;

  (Object.keys(ranges) as RevenueRange[]).forEach((range) => {
    const { start, end, mode } = ranges[range];
    const buckets = new Map<string, { label: string; revenue: number; units: number; orderIds: Set<string>; order: number }>();

    const cursor = new Date(start);
    let index = 0;
    while (cursor <= end) {
      let key: string;
      let label: string;
      let step = 1;

      if (mode === 'month') {
        key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        label = formatMonthLabel(cursor);
        cursor.setMonth(cursor.getMonth() + 1, 1);
        step = 0;
      } else if (mode === 'week') {
        const weekStart = startOfDay(cursor);
        key = localDateKey(weekStart);
        label = formatDayLabel(weekStart);
        cursor.setDate(cursor.getDate() + 7);
        step = 0;
      } else {
        key = localDateKey(cursor);
        label = formatDayLabel(cursor);
      }

      buckets.set(key, { label, revenue: 0, units: 0, orderIds: new Set(), order: index });
      index += 1;
      if (step) cursor.setDate(cursor.getDate() + step);
    }

    items.forEach((item) => {
      const occurred = item.occurredAt ? startOfDay(item.occurredAt) : null;
      if (!occurred || occurred < start || occurred > end) return;

      let key: string;
      if (mode === 'month') {
        key = `${occurred.getFullYear()}-${String(occurred.getMonth() + 1).padStart(2, '0')}`;
      } else if (mode === 'week') {
        const weekStart = new Date(start);
        const diff = Math.floor((occurred.getTime() - weekStart.getTime()) / 86400000);
        const bucketIndex = Math.max(0, Math.floor(diff / 7));
        key = localDateKey(addDays(weekStart, bucketIndex * 7));
      } else {
        key = localDateKey(occurred);
      }

      const bucket = buckets.get(key);
      if (!bucket) return;
      bucket.revenue += item.revenue;
      bucket.units += item.quantity;
      if (item.orderId) bucket.orderIds.add(item.orderId);
    });

    series[range] = Array.from(buckets.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, bucket]) => ({
        key,
        label: bucket.label,
        revenue: bucket.revenue,
        units: bucket.units,
        orders: bucket.orderIds.size,
      }));
  });

  return series;
};

const asProduct = (row: Record<string, unknown>): MarketplaceProduct => ({
  id: toStringValue(row.id) || '',
  vendor_id: toStringValue(row.vendor_id),
  title: toStringValue(row.title),
  title_en: toStringValue(row.title_en),
  description_en: toStringValue(row.description_en),
  raw_description: toStringValue(row.raw_description),
  category: toStringValue(row.category),
  material: toStringValue(row.material),
  original_image_url: toStringValue(row.original_image_url),
  studio_image_url: toStringValue(row.studio_image_url),
  enhanced_image_url: toStringValue(row.enhanced_image_url),
  final_price: row.final_price == null ? null : toNumber(row.final_price),
  suggested_price: row.suggested_price == null ? null : toNumber(row.suggested_price),
  quantity: row.quantity == null ? null : toNumber(row.quantity),
  stock_count: row.stock_count == null ? null : toNumber(row.stock_count),
  status: (toStringValue(row.status) || 'draft') as MarketplaceProduct['status'],
  created_at: toStringValue(row.created_at) || '',
  updated_at: toStringValue(row.updated_at),
});

export const loadAdminAnalytics = async (): Promise<AdminAnalytics> => {
  const [
    profileRows,
    vendorRowsRaw,
    applicationRows,
    productRowsRaw,
    orderRows,
    orderItemRows,
    paymentRows,
    reviewRows,
  ] = await Promise.all([
    fetchTable('profiles', () => supabase.from('profiles').select('id, role, full_name, created_at')),
    fetchTable('vendors', () => supabase.from('vendors').select('id, craft_type, verification_status, created_at')),
    fetchTable('vendor_applications', () =>
      supabase.from('vendor_applications').select('id, name, email, status, service_type, location, created_at').order('created_at', { ascending: false }),
    ),
    fetchTable('products', () =>
      supabase.from('products').select('id, vendor_id, title, title_en, category, material, status, stock_count, quantity, final_price, suggested_price, original_image_url, studio_image_url, enhanced_image_url, description_en, raw_description, created_at, updated_at').order('created_at', { ascending: false }),
    ),
    fetchTable('orders', () => supabase.from('orders').select('id, status, buyer_id, total_amount, created_at, updated_at')),
    fetchTable('order_items', () => supabase.from('order_items').select('id, order_id, product_id, vendor_id, quantity, unit_price, subtotal, created_at')),
    fetchTable('payments', () => supabase.from('payments').select('id, order_id, status, payment_method, upi_app, amount, created_at')),
    fetchTable('customer_reviews', () => supabase.from('customer_reviews').select('id, vendor_id, product_id, consumer_id, rating, comment, created_at').order('created_at', { ascending: false })),
  ]);

  const products = productRowsRaw.map(asProduct).filter((product) => product.id);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const profilesById = new Map(profileRows.map((row) => [toStringValue(row.id) || '', row]));
  const vendorsById = new Map(vendorRowsRaw.map((row) => [toStringValue(row.id) || '', row]));

  const roleValues = profileRows.map((row) => toStringValue(row.role));
  const users = {
    total: profileRows.length,
    buyers: roleValues.filter((role) => role === 'consumer').length,
    vendors: roleValues.filter((role) => role === 'vendor').length,
    admins: roleValues.filter((role) => role === 'admin').length,
    byRole: countBy(roleValues, { consumer: 'Buyers', vendor: 'Vendors', admin: 'Admins' }),
  };

  const verificationValues = vendorRowsRaw.map((row) => toStringValue(row.verification_status));
  const vendors = {
    total: vendorRowsRaw.length,
    verified: verificationValues.filter((status) => status === 'verified').length,
    pending: verificationValues.filter((status) => status === 'pending').length,
    rejected: verificationValues.filter((status) => status === 'rejected').length,
  };

  const applicationStatuses = applicationRows.map((row) => toStringValue(row.status));
  const applications = {
    total: applicationRows.length,
    pending: applicationStatuses.filter((status) => status === 'pending').length,
    approved: applicationStatuses.filter((status) => status === 'approved').length,
    rejected: applicationStatuses.filter((status) => status === 'rejected').length,
  };

  const published = products.filter((product) => PUBLISHED_PRODUCT_STATUSES.has(product.status)).length;
  const draft = products.filter((product) => product.status === 'draft').length;
  const pendingReview = products.filter((product) => product.status === 'pending_review' || product.status === 'under_review').length;
  const stocks = products.map((product) => productStock(product));
  const productMetrics = {
    total: products.length,
    published,
    draft,
    unpublished: products.length - published,
    pendingReview,
    totalStock: stocks.reduce((sum, stock) => sum + stock, 0),
    lowStock: stocks.filter((stock) => stock <= ADMIN_LOW_STOCK_THRESHOLD).length,
  };

  const orderStatuses = orderRows.map((row) => toStringValue(row.status));
  const ordersById = new Map(orderRows.map((row) => [toStringValue(row.id) || '', row]));
  const orderMetrics = {
    total: orderRows.length,
    completed: orderStatuses.filter((status) => isCompletedStatus(status)).length,
    processing: orderStatuses.filter((status) => status === 'processing').length,
    shipped: orderStatuses.filter((status) => status === 'shipped').length,
    cancelled: orderStatuses.filter((status) => status === 'cancelled' || status === 'canceled').length,
    byStatus: countBy(orderStatuses),
  };

  const completedItems: CompletedSaleLine[] = orderItemRows.map((row) => {
    const orderId = toStringValue(row.order_id) || '';
    const order = ordersById.get(orderId) || {};
    const quantity = Math.max(0, toNumber(row.quantity ?? row.qty));
    const unitPrice = toNumber(row.unit_price || row.price || row.item_price);
    return {
      id: toStringValue(row.id),
      orderId,
      productId: toStringValue(row.product_id),
      vendorId: toStringValue(row.vendor_id) || toStringValue(productsById.get(toStringValue(row.product_id) || '')?.vendor_id),
      quantity,
      revenue: lineRevenue(row, quantity, unitPrice),
      orderStatus: toStringValue(order.status),
      occurredAt: toDate(order.created_at) || toDate(row.created_at),
    };
  }).filter((item) => isCompletedStatus(item.orderStatus));

  const revenue = completedItems.reduce((sum, item) => sum + item.revenue, 0);
  const unitsSold = completedItems.reduce((sum, item) => sum + item.quantity, 0);
  const completedOrderCount = orderMetrics.completed;
  const sales = {
    revenue,
    unitsSold,
    completedOrderCount,
    averageOrderValue: completedOrderCount ? revenue / completedOrderCount : 0,
    byRange: buildSalesSeries(completedItems),
  };

  const paymentStatuses = paymentRows.map((row) => toStringValue(row.status));
  const paymentMethods = paymentRows.map((row) => toStringValue(row.upi_app) || toStringValue(row.payment_method));
  const paymentAmount = (row: Record<string, unknown>) => Math.max(0, toNumber(row.amount));
  const payments = {
    successful: paymentStatuses.filter((status) => isSuccessfulPayment(status)).length,
    failed: paymentStatuses.filter((status) => status === 'failed').length,
    pending: paymentStatuses.filter((status) => status === 'pending').length,
    cancelled: paymentStatuses.filter((status) => status === 'cancelled' || status === 'canceled').length,
    successfulAmount: paymentRows
      .filter((row) => isSuccessfulPayment(toStringValue(row.status)))
      .reduce((sum, row) => sum + paymentAmount(row), 0),
    pendingAmount: paymentRows
      .filter((row) => toStringValue(row.status) === 'pending')
      .reduce((sum, row) => sum + paymentAmount(row), 0),
    failedAmount: paymentRows
      .filter((row) => toStringValue(row.status) === 'failed')
      .reduce((sum, row) => sum + paymentAmount(row), 0),
    totalAmount: paymentRows.reduce((sum, row) => sum + paymentAmount(row), 0),
    byStatus: countBy(paymentStatuses),
    byMethod: countBy(paymentMethods),
  };

  const soldByProduct = new Map<string, { units: number; revenue: number }>();
  const soldByVendor = new Map<string, { units: number; revenue: number; orderIds: Set<string> }>();
  const soldByCategory = new Map<string, { units: number; revenue: number }>();

  completedItems.forEach((item) => {
    if (item.productId) {
      const current = soldByProduct.get(item.productId) || { units: 0, revenue: 0 };
      current.units += item.quantity;
      current.revenue += item.revenue;
      soldByProduct.set(item.productId, current);

      const category = productsById.get(item.productId)?.category || 'Uncategorised';
      const categoryCurrent = soldByCategory.get(category) || { units: 0, revenue: 0 };
      categoryCurrent.units += item.quantity;
      categoryCurrent.revenue += item.revenue;
      soldByCategory.set(category, categoryCurrent);
    }

    if (item.vendorId) {
      const current = soldByVendor.get(item.vendorId) || { units: 0, revenue: 0, orderIds: new Set<string>() };
      current.units += item.quantity;
      current.revenue += item.revenue;
      if (item.orderId) current.orderIds.add(item.orderId);
      soldByVendor.set(item.vendorId, current);
    }
  });

  const ratings = reviewRows
    .map((row) => Math.round(toNumber(row.rating)))
    .filter((rating) => rating >= 1 && rating <= 5);
  const reviewCount = ratings.length;
  const averageRating = reviewCount ? ratings.reduce((sum, rating) => sum + rating, 0) / reviewCount : null;

  const reviewsByProduct = new Map<string, number[]>();
  const reviewsByVendor = new Map<string, number[]>();
  reviewRows.forEach((row) => {
    const rating = Math.round(toNumber(row.rating));
    if (rating < 1 || rating > 5) return;
    const productId = toStringValue(row.product_id);
    const vendorId = toStringValue(row.vendor_id);
    if (productId) {
      const list = reviewsByProduct.get(productId) || [];
      list.push(rating);
      reviewsByProduct.set(productId, list);
    }
    if (vendorId) {
      const list = reviewsByVendor.get(vendorId) || [];
      list.push(rating);
      reviewsByVendor.set(vendorId, list);
    }
  });

  const averageFrom = (values: number[] | undefined): number | null =>
    values && values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const productPerformance: AdminProductRow[] = products.map((product) => {
    const sold = soldByProduct.get(product.id) || { units: 0, revenue: 0 };
    const productRatings = reviewsByProduct.get(product.id);
    return {
      product,
      unitsSold: sold.units,
      revenue: sold.revenue,
      stock: productStock(product),
      averageRating: averageFrom(productRatings),
      reviewCount: productRatings?.length || 0,
    };
  });

  const productsByVendor = new Map<string, number>();
  products.forEach((product) => {
    if (!product.vendor_id) return;
    productsByVendor.set(product.vendor_id, (productsByVendor.get(product.vendor_id) || 0) + 1);
  });

  const vendorIds = unique([
    ...vendorRowsRaw.map((row) => toStringValue(row.id)),
    ...soldByVendor.keys(),
    ...products.map((product) => product.vendor_id),
  ]);

  const vendorPerformance: AdminVendorRow[] = vendorIds.map((id) => {
    const vendor = vendorsById.get(id) || {};
    const profile = profilesById.get(id) || {};
    const sold = soldByVendor.get(id) || { units: 0, revenue: 0, orderIds: new Set<string>() };
    const vendorRatings = reviewsByVendor.get(id);
    return {
      id,
      name: toStringValue(profile.full_name) || 'Unnamed artisan',
      craftType: toStringValue(vendor.craft_type),
      verificationStatus: toStringValue(vendor.verification_status),
      productCount: productsByVendor.get(id) || 0,
      unitsSold: sold.units,
      revenue: sold.revenue,
      completedOrders: sold.orderIds.size,
      averageRating: averageFrom(vendorRatings),
      reviewCount: vendorRatings?.length || 0,
    };
  });

  const categoryRows: AdminCategoryRow[] = Array.from(new Set([
    ...products.map((product) => product.category || 'Uncategorised'),
    ...soldByCategory.keys(),
  ])).map((category) => {
    const sold = soldByCategory.get(category) || { units: 0, revenue: 0 };
    return {
      category,
      productCount: products.filter((product) => (product.category || 'Uncategorised') === category).length,
      unitsSold: sold.units,
      revenue: sold.revenue,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const recentReviews: AdminReviewRow[] = reviewRows.slice(0, 8).map((row) => {
    const product = productsById.get(toStringValue(row.product_id) || '');
    const vendorId = toStringValue(row.vendor_id);
    const consumerId = toStringValue(row.consumer_id);
    return {
      id: toStringValue(row.id) || crypto.randomUUID(),
      rating: Math.max(1, Math.min(5, Math.round(toNumber(row.rating)))),
      comment: toStringValue(row.comment),
      createdAt: toStringValue(row.created_at),
      productTitle: product ? productTitle(product) : null,
      vendorName: vendorId ? toStringValue(profilesById.get(vendorId)?.full_name) : null,
      reviewerName: consumerId ? toStringValue(profilesById.get(consumerId)?.full_name) : null,
    };
  });

  const activity: AdminActivityItem[] = [
    ...orderRows.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 8).map((row) => ({
      id: `order-${toStringValue(row.id)}`,
      kind: 'order' as const,
      title: `Order ${toStringValue(row.status) || 'updated'}`,
      detail: toStringValue(row.id)?.slice(0, 8) || 'Order',
      createdAt: toStringValue(row.created_at),
    })),
    ...paymentRows.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 8).map((row) => ({
      id: `payment-${toStringValue(row.id)}`,
      kind: 'payment' as const,
      title: `Payment ${toStringValue(row.status) || 'recorded'}`,
      detail: [
        toStringValue(row.upi_app) || toStringValue(row.payment_method),
        paymentAmount(row) ? `₹${Math.round(paymentAmount(row)).toLocaleString('en-IN')}` : null,
      ].filter(Boolean).join(' · ') || 'Payment',
      createdAt: toStringValue(row.created_at),
    })),
    ...applicationRows.slice(0, 8).map((row) => ({
      id: `application-${toStringValue(row.id)}`,
      kind: 'application' as const,
      title: toStringValue(row.name) || 'Vendor application',
      detail: `${toStringValue(row.status) || 'pending'} · ${toStringValue(row.location) || 'India'}`,
      createdAt: toStringValue(row.created_at),
    })),
    ...products.slice(0, 8).map((product) => ({
      id: `product-${product.id}`,
      kind: 'product' as const,
      title: productTitle(product),
      detail: product.status.replace('_', ' '),
      createdAt: product.created_at,
    })),
    ...reviewRows.slice(0, 8).map((row) => ({
      id: `review-${toStringValue(row.id)}`,
      kind: 'review' as const,
      title: `${Math.round(toNumber(row.rating))} star review`,
      detail: toStringValue(row.comment) || 'Rating submitted',
      createdAt: toStringValue(row.created_at),
    })),
  ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 12);

  return {
    users,
    vendors,
    applications,
    products: productMetrics,
    orders: orderMetrics,
    sales,
    payments,
    reviews: {
      total: reviewCount,
      averageRating,
      recent: recentReviews,
    },
    productRows: productPerformance,
    vendorRows: vendorPerformance,
    categoryRows,
    lowStockProducts: productPerformance
      .filter((row) => row.stock <= ADMIN_LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8),
    recentActivity: activity,
    warning: null,
  };
};
