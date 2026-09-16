export interface CartItem {
  productId: string;
  vendorId: string | null;
  title: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  maxStock: number;
}

export interface CheckoutOrder {
  id: string;
  status: string;
  totalAmount: number;
  shippingAddress: string | null;
  stockDeducted: boolean;
  createdAt: string | null;
}

export interface CheckoutOrderItem {
  id: string;
  productId: string;
  vendorId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  title?: string | null;
  image?: string | null;
}

export interface CheckoutPayment {
  id: string;
  status: string;
  amount: number;
  transactionId: string | null;
  /** Legacy column: stores Razorpay Order ID during/after Razorpay checkout. */
  upiApp: string | null;
  /** ARTISAN instrument: upi | card | netbanking | cod (Razorpay is the gateway, not this value). */
  paymentMethod: string | null;
}

export interface RazorpayCheckoutSession {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  amountPaise: number;
  currency: string;
  artisanOrderId: string;
  reused: boolean;
}

export interface CheckoutSnapshot {
  order: CheckoutOrder;
  items: CheckoutOrderItem[];
  payment: CheckoutPayment | null;
}

export const CHECKOUT_SESSION_KEY = 'artisan.checkout.idempotency';

export const paymentStatusLabel = (status: string | null | undefined): string => {
  switch ((status || '').toLowerCase()) {
    case 'success':
      return 'Paid';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
    case 'cancelled':
    case 'canceled':
      return 'Cancelled';
    default:
      return status || 'Unknown';
  }
};

export const orderStatusLabel = (status: string | null | undefined): string => {
  switch ((status || '').toLowerCase()) {
    case 'processing':
      return 'Processing';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
    case 'canceled':
      return 'Cancelled';
    default:
      return status || 'Unknown';
  }
};
