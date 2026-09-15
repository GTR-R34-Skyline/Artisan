import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuthHook';
import { useCart } from '../context/CartContext';
import { useLocale } from '../i18n/LocaleContext';
import QuantitySelector from '../components/QuantitySelector';
import { Button, EmptyState, Eyebrow, Field, LoadingState } from '../components/DesignSystem';
import {
  createCheckoutIdempotencyKey,
  createCheckoutOrder,
  formatCurrency,
  rememberCheckoutIdempotencyKey,
} from '../services/checkout.service';

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const { items, subtotal, clearCart, updateQuantity } = useCart();
  const { t } = useLocale();
  const [shippingAddress, setShippingAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  if (authLoading) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><LoadingState label={t('checkout.preparing')} /></div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <EmptyState title={t('checkout.signInTitle')} description={t('checkout.signInDescription')} />
        <div className="mt-8">
          <Button onClick={() => navigate('/login', { state: { from: { pathname: '/checkout' } } })}>{t('nav.signIn')}</Button>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <EmptyState title={t('checkout.emptyTitle')} description={t('checkout.emptyDescription')} />
        <div className="mt-8">
          <Button onClick={() => navigate('/marketplace')}>{t('cart.browse')}</Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const idempotencyKey = createCheckoutIdempotencyKey();
      rememberCheckoutIdempotencyKey(idempotencyKey);
      const { order } = await createCheckoutOrder({
        items,
        shippingAddress,
        idempotencyKey,
        gstin: gstin.trim() || undefined,
      });
      clearCart();
      navigate(`/checkout/payment/${order.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Checkout could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <Eyebrow>{t('checkout.eyebrow')}</Eyebrow>
      <h1 className="mt-4 font-display text-5xl tracking-[-0.04em] text-stone-950 sm:text-6xl">{t('checkout.title')}</h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600">
        {t('checkout.signedInAs')} {profile?.full_name || user.email}.
      </p>

      <form onSubmit={handleSubmit} className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr]">
        <div className="space-y-8">
          <Field
            label={t('checkout.address')}
            value={shippingAddress}
            onChange={(event) => setShippingAddress(event.target.value)}
            placeholder={t('checkout.addressPlaceholder')}
            textarea
            required
          />

          <section className="border-y border-stone-300 py-8">
            <Eyebrow>{t('checkout.bulkTitle')}</Eyebrow>
            <div className="mt-6 space-y-6">
              {items.map((item) => (
                <div key={item.productId} className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-stone-950">{item.title}</p>
                    <p className="mt-1 text-xs text-stone-500">{t('checkout.bulkQuantity')}</p>
                  </div>
                  <QuantitySelector
                    value={item.quantity}
                    max={item.maxStock}
                    onChange={(quantity) => updateQuantity(item.productId, quantity)}
                    decreaseLabel={t('cart.decreaseQty')}
                    increaseLabel={t('cart.increaseQty')}
                  />
                </div>
              ))}
              <Field
                label={t('checkout.gstin')}
                value={gstin}
                onChange={(event) => setGstin(event.target.value)}
                placeholder={t('checkout.gstinPlaceholder')}
              />
              <p className="text-xs leading-6 text-stone-500">{t('checkout.gstinHint')}</p>
              {gstin.trim() ? (
                <p className="text-xs leading-6 text-stone-600">{t('checkout.gstDiscountPending')}</p>
              ) : null}
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                {t('checkout.bulkQuantity')}: {totalQuantity}
              </p>
            </div>
          </section>

          {error && <p className="border-l-2 border-amber-700 pl-4 text-sm leading-6 text-stone-700">{error}</p>}
        </div>

        <aside className="h-fit border border-stone-300 p-6">
          <Eyebrow>{t('checkout.summary')}</Eyebrow>
          <div className="mt-6 space-y-4">
            {items.map((item) => (
              <div key={item.productId} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="text-stone-950">{item.title}</p>
                  <p className="mt-1 text-stone-500">Qty {item.quantity}</p>
                </div>
                <p className="text-stone-950">{formatCurrency(item.unitPrice * item.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-stone-300 pt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{t('checkout.total')}</p>
            <p className="mt-2 font-display text-4xl text-stone-950">{formatCurrency(subtotal)}</p>
          </div>
          <div className="mt-8">
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? t('checkout.creating') : t('checkout.continue')}
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
};

export default CheckoutPage;
