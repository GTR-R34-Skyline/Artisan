import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();
const select = vi.fn(() => ({ maybeSingle }));
const eq = vi.fn(() => ({ select }));
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ update }));
const getSession = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from,
    auth: {
      getSession,
    },
  },
}));

const { parseSellingPrice, formatSellingPrice, updateProductFinalPrice } = await import('./productUpdate.service');

describe('parseSellingPrice', () => {
  it('accepts a positive rupee amount', () => {
    expect(parseSellingPrice('2200')).toEqual({ ok: true, value: 2200 });
    expect(parseSellingPrice('2,200')).toEqual({ ok: true, value: 2200 });
    expect(parseSellingPrice('₹2,200.50')).toEqual({ ok: true, value: 2200.5 });
  });

  it('rejects empty, non-numeric, zero, and negative values', () => {
    expect(parseSellingPrice('')).toEqual({ ok: false, error: 'Please enter a selling price.' });
    expect(parseSellingPrice('   ')).toEqual({ ok: false, error: 'Please enter a selling price.' });
    expect(parseSellingPrice('abc')).toEqual({ ok: false, error: 'Please enter a valid price in rupees.' });
    expect(parseSellingPrice('NaN')).toEqual({ ok: false, error: 'Please enter a valid price in rupees.' });
    expect(parseSellingPrice('-5')).toEqual({ ok: false, error: 'Please enter a valid price in rupees.' });
    expect(parseSellingPrice('0')).toEqual({ ok: false, error: 'The selling price must be greater than 0.' });
    expect(parseSellingPrice('e10')).toEqual({ ok: false, error: 'Please enter a valid price in rupees.' });
  });
});

describe('formatSellingPrice', () => {
  it('formats rupees with the existing Indian locale convention', () => {
    expect(formatSellingPrice(2500)).toBe('₹2,500');
  });
});

describe('updateProductFinalPrice', () => {
  beforeEach(() => {
    from.mockClear();
    update.mockClear();
    eq.mockClear();
    select.mockClear();
    maybeSingle.mockReset();
    getSession.mockReset();
    getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
    maybeSingle.mockResolvedValue({ data: { id: 'prod-1', final_price: 2200 }, error: null });
  });

  it('sends a targeted final_price update without vendor_id', async () => {
    const saved = await updateProductFinalPrice('prod-1', 2200);

    expect(saved).toBe(2200);
    expect(from).toHaveBeenCalledWith('products');
    expect(update).toHaveBeenCalledTimes(1);
    const payload = (update.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];
    expect(payload.final_price).toBe(2200);
    expect(payload).toHaveProperty('updated_at');
    expect(payload).not.toHaveProperty('vendor_id');
    expect(eq).toHaveBeenCalledWith('id', 'prod-1');
  });

  it('rejects an invalid amount before querying supabase', async () => {
    await expect(updateProductFinalPrice('prod-1', 0)).rejects.toThrow('The selling price must be greater than 0.');
    expect(getSession).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('does not update when there is no authenticated session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(updateProductFinalPrice('prod-1', 2200)).rejects.toThrow('Please sign in to update the selling price.');
    expect(update).not.toHaveBeenCalled();
  });

  it('treats an empty update result as an authorization failure', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(updateProductFinalPrice('prod-1', 2200)).rejects.toThrow(
      'This product could not be updated. You can only change the price of your own pieces.',
    );
  });
});
