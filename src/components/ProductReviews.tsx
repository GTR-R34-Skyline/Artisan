import React, { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Button, EmptyState, Eyebrow, Field } from './DesignSystem';
import { useAuth } from '../auth/useAuthHook';
import {
  formatReviewDate,
  getProductReviews,
  getReviewEligibility,
  submitProductReview,
} from '../services/productReviews.service';
import { ProductReviewSummary, ReviewEligibility } from '../types/reviews';

interface ProductReviewsProps {
  productId: string;
  vendorId: string | null;
}

const emptySummary: ProductReviewSummary = {
  reviews: [],
  reviewCount: 0,
  averageRating: null,
};

const emptyEligibility: ReviewEligibility = {
  canSubmit: false,
  orderId: null,
  existingReview: null,
};

const StarRating: React.FC<{ value: number; onChange?: (value: number) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((star) => {
      const filled = star <= value;
      if (!onChange) {
        return (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${filled ? 'fill-forest text-forest' : 'text-stone-300'}`}
            strokeWidth={1.5}
          />
        );
      }

      return (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="p-0.5"
          aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
        >
          <Star
            className={`h-5 w-5 ${filled ? 'fill-forest text-forest' : 'text-stone-300'}`}
            strokeWidth={1.5}
          />
        </button>
      );
    })}
  </div>
);

export const ProductReviews: React.FC<ProductReviewsProps> = ({ productId, vendorId }) => {
  const { user, loading: authLoading } = useAuth();
  const [summary, setSummary] = useState<ProductReviewSummary>(emptySummary);
  const [eligibility, setEligibility] = useState<ReviewEligibility>(emptyEligibility);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  const loadReviews = useCallback(async () => {
    const next = await getProductReviews(productId);
    setSummary(next);
    return next;
  }, [productId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSubmitMessage('');

    const load = async () => {
      let nextSummary = emptySummary;
      try {
        nextSummary = await loadReviews();
        if (cancelled) return;
        setSummary(nextSummary);
      } catch {
        if (!cancelled) setError('Reviews could not be loaded.');
      }

      if (!cancelled && !authLoading && user?.id) {
        try {
          const nextEligibility = await getReviewEligibility(productId, user.id);
          if (cancelled) return;
          setEligibility(nextEligibility);
          setRating(nextEligibility.existingReview?.rating || 5);
          setComment(nextEligibility.existingReview?.comment || '');
        } catch {
          if (!cancelled) setEligibility(emptyEligibility);
        }
      } else if (!cancelled && !authLoading) {
        setEligibility(emptyEligibility);
        setRating(5);
        setComment('');
      }

      if (!cancelled) setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, loadReviews, productId, user?.id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id || !eligibility.canSubmit || !eligibility.orderId) return;

    setSubmitting(true);
    setError('');
    setSubmitMessage('');

    try {
      await submitProductReview({
        productId,
        vendorId,
        userId: user.id,
        orderId: eligibility.orderId,
        existingReviewId: eligibility.existingReview?.id || null,
        draft: { rating, comment },
      });
      const [nextSummary, nextEligibility] = await Promise.all([
        loadReviews(),
        getReviewEligibility(productId, user.id),
      ]);
      setSummary(nextSummary);
      setEligibility(nextEligibility);
      setRating(nextEligibility.existingReview?.rating || rating);
      setComment(nextEligibility.existingReview?.comment || comment.trim());
      setSubmitMessage(eligibility.existingReview ? 'Your review has been updated.' : 'Thank you. Your review is now on this piece.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Your review could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="product-reviews mt-28 grid gap-10 border-t border-stone-300 pt-12 lg:grid-cols-[0.45fr_1fr]">
      <div>
        <Eyebrow>Reviews</Eyebrow>
        {summary.reviewCount > 0 && summary.averageRating !== null && (
          <div className="mt-6">
            <p className="font-display text-6xl leading-none tracking-[-0.05em] text-stone-950">
              {summary.averageRating.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </p>
            <div className="mt-4">
              <StarRating value={Math.round(summary.averageRating)} />
            </div>
            <p className="mt-3 text-sm text-stone-500">
              {summary.reviewCount} {summary.reviewCount === 1 ? 'review' : 'reviews'}
            </p>
          </div>
        )}
      </div>

      <div className="max-w-2xl">
        {error && <p className="mb-6 border-l-2 border-amber-700 pl-4 text-sm leading-6 text-stone-700">{error}</p>}

        {loading ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Reading the notes</p>
        ) : summary.reviewCount === 0 ? (
          <EmptyState
            title="No reviews yet."
            description="When a collector who has received this piece leaves a note, it will appear here."
          />
        ) : (
          <div>
            {summary.reviews.map((review) => (
              <article key={review.id} className="border-b border-stone-300 py-6 first:pt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl text-stone-950">{review.reviewerName || 'A collector'}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-500">{formatReviewDate(review.createdAt)}</p>
                  </div>
                  <StarRating value={review.rating} />
                </div>
                {review.comment ? (
                  <p className="mt-4 text-sm leading-7 text-stone-600">{review.comment}</p>
                ) : (
                  <p className="mt-4 text-sm italic text-stone-400">No written note was left with this rating.</p>
                )}
              </article>
            ))}
          </div>
        )}

        {eligibility.canSubmit && (
          <form onSubmit={handleSubmit} className="mt-12 border-t border-stone-300 pt-8">
            <Eyebrow>{eligibility.existingReview ? 'Update your review' : 'Write a review'}</Eyebrow>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              {eligibility.existingReview
                ? 'You have already written about this piece. You can revise your note below.'
                : 'You received this piece. Share how it lives with you.'}
            </p>
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Rating</p>
                <div className="mt-3">
                  <StarRating value={rating} onChange={setRating} />
                </div>
              </div>
              <Field
                label="Your note"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="How has this piece settled with you?"
                textarea
                required
              />
              {submitMessage && <p className="text-sm text-emerald-800">{submitMessage}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving' : eligibility.existingReview ? 'Update review' : 'Submit review'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
};
