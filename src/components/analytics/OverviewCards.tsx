import React from 'react';
import { motion } from 'motion/react';
import { Boxes, IndianRupee, PackageCheck, ShoppingBag, Star } from 'lucide-react';
import { VendorAnalytics } from '../../types/analytics';
import { AnimatedMetric } from './AnimatedMetric';
import { formatCount, formatRating, formatRupees } from './formatters';

interface OverviewCardsProps {
  analytics: VendorAnalytics;
}

const cards = [
  {
    key: 'revenue',
    label: 'Total revenue',
    hint: 'From completed orders',
    icon: IndianRupee,
    value: (analytics: VendorAnalytics) => analytics.totalRevenue,
    format: formatRupees,
  },
  {
    key: 'sold',
    label: 'Products sold',
    hint: 'Units delivered',
    icon: PackageCheck,
    value: (analytics: VendorAnalytics) => analytics.productsSold,
    format: formatCount,
  },
  {
    key: 'orders',
    label: 'Total orders',
    hint: 'Completed & delivered',
    icon: ShoppingBag,
    value: (analytics: VendorAnalytics) => analytics.totalOrders,
    format: formatCount,
  },
  {
    key: 'stock',
    label: 'Current stock',
    hint: 'Across your collection',
    icon: Boxes,
    value: (analytics: VendorAnalytics) => analytics.currentStock,
    format: formatCount,
  },
] as const;

export const OverviewCards: React.FC<OverviewCardsProps> = ({ analytics }) => (
  <div className="analytics-overview-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
    {cards.map((card, index) => (
      <motion.article
        key={card.key}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
        className="analytics-glass-card group p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{card.label}</p>
          <span className="analytics-icon-chip">
            <card.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
          </span>
        </div>
        <p className="mt-6 font-display text-4xl leading-none tracking-[-0.04em] text-stone-950 sm:text-[2.6rem]">
          <AnimatedMetric value={card.value(analytics)} format={card.format} />
        </p>
        <p className="mt-3 text-xs text-stone-500">{card.hint}</p>
      </motion.article>
    ))}

    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="analytics-glass-card analytics-rating-card group p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Average rating</p>
        <span className="analytics-icon-chip analytics-icon-chip-light">
          <Star className="h-3.5 w-3.5" strokeWidth={1.5} />
        </span>
      </div>
      <p className="mt-6 font-display text-4xl leading-none tracking-[-0.04em] text-ivory sm:text-[2.6rem]">
        {analytics.averageRating === null ? '—' : <AnimatedMetric value={analytics.averageRating} format={formatRating} />}
      </p>
      <p className="mt-3 text-xs text-white/55">
        {analytics.reviewCount ? `${analytics.reviewCount} ${analytics.reviewCount === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
      </p>
    </motion.article>
  </div>
);
