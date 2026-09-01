import React from 'react';
import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { EmptyState, SectionHeading } from '../DesignSystem';
import { VendorAnalytics } from '../../types/analytics';
import { getProductImage, getProductTitle } from '../../types/marketplace';
import { AnimatedMetric } from './AnimatedMetric';
import { formatRating } from './formatters';
import { ProductThumb } from './ProductThumb';

interface ReviewsSectionProps {
  analytics: VendorAnalytics;
}

const STARS: Array<1 | 2 | 3 | 4 | 5> = [5, 4, 3, 2, 1];

const formatReviewDate = (value: string | null): string => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

export const ReviewsSection: React.FC<ReviewsSectionProps> = ({ analytics }) => {
  const maxCount = Math.max(...STARS.map((star) => analytics.ratingDistribution[star]), 1);

  if (!analytics.reviewCount) {
    return (
      <section className="max-w-2xl py-4">
        <SectionHeading
          eyebrow="Reviews"
          title="The conversation starts with the first piece."
          description="Reviews from buyers will appear here when your published work begins receiving responses."
        />
        <div className="mt-12">
          <EmptyState title="No reviews yet." description="Average rating, distribution, and recent comments will gather here as collectors respond to your work." />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-10">
      <SectionHeading
        eyebrow="Reviews"
        title="How collectors are responding."
        description="Ratings and notes from people who have lived with your work."
      />

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.article
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="analytics-glass-card analytics-rating-card p-6 sm:p-8"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Average rating</p>
          <p className="mt-6 font-display text-7xl leading-none tracking-[-0.05em] text-ivory">
            {analytics.averageRating === null ? '—' : <AnimatedMetric value={analytics.averageRating} format={formatRating} />}
          </p>
          <p className="mt-4 text-sm text-white/60">
            {analytics.reviewCount} {analytics.reviewCount === 1 ? 'review' : 'reviews'} across your collection
          </p>
        </motion.article>

        <motion.article
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="analytics-glass-card p-6 sm:p-8"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Rating distribution</p>
          <div className="mt-6 space-y-3">
            {STARS.map((star) => {
              const count = analytics.ratingDistribution[star];
              const width = `${Math.max(count ? 8 : 0, (count / maxCount) * 100)}%`;
              return (
                <div key={star} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1 text-stone-600">
                    {star} <Star className="h-3 w-3 fill-forest text-forest" strokeWidth={1.5} />
                  </span>
                  <div className="analytics-bar-track">
                    <div className="analytics-bar-fill" style={{ width }} />
                  </div>
                  <span className="text-right text-stone-500">{count}</span>
                </div>
              );
            })}
          </div>
        </motion.article>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Recent reviews</p>
        <div className="mt-5 grid gap-4">
          {analytics.recentReviews.map((review) => (
            <article key={review.id} className="analytics-glass-card p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <ProductThumb
                  src={review.product ? getProductImage(review.product) : null}
                  alt={review.product ? getProductTitle(review.product) : 'Reviewed work'}
                  className="h-20 w-20 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-2xl text-stone-950">{review.reviewerName || 'A collector'}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-500">
                        {review.product ? getProductTitle(review.product) : 'Collection review'} · {formatReviewDate(review.createdAt)}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm text-stone-950">
                      <Star className="h-3.5 w-3.5 fill-forest text-forest" strokeWidth={1.5} />
                      {review.rating}.0
                    </span>
                  </div>
                  {review.comment ? (
                    <p className="mt-4 text-sm leading-6 text-stone-600">{review.comment}</p>
                  ) : (
                    <p className="mt-4 text-sm italic text-stone-400">No written note was left with this rating.</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
