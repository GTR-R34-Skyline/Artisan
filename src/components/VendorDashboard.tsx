import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Check, Clock3, Package, Plus } from 'lucide-react';
import { EmptyState, Eyebrow, ImageFrame, LoadingState, SectionHeading, StatusLabel } from './DesignSystem';
import { useAuth } from '../auth/useAuthHook';
import { supabase } from '../lib/supabase';
import { getProductImage, getProductPrice, getProductTitle, MarketplaceProduct } from '../types/marketplace';

type WorkspaceView = 'overview' | 'products' | 'insights' | 'reviews';

const VendorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<WorkspaceView>('overview');

  const fetchProducts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase.from('products').select('*').eq('vendor_id', user.id).order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setProducts((data || []) as MarketplaceProduct[]);
    } catch {
      setError('Your collection could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (profile && (!profile.preferred_language || !profile.location_state)) {
      navigate('/vendor/onboarding');
      return;
    }
    void fetchProducts();
  }, [fetchProducts, navigate, profile]);

  const published = products.filter((product) => ['approved', 'published', 'synced'].includes(product.status));
  const pending = products.filter((product) => ['pending_review', 'under_review', 'processing'].includes(product.status));
  const drafts = products.filter((product) => product.status === 'draft');

  return (
    <div className="workspace-page mx-auto max-w-[1400px] px-6 pb-28 pt-12 lg:px-10 lg:pt-20">
      <header className="workspace-header grid gap-10 border-b border-stone-300 pb-12 lg:grid-cols-[1fr_0.7fr] lg:items-end">
        <div className="space-y-5">
          <Eyebrow>Artisan workspace</Eyebrow>
          <h1 className="font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">Good to see you, {profile?.full_name || 'maker'}.</h1>
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
      {loading ? <LoadingState label="Opening your workspace" /> : (
        <>
          {view === 'overview' && (
            <div className="workspace-overview grid gap-16 py-12 lg:grid-cols-[1fr_0.75fr]">
              <section>
                <SectionHeading eyebrow="At a glance" title="A clear view of your collection." description="Keep your work current, review pieces waiting to go live, and add the next one when you are ready." />
                <div className="metric-list mt-12 border-t border-stone-300">
                  {[
                    { label: 'Published pieces', value: published.length, icon: Check, tone: 'success' as const },
                    { label: 'Awaiting review', value: pending.length, icon: Clock3, tone: 'warning' as const },
                    { label: 'Drafts', value: drafts.length, icon: Package, tone: 'neutral' as const },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between border-b border-stone-300 py-5">
                      <StatusLabel tone={item.tone}>{item.label}</StatusLabel>
                      <span className="font-display text-3xl text-stone-950">{item.value}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="border-t border-stone-300 pt-7">
                <Eyebrow>Next action</Eyebrow>
                <h2 className="mt-4 font-display text-4xl text-stone-950">{drafts.length ? 'Finish a piece already in progress.' : 'Bring another piece online.'}</h2>
                <p className="mt-4 text-sm leading-7 text-stone-600">{drafts.length ? 'Your draft is saved and ready whenever you are.' : 'A photograph and a few notes are enough to begin.'}</p>
                <Link to="/vendor/wizard" className="mt-8 inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-950">Continue <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} /></Link>
              </section>
            </div>
          )}

          {view === 'products' && (
            <section className="py-12">
              {products.length ? (
                <div className="workspace-product-grid grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((product) => (
                    <article key={product.id} className="workspace-product">
                      <ImageFrame src={getProductImage(product)} alt={getProductTitle(product)} label={product.category || 'Handmade work'} className="aspect-[4/3]" />
                      <div className="border-b border-stone-300 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <h2 className="font-display text-2xl text-stone-950">{getProductTitle(product)}</h2>
                          <StatusLabel tone={product.status === 'published' || product.status === 'approved' ? 'success' : product.status === 'pending_review' ? 'warning' : 'neutral'}>{product.status.replace('_', ' ')}</StatusLabel>
                        </div>
                        <p className="mt-2 text-xs text-stone-500">{getProductPrice(product) !== null ? `₹${getProductPrice(product)?.toLocaleString('en-IN')}` : 'Price to be set'}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <EmptyState title="Your collection starts here." description="Add your first piece and it will appear in this workspace." />}
            </section>
          )}

          {view === 'insights' && (
            <section className="max-w-2xl py-12">
              <SectionHeading eyebrow="Insights" title="Let the work speak first." description="Meaningful insights will appear as your products begin receiving views and inquiries." />
              <div className="mt-12 border-y border-stone-300 py-6 text-sm leading-7 text-stone-600">There is not enough activity yet to make a useful recommendation.</div>
            </section>
          )}

          {view === 'reviews' && (
            <section className="max-w-2xl py-12">
              <SectionHeading eyebrow="Reviews" title="The conversation starts with the first piece." description="Reviews from buyers will appear here when your published work begins receiving responses." />
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default VendorDashboard;
