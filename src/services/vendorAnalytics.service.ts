import { supabase } from '../lib/supabase';
import {
  BusinessRecommendation,
  ProductPerformanceRow,
  RevenuePoint,
  RevenueRange,
  ReviewEntry,
  VendorAnalytics,
} from '../types/analytics';
import { getProductPrice, MarketplaceProduct } from '../types/marketplace';

const COMPLETED_ORDER_STATUSES = new Set(['delivered', 'completed', 'complete', 'fulfilled']);

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

const productStock = (product: MarketplaceProduct): number =>
  toNumber(product.stock_count ?? product.quantity);

const isCompletedStatus = (status: string | null): boolean =>
  Boolean(status && COMPLETED_ORDER_STATUSES.has(status.toLowerCase()));

const unique = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const readErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return error instanceof Error ? error.message : 'Unknown error';
};

interface CommerceItem {
  orderId: string;
  productId: string | null;
  quantity: number;
  unitPrice: number;
  orderStatus: string | null;
  occurredAt: Date | null;
  paymentStatus: string | null;
}

const fetchTable = async (
  table: string,
  run: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
) => {
  try {
    const { data, error } = await run();
    if (error) throw error;
    return asList(data);
  } catch (error) {
    throw new Error(`${table}: ${readErrorMessage(error)}`);
  }
};

const buildRevenueSeries = (items: CommerceItem[]): Record<RevenueRange, RevenuePoint[]> => {
  const completed = items.filter((item) => isCompletedStatus(item.orderStatus));
  const now = startOfDay(new Date());

  const dated = completed
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
      mode: (now.getTime() - startOfDay(earliest).getTime()) / 86400000 > 120 ? 'month' : (now.getTime() - startOfDay(earliest).getTime()) / 86400000 > 45 ? 'week' : 'day',
    },
  };

  const series = {} as Record<RevenueRange, RevenuePoint[]>;

  (Object.keys(ranges) as RevenueRange[]).forEach((range) => {
    const { start, end, mode } = ranges[range];
    const buckets = new Map<string, { label: string; revenue: number; order: number }>();

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

      buckets.set(key, { label, revenue: 0, order: index });
      index += 1;
      if (step) cursor.setDate(cursor.getDate() + step);
    }

    completed.forEach((item) => {
      const occurred = item.occurredAt ? startOfDay(item.occurredAt) : null;
      if (!occurred || occurred < start || occurred > end) return;

      let key: string;
      if (mode === 'month') {
        key = `${occurred.getFullYear()}-${String(occurred.getMonth() + 1).padStart(2, '0')}`;
      } else if (mode === 'week') {
        const weekStart = new Date(start);
        const diff = Math.floor((occurred.getTime() - weekStart.getTime()) / 86400000);
        const bucketIndex = Math.max(0, Math.floor(diff / 7));
        const bucketDate = addDays(weekStart, bucketIndex * 7);
        key = localDateKey(bucketDate);
      } else {
        key = localDateKey(occurred);
      }

      const bucket = buckets.get(key);
      if (bucket) bucket.revenue += item.quantity * item.unitPrice;
    });

    series[range] = Array.from(buckets.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, bucket]) => ({ key, label: bucket.label, revenue: bucket.revenue }));
  });

  return series;
};

const percentileThreshold = (values: number[], percentile: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentile * sorted.length) - 1));
  return sorted[index];
};

const buildRecommendations = (rows: ProductPerformanceRow[]): BusinessRecommendation[] => {
  if (!rows.length) return [];

  const soldValues = rows.map((row) => row.unitsSold);
  const hasSalesActivity = soldValues.some((value) => value > 0);
  const highSales = Math.max(percentileThreshold(soldValues, 0.75), 3);
  const lowSales = Math.min(percentileThreshold(soldValues, 0.35), 1);
  const now = Date.now();

  const recommendations: BusinessRecommendation[] = [];

  rows.forEach((row) => {
    const listedAt = toDate(row.product.created_at);
    const ageDays = listedAt ? Math.max(1, Math.round((now - listedAt.getTime()) / 86400000)) : 30;
    const velocity = row.unitsSold / ageDays;
    const strongRating = (row.averageRating ?? 0) >= 4.5 && row.reviewCount > 0;
    const decentRating = (row.averageRating ?? 0) >= 4 || row.reviewCount === 0;
    const lowStock = row.stock <= 5;
    const enoughStock = row.stock >= 8;
    const strongSales = hasSalesActivity && row.unitsSold >= highSales && row.unitsSold > 0;
    const weakSales = hasSalesActivity && row.unitsSold <= lowSales;
    const highVelocity = velocity >= 0.2 && strongSales;

    if (strongSales && lowStock) {
      recommendations.push({
        id: `${row.product.id}-restock`,
        product: row.product,
        kind: 'restock',
        title: 'Restock soon',
        message: `${row.unitsSold} sold with only ${row.stock} left. Bring more of this piece in before the next inquiry.`,
      });
      return;
    }

    if (highVelocity && enoughStock && decentRating) {
      recommendations.push({
        id: `${row.product.id}-price`,
        product: row.product,
        kind: 'price',
        title: 'Consider a small price increase',
        message: 'This piece is moving quickly. A modest price adjustment could lift earnings without slowing demand.',
      });
      return;
    }

    if (strongRating && weakSales) {
      recommendations.push({
        id: `${row.product.id}-visibility`,
        product: row.product,
        kind: 'visibility',
        title: 'Good product — consider improving visibility',
        message: 'Buyers who find this work rate it highly. A stronger photograph or clearer title may help more people see it.',
      });
      return;
    }

    if (weakSales && enoughStock && row.stock > 0) {
      recommendations.push({
        id: `${row.product.id}-offer`,
        product: row.product,
        kind: 'offer',
        title: 'Consider an offer',
        message: 'Sales are quiet and stock is healthy. A short seasonal offer could help this piece find its next home.',
      });
    }
  });

  const order: Record<BusinessRecommendation['kind'], number> = {
    restock: 0,
    price: 1,
    visibility: 2,
    offer: 3,
  };

  return recommendations.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 8);
};

