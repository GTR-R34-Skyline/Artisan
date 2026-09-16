import React, { useEffect, useState } from 'react';
import { Button, ConfirmDialog, Eyebrow, Field } from '../DesignSystem';
import {
  formatSellingPrice,
  parseSellingPrice,
  updateProductFinalPrice,
} from '../../services/productUpdate.service';
import { getProductPrice, getProductTitle, MarketplaceProduct } from '../../types/marketplace';

interface ProductPriceEditorProps {
  product: MarketplaceProduct;
  onClose: () => void;
  onUpdated: (finalPrice: number) => void;
}

const currentSellingPrice = (product: MarketplaceProduct): number | null => getProductPrice(product);

const priceInputValue = (product: MarketplaceProduct): string => {
  const current = currentSellingPrice(product);
  return current == null ? '' : String(current);
};

export const ProductPriceEditor: React.FC<ProductPriceEditorProps> = ({ product, onClose, onUpdated }) => {
  const [price, setPrice] = useState(() => priceInputValue(product));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingPrice, setPendingPrice] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setPrice(priceInputValue(product));
    setError('');
    setSuccess('');
    setPendingPrice(null);
    setSaving(false);
    setSaveError('');
    // Reset the form when a different product is opened, not when its price is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const productName = getProductTitle(product);
  const currentPrice = currentSellingPrice(product);

  const requestSave = () => {
    if (saving) return;
    setError('');
    setSuccess('');
    const parsed = parseSellingPrice(price);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (currentPrice !== null && parsed.value === currentPrice) {
      setError('The selling price is already set to this amount.');
      return;
    }
    setPendingPrice(parsed.value);
    setSaveError('');
  };

  const closeConfirmation = () => {
    if (saving) return;
    setPendingPrice(null);
    setSaveError('');
  };

  const confirmUpdate = async () => {
    if (pendingPrice == null || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const saved = await updateProductFinalPrice(product.id, pendingPrice);
      setPrice(String(saved));
      setPendingPrice(null);
      setSuccess('Selling price updated.');
      onUpdated(saved);
    } catch (updateError) {
      setSaveError(updateError instanceof Error ? updateError.message : 'The selling price could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="min-w-0 border border-stone-300 p-5 sm:p-8">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Eyebrow>Edit selling price</Eyebrow>
          <h3 className="mt-3 font-display text-3xl leading-tight tracking-[-0.03em] text-stone-950 [overflow-wrap:anywhere]">
            {productName}
          </h3>
          <p className="mt-2 text-sm leading-7 text-stone-600">
            Current price: {currentPrice == null ? 'Not set' : formatSellingPrice(currentPrice)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 hover:text-stone-950"
        >
          Close
        </button>
      </div>

      <div className="mt-8 max-w-md">
        <Field
          label="Your price in rupees"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);
            setError('');
            setSuccess('');
          }}
          placeholder="0"
          type="text"
          inputMode="decimal"
          required
        />
      </div>

      {error && <p className="mt-5 text-sm text-red-700">{error}</p>}
      {success && <p className="mt-5 text-sm text-forest">{success}</p>}

      <div className="mt-8 flex min-w-0 flex-col gap-3 sm:flex-row">
        <Button variant="light" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button className="w-full sm:w-auto" onClick={requestSave} disabled={saving}>
          Save
        </Button>
      </div>

      <ConfirmDialog
        open={pendingPrice !== null}
        title="Confirm price update"
        confirmLabel="Confirm Update"
        onCancel={closeConfirmation}
        onConfirm={() => { void confirmUpdate(); }}
        confirming={saving}
        confirmDisabled={saving}
        error={saveError}
      >
        <dl className="min-w-0 space-y-4">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Product</dt>
            <dd className="mt-1 [overflow-wrap:anywhere] text-stone-950">{productName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">Current price</dt>
            <dd className="mt-1 text-stone-950">{currentPrice == null ? 'Not set' : formatSellingPrice(currentPrice)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">New price</dt>
            <dd className="mt-1 text-stone-950">{pendingPrice == null ? '—' : formatSellingPrice(pendingPrice)}</dd>
          </div>
        </dl>
        <p className="[overflow-wrap:anywhere]">Are you sure you want to update the selling price?</p>
      </ConfirmDialog>
    </section>
  );
};
