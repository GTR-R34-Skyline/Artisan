import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowButton, EmptyState, Eyebrow, ImageFrame, LoadingState, Reveal } from '../components/DesignSystem';
import { getCraftsmanProfile } from '../services/marketplace.service';
import { CraftsmanProfile, getProductDescription, getProductImage, getProductPrice, getProductTitle, MarketplaceListing } from '../types/marketplace';

const CraftsmanPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [craftsman, setCraftsman] = useState<CraftsmanProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    getCraftsmanProfile(id)
      .then(setCraftsman)
      .catch(() => setError('This craftsman could not be loaded.'))
      .finally(() => setLoading(false));
  }, [id]);

  const specializations = useMemo(() => {
    if (!craftsman) return [];
    return Array.from(new Set(
      craftsman.products
        .map((product) => product.category)
        .filter((category): category is string => Boolean(category)),
    ));
  }, [craftsman]);

  if (loading) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><LoadingState label="Opening the craftsman’s exhibition" /></div>;
  }

  if (error || !craftsman) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><EmptyState title="Craftsman not found." description={error || 'This profile may no longer be available.'} /></div>;
  }

  const heroProduct = craftsman.products[0];
  const descriptionProduct = craftsman.products.find((product) => product.raw_description || product.description_en);
  const specialization = craftsman.craft_type || specializations.join(' · ');

  return (
    <div className="craftsman-page mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <button type="button" onClick={() => navigate(-1)} className="editorial-link mb-10 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 hover:text-stone-950">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Back to collection
      </button>

      <section className="craftsman-hero relative grid gap-10 lg:min-h-[680px] lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <Reveal className="craftsman-hero-image">
          <ImageFrame src={heroProduct ? getProductImage(heroProduct) : null} alt={craftsman.full_name || 'Craftsman’s work'} label={craftsman.full_name || 'Independent craftsman'} className="aspect-[4/3] lg:aspect-[5/4]" />
        </Reveal>
        <Reveal delay="140ms" className="craftsman-hero-copy lg:pb-12 lg:pl-10">
          <Eyebrow>{specialization || 'Independent craftsman'}</Eyebrow>
          <h1 className="mt-5 max-w-3xl font-display text-6xl leading-[0.84] tracking-[-0.06em] text-stone-950 sm:text-8xl lg:text-[clamp(5rem,10vw,10rem)]">{craftsman.full_name || 'Independent craftsman'}</h1>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs uppercase tracking-[0.16em] text-stone-500">
            {craftsman.location_state && <span>{craftsman.location_state}</span>}
            {craftsman.preferred_language && <span>{craftsman.preferred_language}</span>}
            {craftsman.products.length > 0 && <span>{craftsman.products.length} {craftsman.products.length === 1 ? 'piece' : 'pieces'} available</span>}
          </div>
          {heroProduct && <ArrowButton to="/login" className="inquiry-cta mt-10">Inquire about this work</ArrowButton>}
        </Reveal>
        <span className="craftsman-hero-index absolute right-0 top-0 hidden font-display text-7xl text-stone-300 lg:block">01</span>
      </section>

      {(descriptionProduct || specialization || craftsman.location_state || craftsman.preferred_language) && (
        <section className="craftsman-story mt-28 grid gap-10 border-t border-stone-300 pt-12 lg:grid-cols-[0.45fr_1fr]">
          <Reveal><Eyebrow>The maker</Eyebrow></Reveal>
          <Reveal delay="100ms" className="max-w-3xl">
            <h2 className="font-display text-5xl leading-[0.94] tracking-[-0.045em] text-stone-950 sm:text-7xl">
              {craftsman.full_name ? `The work of ${craftsman.full_name}.` : 'An independent practice.'}
            </h2>
            {descriptionProduct && <p className="mt-8 max-w-2xl text-base leading-8 text-stone-600">{getProductDescription(descriptionProduct)}</p>}
            <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-7 border-t border-stone-300 pt-7 sm:grid-cols-3">
              {specialization && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Craft</dt><dd className="mt-2 text-stone-950">{specialization}</dd></div>}
              {craftsman.location_state && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Based in</dt><dd className="mt-2 text-stone-950">{craftsman.location_state}</dd></div>}
              {craftsman.preferred_language && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Language</dt><dd className="mt-2 text-stone-950">{craftsman.preferred_language}</dd></div>}
            </dl>
          </Reveal>
        </section>
      )}

      <section className="craftsman-collection mt-28 border-t border-stone-300 pt-12">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div><Eyebrow>The collection</Eyebrow><h2 className="mt-4 font-display text-5xl leading-none tracking-[-0.045em] text-stone-950 sm:text-7xl">{craftsman.full_name ? `Works by ${craftsman.full_name}.` : 'Works from the practice.'}</h2></div>
          {craftsman.products.length > 0 && <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{craftsman.products.length} selected {craftsman.products.length === 1 ? 'work' : 'works'}</span>}
        </div>
        {craftsman.products.length ? (
          <div className="mt-14 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-12">
            {craftsman.products.map((product: MarketplaceListing, index) => (
              <Reveal key={product.id} delay={`${Math.min(index, 5) * 70}ms`} className={index % 3 === 0 ? 'lg:col-span-7' : index % 3 === 1 ? 'lg:col-span-5 lg:pt-20' : 'lg:col-span-4'}>
                <Link to={`/marketplace/${product.id}`} className="product-tile group block">
                  <ImageFrame src={getProductImage(product)} alt={getProductTitle(product)} label={product.category || 'Handmade work'} className={`aspect-[4/3] ${index % 3 === 0 ? 'lg:aspect-[5/4]' : ''}`} />
                  <div className="flex items-start justify-between gap-4 border-b border-stone-300 py-4">
                    <div><h3 className="font-display text-3xl leading-none text-stone-950 group-hover:text-forest">{getProductTitle(product)}</h3><p className="mt-2 text-xs text-stone-500">{product.material || product.category || 'Handmade work'}</p></div>
                    {getProductPrice(product) !== null && <p className="text-sm text-stone-950">₹{getProductPrice(product)?.toLocaleString('en-IN')}</p>}
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : <div className="mt-10"><EmptyState title="The collection is taking shape." description="Published work from this craftsman will appear here." /></div>}
      </section>
    </div>
  );
};

export default CraftsmanPage;
