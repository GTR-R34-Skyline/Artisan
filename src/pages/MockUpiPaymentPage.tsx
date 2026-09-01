import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, QrCode, RefreshCw, XCircle } from 'lucide-react';
import { Button, EmptyState, Eyebrow, Field, LoadingState, StatusLabel } from '../components/DesignSystem';
import {
  formatCurrency,
  getCheckoutSnapshot,
  processMockPayment,
  resolveMockOutcomeFromUpiId,
  retryMockPayment,
} from '../services/checkout.service';
import {
  CheckoutSnapshot,
  MOCK_UPI_APPS,
  MockPaymentOutcome,
  MockUpiApp,
  paymentStatusLabel,
} from '../types/checkout';

type PaymentScreen = 'form' | 'processing' | 'success' | 'failed' | 'pending';

const MockUpiPaymentPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedApp, setSelectedApp] = useState<MockUpiApp>('Google Pay');
  const [upiId, setUpiId] = useState('collector@mockupi');
  const [demoOutcome, setDemoOutcome] = useState<MockPaymentOutcome>('success');
  const [screen, setScreen] = useState<PaymentScreen>('form');
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
    } else if (paymentStatus === 'pending' && next.order.status === 'processing') {
      setScreen('pending');
    } else {
      setScreen('form');
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
    if (!orderId || !snapshot?.payment) return;

    const outcome = resolveMockOutcomeFromUpiId(upiId) || demoOutcome;
    setProcessing(true);
    setScreen('processing');
    setError('');
    setResultMessage('');

    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const result = await processMockPayment({
        orderId,
        mockOutcome: outcome,
        upiApp: selectedApp,
        upiId: selectedApp === 'UPI ID' ? upiId : undefined,
        transactionId: snapshot.payment.transactionId,
      });

      await loadSnapshot();

      const paymentStatus = String(result.payment_status || '').toLowerCase();
      if (paymentStatus === 'success') {
        setScreen('success');
        setResultMessage('Payment completed successfully.');
        return;
      }
      if (paymentStatus === 'failed') {
        setScreen('failed');
        setResultMessage('The mock UPI payment was declined.');
        return;
      }
      setScreen('pending');
      setResultMessage('The mock UPI payment is still pending.');
    } catch (payError) {
      setScreen('failed');
      setError(payError instanceof Error ? payError.message : 'Payment could not be processed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRetry = async () => {
    if (!orderId) return;
    setProcessing(true);
    setError('');
    try {
      await retryMockPayment(orderId);
      await loadSnapshot();
      setScreen('form');
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
      <Eyebrow>Mock UPI payment</Eyebrow>
      <h1 className="mt-4 font-display text-5xl tracking-[-0.04em] text-stone-950 sm:text-6xl">Complete payment</h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600">
        This is a simulated UPI flow for testing. No real payment provider is connected and no money moves.
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr]">
        <section className="border border-stone-300 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Amount payable</p>
              <p className="mt-2 font-display text-5xl text-stone-950">{formatCurrency(amount)}</p>
            </div>
            <StatusLabel tone={screen === 'success' ? 'success' : screen === 'failed' ? 'warning' : 'neutral'}>
              {paymentStatusLabel(snapshot.payment?.status)}
            </StatusLabel>
          </div>

          {screen === 'form' && (
            <div className="mt-10 space-y-8">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Choose a UPI option</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {MOCK_UPI_APPS.map((app) => (
                    <button
                      key={app}
                      type="button"
                      onClick={() => setSelectedApp(app)}
                      className={`border px-4 py-4 text-left text-sm transition-colors ${
                        selectedApp === app ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-300 text-stone-700 hover:border-stone-950'
                      }`}
                    >
                      {app}
                    </button>
                  ))}
                </div>
              </div>

              {selectedApp === 'UPI ID' && (
                <Field
                  label="UPI ID"
                  value={upiId}
                  onChange={(event) => setUpiId(event.target.value)}
                  placeholder="name@bank or success@mockupi"
                  required
                />
              )}

              {selectedApp === 'QR' && (
                <div className="border border-dashed border-stone-300 p-8 text-center">
                  <QrCode className="mx-auto h-16 w-16 text-stone-400" strokeWidth={1.2} />
                  <p className="mt-4 text-sm text-stone-600">Scan this mock QR code with any UPI app in a real deployment.</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-500">Simulated only</p>
                </div>
              )}

              <div className="rounded-none border border-stone-300 bg-stone-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Demo controls</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Choose the mock result, or use UPI IDs like <span className="font-medium">success@mockupi</span>, <span className="font-medium">fail@mockupi</span>, or <span className="font-medium">pending@mockupi</span>.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(['success', 'failed', 'pending'] as MockPaymentOutcome[]).map((outcome) => (
                    <button
                      key={outcome}
                      type="button"
                      onClick={() => setDemoOutcome(outcome)}
                      className={`rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                        demoOutcome === outcome ? 'bg-stone-950 text-white' : 'border border-stone-300 text-stone-600'
                      }`}
                    >
                      {outcome}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="border-l-2 border-amber-700 pl-4 text-sm leading-6 text-stone-700">{error}</p>}

              <Button onClick={handlePay} disabled={processing} className="w-full sm:w-auto">
                Pay {formatCurrency(amount)}
              </Button>
            </div>
          )}

          {screen === 'processing' && (
            <div className="mt-12 flex items-center gap-4 text-sm text-stone-600">
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
              Processing mock UPI payment...
            </div>
          )}

          {screen === 'success' && (
            <div className="mt-12 space-y-4">
              <div className="flex items-start gap-3 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-5 w-5" strokeWidth={1.5} />
                <div>
                  <p className="font-medium">{resultMessage || 'Payment completed successfully.'}</p>
                  {snapshot.payment?.transactionId && (
                    <p className="mt-2 text-sm text-stone-600">Reference: {snapshot.payment.transactionId}</p>
                  )}
                </div>
              </div>
              <Button onClick={() => navigate(`/checkout/confirmation/${snapshot.order.id}`)}>View confirmation</Button>
            </div>
          )}

          {screen === 'failed' && (
            <div className="mt-12 space-y-4">
              <div className="flex items-start gap-3 text-amber-800">
                <XCircle className="mt-0.5 h-5 w-5" strokeWidth={1.5} />
                <div>
                  <p className="font-medium">{resultMessage || error || 'The mock UPI payment failed.'}</p>
                  <p className="mt-2 text-sm text-stone-600">Your order was not marked as paid and stock was not reduced.</p>
                </div>
              </div>
              <Button onClick={handleRetry} disabled={processing}>
                <RefreshCw className="h-4 w-4" strokeWidth={1.5} /> Retry payment
              </Button>
            </div>
          )}

          {screen === 'pending' && (
            <div className="mt-12 space-y-4">
              <p className="text-sm leading-7 text-stone-600">
                {resultMessage || 'Your mock payment is pending confirmation. The order has not been marked as delivered.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleRetry} disabled={processing}>Retry payment</Button>
                <Button variant="light" onClick={() => setScreen('form')}>Check again</Button>
              </div>
            </div>
          )}
        </section>

        <aside className="h-fit border border-stone-300 p-6">
          <Eyebrow>Order</Eyebrow>
          <p className="mt-4 text-sm text-stone-500">Order #{snapshot.order.id.slice(0, 8)}</p>
          <div className="mt-6 space-y-4">
            {snapshot.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="text-stone-950">{item.title || 'Selected work'}</p>
                  <p className="mt-1 text-stone-500">Qty {item.quantity}</p>
                </div>
                <p className="text-stone-950">{formatCurrency(item.subtotal)}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default MockUpiPaymentPage;
