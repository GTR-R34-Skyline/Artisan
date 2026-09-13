import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, EmptyState, Eyebrow, LoadingState, StatusLabel } from '../../components/DesignSystem';
import { useAuth } from '../../auth/useAuthHook';
import {
  advanceCourierShipment,
  getCourierShipment,
  listShipmentEvents,
  sortShipmentEvents,
} from '../../services/logistics.service';
import {
  SHIPMENT_LIFECYCLE,
  Shipment,
  ShipmentEvent,
  formatShipmentDate,
  formatShipmentDateOnly,
  formatShipmentPlace,
  getNextCourierStatus,
  shipmentStatusLabel,
  shipmentStatusTone,
} from '../../types/logistics';


const ShipmentDetailPage: React.FC = () => {
  const { shipmentId } = useParams<{ shipmentId: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [advancing, setAdvancing] = useState(false);

  const loadShipment = useCallback(async (options?: { silent?: boolean }) => {
    if (!shipmentId || !user || !profile || profile.role !== 'courier' || user.id !== profile.id) {
      if (!options?.silent) setLoading(false);
      return;
    }
    if (!options?.silent) {
      setLoading(true);
      setActionError('');
    }
    setError('');
    try {
      const row = await getCourierShipment(shipmentId, profile.id);
      if (!row) {
        setShipment(null);
        setEvents([]);
        setError('This shipment could not be found in your route.');
        return;
      }
      setShipment(row);
      try {
        const timeline = await listShipmentEvents(shipmentId);
        setEvents(sortShipmentEvents(timeline));
      } catch (timelineError) {
        setEvents([]);
        setActionError(timelineError instanceof Error ? timelineError.message : 'The shipment timeline could not be loaded.');
      }
    } catch (loadError) {
      setShipment(null);
      setEvents([]);
      setError(loadError instanceof Error ? loadError.message : 'This shipment could not be loaded.');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [profile, shipmentId, user]);

  useEffect(() => {
    if (authLoading || !user || !profile || profile.role !== 'courier') return undefined;
    void loadShipment();
    return undefined;
  }, [authLoading, loadShipment, profile, user]);

  const nextStatus = shipment ? getNextCourierStatus(shipment.status) : null;
  const delivered = shipment?.status === 'delivered';

  const handleAdvance = async () => {
    if (!shipment || !profile || !nextStatus || delivered || advancing) return;
    setActionError('');
    setAdvancing(true);
    try {
      const result = await advanceCourierShipment(shipment.id, profile.id);
      setShipment(result.shipment);
      setEvents(result.events);
    } catch (advanceError) {
      setActionError(advanceError instanceof Error ? advanceError.message : 'The shipment could not be updated.');
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <LoadingState label="Opening shipment" />
      </div>
    );
  }

  if (error || !shipment) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <Link
          to="/courier/dashboard"
          className="mb-10 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 hover:text-stone-950"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> All shipments
        </Link>
        <EmptyState title="Shipment unavailable." description={error || 'This shipment could not be found.'} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <Link
        to="/courier/dashboard"
        className="mb-10 inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 hover:text-stone-950"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> All shipments
      </Link>

      <header className="grid gap-10 border-b border-stone-300 pb-12 lg:grid-cols-[1fr_0.7fr] lg:items-end">
        <div className="space-y-5">
          <Eyebrow>Shipment</Eyebrow>
          <h1 className="font-display text-5xl leading-[0.95] tracking-[-0.04em] text-stone-950 sm:text-7xl">
            {shipment.tracking_number || 'No tracking number'}
          </h1>
          <StatusLabel tone={shipmentStatusTone(shipment.status)}>
            {shipmentStatusLabel(shipment.status)}
          </StatusLabel>
        </div>
        <div className="space-y-4 lg:justify-self-end">
          {delivered ? (
            <p className="text-sm leading-7 text-stone-600">This shipment has been delivered. No further courier actions are available.</p>
          ) : nextStatus ? (
            <>
              <p className="text-sm leading-7 text-stone-600">
                Next stage: {shipmentStatusLabel(nextStatus)}. Stages cannot be skipped.
              </p>
              <Button onClick={() => { void handleAdvance(); }} disabled={advancing}>
                {advancing ? 'Updating shipment' : `Mark as ${shipmentStatusLabel(nextStatus)}`}
              </Button>
            </>
          ) : (
            <p className="text-sm leading-7 text-stone-600">This shipment cannot be advanced from its current status.</p>
          )}
        </div>
      </header>

      {actionError && <p className="border-b border-stone-300 py-5 text-sm text-red-700">{actionError}</p>}

      <nav className="flex flex-wrap gap-x-7 gap-y-4 border-b border-stone-300 py-6">
        {SHIPMENT_LIFECYCLE.map((status) => {
          const currentIndex = SHIPMENT_LIFECYCLE.indexOf(shipment.status as (typeof SHIPMENT_LIFECYCLE)[number]);
          const stepIndex = SHIPMENT_LIFECYCLE.indexOf(status);
          const reached = currentIndex !== -1 && stepIndex <= currentIndex;
          const current = shipment.status === status;
          return (
            <span
              key={status}
              className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
                current ? 'text-stone-950' : reached ? 'text-forest' : 'text-stone-400'
              }`}
            >
              {shipmentStatusLabel(status)}
            </span>
          );
        })}
      </nav>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr]">
        <section className="space-y-8">
          <div className="border border-stone-300 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Shipment details</p>
            <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Tracking number</dt>
                <dd className="mt-1 text-stone-950">{shipment.tracking_number || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Order ID</dt>
                <dd className="mt-1 break-all text-stone-950">{shipment.order_id || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Current status</dt>
                <dd className="mt-1">
                  <StatusLabel tone={shipmentStatusTone(shipment.status)}>
                    {shipmentStatusLabel(shipment.status)}
                  </StatusLabel>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Carrier</dt>
                <dd className="mt-1 text-stone-950">{shipment.carrier || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Origin</dt>
                <dd className="mt-1 text-stone-950">{formatShipmentPlace(shipment.origin)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Destination</dt>
                <dd className="mt-1 text-stone-950">{formatShipmentPlace(shipment.destination)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Estimated delivery date</dt>
                <dd className="mt-1 text-stone-950">{formatShipmentDateOnly(shipment.estimated_delivery_date)}</dd>
              </div>
            </dl>
          </div>

          <div className="border border-stone-300 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Timeline</p>
            {events.length ? (
              <ol className="mt-8 space-y-0">
                {events.map((event, index) => (
                  <li key={event.id} className="grid grid-cols-[1rem_1fr] gap-4">
                    <div className="flex flex-col items-center">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${index === events.length - 1 ? 'bg-stone-950' : 'bg-forest'}`} />
                      {index < events.length - 1 && <span className="w-px flex-1 bg-stone-300" />}
                    </div>
                    <div className={index < events.length - 1 ? 'pb-8' : ''}>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm font-medium text-stone-950">{shipmentStatusLabel(event.status)}</p>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-stone-500">
                          {formatShipmentDate(event.event_time || event.created_at)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-600">{event.description || '—'}</p>
                      <p className="mt-1 text-xs text-stone-500">{event.location || '—'}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-6 text-sm leading-7 text-stone-600">No tracking events have been recorded yet.</p>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="border border-stone-300 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Pickup</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              {shipment.picked_up_at ? `Picked up ${formatShipmentDate(shipment.picked_up_at)}.` : 'Not picked up yet.'}
            </p>
          </div>
          <div className="border border-stone-300 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Delivery</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              {shipment.delivered_at ? `Delivered ${formatShipmentDate(shipment.delivered_at)}.` : 'Not delivered yet.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ShipmentDetailPage;
