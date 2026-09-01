import React, { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { StatusLabel } from '../DesignSystem';
import { ADMIN_LOW_STOCK_THRESHOLD, AdminAnalytics, AdminProductRow, AdminVendorRow } from '../../types/adminAnalytics';
import { getProductTitle } from '../../types/marketplace';
import { formatCount, formatRating, formatRupees } from '../analytics/formatters';
import { AdminCategoryBars, AdminDonut, AdminMetricCard, AdminSectionLabel } from './AdminCharts';

interface AdminMarketplaceProps {
  analytics: AdminAnalytics;
}

type ProductSort = 'best_selling' | 'highest_revenue' | 'lowest_stock' | 'highest_rated';
type VendorSort = 'highest_revenue' | 'highest_units' | 'most_products' | 'highest_rated';

const PRODUCT_SORTS: Array<{ id: ProductSort; label: string }> = [
  { id: 'best_selling', label: 'Best selling' },
  { id: 'highest_revenue', label: 'Highest revenue' },
  { id: 'lowest_stock', label: 'Lowest stock' },
  { id: 'highest_rated', label: 'Highest rated' },
];

const VENDOR_SORTS: Array<{ id: VendorSort; label: string }> = [
  { id: 'highest_revenue', label: 'Highest revenue' },
  { id: 'highest_units', label: 'Highest units sold' },
  { id: 'most_products', label: 'Most products' },
  { id: 'highest_rated', label: 'Highest rated' },
];

const sortProducts = (rows: AdminProductRow[], sort: ProductSort) => {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'best_selling') return b.unitsSold - a.unitsSold;
    if (sort === 'highest_revenue') return b.revenue - a.revenue;
    if (sort === 'lowest_stock') return a.stock - b.stock;
    return (b.averageRating ?? -1) - (a.averageRating ?? -1);
  });
  return copy.slice(0, 12);
};

const sortVendors = (rows: AdminVendorRow[], sort: VendorSort) => {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'highest_revenue') return b.revenue - a.revenue;
    if (sort === 'highest_units') return b.unitsSold - a.unitsSold;
    if (sort === 'most_products') return b.productCount - a.productCount;
    return (b.averageRating ?? -1) - (a.averageRating ?? -1);
  });
  return copy.slice(0, 12);
};

const RatingCell: React.FC<{ value: number | null; count: number }> = ({ value, count }) => {
  if (value === null) return <span className="text-stone-400">No reviews</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-stone-950">
      <Star className="h-3.5 w-3.5 fill-forest text-forest" strokeWidth={1.5} />
      {formatRating(value)}
      <span className="text-stone-400">({count})</span>
    </span>
  );
};

