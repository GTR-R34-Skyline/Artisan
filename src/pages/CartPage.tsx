import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLocale } from '../i18n/LocaleContext';
import QuantitySelector from '../components/QuantitySelector';
import { Button, EmptyState, Eyebrow, ImageFrame } from '../components/DesignSystem';
import { formatCurrency } from '../services/checkout.service';

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, subtotal, updateQuantity, removeItem } = useCart();
  const { t } = useLocale();

  if (!items.length) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <Eyebrow>{t('cart.eyebrow')}</Eyebrow>
        <div className="mt-10">
          <EmptyState
            title={t('cart.emptyTitle')}
            description={t('cart.emptyDescription')}
          />
        </div>
        <div className="mt-10">
          <Button onClick={() => navigate('/marketplace')}>{t('cart.browse')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <Eyebrow>{t('cart.eyebrow')}</Eyebrow>
      <h1 className="mt-4 font-display text-5xl tracking-[-0.04em] text-stone-950 sm:text-6xl">{t('cart.title')}</h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600">
        {t('cart.subtitle')}
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr]">
        <div className="space-y-8">
          {items.map((item) => (
            <article key={item.productId} className="grid gap-6 border-b border-stone-300 pb-8 sm:grid-cols-[8rem_1fr_auto]">
              <Link to={`/marketplace/${item.productId}`}>
                <ImageFrame src={item.image} alt={item.title} className="aspect-square" />
              </Link>
              <div>
                <Link to={`/marketplace/${item.productId}`} className="font-display text-3xl text-stone-950 hover:text-forest">
                  {item.title}
                </Link>
                <p className="mt-2 text-sm text-stone-500">{formatCurrency(item.unitPrice)} {t('cart.each')}</p>
                <div className="mt-5">
                  <QuantitySelector
                    value={item.quantity}
                    max={item.maxStock}
                    onChange={(quantity) => updateQuantity(item.productId, quantity)}
                    decreaseLabel={t('cart.decreaseQty')}
                    increaseLabel={t('cart.increaseQty')}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end justify-between gap-4">
                <p className="font-display text-2xl text-stone-950">{formatCurrency(item.unitPrice * item.quantity)}</p>
                <button
                  type="button"
                  onClick={() => removeItem(item.productId)}
                  className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 hover:text-stone-950"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} /> {t('cart.remove')}
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="h-fit border border-stone-300 p-6">
          <Eyebrow>{t('cart.summary')}</Eyebrow>
          <p className="mt-6 font-display text-4xl text-stone-950">{formatCurrency(subtotal)}</p>
          <p className="mt-2 text-sm text-stone-500">{t('cart.mockNote')}</p>
          <div className="mt-8 space-y-3">
            <Button className="w-full" onClick={() => navigate('/checkout')}>{t('cart.proceed')}</Button>
            <Button variant="light" className="w-full" onClick={() => navigate('/marketplace')}>{t('cart.continue')}</Button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CartPage;
