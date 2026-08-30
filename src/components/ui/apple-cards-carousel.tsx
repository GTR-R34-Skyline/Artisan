import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface AppleCardData {
  category: string;
  title: string;
  src: string;
  content?: React.ReactNode;
}

export const Card: React.FC<{ card: AppleCardData; index: number }> = ({ card, index }) => (
  <motion.article
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.2 }}
    transition={{ duration: 0.7, delay: Math.min(index, 4) * 0.08 }}
    className="apple-card group relative h-[25rem] w-[min(82vw,24rem)] shrink-0 snap-start overflow-hidden rounded-[1.75rem] bg-stone-950 sm:h-[29rem] sm:w-[22rem]"
  >
    <img src={card.src} alt={card.title} className="absolute inset-0 h-full w-full object-cover transition duration-1000 ease-out group-hover:scale-105" />
    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/10 to-transparent" />
    <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-7">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">{card.category}</p>
      <h3 className="mt-3 max-w-[12ch] font-display text-4xl leading-[0.92] tracking-[-0.04em]">{card.title}</h3>
      {card.content && <div className="mt-5 max-w-[28ch] text-sm leading-6 text-white/75">{card.content}</div>}
    </div>
  </motion.article>
);

export const Carousel: React.FC<{ items: React.ReactNode[] }> = ({ items }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return undefined;
    const track = trackRef.current;
    if (!track) return undefined;

    const timer = window.setInterval(() => {
      if (track.matches(':hover') || track.matches(':focus-within')) return;
      track.scrollLeft += 0.8;
      if (track.scrollLeft >= track.scrollWidth / 2) {
        track.scrollLeft -= track.scrollWidth / 2;
      }
    }, 24);

    return () => window.clearInterval(timer);
  }, [reduceMotion, items.length]);

  return (
    <div className="apple-carousel relative">
      <div ref={trackRef} aria-label="Selected artisan traditions" className="apple-carousel-track flex gap-5 overflow-x-auto pb-5 pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[...items, ...items].map((item, index) => <React.Fragment key={index}>{item}</React.Fragment>)}
      </div>
      <div className="mt-7 flex items-center justify-between border-t border-stone-300/30 pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">A continuous study of Indian craft</p>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Moving archive</span>
      </div>
    </div>
  );
};
