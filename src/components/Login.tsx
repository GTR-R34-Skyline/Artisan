import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button, Eyebrow, Field } from './DesignSystem';
import { useAuth } from '../auth/useAuthHook';
import { isVendorDashboardReady } from '../auth/vendorDashboardAccess';

type AuthRole = 'vendor' | 'consumer' | 'admin';
type LoginLocationState = { from?: { pathname?: string } } | null;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginAsVendor, loginWithEmail, signUpWithEmail } = useAuth();
  const [activeRole, setActiveRole] = useState<AuthRole>('vendor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const redirectPath = (location.state as LoginLocationState)?.from?.pathname || '/';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (activeRole === 'vendor') {
        if (!vendorName.trim() || !vendorPhone.trim()) throw new Error('Please enter your name and phone number.');
        const artisanProfile = await loginAsVendor(vendorName.trim(), vendorPhone.trim(), 'en');
        const ready = await isVendorDashboardReady(artisanProfile);
        const destination = ready
          ? (redirectPath.startsWith('/vendor/') && redirectPath !== '/vendor/onboarding' ? redirectPath : '/vendor/dashboard')
          : '/vendor/onboarding';
        navigate(destination);
      } else if (isRegistering) {
        if (!fullName.trim()) throw new Error('Please enter your name.');
        await signUpWithEmail(email.trim(), password, fullName.trim(), 'consumer');
        setIsRegistering(false);
        setError('Account created. You can now sign in.');
      } else {
        await loginWithEmail(email.trim(), password, activeRole);
        navigate(activeRole === 'admin' ? '/admin/dashboard' : redirectPath);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page mx-auto grid max-w-[1400px] gap-16 px-6 py-16 lg:grid-cols-[0.9fr_0.7fr] lg:px-10 lg:py-28">
      <div className="auth-intro flex flex-col justify-between border-t border-stone-300 pt-8">
        <div className="space-y-8">
          <Eyebrow>Private workspace</Eyebrow>
          <h1 className="hero-title max-w-xl font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">A place for your work.</h1>
          <p className="max-w-md text-sm leading-7 text-stone-600">Sign in to manage your story, bring new pieces online, and keep your collection current.</p>
        </div>
        <p className="mt-20 max-w-xs border-l border-stone-400 pl-4 text-xs leading-6 text-stone-500">Your work remains yours. ARTISAN gives it a clear, considered place to be found.</p>
      </div>

      <div className="auth-panel border-y border-stone-300 py-8 lg:mt-16">
        <div className="role-tabs mb-10 flex gap-6 border-b border-stone-300">
          {(['vendor', 'consumer', 'admin'] as AuthRole[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => { setActiveRole(role); setError(''); setIsRegistering(false); }}
              className={`-mb-px border-b-2 pb-4 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${activeRole === role ? 'border-stone-950 text-stone-950' : 'border-transparent text-stone-500 hover:text-stone-950'}`}
            >
              {role === 'vendor' ? 'Artisan' : role === 'consumer' ? 'Buyer' : 'Admin'}
            </button>
          ))}
        </div>

        {error && <p className="mb-7 border-l-2 border-amber-700 pl-4 text-sm leading-6 text-stone-700">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-8">
          {activeRole === 'vendor' ? (
            <>
              <Field label="Your name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="Enter your name" required />
              <Field label="Phone number" value={vendorPhone} onChange={(event) => setVendorPhone(event.target.value)} placeholder="Enter your phone number" type="tel" required />
            </>
          ) : (
            <>
              {activeRole === 'consumer' && isRegistering && <Field label="Your name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Enter your name" required />}
              <Field label="Email address" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" required />
              <Field label="Password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" type="password" required />
            </>
          )}
          <Button type="submit" disabled={loading} className="w-full justify-between">
            {loading ? 'Opening workspace' : activeRole === 'vendor' ? 'Enter as artisan' : isRegistering ? 'Create account' : 'Sign in'}
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </form>

        {activeRole === 'consumer' && (
          <button type="button" onClick={() => { setIsRegistering((registering) => !registering); setError(''); }} className="mt-7 text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-950">
            {isRegistering ? 'Already have an account? Sign in' : 'New here? Create a buyer account'}
          </button>
        )}
      </div>
    </div>
  );
};

export default Login;
