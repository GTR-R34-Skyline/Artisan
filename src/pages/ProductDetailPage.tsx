import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { ProductReviews } from '../components/ProductReviews';
import QuantitySelector from '../components/QuantitySelector';
import { Button, EmptyState, Eyebrow, ImageFrame, LoadingState, Reveal, StatusLabel } from '../components/DesignSystem';
import { useCart } from '../context/CartContext';
import { useLocale } from '../i18n/LocaleContext';
import { getMarketplaceListing } from '../services/marketplace.service';
import { getProductDescription, getProductImage, getProductPrice, getProductTitle, MarketplaceListing } from '../types/marketplace';

const ProductDetailPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { addListing } = useCart();
  const { t } = useLocale();
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!productId) return;
    getMarketplaceListing(productId)
      .then((next) => {
        setListing(next);
        const stock = Math.max(0, next.quantity ?? next.stock_count ?? 0);
        setQuantity(stock > 0 ? 1 : 0);
      })
      .catch(() => setError(t('product.loadError')))
      .finally(() => setLoading(false));
  }, [productId, t]);

  if (loading) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><LoadingState label={t('product.opening')} /></div>;
  }

  if (error || !listing) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><EmptyState title={t('product.notFound')} description={error || t('product.notFound')} /></div>;
  }

  const artisan = listing.artisan;
  const price = getProductPrice(listing);
  const stock = listing.quantity ?? listing.stock_count;
  const maxStock = Math.max(0, stock ?? 0);

  return (
    <div className="product-detail-page mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <button onClick={() => navigate(-1)} className="mb-10 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 hover:text-stone-950">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> {t('product.back')}
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
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{t('product.craftedBy')}</dt>
                <dd className="mt-2">
                  <Link to={`/craftsman/${artisan.id}`} className="flex flex-wrap items-end justify-between gap-4">
                    <span>
                      <span className="block font-display text-3xl leading-none text-stone-950 transition-colors group-hover:text-forest">{artisan.full_name || 'Independent craftsman'}</span>
                      {artisan.location_state && <span className="mt-2 block text-xs text-stone-500">{artisan.location_state}</span>}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950">{t('product.meetMaker')} <ArrowUpRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1" strokeWidth={1.5} /></span>
                  </Link>
                </dd>
              </div>}
              {artisan?.location_state && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{t('product.location')}</dt><dd className="mt-1 text-stone-950">{artisan.location_state}</dd></div>}
              {listing.material && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{t('product.material')}</dt><dd className="mt-1 text-stone-950">{listing.material}</dd></div>}
              {stock !== null && stock !== undefined && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{t('product.availability')}</dt><dd className="mt-1 text-stone-950">{t('common.availableCount', { count: stock })}</dd></div>}
            </dl>
          </div>

          <div className="mt-16 border-t border-stone-300 pt-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow>{t('product.price')}</Eyebrow>
                <p className="mt-2 font-display text-4xl text-stone-950">{price !== null ? `₹${price.toLocaleString('en-IN')}` : t('product.priceOnRequest')}</p>
              </div>
              <StatusLabel tone={maxStock === 0 ? 'warning' : 'success'}>{maxStock === 0 ? t('product.unavailable') : t('product.available')}</StatusLabel>
            </div>
            {price !== null && maxStock > 0 && (
              <div className="mt-8 space-y-5">
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{t('product.quantity')}</p>
                  <QuantitySelector
                    value={quantity}
                    max={maxStock}
                    onChange={setQuantity}
                    decreaseLabel={t('cart.decreaseQty')}
                    increaseLabel={t('cart.increaseQty')}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => {
                      addListing(listing, quantity);
                      setAdded(true);
                    }}
                  >
                    {added ? t('product.added') : t('product.addToCollection')}
                  </Button>
                  <Button variant="light" onClick={() => navigate('/cart')}>{t('product.viewCollection')}</Button>
                </div>
              </div>
            )}
          </div>
        </article>
        </Reveal>
      </div>

      <section className="mt-28 grid gap-10 border-t border-stone-300 pt-12 lg:grid-cols-[0.45fr_1fr]">
        <div><Eyebrow>{t('product.maker')}</Eyebrow></div>
        <div className="max-w-2xl">
          {artisan?.id ? (
            <Link to={`/craftsman/${artisan.id}`} className="group inline-flex items-end gap-3 font-display text-4xl leading-tight text-stone-950 transition-colors hover:text-forest">
              {artisan.full_name ? `${artisan.full_name}'s practice` : t('product.makerPractice')}
              <ArrowUpRight className="mb-1 h-5 w-5 transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1" strokeWidth={1.5} />
            </Link>
          ) : (
            <h2 className="font-display text-4xl leading-tight text-stone-950">{t('product.makerPractice')}</h2>
          )}
          <p className="mt-5 text-sm leading-7 text-stone-600">
            {artisan?.location_state
              ? `Working from ${artisan.location_state}, this piece is part of an independent practice represented through ARTISAN.`
              : t('product.makerBlurb')}
          </p>
        </div>
      </section>

      <ProductReviews productId={listing.id} vendorId={listing.vendor_id} />
    </div>
  );
};

export default ProductDetailPage;
