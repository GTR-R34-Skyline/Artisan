export const SHIPMENT_LIFECYCLE = [
  'dispatched',
  'picked_up',
  'in_transit',
  'at_destination_hub',
  'out_for_delivery',
  'delivered',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_LIFECYCLE)[number];
export type CourierProgressStatus = Exclude<ShipmentStatus, 'dispatched'>;

export const COURIER_PROGRESS_STATUSES: CourierProgressStatus[] = [
  'picked_up',
  'in_transit',
  'at_destination_hub',
  'out_for_delivery',
  'delivered',
];

export interface Shipment {
  id: string;
  order_id: string | null;
  vendor_id: string | null;
  buyer_id: string | null;
  courier_id: string | null;
  carrier: string | null;
  tracking_number: string | null;
  status: string;
  origin: unknown;
  destination: unknown;
  estimated_delivery_date: string | null;
  dispatched_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ShipmentEvent {
  id: string;
  shipment_id: string;
  status: string;
  location: string | null;
  description: string | null;
  actor_type: string | null;
  actor_id: string | null;
  event_time: string | null;
  created_at: string | null;
}

export const COURIER_EVENT_DETAILS: Record<CourierProgressStatus, { location: string; description: string }> = {
  picked_up: {
    location: 'Artisan Origin',
    description: 'Shipment picked up by courier',
  },
  in_transit: {
    location: 'Transit Hub',
    description: 'Shipment is in transit',
  },
  at_destination_hub: {
    location: 'Destination Hub',
    description: 'Shipment reached the destination hub',
  },
  out_for_delivery: {
    location: 'Local Delivery Facility',
    description: 'Shipment is out for delivery',
  },
  delivered: {
    location: 'Delivery Address',
    description: 'Shipment delivered successfully',
  },
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  seller_processing: 'Seller processing',
  dispatched: 'Dispatched',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  at_destination_hub: 'At destination hub',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rto: 'RTO',
  lost: 'Lost',
};

export const SELLER_DISPATCHABLE_STATUSES = ['pending', 'seller_processing'] as const;

export type SellerDispatchableStatus = (typeof SELLER_DISPATCHABLE_STATUSES)[number];

export const canSellerDispatchShipment = (status: string | null | undefined): boolean =>
  typeof status === 'string' && (SELLER_DISPATCHABLE_STATUSES as readonly string[]).includes(status);

export const isShipmentStatus = (value: string): value is ShipmentStatus =>
  (SHIPMENT_LIFECYCLE as readonly string[]).includes(value);

export const shipmentStatusLabel = (status: string | null | undefined): string => {
  if (!status) return 'Unknown';
  return STATUS_LABELS[status] || status.replace(/_/g, ' ');
};

export const shipmentStatusTone = (status: string | null | undefined): 'success' | 'warning' | 'neutral' => {
  if (status === 'delivered') return 'success';
  if (status === 'pending' || status === 'seller_processing' || status === 'dispatched' || status === 'out_for_delivery') {
    return 'warning';
  }
  return 'neutral';
};

export const getNextCourierStatus = (currentStatus: string | null | undefined): CourierProgressStatus | null => {
  if (!currentStatus) return null;
  if (currentStatus === 'delivered') return null;
  if (currentStatus === 'dispatched') return 'picked_up';

  const index = COURIER_PROGRESS_STATUSES.indexOf(currentStatus as CourierProgressStatus);
  if (index === -1 || index === COURIER_PROGRESS_STATUSES.length - 1) return null;
  return COURIER_PROGRESS_STATUSES[index + 1];
};

export const formatShipmentPlace = (value: unknown): string => {
  if (value == null) return '—';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '—';
    try {
      return formatShipmentPlace(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatShipmentPlace(item)).filter((item) => item !== '—');
    return parts.length ? parts.join(', ') : '—';
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const namedParts = [
      record.address,
      record.line1,
      record.line2,
      record.street,
      record.city,
      record.district,
      record.state,
      record.location_state,
      record.pincode,
      record.postal_code,
      record.zip,
      record.country,
    ]
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    if (namedParts.length) return namedParts.join(', ');
    const values = Object.values(record)
      .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''))
      .filter(Boolean);
    return values.length ? values.join(', ') : '—';
  }
  return '—';
};

export const formatShipmentDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly && !value.includes('T') && !value.includes(' ')) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const formatShipmentDateOnly = (value: string | null | undefined): string => {
  if (!value) return '—';
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};
