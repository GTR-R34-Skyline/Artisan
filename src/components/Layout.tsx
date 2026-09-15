import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Briefcase, Compass, Home, LogIn, LogOut, Menu, ShoppingBag, Sparkles, X } from 'lucide-react';
import { useAuth } from '../auth/useAuthHook';
import { useCart } from '../context/CartContext';
import { useLocale } from '../i18n/LocaleContext';
import LanguageSelector from './LanguageSelector';
import PwaStatus from './pwa/PwaStatus';
import { FloatingDock, FloatingDockItem } from './ui/floating-dock';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, className = '' }) => {
  const { user, profile, logout } = useAuth();
  const { itemCount } = useCart();
  const { t } = useLocale();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  const navigation = [
    { label: t('nav.collection'), to: '/marketplace' },
    { label: t('nav.join'), to: '/join' },
  ];

  return (
    <div className={`site-shell min-h-screen bg-ivory text-stone-950 ${className}`}>
      <header className="site-header border-b border-stone-300/80 bg-ivory/90">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-6 py-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-10">
          <Link to="/" onClick={closeMenu} className="brand-mark group flex min-w-0 items-center gap-3 justify-self-start">
            <span className="brand-mark-word shrink-0 font-display text-2xl tracking-[-0.04em]">ARTISAN</span>
            <span className="hidden min-w-0 truncate border-l border-stone-300 pl-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-stone-500 sm:block">
              {t('brand.tagline')}
            </span>
          </Link>

          <div className="hidden justify-self-center md:block">
            <FloatingDock
              className="relative z-[1]"
              items={[
                { title: t('nav.home'), href: '/', active: location.pathname === '/', icon: <Home /> },
                { title: t('nav.collection'), href: '/marketplace', active: location.pathname.startsWith('/marketplace') && !location.pathname.startsWith('/marketplace/register'), icon: <Compass /> },
                { title: t('nav.cart'), href: '/cart', active: location.pathname.startsWith('/cart') || location.pathname.startsWith('/checkout'), icon: <ShoppingBag />, badge: itemCount || undefined },
                { title: t('nav.join'), href: '/join', active: location.pathname.startsWith('/join'), icon: <Sparkles /> },
                ...(user && profile ? [
                  { title: t('nav.workspace'), href: profile.role === 'admin' ? '/admin/dashboard' : profile.role === 'courier' ? '/courier/dashboard' : '/vendor/dashboard', active: location.pathname.includes('dashboard') || location.pathname.startsWith('/courier/'), icon: <Briefcase /> },
                  { title: t('nav.signOut'), onClick: () => { void logout(); }, icon: <LogOut /> },
                ] : [
                  { title: t('nav.signIn'), href: '/login', active: location.pathname.startsWith('/login'), icon: <LogIn /> },
                ]),
              ] as FloatingDockItem[]}
            />
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 justify-self-end">
            <LanguageSelector className="relative z-[2]" />
            <button
              type="button"
              aria-label={menuOpen ? t('nav.menuClose') : t('nav.menuOpen')}
              onClick={() => setMenuOpen((open) => !open)}
              className="menu-toggle p-2 text-stone-950 md:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
            </button>
          </div>
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
                {t('nav.cart')}{itemCount ? ` (${itemCount})` : ''}
              </Link>
              {user && profile ? (
                <>
                  <Link to={profile.role === 'admin' ? '/admin/dashboard' : profile.role === 'courier' ? '/courier/dashboard' : '/vendor/dashboard'} onClick={closeMenu} className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
                    {t('nav.workspace')}
                  </Link>
                  <button onClick={() => { closeMenu(); void logout(); }} className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={closeMenu} className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
                  {t('nav.signIn')}
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
              {t('footer.blurb')}
            </p>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            {t('footer.line')}
          </p>
        </div>
      </footer>

      <PwaStatus />
    </div>
  );
};

export default Layout;
