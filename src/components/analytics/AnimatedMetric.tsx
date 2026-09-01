import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { formatCount } from './formatters';

interface AnimatedMetricProps {
  value: number;
  format?: (value: number) => string;
  className?: string;
}

const easeOut = (progress: number) => 1 - Math.pow(1 - progress, 3);

export const AnimatedMetric: React.FC<AnimatedMetricProps> = ({
  value,
  format = formatCount,
  className = '',
}) => {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setShown(value);
      return undefined;
    }

    const startValue = 0;
    const startedAt = performance.now();
    const duration = 1100;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setShown(startValue + (value - startValue) * easeOut(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, value]);

  return <span className={className}>{format(shown)}</span>;
};