export const loadVendorAnalytics = async (vendorId: string): Promise<VendorAnalytics> => {
  const warnings: string[] = [];

  const { data: productData, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (productError) throw productError;

  const products = (productData || []) as MarketplaceProduct[];
  const productIds = products.map((product) => product.id);
  const productsById = new Map(products.map((product) => [product.id, product]));

  let craftType: string | null = null;
  try {
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, craft_type, verification_status')
      .eq('id', vendorId)
      .maybeSingle();
    if (vendorError) throw vendorError;
    craftType = toStringValue(asRecord(vendor).craft_type);
  } catch {
    warnings.push('Studio details could not be loaded.');
  }

  let orderItemRows: Record<string, unknown>[] = [];
  let orderRows: Record<string, unknown>[] = [];
  let paymentRows: Record<string, unknown>[] = [];
  let loadedPrivilegedCommerce = false;

  try {
    const { data, error } = await supabase.functions.invoke('vendor-commerce', {
      body: { vendorId },
    });
    if (error) throw error;
    const payload = asRecord(data);
    const nested = asRecord(payload.data);
    const body = payload.success ? payload : nested.success ? nested : payload;
    if (body.success) {
      orderItemRows = asList(body.orderItems);
      orderRows = asList(body.orders);
      paymentRows = asList(body.payments);
      loadedPrivilegedCommerce = orderItemRows.length > 0 || Array.isArray(body.orderItems);
    }
  } catch {
    // Fall back to direct table reads when the session can see commerce rows.
  }

  if (!loadedPrivilegedCommerce) {
    let vendorItemsFailed = false;
    let productItemsFailed = false;

    try {
      orderItemRows = await fetchTable('order_items', () =>
        supabase.from('order_items').select('*').eq('vendor_id', vendorId),
      );
    } catch {
      vendorItemsFailed = true;
    }

    if (productIds.length) {
      try {
        const itemsByProduct = await fetchTable('order_items', () =>
          supabase.from('order_items').select('*').in('product_id', productIds),
        );
        const merged = new Map<string, Record<string, unknown>>();
        [...orderItemRows, ...itemsByProduct].forEach((row) => {
          const id = toStringValue(row.id) || `${toStringValue(row.order_id)}:${toStringValue(row.product_id)}`;
          if (id) merged.set(id, row);
        });
        orderItemRows = Array.from(merged.values());
      } catch {
        productItemsFailed = true;
      }
    }

    if (!orderItemRows.length && vendorItemsFailed && productItemsFailed) {
      warnings.push('Order history could not be loaded.');
    }

    const fallbackOrderIds = unique(orderItemRows.map((row) => toStringValue(row.order_id)));
    if (fallbackOrderIds.length) {
      try {
        orderRows = await fetchTable('orders', () =>
          supabase.from('orders').select('*').in('id', fallbackOrderIds),
        );
      } catch {
        warnings.push('Completed order details could not be loaded.');
      }

      try {
        paymentRows = await fetchTable('payments', () =>
          supabase.from('payments').select('*').in('order_id', fallbackOrderIds),
        );
      } catch {
        warnings.push('Payment records could not be loaded.');
      }
    }
  }

  let reviewRows: Record<string, unknown>[] = [];
  try {
    reviewRows = await fetchTable('customer_reviews', () =>
      supabase.from('customer_reviews').select('*').eq('vendor_id', vendorId).order('created_at', { ascending: false }),
    );
  } catch {
    try {
      reviewRows = await fetchTable('customer_reviews', () =>
        supabase.from('customer_reviews').select('*').eq('vendor_id', vendorId),
      );
    } catch {
      warnings.push('Reviews could not be loaded.');
    }
  }

  const consumerIds = unique(reviewRows.map((row) => toStringValue(row.consumer_id) || toStringValue(row.buyer_id) || toStringValue(row.customer_id)));
  const profilesById = new Map<string, string>();
  if (consumerIds.length) {
    try {
      const profileRows = await fetchTable('profiles', () =>
        supabase.from('profiles').select('id, full_name').in('id', consumerIds),
      );
      profileRows.forEach((row) => {
        const id = toStringValue(row.id);
        if (id) profilesById.set(id, toStringValue(row.full_name) || 'A collector');
      });
    } catch {
      // Reviewer names are optional.
    }
  }

  const ordersById = new Map(orderRows.map((row) => [toStringValue(row.id) || '', row]));
  const paymentsByOrderId = new Map<string, Record<string, unknown>>();
  paymentRows.forEach((row) => {
    const orderId = toStringValue(row.order_id);
    if (orderId && !paymentsByOrderId.has(orderId)) paymentsByOrderId.set(orderId, row);
  });

  const commerceItems: CommerceItem[] = orderItemRows.map((row) => {
    const orderId = toStringValue(row.order_id) || '';
    const order = ordersById.get(orderId) || {};
    const payment = paymentsByOrderId.get(orderId) || {};
    const productId = toStringValue(row.product_id);
    const product = productId ? productsById.get(productId) : undefined;
    const unitPrice = toNumber(row.unit_price || row.price || row.item_price) || (product ? toNumber(getProductPrice(product)) : 0);

    return {
      orderId,
      productId,
      quantity: Math.max(0, toNumber(row.quantity ?? row.qty)),
      unitPrice,
      orderStatus: toStringValue(order.status),
      occurredAt:
        toDate(order.created_at) ||
        toDate(order.placed_at) ||
        toDate(order.updated_at) ||
        toDate(payment.created_at) ||
        toDate(row.created_at),
      paymentStatus: toStringValue(payment.status),
    };
  });

  const completedItems = commerceItems.filter((item) => isCompletedStatus(item.orderStatus));
  const totalRevenue = completedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const productsSold = completedItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalOrders = unique(completedItems.map((item) => item.orderId)).length;
  const currentStock = products.reduce((sum, product) => sum + productStock(product), 0);

  const ratings = reviewRows
    .map((row) => Math.round(toNumber(row.rating)))
    .filter((rating) => rating >= 1 && rating <= 5);

  const ratingDistribution: VendorAnalytics['ratingDistribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratings.forEach((rating) => {
    ratingDistribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
  });

  const reviewCount = ratings.length;
  const averageRating = reviewCount ? ratings.reduce((sum, rating) => sum + rating, 0) / reviewCount : null;

  const reviewsByProduct = new Map<string, number[]>();
  reviewRows.forEach((row) => {
    const productId = toStringValue(row.product_id);
    const rating = Math.round(toNumber(row.rating));
    if (!productId || rating < 1 || rating > 5) return;
    const list = reviewsByProduct.get(productId) || [];
    list.push(rating);
    reviewsByProduct.set(productId, list);
  });

  const soldByProduct = new Map<string, { units: number; revenue: number }>();
  completedItems.forEach((item) => {
    if (!item.productId) return;
    const current = soldByProduct.get(item.productId) || { units: 0, revenue: 0 };
    current.units += item.quantity;
    current.revenue += item.quantity * item.unitPrice;
    soldByProduct.set(item.productId, current);
  });

  const productRows: ProductPerformanceRow[] = products.map((product) => {
    const sold = soldByProduct.get(product.id) || { units: 0, revenue: 0 };
    const productRatings = reviewsByProduct.get(product.id) || [];
    return {
      product,
      unitsSold: sold.units,
      revenue: sold.revenue,
      stock: productStock(product),
      averageRating: productRatings.length
        ? productRatings.reduce((sum, rating) => sum + rating, 0) / productRatings.length
        : null,
      reviewCount: productRatings.length,
      price: getProductPrice(product),
    };
  });

  const recentReviews: ReviewEntry[] = reviewRows.slice(0, 8).map((row) => {
    const productId = toStringValue(row.product_id);
    const consumerId = toStringValue(row.consumer_id) || toStringValue(row.buyer_id) || toStringValue(row.customer_id);
    return {
      id: toStringValue(row.id) || crypto.randomUUID(),
      rating: Math.max(1, Math.min(5, Math.round(toNumber(row.rating)))),
      comment: toStringValue(row.comment) || toStringValue(row.review) || toStringValue(row.message),
      createdAt: toStringValue(row.created_at),
      product: productId ? productsById.get(productId) || null : null,
      reviewerName: consumerId ? profilesById.get(consumerId) || null : toStringValue(row.customer_name),
    };
  });

  return {
    products,
    craftType,
    totalRevenue,
    productsSold,
    totalOrders,
    currentStock,
    averageRating,
    reviewCount,
    ratingDistribution,
    revenueByRange: buildRevenueSeries(commerceItems),
    productRows,
    recommendations: buildRecommendations(productRows),
    recentReviews,
    warning: warnings.length ? warnings.join(' ') : null,
  };
};
