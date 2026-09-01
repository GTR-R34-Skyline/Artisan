import React from 'react';
import { motion } from 'motion/react';
import { EmptyState, SectionHeading } from '../DesignSystem';
import { BusinessRecommendation } from '../../types/analytics';
import { getProductImage, getProductTitle } from '../../types/marketplace';
import { ProductThumb } from './ProductThumb';

interface BusinessRecommendationsProps {
  recommendations: BusinessRecommendation[];
}

const KIND_LABEL: Record<BusinessRecommendation['kind'], string> = {
  restock: 'Inventory',
  price: 'Pricing',
  offer: 'Demand',
  visibility: 'Discovery',
};

export const BusinessRecommendations: React.FC<BusinessRecommendationsProps> = ({ recommendations }) => {
  if (!recommendations.length) {
    return (
      <section className="max-w-2xl py-4">
        <SectionHeading
          eyebrow="Insights"
          title="Let the work speak first."
          description="Meaningful recommendations will appear as your products begin receiving orders and reviews."
        />
        <div className="mt-12">
          <EmptyState title="There is not enough activity yet to make a useful recommendation." description="Keep your collection current. Insights are drawn only from your live orders, stock, and reviews." />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-10">
      <SectionHeading
        eyebrow="Insights"
        title="Quiet suggestions from the work itself."
        description="These are observations only. Nothing is changed automatically — you decide what, if anything, to do next."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {recommendations.map((item, index) => (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className={`analytics-glass-card analytics-insight-card is-${item.kind} p-5`}
          >
            <div className="flex gap-4">
              <ProductThumb
                src={getProductImage(item.product)}
                alt={getProductTitle(item.product)}
                className="h-20 w-20 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{KIND_LABEL[item.kind]}</p>
                <h3 className="mt-2 font-display text-2xl leading-tight text-stone-950">{item.title}</h3>
                <p className="mt-1 truncate text-sm text-stone-600">{getProductTitle(item.product)}</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-stone-600">{item.message}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
};
