import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Briefcase, Compass, Home, LogIn, LogOut, Menu, ShoppingBag, Sparkles, X } from 'lucide-react';
import { useAuth } from '../auth/useAuthHook';
import { useCart } from '../context/CartContext';
import { FloatingDock, FloatingDockItem } from './ui/floating-dock';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

const navigation = [
  { label: 'Collection', to: '/marketplace' },
  { label: 'Join ARTISAN', to: '/join' },
];

const Layout: React.FC<LayoutProps> = ({ children, className = '' }) => {
  const { user, profile, logout } = useAuth();
  const { itemCount } = useCart();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={`site-shell min-h-screen bg-ivory text-stone-950 ${className}`}>
      <header className="site-header border-b border-stone-300/80 bg-ivory/90">
        <div className="relative mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 lg:px-10">
          <Link to="/" onClick={closeMenu} className="brand-mark group flex items-center gap-3 md:absolute md:left-6 lg:left-10">
            <span className="brand-mark-word font-display text-2xl tracking-[-0.04em]">ARTISAN</span>
            <span className="hidden border-l border-stone-300 pl-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-stone-500 sm:block">
              India, made by hand
            </span>
          </Link>

          <FloatingDock
            className="hidden md:flex"
            items={[
              { title: 'Home', href: '/', active: location.pathname === '/', icon: <Home /> },
              { title: 'Collection', href: '/marketplace', active: location.pathname.startsWith('/marketplace') && !location.pathname.startsWith('/marketplace/register'), icon: <Compass /> },
              { title: 'Cart', href: '/cart', active: location.pathname.startsWith('/cart') || location.pathname.startsWith('/checkout'), icon: <ShoppingBag />, badge: itemCount || undefined },
              { title: 'Join ARTISAN', href: '/join', active: location.pathname.startsWith('/join'), icon: <Sparkles /> },
              ...(user && profile ? [
                { title: 'Workspace', href: profile.role === 'admin' ? '/admin/dashboard' : profile.role === 'courier' ? '/courier/dashboard' : '/vendor/dashboard', active: location.pathname.includes('dashboard') || location.pathname.startsWith('/courier/'), icon: <Briefcase /> },
                { title: 'Sign out', onClick: () => { void logout(); }, icon: <LogOut /> },
              ] : [
                { title: 'Sign in', href: '/login', active: location.pathname.startsWith('/login'), icon: <LogIn /> },
              ]),
            ] as FloatingDockItem[]}
          />

          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
            className="menu-toggle p-2 text-stone-950 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
          </button>
        </div>

        {menuOpen && (
          <nav className="mobile-nav border-t border-stone-300/80 px-6 py-6 md:hidden">
            <div className="flex flex-col gap-5">
              {navigation.map((item) => (
                <Link key={item.to} to={item.to} onClick={closeMenu} className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
                  {item.label}
                </Link>
              ))}
              <Link to="/cart" onClick={closeMenu} className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
                Cart{itemCount ? ` (${itemCount})` : ''}
              </Link>
              {user && profile ? (
                <>
                  <Link to={profile.role === 'admin' ? '/admin/dashboard' : profile.role === 'courier' ? '/courier/dashboard' : '/vendor/dashboard'} onClick={closeMenu} className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
                    Workspace
                  </Link>
                  <button onClick={() => { closeMenu(); void logout(); }} className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
                    Sign out
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={closeMenu} className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>

      <main key={location.pathname} className="page-transition">{children}</main>

      <footer className="site-footer border-t border-stone-300/80">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-12 sm:flex-row sm:items-end sm:justify-between lg:px-10">
          <div>
            <p className="font-display text-3xl tracking-[-0.04em]">ARTISAN<span className="text-forest">.</span></p>
            <p className="mt-3 max-w-xs text-xs leading-6 text-stone-600">
              A considered digital home for independent makers and the work they carry forward.
            </p>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Discover, document, and sell craftsmanship from across India.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
