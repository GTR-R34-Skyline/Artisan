import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CartItem } from '../types/checkout';
import { getProductImage, getProductPrice, getProductTitle, MarketplaceListing } from '../types/marketplace';

const CART_STORAGE_KEY = 'artisan.marketplace.cart';

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addListing: (listing: MarketplaceListing, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const readStoredCart = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.productId === 'string');
  } catch {
    return [];
  }
};

const listingToCartItem = (listing: MarketplaceListing, quantity: number): CartItem => {
  const maxStock = Math.max(0, listing.quantity ?? listing.stock_count ?? 0);
  const unitPrice = getProductPrice(listing) ?? 0;
  return {
    productId: listing.id,
    vendorId: listing.vendor_id,
    title: getProductTitle(listing),
    image: getProductImage(listing) || null,
    unitPrice,
    quantity: Math.max(1, Math.min(maxStock || 1, quantity)),
    maxStock: maxStock || 1,
  };
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => readStoredCart());

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addListing = useCallback((listing: MarketplaceListing, quantity = 1) => {
    const maxStock = Math.max(0, listing.quantity ?? listing.stock_count ?? 0);
    if (maxStock <= 0) return;

    setItems((current) => {
      const existing = current.find((item) => item.productId === listing.id);
      if (existing) {
        return current.map((item) =>
          item.productId === listing.id
            ? {
                ...item,
                quantity: Math.min(maxStock, item.quantity + quantity),
                unitPrice: getProductPrice(listing) ?? item.unitPrice,
                maxStock,
              }
            : item,
        );
      }
      return [...current, listingToCartItem(listing, quantity)];
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(1, Math.min(item.maxStock, quantity)) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return { items, itemCount, subtotal, addListing, updateQuantity, removeItem, clearCart };
  }, [items, addListing, updateQuantity, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = (): CartContextValue => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
