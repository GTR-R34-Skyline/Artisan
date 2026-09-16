import { supabase } from '../lib/supabase';

export type PriceParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;

const readErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return error instanceof Error ? error.message : 'The selling price could not be updated.';
};

export const formatSellingPrice = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const parseSellingPrice = (raw: string): PriceParseResult => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Please enter a selling price.' };
  }

  const normalized = trimmed.replace(/₹/g, '').replace(/,/g, '').replace(/\s/g, '');
  if (!normalized || !PRICE_PATTERN.test(normalized)) {
    return { ok: false, error: 'Please enter a valid price in rupees.' };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return { ok: false, error: 'Please enter a valid price in rupees.' };
  }
  if (value <= 0) {
    return { ok: false, error: 'The selling price must be greater than 0.' };
  }

  return { ok: true, value };
};

const authorizationFailure = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    lower.includes('not allowed') ||
    (lower.includes('violat') && lower.includes('policy'))
  );
};

/**
 * Updates only products.final_price for the authenticated seller.
 * Ownership is enforced by the existing Supabase RLS policy (auth.uid() = vendor_id).
 * Do not send vendor_id from the client as proof of ownership.
 */
export const updateProductFinalPrice = async (productId: string, finalPrice: number): Promise<number> => {
  if (!productId.trim()) {
    throw new Error('A product is required.');
  }

  const parsed = parseSellingPrice(String(finalPrice));
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error('Please sign in to update the selling price.');
  }

  const { data, error } = await supabase
    .from('products')
    .update({
      final_price: parsed.value,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .select('id, final_price')
    .maybeSingle();

  if (error) {
    const message = readErrorMessage(error);
    if (authorizationFailure(message)) {
      throw new Error('You can only update the selling price of your own pieces.');
    }
    throw new Error(message || 'The selling price could not be updated. Please try again.');
  }

  if (!data) {
    throw new Error('This product could not be updated. You can only change the price of your own pieces.');
  }

  const saved = Number((data as { final_price?: unknown }).final_price);
  if (!Number.isFinite(saved)) {
    return parsed.value;
  }
  return saved;
};
