import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { EmptyState, Eyebrow, LoadingState, StatusLabel } from '../../components/DesignSystem';
import { useAuth } from '../../auth/useAuthHook';
import { listCourierShipments } from '../../services/logistics.service';
import {
  SHIPMENT_LIFECYCLE,
  Shipment,
  formatShipmentDateOnly,
  formatShipmentPlace,
  shipmentStatusLabel,
  shipmentStatusTone,
} from '../../types/logistics';

type StatusFilter = 'all' | (typeof SHIPMENT_LIFECYCLE)[number];

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  ...SHIPMENT_LIFECYCLE.map((status) => ({ id: status, label: shipmentStatusLabel(status) })),
];

const CourierDashboardPage: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const fetchShipments = useCallback(async () => {
    if (!user || !profile || profile.role !== 'courier' || user.id !== profile.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await listCourierShipments(profile.id);
      setShipments(rows);
    } catch (loadError) {
      setShipments([]);
      setError(loadError instanceof Error ? loadError.message : 'Assigned shipments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [profile, user]);

  useEffect(() => {
    if (authLoading || !user || !profile || profile.role !== 'courier') return undefined;
    void fetchShipments();
    return undefined;
  }, [authLoading, fetchShipments, profile, user]);

  const visibleShipments = useMemo(
    () => (filter === 'all' ? shipments : shipments.filter((shipment) => shipment.status === filter)),
    [filter, shipments],
  );

  const activeCount = shipments.filter((shipment) => shipment.status !== 'delivered').length;

  return (
    <div className="workspace-page mx-auto max-w-[1400px] px-6 pb-28 pt-12 lg:px-10 lg:pt-20">
      <header className="workspace-header grid gap-10 border-b border-stone-300 pb-12 lg:grid-cols-[1fr_0.7fr] lg:items-end">
        <div className="space-y-5">
          <Eyebrow>Courier workspace</Eyebrow>
          <h1 className="font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">
            Good to see you, {profile?.full_name || 'courier'}.
          </h1>
          <p className="max-w-xl text-sm leading-7 text-stone-600">
            {shipments.length
              ? `${activeCount} active of ${shipments.length} assigned shipments.`
              : 'Shipments assigned to you will appear here.'}
          </p>
        </div>
      </header>

      <nav className="workspace-nav flex flex-wrap gap-x-7 gap-y-4 border-b border-stone-300 py-6">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${filter === item.id ? 'text-stone-950' : 'text-stone-500 hover:text-stone-950'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && <p className="border-b border-stone-300 py-5 text-sm text-red-700">{error}</p>}

      {loading ? (
        <LoadingState label="Opening your deliveries" />
      ) : !visibleShipments.length ? (
        <div className="py-10">
          <EmptyState
            title={shipments.length ? 'Nothing in this stage.' : 'No shipments assigned.'}
            description={
              shipments.length
                ? 'Try another status to see the rest of your route.'
                : 'When a seller dispatches work to you, it will appear in this workspace.'
            }
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto py-10 lg:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  <th className="py-4 pr-6">Tracking</th>
                  <th className="py-4 pr-6">Order</th>
                  <th className="py-4 pr-6">Status</th>
                  <th className="py-4 pr-6">Destination</th>
                  <th className="py-4 pr-6">Carrier</th>
                  <th className="py-4 pr-6">Est. delivery</th>
                  <th className="py-4 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {visibleShipments.map((shipment) => (
                  <tr key={shipment.id} className="border-b border-stone-300/80">
                    <td className="py-5 pr-6 font-medium text-stone-950">{shipment.tracking_number || '—'}</td>
                    <td className="py-5 pr-6 text-stone-600">{shipment.order_id || '—'}</td>
                    <td className="py-5 pr-6">
                      <StatusLabel tone={shipmentStatusTone(shipment.status)}>
                        {shipmentStatusLabel(shipment.status)}
                      </StatusLabel>
                    </td>
                    <td className="py-5 pr-6 text-stone-600">{formatShipmentPlace(shipment.destination)}</td>
                    <td className="py-5 pr-6 text-stone-600">{shipment.carrier || '—'}</td>
                    <td className="py-5 pr-6 text-stone-600">{formatShipmentDateOnly(shipment.estimated_delivery_date)}</td>
                    <td className="py-5 text-right">
                      <Link
                        to={`/courier/shipments/${shipment.id}`}
                        className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950"
                      >
                        Details <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4 py-10 lg:hidden">
            {visibleShipments.map((shipment) => (
              <Link
                key={shipment.id}
                to={`/courier/shipments/${shipment.id}`}
                className="block border border-stone-300 p-5"
              >
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <p className="min-w-0 [overflow-wrap:anywhere] font-medium text-stone-950">{shipment.tracking_number || 'No tracking number'}</p>
                  <StatusLabel tone={shipmentStatusTone(shipment.status)}>
                    {shipmentStatusLabel(shipment.status)}
                  </StatusLabel>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Order</dt>
                    <dd className="mt-1 break-all text-stone-700">{shipment.order_id || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Carrier</dt>
                    <dd className="mt-1 text-stone-700">{shipment.carrier || '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Destination</dt>
                    <dd className="mt-1 min-w-0 [overflow-wrap:anywhere] text-stone-700">{formatShipmentPlace(shipment.destination)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Est. delivery</dt>
                    <dd className="mt-1 text-stone-700">{formatShipmentDateOnly(shipment.estimated_delivery_date)}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CourierDashboardPage;
