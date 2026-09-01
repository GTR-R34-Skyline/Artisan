import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { Button, EmptyState, Eyebrow, ImageFrame } from '../components/DesignSystem';
import { formatCurrency } from '../services/checkout.service';

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, subtotal, updateQuantity, removeItem } = useCart();

  if (!items.length) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-10">
        <Eyebrow>Your collection</Eyebrow>
        <div className="mt-10">
          <EmptyState
            title="Nothing selected yet."
            description="Browse the collection and choose a piece to begin checkout."
          />
        </div>
        <div className="mt-10">
          <Button onClick={() => navigate('/marketplace')}>Browse collection</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 pb-28 pt-10 lg:px-10 lg:pt-16">
      <Eyebrow>Your collection</Eyebrow>
      <h1 className="mt-4 font-display text-5xl tracking-[-0.04em] text-stone-950 sm:text-6xl">Selected work</h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600">
        Review your selection before proceeding to checkout and mock UPI payment.
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr]">
        <div className="space-y-8">
          {items.map((item) => (
            <article key={item.productId} className="grid gap-6 border-b border-stone-300 pb-8 sm:grid-cols-[8rem_1fr_auto]">
              <Link to={`/marketplace/${item.productId}`}>
                <ImageFrame src={item.image} alt={item.title} className="aspect-square" />
              </Link>
              <div>
                <Link to={`/marketplace/${item.productId}`} className="font-display text-3xl text-stone-950 hover:text-forest">
                  {item.title}
                </Link>
                <p className="mt-2 text-sm text-stone-500">{formatCurrency(item.unitPrice)} each</p>
                <div className="mt-5 inline-flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="rounded-full border border-stone-300 p-2 text-stone-700"
                  >
                    <Minus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <span className="min-w-8 text-center text-sm font-semibold text-stone-950">{item.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    disabled={item.quantity >= item.maxStock}
                    className="rounded-full border border-stone-300 p-2 text-stone-700 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <div className="flex flex-col items-end justify-between gap-4">
                <p className="font-display text-2xl text-stone-950">{formatCurrency(item.unitPrice * item.quantity)}</p>
                <button
                  type="button"
                  onClick={() => removeItem(item.productId)}
                  className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 hover:text-stone-950"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} /> Remove
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="h-fit border border-stone-300 p-6">
          <Eyebrow>Summary</Eyebrow>
          <p className="mt-6 font-display text-4xl text-stone-950">{formatCurrency(subtotal)}</p>
          <p className="mt-2 text-sm text-stone-500">Mock UPI payment at checkout. No real money is charged.</p>
          <div className="mt-8 space-y-3">
            <Button className="w-full" onClick={() => navigate('/checkout')}>Proceed to checkout</Button>
            <Button variant="light" className="w-full" onClick={() => navigate('/marketplace')}>Continue browsing</Button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CartPage;
