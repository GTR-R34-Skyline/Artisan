import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button, EmptyState, Eyebrow, LoadingState, StatusLabel } from '../components/DesignSystem';
import { useAuth } from '../auth/useAuthHook';
import {
  createRazorpayCheckoutSession,
  formatCurrency,
  getCheckoutSnapshot,
  openRazorpayCheckout,
  retryCheckoutPayment,
  verifyRazorpayPayment,
} from '../services/checkout.service';
import {
  CheckoutSnapshot,
  paymentStatusLabel,
} from '../types/checkout';

type PaymentScreen = 'ready' | 'preparing' | 'checkout' | 'verifying' | 'success' | 'failed' | 'cancelled';

const PaymentCheckoutPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<PaymentScreen>('ready');
  const [processing, setProcessing] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  const loadSnapshot = useCallback(async () => {
    if (!orderId) return;
    const next = await getCheckoutSnapshot(orderId);
    setSnapshot(next);

    const paymentStatus = (next.payment?.status || '').toLowerCase();
    if (paymentStatus === 'success') {
      setScreen('success');
    } else if (paymentStatus === 'failed') {
      setScreen('failed');
    } else {
      setScreen('ready');
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    setError('');
    loadSnapshot()
      .catch(() => setError('This payment could not be loaded.'))
      .finally(() => setLoading(false));
  }, [orderId, loadSnapshot]);

  const handlePay = async () => {
    if (!orderId || !snapshot?.payment || processing) return;

    setProcessing(true);
    setError('');
    setResultMessage('');
    setScreen('preparing');

    try {
      const session = await createRazorpayCheckoutSession(orderId);
      setScreen('checkout');

      await openRazorpayCheckout({
        session,
        customerName: profile?.full_name,
        customerEmail: user?.email,
        customerPhone: profile?.phone_number,
        onSuccess: (response) => {
          void (async () => {
            setScreen('verifying');
            setProcessing(true);
            try {
              const result = await verifyRazorpayPayment({
                orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              await loadSnapshot();
              const paymentStatus = String(result.payment_status || '').toLowerCase();
              if (paymentStatus === 'success') {
                setScreen('success');
                setResultMessage('Payment completed successfully.');
              } else {
                setScreen('failed');
                setResultMessage('Payment verification did not confirm a successful capture.');
              }
            } catch (verifyError) {
              setScreen('failed');
              setError(verifyError instanceof Error ? verifyError.message : 'Payment verification failed.');
            } finally {
              setProcessing(false);
            }
          })();
        },
        onDismiss: () => {
          setScreen('cancelled');
          setResultMessage('Payment was cancelled before completion. Your order is not paid.');
          setProcessing(false);
        },
        onFailure: (message) => {
          setScreen('failed');
          setResultMessage(message);
          setProcessing(false);
        },
      });
    } catch (payError) {
      setScreen('failed');
      setError(payError instanceof Error ? payError.message : 'Payment could not be started.');
      setProcessing(false);
    }
  };

  const handleRetry = async () => {
    if (!orderId) return;
    setProcessing(true);
    setError('');
    try {
      await retryCheckoutPayment(orderId);
      await loadSnapshot();
      setScreen('ready');
      setResultMessage('');
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Payment could not be retried.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10"><LoadingState label="Opening payment" /></div>;
  }

  if (error && !snapshot) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <EmptyState title="Payment unavailable." description={error} />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <EmptyState title="Payment unavailable." description="This order could not be found." />
      </div>
    );
  }

  const amount = snapshot.payment?.amount ?? snapshot.order.totalAmount;

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <Eyebrow>Secure payment</Eyebrow>
      <h1 className="mt-4 font-display text-5xl tracking-[-0.04em] text-stone-950 sm:text-6xl">Complete payment</h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600">
        Pay securely with Razorpay. UPI Intent, UPI QR, cards, and other methods enabled on your Razorpay account are available in checkout.
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr]">
        <section className="min-w-0 border border-stone-300 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Amount payable</p>
              <p className="mt-2 font-display text-5xl text-stone-950">{formatCurrency(amount)}</p>
            </div>
            <StatusLabel tone={screen === 'success' ? 'success' : screen === 'failed' ? 'warning' : 'neutral'}>
              {paymentStatusLabel(snapshot.payment?.status)}
            </StatusLabel>
          </div>

          {screen === 'ready' && (
            <div className="mt-10 space-y-6">
              <p className="text-sm leading-7 text-stone-600">
                You will be taken to Razorpay Checkout to complete this payment. ARTISAN only marks the order paid after server-side verification.
              </p>
              {error && <p className="border-l-2 border-amber-700 pl-4 text-sm leading-6 text-stone-700">{error}</p>}
              <Button onClick={() => { void handlePay(); }} disabled={processing} className="w-full sm:w-auto">
                Pay {formatCurrency(amount)}
              </Button>
            </div>
          )}

          {(screen === 'preparing' || screen === 'checkout' || screen === 'verifying') && (
            <div className="mt-12 flex items-center gap-4 text-sm text-stone-600">
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
              {screen === 'preparing' && 'Preparing payment...'}
              {screen === 'checkout' && 'Waiting for Razorpay Checkout...'}
              {screen === 'verifying' && 'Verifying payment with ARTISAN...'}
            </div>
          )}

          {screen === 'success' && (
            <div className="mt-12 space-y-4">
              <div className="flex items-start gap-3 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="font-medium">{resultMessage || 'Payment completed successfully.'}</p>
                  {snapshot.payment?.transactionId && (
                    <p className="mt-2 break-all text-sm text-stone-600">Reference: {snapshot.payment.transactionId}</p>
                  )}
                </div>
              </div>
              <Button onClick={() => navigate(`/checkout/confirmation/${snapshot.order.id}`)}>View confirmation</Button>
            </div>
          )}

          {screen === 'failed' && (
            <div className="mt-12 space-y-4">
              <div className="flex items-start gap-3 text-amber-800">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="font-medium">{resultMessage || error || 'The payment failed.'}</p>
                  <p className="mt-2 text-sm text-stone-600">Your order was not marked as paid and stock was not reduced.</p>
                </div>
              </div>
              <Button onClick={() => { void handleRetry(); }} disabled={processing}>
                <RefreshCw className="h-4 w-4" strokeWidth={1.5} /> Retry payment
              </Button>
            </div>
          )}

          {screen === 'cancelled' && (
            <div className="mt-12 space-y-4">
              <p className="text-sm leading-7 text-stone-600">
                {resultMessage || 'Payment was cancelled. You can try again when ready.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => { void handlePay(); }} disabled={processing}>
                  Try again
                </Button>
                <Button variant="light" onClick={() => setScreen('ready')}>Back</Button>
              </div>
            </div>
          )}
        </section>

        <aside className="h-fit min-w-0 border border-stone-300 p-6">
          <Eyebrow>Order</Eyebrow>
          <p className="mt-4 break-all text-sm text-stone-500">Order #{snapshot.order.id.slice(0, 8)}</p>
          <div className="mt-6 space-y-4">
            {snapshot.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="[overflow-wrap:anywhere] text-stone-950">{item.title || 'Selected work'}</p>
                  <p className="mt-1 text-stone-500">Qty {item.quantity}</p>
                </div>
                <p className="shrink-0 text-stone-950">{formatCurrency(item.subtotal)}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default PaymentCheckoutPage;
