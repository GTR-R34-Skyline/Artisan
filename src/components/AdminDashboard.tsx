import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { EmptyState, Eyebrow, StatusLabel } from './DesignSystem';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuthHook';
import { loadAdminAnalytics } from '../services/adminAnalytics.service';
import { AdminAnalytics } from '../types/adminAnalytics';
import { AdminOverview } from './admin/AdminOverview';
import { AdminMarketplace } from './admin/AdminMarketplace';

interface AdminDashboardProps {
  onLogout: () => void;
}

interface Application {
  id: string;
  name: string;
  email: string;
  phone: string;
  service_type: string;
  location: string | null;
  description: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface MarketplaceItem {
  id: string;
  vendor_id: string | null;
  title: string | null;
  title_en: string | null;
  category: string | null;
  material: string | null;
  status: 'draft' | 'processing' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'under_review' | 'synced';
  created_at: string;
}

type AdminView = 'overview' | 'marketplace' | 'applications' | 'products';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const { user, profile, loading: authLoading } = useAuth();
  const [view, setView] = useState<AdminView>('overview');
  const [applications, setApplications] = useState<Application[]>([]);
  const [products, setProducts] = useState<MarketplaceItem[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!user || profile?.role !== 'admin') return;
    setLoading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        throw new Error('The admin session is not available.');
      }

      const [applicationResult, productResult, snapshot] = await Promise.all([
        supabase.from('vendor_applications').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('id, vendor_id, title, title_en, category, material, status, created_at').order('created_at', { ascending: false }),
        loadAdminAnalytics(),
      ]);
      if (applicationResult.error) throw new Error(`vendor_applications: ${applicationResult.error.message}`);
      if (productResult.error) throw new Error(`products: ${productResult.error.message}`);
      setApplications((applicationResult.data || []) as Application[]);
      setProducts((productResult.data || []) as MarketplaceItem[]);
      setAnalytics(snapshot);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'The operational data could not be loaded.';
      console.error('Admin analytics load failed:', loadError);
      setError(message);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [profile?.role, user]);

  useEffect(() => {
    if (authLoading || !user || profile?.role !== 'admin') return undefined;
    void fetchData();
    return undefined;
  }, [authLoading, fetchData, profile?.role, user]);

  const updateApplication = async (id: string, status: 'approved' | 'rejected') => {
    const reason = status === 'rejected' ? window.prompt('Reason for rejection') : undefined;
    if (status === 'rejected' && !reason?.trim()) return;
    try {
      const { error: updateError } = await supabase
        .from('vendor_applications')
        .update({ status })
        .eq('id', id)
        .select('id, status')
        .single();
      if (updateError) throw updateError;
      await fetchData();
    } catch (updateFailure) {
      const error = updateFailure && typeof updateFailure === 'object'
        ? updateFailure as { code?: string; message?: string; details?: string; hint?: string }
        : {};
      console.error('Application status update failed:', {
        error: updateFailure,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        applicationId: id,
        requestedStatus: status,
      });
      setError(error.message || 'That status could not be updated.');
    }
  };

  const updateProduct = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({ status })
        .eq('id', id)
        .select('id, status')
        .single();
      if (updateError) throw updateError;
      await fetchData();
    } catch (updateFailure) {
      const error = updateFailure && typeof updateFailure === 'object'
        ? updateFailure as { code?: string; message?: string; details?: string; hint?: string }
        : {};
      console.error('Product status update failed:', {
        error: updateFailure,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        productId: id,
        requestedStatus: status,
      });
      setError(error.message || 'That product status could not be updated.');
    }
  };

  const filteredApplications = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return applications;
    return applications.filter((application) => [application.name, application.email, application.location, application.status].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [applications, search]);

  return (
    <div className="workspace-page admin-workspace mx-auto max-w-[1400px] px-6 pb-28 pt-12 lg:px-10 lg:pt-20">
      <header className="workspace-header flex flex-col gap-8 border-b border-stone-300 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-5">
          <Eyebrow>Operations</Eyebrow>
          <h1 className="font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">The workroom.</h1>
          <p className="max-w-md text-sm leading-6 text-stone-600">A considered view of the marketplace — sales, inventory, and the work still waiting for review.</p>
        </div>
        <button onClick={onLogout} className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 hover:text-stone-950">Sign out</button>
      </header>
      <nav className="workspace-nav flex flex-wrap gap-7 border-b border-stone-300 py-6">
        {(['overview', 'marketplace', 'applications', 'products'] as AdminView[]).map((item) => (
          <button key={item} type="button" onClick={() => setView(item)} className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${view === item ? 'text-stone-950' : 'text-stone-500 hover:text-stone-950'}`}>{item}</button>
        ))}
      </nav>
      {error && <p className="border-b border-stone-300 py-5 text-sm text-red-700">{error}</p>}
      {authLoading || loading ? <div className="py-16 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Loading operations</div> : (
        <>
          {view === 'overview' && analytics && <AdminOverview analytics={analytics} />}
          {view === 'marketplace' && analytics && <AdminMarketplace analytics={analytics} />}
          {view === 'applications' && (
            <section className="py-12">
              <div className="flex flex-col gap-6 border-b border-stone-300 pb-7 sm:flex-row sm:items-end sm:justify-between"><div><Eyebrow>Applications</Eyebrow><h2 className="mt-3 font-display text-4xl">Artisan profiles.</h2></div><label className="flex items-center gap-3 border-b border-stone-300 pb-2 sm:w-64"><Search className="h-4 w-4 text-stone-400" strokeWidth={1.5} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400" /></label></div>
              {filteredApplications.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-stone-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500"><th className="py-4 pr-6">Applicant</th><th className="py-4 pr-6">Practice</th><th className="py-4 pr-6">Status</th><th className="py-4 text-right">Action</th></tr></thead><tbody>{filteredApplications.map((application) => <tr key={application.id} className="border-b border-stone-200"><td className="py-5 pr-6"><p className="font-medium text-stone-950">{application.name}</p><p className="mt-1 text-xs text-stone-500">{application.email}</p></td><td className="py-5 pr-6 text-stone-600">{application.service_type === 'guide' ? 'Handloom and textiles' : 'Handicrafts and objects'}</td><td className="py-5 pr-6"><StatusLabel tone={application.status === 'approved' ? 'success' : application.status === 'pending' ? 'warning' : 'neutral'}>{application.status}</StatusLabel></td><td className="py-5 text-right">{application.status === 'pending' && <span className="inline-flex gap-4"><button onClick={() => void updateApplication(application.id, 'approved')} className="text-emerald-700 hover:text-emerald-900"><Check className="h-4 w-4" strokeWidth={1.5} /></button><button onClick={() => void updateApplication(application.id, 'rejected')} className="text-stone-500 hover:text-red-700"><X className="h-4 w-4" strokeWidth={1.5} /></button></span>}</td></tr>)}</tbody></table></div> : <div className="pt-10"><EmptyState title="No applications found." description="New artisan applications will appear here for review." /></div>}
            </section>
          )}
          {view === 'products' && (
            <section className="py-12">
              <Eyebrow>Product review</Eyebrow><h2 className="mt-3 font-display text-4xl">The collection queue.</h2>
              {products.length ? <div className="product-review-table mt-10 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b border-stone-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500"><th className="py-4 pr-6">Work</th><th className="py-4 pr-6">Category</th><th className="py-4 pr-6">Status</th><th className="py-4 text-right">Action</th></tr></thead><tbody>{products.map((product) => <tr key={product.id} className="border-b border-stone-200"><td className="py-5 pr-6 text-stone-950">{product.title_en || product.title || 'Untitled work'}</td><td className="py-5 pr-6 text-stone-600">{product.category || product.material || '—'}</td><td className="py-5 pr-6"><StatusLabel tone={product.status === 'approved' || product.status === 'published' || product.status === 'synced' ? 'success' : ['pending_review', 'under_review', 'processing'].includes(product.status) ? 'warning' : 'neutral'}>{product.status.replace('_', ' ')}</StatusLabel></td><td className="py-5 text-right">{['pending_review', 'under_review'].includes(product.status) && <span className="inline-flex gap-4"><button type="button" onClick={() => void updateProduct(product.id, 'approved')} className="text-emerald-700 hover:text-emerald-900" aria-label={`Approve ${product.title_en || product.title || 'product'}`}><Check className="h-4 w-4" strokeWidth={1.5} /></button><button type="button" onClick={() => void updateProduct(product.id, 'rejected')} className="text-stone-500 hover:text-red-700" aria-label={`Reject ${product.title_en || product.title || 'product'}`}><X className="h-4 w-4" strokeWidth={1.5} /></button></span>}</td></tr>)}</tbody></table></div> : <div className="pt-10"><EmptyState title="The product queue is clear." description="Submitted work will appear here for review." /></div>}
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
