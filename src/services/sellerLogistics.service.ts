import { supabase } from '../lib/supabase';
import {
  Shipment,
} from '../types/logistics';

const SHIPMENT_SELECT =
  'id, order_id, vendor_id, buyer_id, courier_id, carrier, tracking_number, status, origin, destination, estimated_delivery_date, dispatched_at, picked_up_at, delivered_at, created_at, updated_at';

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : value == null ? null : String(value);

const asShipment = (row: unknown): Shipment | null => {
  if (!row || typeof row !== 'object') return null;
  const source = row as Record<string, unknown>;
  if (typeof source.id !== 'string') return null;
  return {
    id: source.id,
    order_id: toStringOrNull(source.order_id),
    vendor_id: toStringOrNull(source.vendor_id),
    buyer_id: toStringOrNull(source.buyer_id),
    courier_id: toStringOrNull(source.courier_id),
    carrier: toStringOrNull(source.carrier),
    tracking_number: toStringOrNull(source.tracking_number),
    status: typeof source.status === 'string' ? source.status : '',
    origin: source.origin ?? null,
    destination: source.destination ?? null,
    estimated_delivery_date: toStringOrNull(source.estimated_delivery_date),
    dispatched_at: toStringOrNull(source.dispatched_at),
    picked_up_at: toStringOrNull(source.picked_up_at),
    delivered_at: toStringOrNull(source.delivered_at),
    created_at: toStringOrNull(source.created_at),
    updated_at: toStringOrNull(source.updated_at),
  };
};

export interface VendorOrderShipmentRow {
  orderId: string;
  orderStatus: string;
  shippingAddress: string | null;
  createdAt: string | null;
  shipment: Shipment | null;
}

const SELLER_SHIPMENT_STATUS_PRIORITY: Record<string, number> = {
  pending: 1,
  seller_processing: 2,
  dispatched: 3,
  picked_up: 4,
  in_transit: 5,
  at_destination_hub: 6,
  out_for_delivery: 7,
  delivered: 8,
  cancelled: 9,
  rto: 10,
  lost: 11,
};

const NO_SHIPMENT_PRIORITY = 12;
const UNKNOWN_STATUS_PRIORITY = 13;

const sellerShipmentSortPriority = (row: VendorOrderShipmentRow): number => {
  if (!row.shipment) return NO_SHIPMENT_PRIORITY;
  return SELLER_SHIPMENT_STATUS_PRIORITY[row.shipment.status] ?? UNKNOWN_STATUS_PRIORITY;
};

export const sortVendorOrderShipmentRows = (
  rows: VendorOrderShipmentRow[],
): VendorOrderShipmentRow[] =>
  rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const priorityDiff = sellerShipmentSortPriority(left.row) - sellerShipmentSortPriority(right.row);
      if (priorityDiff !== 0) return priorityDiff;
      return left.index - right.index;
    })
    .map(({ row }) => row);

const requireVendorSession = async (vendorId: string) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const sessionUserId = data.session?.user.id;
  if (!data.session?.access_token || !sessionUserId) {
    throw new Error('Your artisan session is not available. Please sign in again.');
  }
  if (sessionUserId !== vendorId) {
    throw new Error('This workspace does not match the signed-in artisan.');
  }
};

