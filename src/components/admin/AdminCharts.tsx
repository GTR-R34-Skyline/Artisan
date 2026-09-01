import React, { useMemo, useState } from 'react';
import { AdminSalesPoint, NamedCount, RevenueRange } from '../../types/adminAnalytics';
import { AnimatedMetric } from '../analytics/AnimatedMetric';
import { formatCount, formatRupees } from '../analytics/formatters';

const FOREST = '#264336';
const SAGE = '#6d7f74';
const WARM = '#b59a6a';
const STONE = '#8a8e85';
const INK = '#1d211d';

const RANGES: Array<{ id: RevenueRange; label: string }> = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
];

const STATUS_COLORS: Record<string, string> = {
  delivered: FOREST,
  completed: FOREST,
  complete: FOREST,
  fulfilled: FOREST,
  shipped: SAGE,
  processing: WARM,
  cancelled: STONE,
  canceled: STONE,
  success: FOREST,
  succeeded: FOREST,
  paid: FOREST,
  pending: WARM,
  failed: STONE,
};

const colorForStatus = (key: string, index = 0): string =>
  STATUS_COLORS[key.toLowerCase()] || [FOREST, SAGE, WARM, STONE, INK][index % 5];

const formatAxisRupees = (value: number): string => {
  if (value >= 100000) return `₹${(Math.round((value / 100000) * 10) / 10).toLocaleString('en-IN')}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000).toLocaleString('en-IN')}k`;
  return formatRupees(value);
};

const toSmoothPath = (points: Array<{ x: number; y: number }>): string => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] || current;
    const after = points[index + 2] || next;
    path += ` C ${current.x + (next.x - previous.x) / 6} ${current.y + (next.y - previous.y) / 6}, ${next.x - (after.x - current.x) / 6} ${next.y - (after.y - current.y) / 6}, ${next.x} ${next.y}`;
  }
  return path;
};

export const Sparkline: React.FC<{ values: number[]; className?: string }> = ({ values, className = '' }) => {
  const width = 320;
  const height = 58;
  const pad = 4;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const mapped = values.map((value, index) => ({
    x: pad + (values.length <= 1 ? (width - pad * 2) / 2 : (index / Math.max(values.length - 1, 1)) * (width - pad * 2)),
    y: pad + (height - pad * 2) - ((value - min) / span) * (height - pad * 2),
  }));
  const line = toSmoothPath(mapped);
  const area = mapped.length
    ? `${line} L ${mapped[mapped.length - 1].x} ${height - pad} L ${mapped[0].x} ${height - pad} Z`
    : '';
  const last = mapped[mapped.length - 1];

  if (!values.length) return null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={`admin-sparkline ${className}`} aria-hidden="true">
      <path d={area} className="admin-sparkline-fill" />
      <path d={line} className="admin-sparkline-line" />
      {last ? <rect x={last.x - 2.5} y={last.y - 2.5} width="5" height="5" className="admin-sparkline-mark" /> : null}
    </svg>
  );
};

interface AdminMetricCardProps {
  label: string;
  value: number;
  format?: (value: number) => string;
  hint?: string;
  spark?: number[];
}

export const AdminMetricCard: React.FC<AdminMetricCardProps> = ({
  label,
  value,
  format = formatCount,
  hint,
  spark,
}) => (
  <article className="admin-metric-card">
    <p className="admin-metric-label">{label}</p>
    <p className="admin-metric-value">
      <AnimatedMetric value={value} format={format} />
    </p>
    {hint ? <p className="admin-metric-hint">{hint}</p> : null}
    {spark && spark.length ? (
      <div className="admin-metric-spark">
        <Sparkline values={spark} />
      </div>
    ) : null}
  </article>
);

export const AdminSectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="admin-section-label">{children}</p>
);

const VIEW_W = 860;
const VIEW_H = 268;
const PAD = { top: 24, right: 16, bottom: 40, left: 58 };

interface SalesChartProps {
  series: Record<RevenueRange, AdminSalesPoint[]>;
}

