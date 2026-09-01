import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { Button, EmptyState, Eyebrow, LoadingState, StatusLabel } from '../components/DesignSystem';
import { formatCurrency, getCheckoutSnapshot } from '../services/checkout.service';
import { CheckoutSnapshot, orderStatusLabel, paymentStatusLabel } from '../types/checkout';

const OrderConfirmationPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return;
    getCheckoutSnapshot(orderId)
      .then(setSnapshot)
      .catch(() => setError('This confirmation could not be loaded.'))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><LoadingState label="Opening confirmation" /></div>;
  }

  if (error || !snapshot) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <EmptyState title="Confirmation unavailable." description={error || 'This order could not be found.'} />
      </div>
    );
  }

  const paid = (snapshot.payment?.status || '').toLowerCase() === 'success';

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <Eyebrow>Order confirmation</Eyebrow>
      <div className="mt-6 flex items-start gap-4">
        <CheckCircle2 className={`mt-1 h-6 w-6 ${paid ? 'text-emerald-700' : 'text-stone-400'}`} strokeWidth={1.5} />
        <div>
          <h1 className="font-display text-5xl tracking-[-0.04em] text-stone-950 sm:text-6xl">
            {paid ? 'Thank you. Your order is confirmed.' : 'Your order is recorded.'}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
            {paid
              ? 'Your mock UPI payment succeeded. The order is marked delivered in this demo flow, and you may review the piece once it appears in your purchase history.'
              : 'Payment has not completed yet. Return to the payment screen to finish checkout.'}
          </p>
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr]">
        <section className="space-y-8">
          <div className="border border-stone-300 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Order details</p>
            <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Order ID</dt>
                <dd className="mt-1 text-stone-950">{snapshot.order.id}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Order status</dt>
                <dd className="mt-1"><StatusLabel tone={paid ? 'success' : 'neutral'}>{orderStatusLabel(snapshot.order.status)}</StatusLabel></dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Payment status</dt>
                <dd className="mt-1">{paymentStatusLabel(snapshot.payment?.status)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Reference</dt>
                <dd className="mt-1 text-stone-950">{snapshot.payment?.transactionId || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Delivery address</dt>
                <dd className="mt-1 text-stone-950">{snapshot.order.shippingAddress || '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="border border-stone-300 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Pieces in this order</p>
            <div className="mt-6 space-y-4">
              {snapshot.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4 last:border-b-0 last:pb-0">
                  <div>
                    <Link to={`/marketplace/${item.productId}`} className="font-display text-2xl text-stone-950 hover:text-forest">
                      {item.title || 'Selected work'}
                    </Link>
                    <p className="mt-1 text-sm text-stone-500">Qty {item.quantity}</p>
                  </div>
                  <p className="text-sm text-stone-950">{formatCurrency(item.subtotal)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="h-fit border border-stone-300 p-6">
          <Eyebrow>Total paid</Eyebrow>
          <p className="mt-4 font-display text-5xl text-stone-950">{formatCurrency(snapshot.payment?.amount ?? snapshot.order.totalAmount)}</p>
          <div className="mt-8 space-y-3">
            {snapshot.items[0] && (
              <Link
                to={`/marketplace/${snapshot.items[0].productId}`}
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-950"
              >
                View piece <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            )}
            {!paid && snapshot.order.id && (
              <Button className="w-full" onClick={() => window.location.assign(`/checkout/payment/${snapshot.order.id}`)}>
                Return to payment
              </Button>
            )}
            <Button variant="light" className="w-full" onClick={() => window.location.assign('/marketplace')}>
              Continue browsing
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
