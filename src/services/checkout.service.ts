import { supabase } from '../lib/supabase';
import {
  CHECKOUT_SESSION_KEY,
  CheckoutOrder,
  CheckoutOrderItem,
  CheckoutPayment,
  CheckoutSnapshot,
  MockPaymentOutcome,
  MockUpiApp,
} from '../types/checkout';
import { CartItem } from '../types/checkout';

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toStringValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const readFunctionError = async (error: unknown): Promise<string> => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const payload = asRecord(await context.json());
        return toStringValue(payload.error) || toStringValue(payload.message) || 'Checkout request failed.';
      } catch {
        return 'Checkout request failed.';
      }
    }
  }
  return error instanceof Error ? error.message : 'Checkout request failed.';
};

const mapOrder = (row: Record<string, unknown>): CheckoutOrder => ({
  id: toStringValue(row.id) || '',
  status: toStringValue(row.status) || 'processing',
  totalAmount: toNumber(row.total_amount),
  shippingAddress: toStringValue(row.shipping_address),
  stockDeducted: Boolean(row.stock_deducted),
  createdAt: toStringValue(row.created_at),
});

const mapPayment = (row: Record<string, unknown> | null | undefined): CheckoutPayment | null => {
  if (!row) return null;
  return {
    id: toStringValue(row.id) || '',
    status: toStringValue(row.status) || 'pending',
    amount: toNumber(row.amount),
    transactionId: toStringValue(row.transaction_id),
    upiApp: toStringValue(row.upi_app),
    paymentMethod: toStringValue(row.payment_method),
  };
};

const mapItem = (
  row: Record<string, unknown>,
  productsById: Map<string, Record<string, unknown>>,
): CheckoutOrderItem => {
  const productId = toStringValue(row.product_id) || '';
  const product = productsById.get(productId);
  const title = product ? toStringValue(product.title_en) || toStringValue(product.title) : null;
  const image =
    toStringValue(product?.studio_image_url) ||
    toStringValue(product?.enhanced_image_url) ||
    toStringValue(product?.original_image_url);
  return {
    id: toStringValue(row.id) || '',
    productId,
    vendorId: toStringValue(row.vendor_id),
    quantity: Math.max(1, toNumber(row.quantity)),
    unitPrice: toNumber(row.unit_price),
    subtotal: toNumber(row.subtotal) || toNumber(row.unit_price) * Math.max(1, toNumber(row.quantity)),
    title,
    image,
  };
};

export const createCheckoutIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const rememberCheckoutIdempotencyKey = (key: string): void => {
  sessionStorage.setItem(CHECKOUT_SESSION_KEY, key);
};

export const readCheckoutIdempotencyKey = (): string | null => {
  return sessionStorage.getItem(CHECKOUT_SESSION_KEY);
};

export const clearCheckoutIdempotencyKey = (): void => {
  sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
};

export const createCheckoutOrder = async (input: {
  items: CartItem[];
  shippingAddress: string;
  idempotencyKey: string;
  gstin?: string;
}): Promise<{ order: CheckoutOrder; payment: CheckoutPayment | null; idempotent: boolean }> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: {
      action: 'create_order',
      items: input.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      shippingAddress: input.shippingAddress,
      idempotencyKey: input.idempotencyKey,
      gstin: input.gstin?.trim() || undefined,
    },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Order could not be created.');

  return {
    order: mapOrder(asRecord(payload.order)),
    payment: mapPayment(asRecord(payload.payment)),
    idempotent: Boolean(payload.idempotent),
  };
};

export const getCheckoutSnapshot = async (orderId: string): Promise<CheckoutSnapshot> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: { action: 'get_checkout', orderId },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Checkout could not be loaded.');

  const productsById = new Map<string, Record<string, unknown>>();
  (Array.isArray(payload.products) ? payload.products : []).forEach((row) => {
    const record = asRecord(row);
    const id = toStringValue(record.id);
    if (id) productsById.set(id, record);
  });

  return {
    order: mapOrder(asRecord(payload.order)),
    items: (Array.isArray(payload.items) ? payload.items : []).map((row) => mapItem(asRecord(row), productsById)),
    payment: mapPayment(asRecord(payload.payment)),
  };
};

export const processMockPayment = async (input: {
  orderId: string;
  mockOutcome: MockPaymentOutcome;
  upiApp: MockUpiApp;
  upiId?: string;
  transactionId?: string | null;
}): Promise<Record<string, unknown>> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: {
      action: 'process_payment',
      orderId: input.orderId,
      mockOutcome: input.mockOutcome,
      upiApp: input.upiApp,
      upiId: input.upiId,
      transactionId: input.transactionId,
    },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Payment could not be processed.');
  return asRecord(payload.result);
};

export const retryMockPayment = async (orderId: string): Promise<Record<string, unknown>> => {
  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: { action: 'retry_payment', orderId },
  });

  if (error) throw new Error(await readFunctionError(error));
  const payload = asRecord(data);
  if (!payload.success) throw new Error(toStringValue(payload.error) || 'Payment could not be retried.');
  return asRecord(payload.result);
};

export const resolveMockOutcomeFromUpiId = (upiId: string): MockPaymentOutcome | null => {
  const normalized = upiId.trim().toLowerCase();
  if (normalized.endsWith('@success') || normalized === 'success@mockupi') return 'success';
  if (normalized.endsWith('@fail') || normalized.endsWith('@failed') || normalized === 'fail@mockupi') return 'failed';
  if (normalized.endsWith('@pending') || normalized === 'pending@mockupi') return 'pending';
  return null;
};

export const formatCurrency = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;
