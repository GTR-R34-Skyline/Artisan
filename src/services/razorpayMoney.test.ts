import { describe, expect, it } from 'vitest';
import { inrToPaise, mapRazorpayInstrumentToPaymentMethod, timingSafeEqual } from './razorpayMoney';

describe('inrToPaise', () => {
  it('converts whole rupees without float drift', () => {
    expect(inrToPaise(500)).toBe(50000);
    expect(inrToPaise(1250)).toBe(125000);
  });

  it('converts fractional rupees deterministically', () => {
    expect(inrToPaise(19.99)).toBe(1999);
    expect(inrToPaise(0.01)).toBe(1);
  });

  it('rejects invalid amounts', () => {
    expect(() => inrToPaise(-1)).toThrow('Invalid payment amount.');
    expect(() => inrToPaise(Number.NaN)).toThrow('Invalid payment amount.');
  });
});

describe('mapRazorpayInstrumentToPaymentMethod', () => {
  it('maps supported Razorpay instruments to ARTISAN payment_method values', () => {
    expect(mapRazorpayInstrumentToPaymentMethod('upi')).toBe('upi');
    expect(mapRazorpayInstrumentToPaymentMethod('card')).toBe('card');
    expect(mapRazorpayInstrumentToPaymentMethod('netbanking')).toBe('netbanking');
  });

  it('never returns razorpay and defaults unsupported instruments to upi', () => {
    expect(mapRazorpayInstrumentToPaymentMethod('razorpay')).toBe('upi');
    expect(mapRazorpayInstrumentToPaymentMethod('wallet')).toBe('upi');
    expect(mapRazorpayInstrumentToPaymentMethod(null)).toBe('upi');
  });
});

describe('timingSafeEqual', () => {
  it('compares equal and unequal strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});
