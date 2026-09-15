import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { EmptyState, Eyebrow, ImageFrame, LoadingState, Reveal } from '../components/DesignSystem';
import { useLocale } from '../i18n/LocaleContext';
import { getMarketplaceListings } from '../services/marketplace.service';
import { getProductImage, getProductPrice, getProductTitle, MarketplaceListing } from '../types/marketplace';

const ALL_CATEGORIES = 'All categories';
const ALL_REGIONS = 'All regions';

const MarketplacePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { t } = useLocale();

  const search = searchParams.get('q') || '';
  const category = searchParams.get('category') || ALL_CATEGORIES;
  const region = searchParams.get('region') || ALL_REGIONS;

  useEffect(() => {
    getMarketplaceListings()
      .then(setListings)
      .catch(() => setError(t('marketplace.empty')))
      .finally(() => setLoading(false));
  }, [t]);

  const categories = useMemo(
    () => [ALL_CATEGORIES, ...Array.from(new Set(listings.map((listing) => listing.category).filter((value): value is string => Boolean(value))))],
    [listings],
  );
  const regions = useMemo(
    () => [ALL_REGIONS, ...Array.from(new Set(listings.map((listing) => listing.artisan?.location_state).filter((value): value is string => Boolean(value))))],
    [listings],
  );

  const filteredListings = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return listings.filter((listing) => {
      const matchesSearch = !normalizedSearch || [getProductTitle(listing), listing.artisan?.full_name, listing.category, listing.material]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
      const matchesCategory = category === ALL_CATEGORIES || listing.category === category;
      const matchesRegion = region === ALL_REGIONS || listing.artisan?.location_state === region;
      return matchesSearch && matchesCategory && matchesRegion;
    });
  }, [category, listings, region, search]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === ALL_CATEGORIES || value === ALL_REGIONS) next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  };

  const categoryLabel = (value: string) => (value === ALL_CATEGORIES ? t('marketplace.allCategories') : value);
  const regionLabel = (value: string) => (value === ALL_REGIONS ? t('marketplace.allRegions') : value);

  return (
    <div className="marketplace-page mx-auto max-w-[1400px] px-6 pb-28 pt-16 lg:px-10 lg:pt-24">
      <header className="editorial-hero grid gap-10 border-b border-stone-300 pb-12 lg:grid-cols-[1fr_0.8fr] lg:items-end">
        <div className="space-y-6">
          <Eyebrow>{t('marketplace.title')}</Eyebrow>
          <h1 className="font-display text-6xl leading-[0.9] tracking-[-0.055em] sm:text-8xl">{t('marketplace.title')}</h1>
        </div>
        <p className="max-w-md text-sm leading-7 text-stone-600 lg:justify-self-end">
          {t('marketplace.subtitle')}
        </p>
      </header>

      <div className="filter-bar flex flex-col gap-5 border-b border-stone-300 py-7 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex items-center gap-4 border-b border-stone-300 pb-3 lg:min-w-72">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{t('marketplace.search')}</span>
          <input
            value={search}
            onChange={(event) => updateFilter('q', event.target.value)}
            placeholder={t('marketplace.search')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
          />
        </label>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            {t('marketplace.category')}
            <select value={category} onChange={(event) => updateFilter('category', event.target.value)} className="bg-transparent text-stone-950 outline-none">
              {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            {t('marketplace.region')}
            <select value={region} onChange={(event) => updateFilter('region', event.target.value)} className="bg-transparent text-stone-950 outline-none">
              {regions.map((item) => <option key={item} value={item}>{regionLabel(item)}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <p className="border-b border-stone-300 py-5 text-sm text-red-700">{error}</p>}
      {loading ? (
        <LoadingState label={t('marketplace.loading')} />
      ) : filteredListings.length > 0 ? (
        <div className="grid gap-x-8 gap-y-16 pt-12 sm:grid-cols-2 lg:grid-cols-12">
          {filteredListings.map((listing, index) => (
            <Reveal key={listing.id} delay={`${Math.min(index, 5) * 70}ms`} className={index % 5 === 0 ? 'lg:col-span-7' : index % 5 === 1 ? 'lg:col-span-5 lg:pt-20' : 'lg:col-span-4'}>
            <Link
              to={`/marketplace/${listing.id}`}
              className="product-tile group block"
            >
              <ImageFrame src={getProductImage(listing)} alt={getProductTitle(listing)} label={listing.category || 'Handmade work'} className={`aspect-[4/3] ${index % 5 === 0 ? 'lg:aspect-[5/3]' : ''}`} />
              <div className="flex justify-between gap-4 border-b border-stone-300 py-4">
                <div>
                  <h2 className="font-display text-2xl text-stone-950 group-hover:text-forest">{getProductTitle(listing)}</h2>
                  <p className="mt-1 text-xs text-stone-500">
                    {listing.artisan?.full_name || 'Independent artisan'}
                    {listing.artisan?.location_state ? ` · ${listing.artisan.location_state}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  {getProductPrice(listing) !== null && <p className="text-sm text-stone-950">₹{getProductPrice(listing)?.toLocaleString('en-IN')}</p>}
                  <ArrowUpRight className="ml-auto mt-3 h-4 w-4 text-stone-400 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" strokeWidth={1.5} />
                </div>
              </div>
            </Link>
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="pt-12">
          <EmptyState title={t('marketplace.empty')} description={t('marketplace.subtitle')} />
        </div>
      )}
    </div>
  );
};

export default MarketplacePage;
