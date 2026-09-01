import { supabase } from '../lib/supabase';
import { ProductReview, ProductReviewSummary, ReviewDraft, ReviewEligibility } from '../types/reviews';

export const COMPLETED_ORDER_STATUSES = new Set(['delivered', 'completed', 'complete', 'fulfilled']);
export const MIN_REVIEW_COMMENT = 8;
export const MAX_REVIEW_COMMENT = 2000;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toStringValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const isCompletedOrderStatus = (status: string | null | undefined): boolean =>
  Boolean(status && COMPLETED_ORDER_STATUSES.has(status.trim().toLowerCase()));

export const formatReviewDate = (value: string | null): string => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

export const validateReviewDraft = (draft: ReviewDraft): string | null => {
  const rating = Math.round(draft.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return 'Please choose a rating from 1 to 5.';
  }

  const comment = draft.comment.trim();
  if (comment.length < MIN_REVIEW_COMMENT) {
    return 'Please write a short note about the piece.';
  }
  if (comment.length > MAX_REVIEW_COMMENT) {
    return 'Please keep your review under 2,000 characters.';
  }

  return null;
};

const reviewerNameFromEmbed = (value: unknown): string | null => {
  const source = Array.isArray(value) ? value[0] : value;
  return toStringValue(asRecord(source).full_name);
};

const mapReview = (row: Record<string, unknown>, fallbackName?: string | null): ProductReview => ({
  id: toStringValue(row.id) || '',
  productId: toStringValue(row.product_id) || '',
  vendorId: toStringValue(row.vendor_id),
  consumerId: toStringValue(row.consumer_id),
  orderId: toStringValue(row.order_id),
  rating: Math.max(1, Math.min(5, Math.round(toNumber(row.rating)))),
  comment: toStringValue(row.comment),
  createdAt: toStringValue(row.created_at),
  reviewerName: reviewerNameFromEmbed(row.reviewer) || fallbackName || null,
});

const summarize = (reviews: ProductReview[]): ProductReviewSummary => {
  const ratings = reviews.map((review) => review.rating).filter((rating) => rating >= 1 && rating <= 5);
  return {
    reviews,
    reviewCount: ratings.length,
    averageRating: ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
  };
};

export const getProductReviews = async (productId: string): Promise<ProductReviewSummary> => {
  const { data, error } = await supabase
    .from('customer_reviews')
    .select('id, vendor_id, product_id, consumer_id, order_id, rating, comment, created_at, reviewer:profiles!customer_reviews_consumer_id_fkey(full_name)')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) {
    const fallback = await supabase
      .from('customer_reviews')
      .select('id, vendor_id, product_id, consumer_id, order_id, rating, comment, created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (fallback.error) throw fallback.error;

    const rows = (fallback.data || []).map((row) => asRecord(row));
    const consumerIds = Array.from(
      new Set(rows.map((row) => toStringValue(row.consumer_id)).filter((id): id is string => Boolean(id))),
    );

    const names = new Map<string, string>();
    if (consumerIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', consumerIds);
      (profiles || []).forEach((profile) => {
        const id = toStringValue(asRecord(profile).id);
        const name = toStringValue(asRecord(profile).full_name);
        if (id && name) names.set(id, name);
      });
    }

    return summarize(rows.map((row) => mapReview(row, toStringValue(row.consumer_id) ? names.get(toStringValue(row.consumer_id) || '') || null : null)));
  }

  return summarize((data || []).map((row) => mapReview(asRecord(row))));
};

export const getReviewEligibility = async (productId: string, userId: string | null | undefined): Promise<ReviewEligibility> => {
  if (!userId) {
    return { canSubmit: false, orderId: null, existingReview: null };
  }

  const [{ data: orderRows, error: orderError }, { data: existingRow, error: existingError }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, order_items!inner(product_id)')
      .eq('buyer_id', userId)
      .eq('order_items.product_id', productId),
    supabase
      .from('customer_reviews')
      .select('id, vendor_id, product_id, consumer_id, order_id, rating, comment, created_at')
      .eq('product_id', productId)
      .eq('consumer_id', userId)
      .maybeSingle(),
  ]);

  if (existingError) throw existingError;
  if (orderError) {
    return {
      canSubmit: false,
      orderId: null,
      existingReview: existingRow ? mapReview(asRecord(existingRow)) : null,
    };
  }

  const completedOrder = (orderRows || []).find((row) => isCompletedOrderStatus(toStringValue(asRecord(row).status)));
  const orderId = toStringValue(asRecord(completedOrder).id);
  const existingReview = existingRow ? mapReview(asRecord(existingRow)) : null;

  return {
    canSubmit: Boolean(orderId),
    orderId,
    existingReview,
  };
};

export const submitProductReview = async (input: {
  productId: string;
  vendorId: string | null;
  userId: string;
  orderId: string;
  existingReviewId?: string | null;
  draft: ReviewDraft;
}): Promise<ProductReview> => {
  const validationError = validateReviewDraft(input.draft);
  if (validationError) throw new Error(validationError);
  if (!input.userId) throw new Error('Please sign in to write a review.');
  if (!input.vendorId) throw new Error('This piece cannot be reviewed yet.');
  if (!input.orderId) throw new Error('Only collectors who have received this piece can review it.');

  const payload = {
    vendor_id: input.vendorId,
    product_id: input.productId,
    consumer_id: input.userId,
    order_id: input.orderId,
    rating: Math.round(input.draft.rating),
    comment: input.draft.comment.trim(),
  };

  if (input.existingReviewId) {
    const { data, error } = await supabase
      .from('customer_reviews')
      .update({ rating: payload.rating, comment: payload.comment })
      .eq('id', input.existingReviewId)
      .eq('consumer_id', input.userId)
      .eq('product_id', input.productId)
      .select('id, vendor_id, product_id, consumer_id, order_id, rating, comment, created_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Your review could not be updated.');
    return mapReview(asRecord(data));
  }

  const { data, error } = await supabase
    .from('customer_reviews')
    .insert(payload)
    .select('id, vendor_id, product_id, consumer_id, order_id, rating, comment, created_at')
    .maybeSingle();

  if (error) {
    const message = error.message || '';
    if (message.toLowerCase().includes('duplicate') || error.code === '23505') {
      throw new Error('You have already reviewed this piece. You can update your existing note instead.');
    }
    if (error.code === '42501' || message.toLowerCase().includes('row-level security')) {
      throw new Error('Only collectors who have received this piece can review it.');
    }
    throw error;
  }

  if (!data) throw new Error('Your review could not be saved.');
  return mapReview(asRecord(data));
};