export const AdminSalesChart: React.FC<SalesChartProps> = ({ series }) => {
  const [range, setRange] = useState<RevenueRange>('30d');
  const [metric, setMetric] = useState<'revenue' | 'units'>('revenue');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const points = useMemo(() => series[range] || [], [range, series]);
  const gradientId = React.useId().replace(/:/g, '');

  const chart = useMemo(() => {
    const innerWidth = VIEW_W - PAD.left - PAD.right;
    const innerHeight = VIEW_H - PAD.top - PAD.bottom;
    const values = points.map((point) => (metric === 'revenue' ? point.revenue : point.units));
    const maxValue = Math.max(...values, 0);
    const ceiling = maxValue === 0 ? 1 : maxValue * 1.12;
    const mapped = points.map((point, index) => {
      const value = metric === 'revenue' ? point.revenue : point.units;
      const x = PAD.left + (points.length === 1 ? innerWidth / 2 : (index / Math.max(points.length - 1, 1)) * innerWidth);
      const y = PAD.top + innerHeight - (value / ceiling) * innerHeight;
      return { ...point, x, y, value };
    });
    const line = toSmoothPath(mapped.map(({ x, y }) => ({ x, y })));
    const area = mapped.length
      ? `${line} L ${mapped[mapped.length - 1].x} ${PAD.top + innerHeight} L ${mapped[0].x} ${PAD.top + innerHeight} Z`
      : '';
    const ticks = [0, 0.5, 1].map((ratio) => ({
      y: PAD.top + innerHeight - ratio * innerHeight,
      label: metric === 'revenue' ? formatAxisRupees(ceiling * ratio) : formatCount(ceiling * ratio),
    }));
    const xLabels = mapped.filter((_, index) => {
      if (mapped.length <= 7) return true;
      const step = Math.ceil(mapped.length / 6);
      return index % step === 0 || index === mapped.length - 1;
    });
    return { mapped, line, area, ticks, xLabels, maxValue };
  }, [metric, points]);

  const nearestIndex = (viewX: number): number => {
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    chart.mapped.forEach((point, index) => {
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

  const active = activeIndex !== null ? chart.mapped[activeIndex] : null;
  const periodRevenue = points.reduce((sum, point) => sum + point.revenue, 0);
  const periodUnits = points.reduce((sum, point) => sum + point.units, 0);

  return (
    <section className="admin-panel overflow-hidden p-5 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="admin-metric-label">Sales over time</p>
          <h2 className="mt-3 font-display text-4xl leading-none tracking-[-0.04em] text-stone-950 sm:text-5xl">
            {metric === 'revenue' ? formatRupees(periodRevenue) : formatCount(periodUnits)}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-stone-600">
            Completed marketplace sales for the selected period. Realized revenue uses delivered orders only.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="admin-range-pills flex flex-wrap gap-2">
            {(['revenue', 'units'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => { setMetric(item); setActiveIndex(null); }}
                className={metric === item ? 'is-active' : ''}
              >
                {item === 'revenue' ? 'Revenue' : 'Units sold'}
              </button>
            ))}
          </div>
          <div className="admin-range-pills flex flex-wrap gap-2">
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
      </div>

      {chart.maxValue === 0 ? (
        <div className="mt-10 border-t border-stone-300/80 pt-10">
          <p className="font-display text-2xl text-stone-900">No completed sales in this period.</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">
            When delivered orders arrive, this chart will show revenue and units across the marketplace.
          </p>
        </div>
      ) : (
        <div className="admin-chart-wrap relative mt-8 min-w-0">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="admin-chart h-[210px] w-full sm:h-[268px]"
            role="img"
            aria-label={metric === 'revenue' ? 'Revenue over time' : 'Units sold over time'}
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(event) => setActiveIndex(nearestIndex(pointerViewX(event, event.clientX)))}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (touch) setActiveIndex(nearestIndex(pointerViewX(event, touch.clientX)));
            }}
          >
            <defs>
              <linearGradient id={`admin-sales-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={FOREST} stopOpacity="0.22" />
                <stop offset="100%" stopColor={FOREST} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {chart.ticks.map((tick) => (
              <g key={tick.y}>
                <line x1={PAD.left} x2={VIEW_W - PAD.right} y1={tick.y} y2={tick.y} className="admin-chart-grid" />
                <text x={0} y={tick.y + 4} className="admin-chart-axis">{tick.label}</text>
              </g>
            ))}
            <path d={chart.area} fill={`url(#admin-sales-fill-${gradientId})`} />
            <path d={chart.line} className="admin-chart-line" />
            {chart.xLabels.map((point) => (
              <text key={point.key} x={point.x} y={VIEW_H - 10} textAnchor="middle" className="admin-chart-axis">
                {point.label}
              </text>
            ))}
            {active && (
              <g>
                <line x1={active.x} x2={active.x} y1={PAD.top} y2={VIEW_H - PAD.bottom} className="admin-chart-guide" />
                <circle cx={active.x} cy={active.y} r="5" className="admin-chart-dot" />
              </g>
            )}
          </svg>
          {active && (
            <div className="admin-chart-tooltip" style={{ '--tooltip-x': `${(active.x / VIEW_W) * 100}%` } as React.CSSProperties}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{active.label}</p>
              <p className="mt-1 font-display text-xl text-stone-950">{formatRupees(active.revenue)}</p>
              <p className="mt-1 text-xs text-stone-500">
                {formatCount(active.units)} units · {formatCount(active.orders)} orders
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

interface DonutSlice {
  key: string;
  label: string;
  count: number;
  color: string;
}

const slicesFromCounts = (items: NamedCount[]): DonutSlice[] =>
  items.map((item, index) => ({
    key: item.key,
    label: item.label,
    count: item.count,
    color: colorForStatus(item.key, index),
  }));

interface DonutProps {
  title?: string;
  eyebrow: string;
  items: NamedCount[];
  centerLabel: string;
  centerValue: string;
  footnote?: string;
}

export const AdminDonut: React.FC<DonutProps> = ({ title, eyebrow, items, centerLabel, centerValue, footnote }) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const slices = slicesFromCounts(items);
  const SIZE = 176;
  const STROKE = 22;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const visible = slices.filter((slice) => slice.count > 0);
  let offset = 0;

  const rings = (visible.length ? visible : [{ key: 'empty', label: 'None', count: 1, color: 'rgba(29,33,29,0.08)' }]).map((slice) => {
    const fraction = total ? slice.count / total : 1;
    const dash = fraction * circumference;
    const ring = { ...slice, dash, offset, fraction };
    offset += dash;
    return ring;
  });

  return (
    <section className="admin-panel p-5 sm:p-7">
      <p className="admin-metric-label">{eyebrow}</p>
      {title ? <h2 className="mt-2 font-display text-2xl tracking-[-0.04em] text-stone-950 sm:text-3xl">{title}</h2> : null}
      <div className={`${title ? 'mt-8' : 'mt-6'} flex flex-col items-center gap-8 sm:flex-row sm:items-center`}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-40 w-40 shrink-0" role="img" aria-label={title}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {rings.map((ring) => (
              <circle
                key={ring.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={STROKE}
                strokeDasharray={`${ring.dash} ${circumference - ring.dash}`}
                strokeDashoffset={-ring.offset}
                strokeLinecap="butt"
                className={`admin-donut-slice ${activeKey && activeKey !== ring.key ? 'is-muted' : ''}`}
                onMouseEnter={() => setActiveKey(ring.key === 'empty' ? null : ring.key)}
                onMouseLeave={() => setActiveKey(null)}
              />
            ))}
          </g>
          <text x={SIZE / 2} y={SIZE / 2 - 6} textAnchor="middle" className="admin-donut-value">{centerValue}</text>
          <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" className="admin-donut-caption">{centerLabel}</text>
        </svg>
        <ul className="w-full min-w-0 space-y-3">
          {slices.map((slice) => (
            <li
              key={slice.key}
              className={`flex items-center justify-between gap-4 text-sm ${activeKey === slice.key ? 'text-stone-950' : 'text-stone-600'}`}
              onMouseEnter={() => setActiveKey(slice.key)}
              onMouseLeave={() => setActiveKey(null)}
            >
              <span className="inline-flex min-w-0 items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                <span className="truncate capitalize">{slice.label}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-display text-lg text-stone-950">{formatCount(slice.count)}</span>
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                  {total ? `${((slice.count / total) * 100).toFixed(1)}%` : '0%'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {footnote ? <p className="mt-6 border-t border-stone-300/80 pt-4 text-xs leading-5 text-stone-500">{footnote}</p> : null}
    </section>
  );
};

interface CategoryBarRow {
  category: string;
  revenue: number;
  unitsSold: number;
  productCount: number;
}

export const AdminCategoryBars: React.FC<{ rows: CategoryBarRow[] }> = ({ rows }) => {
  const [active, setActive] = useState<string | null>(null);
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 0);

  return (
    <section className="admin-panel p-5 sm:p-7">
      <p className="admin-metric-label">Category performance</p>
      <h2 className="mt-2 font-display text-2xl tracking-[-0.04em] text-stone-950 sm:text-3xl">Where demand sits.</h2>
      {rows.length && maxRevenue > 0 ? (
        <div className="mt-8 space-y-4">
          {rows.map((row) => {
            const width = maxRevenue ? Math.max(4, (row.revenue / maxRevenue) * 100) : 0;
            return (
              <button
                key={row.category}
                type="button"
                className="admin-bar-row w-full text-left"
                onMouseEnter={() => setActive(row.category)}
                onMouseLeave={() => setActive(null)}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="truncate text-sm text-stone-950">{row.category}</p>
                  <p className="shrink-0 font-display text-lg text-stone-950">{formatRupees(row.revenue)}</p>
                </div>
                <div className="admin-bar-track mt-2">
                  <div className="admin-bar-fill" style={{ width: `${width}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-stone-500">
                  {formatCount(row.unitsSold)} units · {formatCount(row.productCount)} works
                </p>
                {active === row.category ? (
                  <span className="sr-only">
                    {row.category}: {formatRupees(row.revenue)}, {formatCount(row.unitsSold)} units
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-8 text-sm text-stone-500">No category sales are available yet.</p>
      )}
    </section>
  );
};
