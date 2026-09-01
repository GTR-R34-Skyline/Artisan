import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { RevenuePoint, RevenueRange } from '../../types/analytics';
import { formatRupees } from './formatters';

interface RevenueChartProps {
  series: Record<RevenueRange, RevenuePoint[]>;
}

const RANGES: Array<{ id: RevenueRange; label: string }> = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
];

const VIEW_W = 860;
const VIEW_H = 280;
const PAD = { top: 28, right: 18, bottom: 42, left: 58 };

const toSmoothPath = (points: Array<{ x: number; y: number }>): string => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] || current;
    const after = points[index + 2] || next;
    const cp1x = current.x + (next.x - previous.x) / 6;
    const cp1y = current.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (after.x - current.x) / 6;
    const cp2y = next.y - (after.y - current.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }
  return path;
};

const nearestIndex = (mapped: Array<{ x: number }>, viewX: number): number => {
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  mapped.forEach((point, index) => {
    const nextDistance = Math.abs(point.x - viewX);
    if (nextDistance < distance) {
      distance = nextDistance;
      nearest = index;
    }
  });
  return nearest;
};

const pointerViewX = (event: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>, clientX: number) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  return ((clientX - bounds.left) / bounds.width) * VIEW_W;
};

export const RevenueChart: React.FC<RevenueChartProps> = ({ series }) => {
  const [range, setRange] = useState<RevenueRange>('30d');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = useMemo(() => series[range] || [], [range, series]);
  const gradientId = React.useId().replace(/:/g, '');

  const chart = useMemo(() => {
    const innerWidth = VIEW_W - PAD.left - PAD.right;
    const innerHeight = VIEW_H - PAD.top - PAD.bottom;
    const maxRevenue = Math.max(...points.map((point) => point.revenue), 0);
    const ceiling = maxRevenue === 0 ? 1 : maxRevenue * 1.12;
    const mapped = points.map((point, index) => {
      const x = PAD.left + (points.length === 1 ? innerWidth / 2 : (index / Math.max(points.length - 1, 1)) * innerWidth);
      const y = PAD.top + innerHeight - (point.revenue / ceiling) * innerHeight;
      return { ...point, x, y };
    });
    const line = toSmoothPath(mapped.map(({ x, y }) => ({ x, y })));
    const area = mapped.length
      ? `${line} L ${mapped[mapped.length - 1].x} ${PAD.top + innerHeight} L ${mapped[0].x} ${PAD.top + innerHeight} Z`
      : '';
    const ticks = [0, 0.5, 1].map((ratio) => ({
      y: PAD.top + innerHeight - ratio * innerHeight,
      label: formatRupees(ceiling * ratio),
    }));
    const xLabels = mapped.filter((_, index) => {
      if (mapped.length <= 7) return true;
      const step = Math.ceil(mapped.length / 6);
      return index % step === 0 || index === mapped.length - 1;
    });
    return { mapped, line, area, ticks, xLabels, maxRevenue };
  }, [points]);

  const active = activeIndex !== null ? chart.mapped[activeIndex] : null;
  const periodTotal = points.reduce((sum, point) => sum + point.revenue, 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="analytics-glass-card overflow-hidden p-5 sm:p-8"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Revenue over time</p>
          <h2 className="mt-3 font-display text-4xl leading-none tracking-[-0.04em] text-stone-950 sm:text-5xl">
            {formatRupees(periodTotal)}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-stone-600">
            Completed and delivered orders for the selected period, counted from your own pieces only.
          </p>
        </div>
        <div className="analytics-range-pills flex flex-wrap gap-2">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setRange(item.id); setActiveIndex(null); }}
              className={range === item.id ? 'is-active' : ''}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {chart.maxRevenue === 0 ? (
        <div className="mt-10 border-t border-stone-300/80 pt-10">
          <p className="font-display text-2xl text-stone-900">No completed sales in this period.</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">
            When delivered orders arrive, this chart will show how your earnings move through time.
          </p>
        </div>
      ) : (
        <div className="analytics-chart-wrap relative mt-8 min-w-0">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="analytics-chart h-[220px] w-full sm:h-[280px]"
            role="img"
            aria-label="Revenue over time"
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(event) => {
              setActiveIndex(nearestIndex(chart.mapped, pointerViewX(event, event.clientX)));
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              setActiveIndex(nearestIndex(chart.mapped, pointerViewX(event, touch.clientX)));
            }}
          >
            <defs>
              <linearGradient id={`revenue-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#264336" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#264336" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {chart.ticks.map((tick) => (
              <g key={tick.y}>
                <line x1={PAD.left} x2={VIEW_W - PAD.right} y1={tick.y} y2={tick.y} className="analytics-chart-grid" />
                <text x={0} y={tick.y + 4} className="analytics-chart-axis">{tick.label}</text>
              </g>
            ))}
            <path d={chart.area} fill={`url(#revenue-fill-${gradientId})`} />
            <path d={chart.line} className="analytics-chart-line" />
            {chart.xLabels.map((point) => (
              <text key={point.key} x={point.x} y={VIEW_H - 12} textAnchor="middle" className="analytics-chart-axis">
                {point.label}
              </text>
            ))}
            {active && (
              <g>
                <line x1={active.x} x2={active.x} y1={PAD.top} y2={VIEW_H - PAD.bottom} className="analytics-chart-guide" />
                <circle cx={active.x} cy={active.y} r="5.5" className="analytics-chart-dot" />
              </g>
            )}
          </svg>
          {active && (
            <div
              className="analytics-chart-tooltip"
              style={{ '--tooltip-x': `${(active.x / VIEW_W) * 100}%` } as React.CSSProperties}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{active.label}</p>
              <p className="mt-1 font-display text-xl text-stone-950">{formatRupees(active.revenue)}</p>
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
};
