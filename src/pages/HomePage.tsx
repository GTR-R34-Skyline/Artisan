import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { ArrowButton, Eyebrow, ImageFrame, SectionHeading } from '../components/DesignSystem';
import { Card, Carousel } from '../components/ui/apple-cards-carousel';
import { useLocale } from '../i18n/LocaleContext';
import { getMarketplaceListings } from '../services/marketplace.service';
import { MarketplaceListing } from '../types/marketplace';

const homepageCards = [
  {
    category: 'Folk sculpture',
    title: 'Painted stories.',
    src: '/images/folk-elephants.png',
    content: 'Color, line, and form turn everyday objects into keepable stories.',
  },
  {
    category: 'Natural fibre',
    title: 'Woven utility.',
    src: '/images/woven-baskets.jpg',
    content: 'Patiently built forms that carry the rhythm of the hands that made them.',
  },
  {
    category: 'Embroidered textiles',
    title: 'Threaded memory.',
    src: '/images/embroidered-textile.png',
    content: 'Texture and pattern gathered into pieces with a quiet, tactile presence.',
  },
  {
    category: 'Adornment',
    title: 'Color in circles.',
    src: '/images/colorful-bangles.jpg',
    content: 'Small gestures of color, made to move with the people who wear them.',
  },
  {
    category: 'Handloom',
    title: 'The rhythm of the loom.',
    src: '/images/handloom-weaving.png',
    content: 'A close study of material, repetition, and the beauty of making slowly.',
  },
];

const HomePage: React.FC = () => {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const { t } = useLocale();

  useEffect(() => {
    getMarketplaceListings()
      .then(setListings)
      .catch(() => setListings([]));
  }, []);

  const regions = Array.from(
    new Set(listings.map((listing) => listing.artisan?.location_state).filter((location): location is string => Boolean(location))),
  ).slice(0, 5);

  return (
    <div className="home-page">
      <section className="editorial-hero mx-auto grid max-w-[1400px] gap-12 px-6 pb-28 pt-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:px-10 lg:pb-36 lg:pt-24">
        <div className="max-w-xl space-y-9">
          <Eyebrow>{t('home.eyebrow')}</Eyebrow>
          <h1 className="hero-title font-display text-6xl leading-[0.9] tracking-[-0.055em] text-stone-950 sm:text-8xl">
            {t('home.title.line1')}
            <br />
            {t('home.title.line2')}
          </h1>
          <p className="max-w-md text-base leading-7 text-stone-600">
            {t('home.subtitle')}
          </p>
          <div className="flex flex-wrap items-center gap-7 pt-2">
            <ArrowButton to="/marketplace">{t('home.cta.explore')}</ArrowButton>
            <ArrowButton to="/join" className="text-stone-500">{t('home.cta.join')}</ArrowButton>
          </div>
        </div>

        <div className="hero-image relative lg:pl-10">
          <ImageFrame
            src="/images/folk-elephants.png"
            alt="Colorfully painted folk elephants in a craft collection"
            label={t('home.heroLabel')}
            className="hero-image-frame aspect-[4/3] w-full"
          />
          <div className="absolute -bottom-7 left-6 border-l border-stone-950 bg-ivory px-5 py-2 lg:left-0">
            <Eyebrow>{t('home.heroLabel')}</Eyebrow>
          </div>
        </div>
      </section>

      <section className="apple-carousel-section overflow-hidden bg-forest py-20 text-ivory sm:py-28">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          <div className="mb-12 grid gap-8 lg:grid-cols-[0.55fr_1fr] lg:items-end">
            <div>
              <Eyebrow light>Selected traditions</Eyebrow>
              <h2 className="mt-4 max-w-xl font-display text-5xl leading-[0.92] tracking-[-0.045em] sm:text-7xl">Meet the materials.</h2>
            </div>
            <p className="max-w-sm text-sm leading-7 text-white/70 lg:justify-self-end">A moving study of the color, texture, and patient gestures that give Indian craft its character.</p>
          </div>
          <Carousel items={homepageCards.map((card, index) => <Card key={card.src} card={card} index={index} />)} />
        </div>
      </section>

      <section className="materials-section overflow-hidden border-y border-stone-300/80">
        <div className="materials-inner mx-auto grid max-w-[1400px] gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-24 lg:px-10 lg:py-32">
        <div className="materials-image order-2 lg:order-1">
          <ImageFrame
            src="/images/woven-baskets.jpg"
            alt="Handwoven natural fibre baskets in a craft market"
            label="Woven utility"
            className="materials-image-frame aspect-[4/5] max-w-2xl"
          />
          <div className="materials-image-caption">
            <span>02</span>
            <p>Material, memory, utility.</p>
          </div>
        </div>
        <div className="materials-copy order-1 flex flex-col justify-center space-y-9 lg:order-2">
          <div className="flex items-center justify-between border-b border-stone-300 pb-5">
            <Eyebrow>Made here</Eyebrow>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">A living archive</span>
          </div>
          <SectionHeading title="India, in many materials." description="From woven fibre to fired earth, discover the distinct languages of craft found across the country." />
          <div className="materials-regions border-t border-stone-300">
            {regions.length > 0 ? regions.map((region) => (
              <Link key={region} to={`/marketplace?region=${encodeURIComponent(region)}`} className="flex items-center justify-between border-b border-stone-300 py-4 text-sm text-stone-700 hover:text-forest">
                <span>{region}</span>
                <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            )) : (
              <p className="border-b border-stone-300 py-5 text-sm text-stone-600">Regional discovery will appear as the collection grows.</p>
            )}
          </div>
          <Link to="/marketplace" className="materials-browse text-xs font-semibold uppercase tracking-[0.16em] text-stone-950">Browse all work <ArrowUpRight className="ml-2 inline h-4 w-4 transition-transform duration-500" strokeWidth={1.5} /></Link>
        </div>
        </div>
      </section>

      <section className="artisan-invitation relative overflow-hidden bg-forest text-ivory">
        <div className="artisan-invitation-orbit artisan-invitation-orbit-one" aria-hidden="true" />
        <div className="artisan-invitation-orbit artisan-invitation-orbit-two" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[1400px] gap-12 px-6 py-20 lg:grid-cols-[1fr_0.8fr] lg:items-end lg:px-10 lg:py-32">
          <div className="max-w-xl space-y-8">
            <Eyebrow light>For independent artisans</Eyebrow>
            <h2 className="font-display text-5xl leading-[0.95] tracking-[-0.045em] sm:text-7xl">Your work deserves a wider room.</h2>
            <p className="max-w-md text-sm leading-7 text-white/70">Create a clear, beautiful presence for your craft, at your own pace and in your own words.</p>
            <ArrowButton to="/join" className="text-ivory">Join the network</ArrowButton>
          </div>
          <div className="artisan-invitation-note flex items-end border-l border-white/20 pl-8">
            <p className="max-w-xs font-display text-3xl leading-tight text-white/80">A digital home for the work you make by hand.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
