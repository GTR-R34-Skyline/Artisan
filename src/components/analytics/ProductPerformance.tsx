import React, { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { EmptyState, StatusLabel } from '../DesignSystem';
import { ProductPerformanceRow, ProductPerformanceSort } from '../../types/analytics';
import { getProductImage, getProductTitle, MarketplaceProduct } from '../../types/marketplace';
import { formatRating, formatRupees } from './formatters';
import { ProductThumb } from './ProductThumb';
import { ProductPriceEditor } from '../vendor/ProductPriceEditor';

interface ProductPerformanceProps {
  rows: ProductPerformanceRow[];
  onPriceUpdated?: (productId: string, finalPrice: number) => void;
}

const SORTS: Array<{ id: ProductPerformanceSort; label: string }> = [
  { id: 'best_selling', label: 'Best selling' },
  { id: 'highest_revenue', label: 'Highest revenue' },
  { id: 'lowest_stock', label: 'Lowest stock' },
  { id: 'highest_rated', label: 'Highest rated' },
];

const sortRows = (rows: ProductPerformanceRow[], sort: ProductPerformanceSort) => {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'best_selling') return b.unitsSold - a.unitsSold;
    if (sort === 'highest_revenue') return b.revenue - a.revenue;
    if (sort === 'lowest_stock') return a.stock - b.stock;
    return (b.averageRating ?? -1) - (a.averageRating ?? -1);
  });
  return copy;
};

const statusTone = (status: string): 'success' | 'warning' | 'neutral' => {
  if (['published', 'approved', 'synced'].includes(status)) return 'success';
  if (['pending_review', 'under_review', 'processing'].includes(status)) return 'warning';
  return 'neutral';
};

const RatingValue: React.FC<{ value: number | null; count: number }> = ({ value, count }) => {
  if (value === null) return <span className="text-stone-400">No reviews</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-stone-950">
      <Star className="h-3.5 w-3.5 fill-forest text-forest" strokeWidth={1.5} />
      {formatRating(value)}
      <span className="text-stone-400">({count})</span>
    </span>
  );
};

export const ProductPerformance: React.FC<ProductPerformanceProps> = ({ rows, onPriceUpdated }) => {
  const [sort, setSort] = useState<ProductPerformanceSort>('best_selling');
  const [editingProduct, setEditingProduct] = useState<MarketplaceProduct | null>(null);
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort]);

  if (!rows.length) {
    return <EmptyState title="Your collection starts here." description="Add your first piece and performance details will appear in this workspace." />;
  }

  const openEditor = (product: MarketplaceProduct) => {
    setEditingProduct(product);
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Product performance</p>
          <h2 className="mt-3 font-display text-4xl tracking-[-0.04em] text-stone-950">How each piece is working.</h2>
        </div>
        <div className="analytics-range-pills flex flex-wrap gap-2">
          {SORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSort(item.id)}
              className={sort === item.id ? 'is-active' : ''}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {editingProduct && (
        <ProductPriceEditor
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onUpdated={(finalPrice) => {
            setEditingProduct((current) => (current ? { ...current, final_price: finalPrice } : current));
            onPriceUpdated?.(editingProduct.id, finalPrice);
          }}
        />
      )}

      <div className="hidden overflow-x-auto lg:block">
        <table className="analytics-table w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
              <th className="py-4 pr-6">Work</th>
              <th className="py-4 pr-6">Category</th>
              <th className="py-4 pr-6">Units sold</th>
              <th className="py-4 pr-6">Revenue</th>
              <th className="py-4 pr-6">Stock</th>
              <th className="py-4 pr-6">Rating</th>
              <th className="py-4 pr-6 text-right">Price</th>
              <th className="py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.product.id} className="analytics-table-row border-b border-stone-200">
                <td className="py-4 pr-6">
                  <div className="flex items-center gap-4">
                    <ProductThumb
                      src={getProductImage(row.product)}
                      alt={getProductTitle(row.product)}
                      className="h-16 w-16 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-950">{getProductTitle(row.product)}</p>
                      <div className="mt-1">
                        <StatusLabel tone={statusTone(row.product.status)}>{row.product.status.replace('_', ' ')}</StatusLabel>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-4 pr-6 text-stone-600">{row.product.category || '—'}</td>
                <td className="py-4 pr-6 font-display text-xl text-stone-950">{row.unitsSold.toLocaleString('en-IN')}</td>
                <td className="py-4 pr-6 text-stone-950">{formatRupees(row.revenue)}</td>
                <td className="py-4 pr-6">
                  <span className={row.stock <= 5 ? 'text-amber-800' : 'text-stone-950'}>{row.stock.toLocaleString('en-IN')}</span>
                </td>
                <td className="py-4 pr-6"><RatingValue value={row.averageRating} count={row.reviewCount} /></td>
                <td className="py-4 pr-6 text-right text-stone-950">{row.price !== null ? formatRupees(row.price) : '—'}</td>
                <td className="py-4 text-right">
                  <button
                    type="button"
                    onClick={() => openEditor(row.product)}
                    className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950"
                  >
                    Edit price
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden">
        {sorted.map((row) => (
          <article key={row.product.id} className="analytics-glass-card p-4">
            <div className="flex gap-4">
              <ProductThumb
                src={getProductImage(row.product)}
                alt={getProductTitle(row.product)}
                className="h-24 w-24 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-2xl leading-tight text-stone-950">{getProductTitle(row.product)}</h3>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-500">{row.product.category || 'Handmade work'}</p>
                <div className="mt-2">
                  <StatusLabel tone={statusTone(row.product.status)}>{row.product.status.replace('_', ' ')}</StatusLabel>
                </div>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-stone-300/80 pt-4 text-sm">
              <div><dt className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Units sold</dt><dd className="mt-1 font-display text-xl">{row.unitsSold.toLocaleString('en-IN')}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Revenue</dt><dd className="mt-1">{formatRupees(row.revenue)}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Stock</dt><dd className={`mt-1 ${row.stock <= 5 ? 'text-amber-800' : ''}`}>{row.stock.toLocaleString('en-IN')}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Price</dt><dd className="mt-1">{row.price !== null ? formatRupees(row.price) : '—'}</dd></div>
              <div className="col-span-2"><dt className="text-[10px] uppercase tracking-[0.16em] text-stone-500">Rating</dt><dd className="mt-1"><RatingValue value={row.averageRating} count={row.reviewCount} /></dd></div>
            </dl>
            <button
              type="button"
              onClick={() => openEditor(row.product)}
              className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950"
            >
              Edit price
            </button>
          </article>
        ))}
      </div>
    </section>
  );
};
