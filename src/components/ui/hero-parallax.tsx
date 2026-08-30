import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';

export interface ParallaxProduct {
  title: string;
  link: string;
  thumbnail: string;
  maker?: string;
}

interface HeroParallaxProps {
  products: ParallaxProduct[];
  eyebrow?: string;
  title?: string;
  intro?: string;
}

const SPRING = { stiffness: 120, damping: 26, mass: 0.8 };

export const HeroParallax: React.FC<HeroParallaxProps> = ({
  products,
  eyebrow = 'Selected work',
  title = 'Made by hand.',
  intro = 'A moving study of the people, materials, and places behind the collection.',
}) => {
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const translateForward = useSpring(useTransform(scrollYProgress, [0, 1], [-80, 80]), SPRING);
  const translateReverse = useSpring(useTransform(scrollYProgress, [0, 1], [80, -80]), SPRING);
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.25], [8, 0]), SPRING);
  const opacity = useSpring(useTransform(scrollYProgress, [0, 0.2], [0.55, 1]), SPRING);

  const rows = [products.slice(0, 3), products.slice(3, 6), products.slice(6, 9)].filter((row) => row.length > 0);
  const sharedMotionStyle = reduceMotion ? {} : { rotateX, opacity };

  return (
    <section ref={sectionRef} className="parallax-gallery overflow-hidden border-y border-stone-300/80 bg-stone-100 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[0.55fr_1fr] lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">{eyebrow}</p>
            <h2 className="mt-4 font-display text-5xl leading-[0.92] tracking-[-0.045em] text-stone-950 sm:text-7xl">{title}</h2>
          </div>
          <p className="max-w-sm text-sm leading-7 text-stone-600 lg:justify-self-end">{intro}</p>
        </div>

        {rows.length > 0 && (
          <motion.div style={sharedMotionStyle} className="mt-16 space-y-6 [perspective:1000px] sm:mt-24">
            {rows.map((row, rowIndex) => (
              <motion.div
                key={`row-${rowIndex}`}
                style={reduceMotion ? {} : { x: rowIndex % 2 === 0 ? translateForward : translateReverse }}
                className={`flex min-w-max gap-5 ${rowIndex % 2 === 0 ? '' : 'translate-x-[-10%]'}`}
              >
                {row.map((product) => <ProductCard key={`${product.title}-${product.link}`} product={product} />)}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
};

export const ProductCard: React.FC<{ product: ParallaxProduct }> = ({ product }) => {
  const reduceMotion = useReducedMotion();

  return (
    <Link to={product.link} className="parallax-card group block w-[min(68vw,22rem)] shrink-0 sm:w-[20rem]">
      <div className="aspect-[4/5] overflow-hidden border border-stone-300 bg-stone-200">
        <motion.img
          src={product.thumbnail}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.025]"
          whileHover={reduceMotion ? undefined : { y: -6 }}
        />
      </div>
      <div className="flex items-start justify-between gap-4 border-b border-stone-300 py-4">
        <div>
          <p className="font-display text-2xl leading-none text-stone-950 group-hover:text-forest">{product.title}</p>
          {product.maker && <p className="mt-2 text-xs text-stone-500">{product.maker}</p>}
        </div>
        <span className="pt-1 text-[10px] text-stone-400">↗</span>
      </div>
    </Link>
  );
};