export const AdminMarketplace: React.FC<AdminMarketplaceProps> = ({ analytics }) => {
  const [productSort, setProductSort] = useState<ProductSort>('best_selling');
  const [vendorSort, setVendorSort] = useState<VendorSort>('highest_revenue');
  const productRows = useMemo(() => sortProducts(analytics.productRows, productSort), [analytics.productRows, productSort]);
  const vendorRows = useMemo(() => sortVendors(analytics.vendorRows, vendorSort), [analytics.vendorRows, vendorSort]);
  const healthyProducts = Math.max(0, analytics.products.total - analytics.products.lowStock);
  const inventoryShare = analytics.products.total
    ? (healthyProducts / analytics.products.total) * 100
    : 0;

  const vendorStatusItems = [
    { key: 'verified', label: 'Verified', count: analytics.vendors.verified },
    { key: 'pending', label: 'Pending', count: analytics.vendors.pending },
    { key: 'rejected', label: 'Rejected', count: analytics.vendors.rejected },
  ].filter((item) => item.count > 0 || analytics.vendors.total === 0);

  return (
    <div className="admin-analytics space-y-10 py-12">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Catalogue</p>
          <h2 className="font-display text-4xl leading-[0.95] tracking-[-0.04em] text-stone-950 sm:text-5xl">
            Who is carrying the collection.
          </h2>
          <p className="max-w-xl text-sm leading-7 text-stone-600">
            Products, artisans, categories, and reviews. Sales totals and order settlement stay on Overview.
          </p>
        </div>
        <p className="max-w-sm text-xs leading-6 text-stone-500">
          {formatCount(analytics.users.buyers)} buyers · {formatCount(analytics.users.vendors)} vendor accounts · {formatCount(analytics.reviews.total)} reviews
        </p>
      </div>

      <div>
        <AdminSectionLabel>Collection health</AdminSectionLabel>
        <section className="admin-metric-grid">
          <AdminMetricCard
            label="Products"
            value={analytics.products.total}
            hint={`${formatCount(analytics.products.published)} published`}
          />
          <AdminMetricCard
            label="Current stock"
            value={analytics.products.totalStock}
            hint={`${formatCount(analytics.products.lowStock)} below the restock line`}
          />
          <AdminMetricCard
            label="Vendors"
            value={analytics.vendors.total}
            hint={`${formatCount(analytics.vendors.verified)} verified`}
          />
          <AdminMetricCard
            label="Average rating"
            value={analytics.reviews.averageRating ?? 0}
            format={formatRating}
            hint={analytics.reviews.total ? `${formatCount(analytics.reviews.total)} reviews` : 'No reviews yet'}
          />
        </section>
      </div>

      <div>
        <AdminSectionLabel>Product performance</AdminSectionLabel>
        <section className="admin-panel overflow-hidden p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <p className="admin-metric-label">Collection ranking</p>
            <div className="admin-range-pills flex flex-wrap gap-2">
              {PRODUCT_SORTS.map((item) => (
                <button key={item.id} type="button" onClick={() => setProductSort(item.id)} className={productSort === item.id ? 'is-active' : ''}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="admin-rank-table w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr>
                  <th>Work</th>
                  <th>Category</th>
                  <th>Units sold</th>
                  <th>Revenue</th>
                  <th>Stock</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((row) => (
                  <tr key={row.product.id}>
                    <td className="text-stone-950">{getProductTitle(row.product)}</td>
                    <td className="text-stone-600">{row.product.category || '—'}</td>
                    <td className="font-display text-lg">{formatCount(row.unitsSold)}</td>
                    <td>{formatRupees(row.revenue)}</td>
                    <td className={row.stock <= ADMIN_LOW_STOCK_THRESHOLD ? 'text-amber-800' : 'text-stone-950'}>{formatCount(row.stock)}</td>
                    <td><RatingCell value={row.averageRating} count={row.reviewCount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div>
        <AdminSectionLabel>Vendor performance</AdminSectionLabel>
        <section className="admin-panel overflow-hidden p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <p className="admin-metric-label">Artisan ranking</p>
            <div className="admin-range-pills flex flex-wrap gap-2">
              {VENDOR_SORTS.map((item) => (
                <button key={item.id} type="button" onClick={() => setVendorSort(item.id)} className={vendorSort === item.id ? 'is-active' : ''}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="admin-rank-table w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr>
                  <th>Artisan</th>
                  <th>Practice</th>
                  <th>Products</th>
                  <th>Units sold</th>
                  <th>Revenue</th>
                  <th>Completed orders</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {vendorRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <p className="text-stone-950">{row.name}</p>
                      {row.verificationStatus ? (
                        <div className="mt-1">
                          <StatusLabel tone={row.verificationStatus === 'verified' ? 'success' : row.verificationStatus === 'pending' ? 'warning' : 'neutral'}>
                            {row.verificationStatus}
                          </StatusLabel>
                        </div>
                      ) : null}
                    </td>
                    <td className="text-stone-600">{row.craftType || '—'}</td>
                    <td>{formatCount(row.productCount)}</td>
                    <td className="font-display text-lg">{formatCount(row.unitsSold)}</td>
                    <td>{formatRupees(row.revenue)}</td>
                    <td>{formatCount(row.completedOrders)}</td>
                    <td><RatingCell value={row.averageRating} count={row.reviewCount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div>
        <AdminSectionLabel>Inventory</AdminSectionLabel>
        <section className="admin-panel p-5 sm:p-6">
          <p className="admin-metric-label">Restock list</p>
          <div className="mt-5">
            <div className="admin-inventory-track" aria-hidden="true">
              <span className="admin-inventory-healthy" style={{ width: `${inventoryShare}%` }} />
              <span className="admin-inventory-low" style={{ width: `${Math.max(0, 100 - inventoryShare)}%` }} />
            </div>
            <p className="mt-3 text-xs text-stone-500">
              {formatCount(healthyProducts)} works above a stock of {ADMIN_LOW_STOCK_THRESHOLD} · {formatCount(analytics.products.lowStock)} need attention
            </p>
          </div>
          {analytics.lowStockProducts.length ? (
            <ul className="mt-6 space-y-3">
              {analytics.lowStockProducts.map((row) => (
                <li key={row.product.id} className="flex items-baseline justify-between gap-4 border-b border-stone-200 pb-3 text-sm last:border-0">
                  <span className="truncate text-stone-950">{getProductTitle(row.product)}</span>
                  <span className="shrink-0 text-stone-600">{formatCount(row.stock)} left</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-stone-500">No products currently sit at or below the restock line.</p>
          )}
        </section>
      </div>

      <div>
        <AdminSectionLabel>Composition</AdminSectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminCategoryBars rows={analytics.categoryRows} />
          <div className="grid gap-4">
            <AdminDonut
              eyebrow="Vendor verification"
              items={vendorStatusItems}
              centerValue={formatCount(analytics.vendors.total)}
              centerLabel="vendors"
            />
            <AdminDonut
              eyebrow="People on the platform"
              items={analytics.users.byRole}
              centerValue={formatCount(analytics.users.total)}
              centerLabel="users"
            />
          </div>
        </div>
      </div>

      <section className="admin-panel p-5 sm:p-6">
        <p className="admin-metric-label">Recent reviews</p>
        <div className="mt-5">
          {analytics.reviews.recent.length ? analytics.reviews.recent.map((review) => (
            <article key={review.id} className="border-b border-stone-200 py-4 last:border-0">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-stone-950">{review.productTitle || review.vendorName || 'Marketplace review'}</p>
                <span className="inline-flex items-center gap-1.5 text-stone-950">
                  <Star className="h-3.5 w-3.5 fill-forest text-forest" strokeWidth={1.5} />
                  {formatRating(review.rating)}
                </span>
              </div>
              {review.comment ? <p className="mt-2 text-sm leading-6 text-stone-600">{review.comment}</p> : null}
              <p className="mt-2 text-xs text-stone-400">{[review.reviewerName, review.vendorName].filter(Boolean).join(' · ')}</p>
            </article>
          )) : (
            <p className="text-sm text-stone-500">No reviews are available yet.</p>
          )}
        </div>
      </section>
    </div>
  );
};