const listVendorOrderIds = async (vendorId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('order_items')
    .select('order_id')
    .eq('vendor_id', vendorId);

  if (error) throw error;

  return Array.from(
    new Set(
      (data || [])
        .map((row) => toStringOrNull((row as { order_id?: unknown }).order_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );
};

const listVendorShipments = async (vendorId: string): Promise<Shipment[]> => {
  const { data, error } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(asShipment).filter((shipment): shipment is Shipment => Boolean(shipment));
};

export const listVendorOrderShipments = async (vendorId: string): Promise<VendorOrderShipmentRow[]> => {
  await requireVendorSession(vendorId);

  const orderIds = await listVendorOrderIds(vendorId);
  if (!orderIds.length) return [];

  const [ordersResult, shipments] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, shipping_address, created_at')
      .in('id', orderIds)
      .order('created_at', { ascending: false }),
    listVendorShipments(vendorId),
  ]);

  if (ordersResult.error) throw ordersResult.error;

  const shipmentsByOrderId = new Map<string, Shipment[]>();
  shipments.forEach((shipment) => {
    if (!shipment.order_id) return;
    const existing = shipmentsByOrderId.get(shipment.order_id) || [];
    existing.push(shipment);
    shipmentsByOrderId.set(shipment.order_id, existing);
  });

  const missingShipmentOrderIds = orderIds.filter((orderId) => !shipmentsByOrderId.has(orderId));
  if (missingShipmentOrderIds.length) {
    await Promise.all(
      missingShipmentOrderIds.map(async (orderId) => {
        const { error } = await supabase.functions.invoke('marketplace-checkout', {
          body: { action: 'ensure_shipments', orderId },
        });
        if (error) {
          console.warn('Shipment ensure failed for order', orderId, error);
        }
      }),
    );

    const refreshed = await listVendorShipments(vendorId);
    shipmentsByOrderId.clear();
    refreshed.forEach((shipment) => {
      if (!shipment.order_id) return;
      const existing = shipmentsByOrderId.get(shipment.order_id) || [];
      existing.push(shipment);
      shipmentsByOrderId.set(shipment.order_id, existing);
    });
  }

  const rows: VendorOrderShipmentRow[] = [];

  (ordersResult.data || []).forEach((orderRow) => {
    const order = orderRow as {
      id?: unknown;
      status?: unknown;
      shipping_address?: unknown;
      created_at?: unknown;
    };
    const orderId = toStringOrNull(order.id);
    if (!orderId) return;

    const matched = shipmentsByOrderId.get(orderId) || [];
    if (!matched.length) {
      rows.push({
        orderId,
        orderStatus: typeof order.status === 'string' ? order.status : '',
        shippingAddress: toStringOrNull(order.shipping_address),
        createdAt: toStringOrNull(order.created_at),
        shipment: null,
      });
      return;
    }

    matched.forEach((shipment) => {
      rows.push({
        orderId,
        orderStatus: typeof order.status === 'string' ? order.status : '',
        shippingAddress: toStringOrNull(order.shipping_address),
        createdAt: toStringOrNull(order.created_at),
        shipment,
      });
    });
  });

  return sortVendorOrderShipmentRows(rows);
};

export const dispatchSellerShipment = async (
  shipmentId: string,
  vendorId: string,
): Promise<Shipment> => {
  await requireVendorSession(vendorId);

  const { data, error } = await supabase.functions.invoke('marketplace-checkout', {
    body: {
      action: 'dispatch_shipment',
      shipmentId,
    },
  });

  if (error) {
    const message = await (async () => {
      if (error && typeof error === 'object' && 'context' in error) {
        const context = (error as { context?: Response }).context;
        if (context instanceof Response) {
          try {
            const payload = await context.json();
            if (payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string') {
              return (payload as { error: string }).error;
            }
          } catch {
            // Fall through to generic message.
          }
        }
      }
      return error instanceof Error ? error.message : 'The shipment could not be marked as dispatched.';
    })();
    throw new Error(message);
  }

  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (payload.success === false) {
    throw new Error(
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : 'The shipment could not be marked as dispatched.',
    );
  }

  const fromEdge = asShipment(payload.shipment);
  if (fromEdge) return fromEdge;

  const { data: refreshed, error: refreshError } = await supabase
    .from('shipments')
    .select(SHIPMENT_SELECT)
    .eq('id', shipmentId)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (refreshError) throw refreshError;

  const shipment = asShipment(refreshed);
  if (!shipment) {
    throw new Error('The shipment was updated, but the latest details could not be loaded.');
  }
  return shipment;
};
