import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { EmptyState, Eyebrow, ImageFrame, LoadingState, Reveal, StatusLabel } from '../components/DesignSystem';
import { getMarketplaceListing } from '../services/marketplace.service';
import { getProductDescription, getProductImage, getProductPrice, getProductTitle, MarketplaceListing } from '../types/marketplace';

const ProductDetailPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!productId) return;
    getMarketplaceListing(productId)
      .then(setListing)
      .catch(() => setError('This work could not be loaded.'))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><LoadingState label="Opening the work" /></div>;
  }

  if (error || !listing) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><EmptyState title="Work not found." description={error || 'This piece may no longer be available.'} /></div>;
  }

  const artisan = listing.artisan;
  const price = getProductPrice(listing);
  const quantity = listing.quantity ?? listing.stock_count;

  return (
    <div className="product-detail-page mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <button onClick={() => navigate(-1)} className="mb-10 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 hover:text-stone-950">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Back to collection
      </button>

      <div className="detail-hero grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
        <Reveal><ImageFrame src={getProductImage(listing)} alt={getProductTitle(listing)} label={listing.category || 'Handmade work'} className="aspect-[4/3] lg:aspect-[5/4]" /></Reveal>

        <Reveal delay="120ms" className="flex flex-col justify-between py-2">
        <article>
          <div className="space-y-8">
            <div className="space-y-4">
              <Eyebrow>{listing.category || 'Handmade work'}</Eyebrow>
              <h1 className="font-display text-5xl leading-[0.95] tracking-[-0.04em] text-stone-950 sm:text-7xl">{getProductTitle(listing)}</h1>
            </div>
            <div className="border-y border-stone-300 py-5">
              <p className="text-sm leading-7 text-stone-700">{getProductDescription(listing)}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
              {artisan?.id && <div className="maker-attribution group col-span-2 border-y border-stone-300 py-4 transition-colors hover:border-forest">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Crafted by</dt>
                <dd className="mt-2">
                  <Link to={`/craftsman/${artisan.id}`} className="flex flex-wrap items-end justify-between gap-4">
                    <span>
                      <span className="block font-display text-3xl leading-none text-stone-950 transition-colors group-hover:text-forest">{artisan.full_name || 'Independent craftsman'}</span>
                      {artisan.location_state && <span className="mt-2 block text-xs text-stone-500">{artisan.location_state}</span>}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950">Meet the craftsman <ArrowUpRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1" strokeWidth={1.5} /></span>
                  </Link>
                </dd>
              </div>}
              {artisan?.location_state && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Location</dt><dd className="mt-1 text-stone-950">{artisan.location_state}</dd></div>}
              {listing.material && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Material</dt><dd className="mt-1 text-stone-950">{listing.material}</dd></div>}
              {quantity !== null && quantity !== undefined && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Availability</dt><dd className="mt-1 text-stone-950">{quantity} available</dd></div>}
            </dl>
          </div>

          <div className="mt-16 border-t border-stone-300 pt-6">
            <div className="flex items-end justify-between gap-6">
              <div>
                <Eyebrow>Price</Eyebrow>
                <p className="mt-2 font-display text-4xl text-stone-950">{price !== null ? `₹${price.toLocaleString('en-IN')}` : 'Price on request'}</p>
              </div>
              <StatusLabel tone={quantity === 0 ? 'warning' : 'success'}>{quantity === 0 ? 'Unavailable' : 'Available'}</StatusLabel>
            </div>
          </div>
        </article>
        </Reveal>
      </div>

      <section className="mt-28 grid gap-10 border-t border-stone-300 pt-12 lg:grid-cols-[0.45fr_1fr]">
        <div><Eyebrow>The maker</Eyebrow></div>
        <div className="max-w-2xl">
          {artisan?.id ? (
            <Link to={`/craftsman/${artisan.id}`} className="group inline-flex items-end gap-3 font-display text-4xl leading-tight text-stone-950 transition-colors hover:text-forest">
              {artisan.full_name ? `${artisan.full_name}'s practice` : 'The maker’s practice'}
              <ArrowUpRight className="mb-1 h-5 w-5 transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1" strokeWidth={1.5} />
            </Link>
          ) : (
            <h2 className="font-display text-4xl leading-tight text-stone-950">The maker’s practice</h2>
          )}
          <p className="mt-5 text-sm leading-7 text-stone-600">
            {artisan?.location_state ? `Working from ${artisan.location_state}, this piece is part of an independent practice represented through ARTISAN.` : 'This piece is part of an independent practice represented through ARTISAN.'}
          </p>
        </div>
      </section>
      <div className="mt-8 flex justify-end">
        <Link to="/marketplace" className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-950">
          Discover more work <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
};

export default ProductDetailPage;
