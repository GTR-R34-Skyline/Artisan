import { supabase } from '../lib/supabase';
import {
  Shipment,
  ShipmentEvent,
} from '../types/logistics';

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

const asShipmentEvent = (row: unknown): ShipmentEvent | null => {
  if (!row || typeof row !== 'object') return null;
  const source = row as Record<string, unknown>;
  if (typeof source.id !== 'string' || typeof source.shipment_id !== 'string') return null;
  return {
    id: source.id,
    shipment_id: source.shipment_id,
    status: typeof source.status === 'string' ? source.status : '',
    location: toStringOrNull(source.location),
    description: toStringOrNull(source.description),
    actor_type: toStringOrNull(source.actor_type),
    actor_id: toStringOrNull(source.actor_id),
    event_time: toStringOrNull(source.event_time),
    created_at: toStringOrNull(source.created_at),
  };
};

const requireCourierSession = async (courierId: string) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const sessionUserId = data.session?.user.id;
  if (!data.session?.access_token || !sessionUserId) {
    throw new Error('Your courier session is not available. Please sign in again.');
  }
  if (sessionUserId !== courierId) {
    throw new Error('This workspace does not match the signed-in courier.');
  }
};

export const listCourierShipments = async (courierId: string): Promise<Shipment[]> => {
  await requireCourierSession(courierId);
  const { data, error } = await supabase
    .from('shipments')
    .select('id, order_id, vendor_id, buyer_id, courier_id, carrier, tracking_number, status, origin, destination, estimated_delivery_date, dispatched_at, picked_up_at, delivered_at, created_at, updated_at')
    .eq('courier_id', courierId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(asShipment).filter((shipment): shipment is Shipment => Boolean(shipment));
};

export const getCourierShipment = async (shipmentId: string, courierId: string): Promise<Shipment | null> => {
  await requireCourierSession(courierId);
  const { data, error } = await supabase
    .from('shipments')
    .select('id, order_id, vendor_id, buyer_id, courier_id, carrier, tracking_number, status, origin, destination, estimated_delivery_date, dispatched_at, picked_up_at, delivered_at, created_at, updated_at')
    .eq('id', shipmentId)
    .eq('courier_id', courierId)
    .maybeSingle();

  if (error) throw error;
  return asShipment(data);
};

export const listShipmentEvents = async (shipmentId: string): Promise<ShipmentEvent[]> => {
  const { data, error } = await supabase
    .from('shipment_events')
    .select('id, shipment_id, status, location, description, actor_type, actor_id, event_time, created_at')
    .eq('shipment_id', shipmentId)
    .order('event_time', { ascending: true });

  if (error) throw error;
  return (data || []).map(asShipmentEvent).filter((event): event is ShipmentEvent => Boolean(event));
};

const eventSortValue = (event: ShipmentEvent): number => {
  const stamp = event.event_time || event.created_at;
  if (!stamp) return 0;
  const time = new Date(stamp).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export const sortShipmentEvents = (events: ShipmentEvent[]): ShipmentEvent[] =>
  [...events].sort((left, right) => eventSortValue(left) - eventSortValue(right));

export const advanceCourierShipment = async (
  shipmentId: string,
  courierId: string,
): Promise<{ shipment: Shipment; events: ShipmentEvent[] }> => {
  await requireCourierSession(courierId);

  const { error } = await supabase.rpc('courier_advance_shipment', {
    p_shipment_id: shipmentId,
  });

  if (error) {
    throw new Error(error.message || 'The shipment could not be updated.');
  }

  const shipment = await getCourierShipment(shipmentId, courierId);
  if (!shipment) {
    throw new Error('This shipment could not be found after the update.');
  }

  const events = sortShipmentEvents(await listShipmentEvents(shipmentId));
  return { shipment, events };
};
