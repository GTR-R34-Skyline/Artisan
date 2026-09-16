/**
 * INR money helpers shared with Razorpay checkout (frontend display / tests).
 * Authoritative conversion for charging always happens server-side.
 */

export const inrToPaise = (amountInr: number): number => {
  if (!Number.isFinite(amountInr) || amountInr < 0) {
    throw new Error('Invalid payment amount.');
  }
  const normalized = amountInr.toFixed(2);
  const [rupeesPart, paisePart = '0'] = normalized.split('.');
  const rupees = Number(rupeesPart);
  const paise = Number(paisePart.padEnd(2, '0').slice(0, 2));
  if (!Number.isFinite(rupees) || !Number.isFinite(paise)) {
    throw new Error('Invalid payment amount.');
  }
  return rupees * 100 + paise;
};

export const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

/** Mirror of server mapping — Razorpay is never written as payment_method. */
export const mapRazorpayInstrumentToPaymentMethod = (
  method: string | null | undefined,
): 'upi' | 'card' | 'netbanking' | 'cod' => {
  const normalized = (method || '').trim().toLowerCase();
  if (normalized === 'upi') return 'upi';
  if (normalized === 'card') return 'card';
  if (normalized === 'netbanking') return 'netbanking';
  return 'upi';
};
