import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface QuantitySelectorProps {
  value: number;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  decreaseLabel?: string;
  increaseLabel?: string;
  id?: string;
}

/** Shared quantity control with +/- and manual numeric entry. */
const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  value,
  max,
  min = 1,
  onChange,
  decreaseLabel = 'Decrease quantity',
  increaseLabel = 'Increase quantity',
  id,
}) => {
  const clamp = (next: number) => Math.max(min, Math.min(max, next));

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label={decreaseLabel}
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        className="rounded-full border border-stone-300 p-2 text-stone-700 disabled:opacity-40"
      >
        <Minus className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isFinite(parsed)) return;
          onChange(clamp(Math.round(parsed)));
        }}
        className="w-16 border border-stone-300 bg-transparent px-2 py-1.5 text-center text-sm font-semibold text-stone-950 outline-none focus:border-forest"
      />
      <button
        type="button"
        aria-label={increaseLabel}
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        className="rounded-full border border-stone-300 p-2 text-stone-700 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default QuantitySelector;
