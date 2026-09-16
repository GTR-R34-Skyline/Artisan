import React, { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Eyebrow, LoadingState, StatusLabel } from '../DesignSystem';
import {
  VendorOrderShipmentRow,
  dispatchSellerShipment,
  listVendorOrderShipments,
  sortVendorOrderShipmentRows,
} from '../../services/sellerLogistics.service';
import {
  canSellerDispatchShipment,
  formatShipmentDateOnly,
  formatShipmentPlace,
  shipmentStatusLabel,
  shipmentStatusTone,
} from '../../types/logistics';
import { orderStatusLabel } from '../../types/checkout';

interface VendorShipmentsPanelProps {
  vendorId: string;
}

export const VendorShipmentsPanel: React.FC<VendorShipmentsPanelProps> = ({ vendorId }) => {
  const [rows, setRows] = useState<VendorOrderShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextRows = await listVendorOrderShipments(vendorId);
      setRows(nextRows);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : 'Your order shipments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const handleDispatch = async (shipmentId: string) => {
    if (dispatchingId) return;
    setActionError('');
    setDispatchingId(shipmentId);
    try {
      const updated = await dispatchSellerShipment(shipmentId, vendorId);
      setRows((current) =>
        sortVendorOrderShipmentRows(
          current.map((row) =>
            row.shipment?.id === shipmentId
              ? { ...row, shipment: updated }
              : row,
          ),
        ),
      );
    } catch (dispatchError) {
      setActionError(
        dispatchError instanceof Error
          ? dispatchError.message
          : 'The shipment could not be marked as dispatched.',
      );
    } finally {
      setDispatchingId(null);
    }
  };

  if (loading) {
    return <LoadingState label="Opening your shipments" />;
  }

  if (error) {
    return <p className="py-8 text-sm text-red-700">{error}</p>;
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="No orders to ship yet."
        description="When buyers place orders for your pieces, shipment actions will appear here."
      />
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <Eyebrow>Shipments</Eyebrow>
        <h2 className="mt-3 font-display text-4xl tracking-[-0.04em] text-stone-950">
          Prepare work for delivery.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-stone-600">
          Mark a shipment as dispatched when it is ready for the courier to pick up.
        </p>
      </div>

      {actionError && <p className="border-y border-stone-300 py-5 text-sm text-red-700">{actionError}</p>}

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
              <th className="py-4 pr-6">Order</th>
              <th className="py-4 pr-6">Order status</th>
              <th className="py-4 pr-6">Tracking</th>
              <th className="py-4 pr-6">Shipment status</th>
              <th className="py-4 pr-6">Destination</th>
              <th className="py-4 pr-6">Est. delivery</th>
              <th className="py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const shipment = row.shipment;
              const canDispatch = Boolean(shipment && canSellerDispatchShipment(shipment.status));
              const busy = dispatchingId === shipment?.id;

              return (
                <tr key={`${row.orderId}-${shipment?.id || 'missing'}`} className="border-b border-stone-300/80 align-top">
                  <td className="py-5 pr-6 break-all text-stone-950">{row.orderId}</td>
                  <td className="py-5 pr-6 text-stone-600">{orderStatusLabel(row.orderStatus)}</td>
                  <td className="py-5 pr-6 font-medium text-stone-950">
                    {shipment?.tracking_number || '—'}
                  </td>
                  <td className="py-5 pr-6">
                    {shipment ? (
                      <StatusLabel tone={shipmentStatusTone(shipment.status)}>
                        {shipmentStatusLabel(shipment.status)}
                      </StatusLabel>
                    ) : (
                      <span className="text-sm text-amber-800">No shipment prepared</span>
                    )}
                  </td>
                  <td className="py-5 pr-6 text-stone-600">
                    {shipment
                      ? formatShipmentPlace(shipment.destination)
                      : row.shippingAddress || '—'}
                  </td>
                  <td className="py-5 pr-6 text-stone-600">
                    {formatShipmentDateOnly(shipment?.estimated_delivery_date)}
                  </td>
                  <td className="py-5 text-right">
                    {!shipment ? (
                      <span className="text-xs text-stone-500">Unavailable</span>
                    ) : canDispatch ? (
                      <Button
                        onClick={() => { void handleDispatch(shipment.id); }}
                        disabled={busy || Boolean(dispatchingId)}
                        className="min-h-10 px-4 py-2"
                      >
                        {busy ? 'Dispatching' : 'Mark as Dispatched'}
                      </Button>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                        {shipmentStatusLabel(shipment.status)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 lg:hidden">
        {rows.map((row) => {
          const shipment = row.shipment;
          const canDispatch = Boolean(shipment && canSellerDispatchShipment(shipment.status));
          const busy = dispatchingId === shipment?.id;

          return (
            <article
              key={`${row.orderId}-${shipment?.id || 'missing'}-mobile`}
              className="border border-stone-300 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="break-all text-sm font-medium text-stone-950">{row.orderId}</p>
                {shipment ? (
                  <StatusLabel tone={shipmentStatusTone(shipment.status)}>
                    {shipmentStatusLabel(shipment.status)}
                  </StatusLabel>
                ) : (
                  <span className="text-xs text-amber-800">No shipment</span>
                )}
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Order status</dt>
                  <dd className="mt-1 text-stone-700">{orderStatusLabel(row.orderStatus)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Tracking</dt>
                  <dd className="mt-1 min-w-0 [overflow-wrap:anywhere] text-stone-700">{shipment?.tracking_number || '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Destination</dt>
                  <dd className="mt-1 min-w-0 [overflow-wrap:anywhere] text-stone-700">
                    {shipment ? formatShipmentPlace(shipment.destination) : row.shippingAddress || '—'}
                  </dd>
                </div>
              </dl>
              {!shipment ? (
                <p className="mt-5 text-sm leading-6 text-amber-800">
                  No shipment has been prepared for this order yet.
                </p>
              ) : canDispatch ? (
                <Button
                  onClick={() => { void handleDispatch(shipment.id); }}
                  disabled={busy || Boolean(dispatchingId)}
                  className="mt-5 w-full justify-center"
                >
                  {busy ? 'Dispatching' : 'Mark as Dispatched'}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
};
