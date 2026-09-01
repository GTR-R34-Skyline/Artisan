import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Eyebrow, LoadingState, StatusLabel } from './DesignSystem';
import { useAuth } from '../auth/useAuthHook';
import { isVendorDashboardReady } from '../auth/vendorDashboardAccess';
import { loadVendorAnalytics } from '../services/vendorAnalytics.service';
import { supabase } from '../lib/supabase';
import { VendorAnalytics } from '../types/analytics';
import { OverviewCards } from './analytics/OverviewCards';
import { RevenueChart } from './analytics/RevenueChart';
import { ProductPerformance } from './analytics/ProductPerformance';
import { BusinessRecommendations } from './analytics/BusinessRecommendations';
import { ReviewsSection } from './analytics/ReviewsSection';

type WorkspaceView = 'overview' | 'products' | 'insights' | 'reviews';

const emptyAnalytics = (warning: string | null = null): VendorAnalytics => ({
  products: [],
  craftType: null,
  totalRevenue: 0,
  productsSold: 0,
  totalOrders: 0,
  currentStock: 0,
  averageRating: null,
  reviewCount: 0,
  ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  revenueByRange: { '7d': [], '30d': [], '90d': [], all: [] },
  productRows: [],
  recommendations: [],
  recentReviews: [],
  warning,
});

const VendorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [analytics, setAnalytics] = useState<VendorAnalytics>(emptyAnalytics());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<WorkspaceView>('overview');

  const fetchWorkspace = useCallback(async () => {
    if (!profile || !user || user.id !== profile.id) return;
    setLoading(true);
    setError('');
    try {
      let session = (await supabase.auth.getSession()).data.session;
      for (let attempt = 0; attempt < 10 && !session?.access_token; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (!session?.access_token || session.user.id !== profile.id) {
        setError('Your collection could not be loaded.');
        setAnalytics(emptyAnalytics());
        return;
      }

      const snapshot = await loadVendorAnalytics(profile.id);
      setAnalytics(snapshot);
    } catch {
      setError('Your collection could not be loaded.');
      setAnalytics(emptyAnalytics());
    } finally {
      setLoading(false);
    }
  }, [profile, user]);

  useEffect(() => {
    if (authLoading || !profile || !user || user.id !== profile.id) return undefined;

    let cancelled = false;

    const openWorkspace = async () => {
      const ready = await isVendorDashboardReady(profile, user.email);
      if (cancelled) return;
      if (!ready) {
        navigate('/vendor/onboarding');
        return;
      }
      await fetchWorkspace();
    };

    void openWorkspace();
    return () => {
      cancelled = true;
    };
  }, [authLoading, fetchWorkspace, navigate, profile, user]);

  const products = analytics.products;
  const published = products.filter((product) => ['approved', 'published', 'synced'].includes(product.status));
  const pending = products.filter((product) => ['pending_review', 'under_review', 'processing'].includes(product.status));
  const drafts = products.filter((product) => product.status === 'draft');
  const studioLine = [analytics.craftType, profile?.location_state].filter(Boolean).join(' · ');

  return (
    <div className="workspace-page analytics-workspace mx-auto max-w-[1400px] px-6 pb-28 pt-12 lg:px-10 lg:pt-20">
      <header className="workspace-header grid gap-10 border-b border-stone-300 pb-12 lg:grid-cols-[1fr_0.7fr] lg:items-end">
        <div className="space-y-5">
          <Eyebrow>Artisan workspace</Eyebrow>
          <h1 className="font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">Good to see you, {profile?.full_name || 'maker'}.</h1>
          {studioLine && <p className="text-sm text-stone-500">{studioLine}</p>}
        </div>
        <div className="lg:justify-self-end">
          <Link to="/vendor/wizard" className="inline-flex items-center gap-3 border-b border-stone-950 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-950">
            <Plus className="h-4 w-4" strokeWidth={1.5} /> Add a new piece
          </Link>
        </div>
      </header>

      <nav className="workspace-nav flex flex-wrap gap-x-7 gap-y-4 border-b border-stone-300 py-6">
        {(['overview', 'products', 'insights', 'reviews'] as WorkspaceView[]).map((item) => (
          <button key={item} type="button" onClick={() => setView(item)} className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${view === item ? 'text-stone-950' : 'text-stone-500 hover:text-stone-950'}`}>
            {item}
          </button>
        ))}
      </nav>

      {error && <p className="border-b border-stone-300 py-5 text-sm text-red-700">{error}</p>}
      {!error && analytics.warning && <p className="border-b border-stone-300 py-5 text-sm text-amber-800">{analytics.warning}</p>}

      {loading ? <LoadingState label="Opening your workspace" /> : (
        <>
          {view === 'overview' && (
            <div className="space-y-8 py-10">
              <OverviewCards analytics={analytics} />
              <RevenueChart series={analytics.revenueByRange} />

              <div className="workspace-overview grid gap-8 lg:grid-cols-[1fr_0.75fr]">
                <section className="analytics-glass-card p-6 sm:p-8">
                  <Eyebrow>Collection</Eyebrow>
                  <h2 className="mt-3 font-display text-3xl tracking-[-0.03em] text-stone-950">A clear view of your pieces.</h2>
                  <div className="metric-list mt-8 border-t border-stone-300/80">
                    {[
                      { label: 'Published pieces', value: published.length, tone: 'success' as const },
                      { label: 'Awaiting review', value: pending.length, tone: 'warning' as const },
                      { label: 'Drafts', value: drafts.length, tone: 'neutral' as const },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between border-b border-stone-300/80 py-5">
                        <StatusLabel tone={item.tone}>{item.label}</StatusLabel>
                        <span className="font-display text-3xl text-stone-950">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="analytics-glass-card p-6 sm:p-8">
                  <Eyebrow>Next action</Eyebrow>
                  <h2 className="mt-4 font-display text-4xl text-stone-950">{drafts.length ? 'Finish a piece already in progress.' : 'Bring another piece online.'}</h2>
                  <p className="mt-4 text-sm leading-7 text-stone-600">{drafts.length ? 'Your draft is saved and ready whenever you are.' : 'A photograph and a few notes are enough to begin.'}</p>
                  <Link to="/vendor/wizard" className="mt-8 inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-950">Continue <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} /></Link>
                </section>
              </div>
            </div>
          )}

          {view === 'products' && (
            <section className="py-12">
              <ProductPerformance rows={analytics.productRows} />
            </section>
          )}

          {view === 'insights' && (
            <section className="py-12">
              <BusinessRecommendations recommendations={analytics.recommendations} />
            </section>
          )}

          {view === 'reviews' && (
            <section className="py-12">
              <ReviewsSection analytics={analytics} />
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default VendorDashboard;
