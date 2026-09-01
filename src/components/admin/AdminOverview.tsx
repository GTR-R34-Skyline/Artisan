import React from 'react';
import { StatusLabel } from '../DesignSystem';
import { AdminAnalytics } from '../../types/adminAnalytics';
import { formatCount, formatRupees } from '../analytics/formatters';
import {
  AdminDonut,
  AdminMetricCard,
  AdminSalesChart,
  AdminSectionLabel,
} from './AdminCharts';

interface AdminOverviewProps {
  analytics: AdminAnalytics;
}

const formatActivityDate = (value: string | null): string => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
};

const activityTone = (kind: AdminAnalytics['recentActivity'][number]['kind']): 'success' | 'warning' | 'neutral' => {
  if (kind === 'order' || kind === 'payment') return 'success';
  if (kind === 'application') return 'warning';
  return 'neutral';
};

export const AdminOverview: React.FC<AdminOverviewProps> = ({ analytics }) => {
  const sparkline = analytics.sales.byRange['30d'] || [];
  const paymentItems = [
    { key: 'success', label: 'Successful', count: analytics.payments.successful },
    { key: 'pending', label: 'Pending', count: analytics.payments.pending },
    { key: 'failed', label: 'Failed', count: analytics.payments.failed },
    ...(analytics.payments.cancelled
      ? [{ key: 'cancelled', label: 'Cancelled', count: analytics.payments.cancelled }]
      : []),
  ];

  return (
    <div className="admin-analytics space-y-12 py-12">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Sales overview</p>
          <h2 className="font-display text-4xl leading-[0.95] tracking-[-0.04em] text-stone-950 sm:text-5xl">
            How the market is trading.
          </h2>
          <p className="max-w-xl text-sm leading-7 text-stone-600">
            Realized revenue, completed orders, and settlement status across the whole marketplace. Catalogue and artisan rankings live in Marketplace.
          </p>
        </div>
        <p className="max-w-sm text-xs leading-6 text-stone-500">
          {formatCount(analytics.applications.pending)} applications awaiting review · {formatCount(analytics.products.pendingReview)} products awaiting review
        </p>
      </div>

      <div>
        <AdminSectionLabel>Trading</AdminSectionLabel>
        <section className="admin-metric-grid">
          <AdminMetricCard
            label="Realized revenue"
            value={analytics.sales.revenue}
            format={formatRupees}
            hint="Completed marketplace sales"
            spark={sparkline.map((point) => point.revenue)}
          />
          <AdminMetricCard
            label="Units sold"
            value={analytics.sales.unitsSold}
            hint="From completed orders"
            spark={sparkline.map((point) => point.units)}
          />
          <AdminMetricCard
            label="Completed orders"
            value={analytics.sales.completedOrderCount}
            hint="Delivered and fulfilled"
            spark={sparkline.map((point) => point.orders)}
          />
          <AdminMetricCard
            label="Average order value"
            value={analytics.sales.averageOrderValue}
            format={formatRupees}
            hint="Revenue per completed order"
            spark={sparkline.map((point) => (point.orders ? point.revenue / point.orders : 0))}
          />
        </section>
      </div>

      <div>
        <AdminSectionLabel>Sales over time</AdminSectionLabel>
        <AdminSalesChart series={analytics.sales.byRange} />
      </div>

      <div>
        <AdminSectionLabel>Orders and payments</AdminSectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminDonut
            eyebrow="Order status"
            items={analytics.orders.byStatus}
            centerValue={formatCount(analytics.orders.total)}
            centerLabel="orders"
          />
          <AdminDonut
            eyebrow="Payment status"
            items={paymentItems}
            centerValue={formatCount(analytics.payments.successful + analytics.payments.pending + analytics.payments.failed + analytics.payments.cancelled)}
            centerLabel="payments"
            footnote={`Successful payment value ${formatRupees(analytics.payments.successfulAmount)}. Recorded payment amounts are shown for settlement mix only and are not added to realized revenue.`}
          />
        </div>
      </div>

      <section className="admin-panel p-5 sm:p-6">
        <p className="admin-metric-label">Recent activity</p>
        {analytics.recentActivity.length ? (
          <div className="mt-5">
            {analytics.recentActivity.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 border-b border-stone-300 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-stone-950">{item.title}</p>
                  <p className="mt-1 text-xs text-stone-500">{item.detail}</p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusLabel tone={activityTone(item.kind)}>{item.kind}</StatusLabel>
                  <span className="text-xs text-stone-500">{formatActivityDate(item.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-stone-500">No recent activity is available.</p>
        )}
      </section>
    </div>
  );
};
