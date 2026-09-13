import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { AuthContext, UserProfile } from './AuthContext';
import { findExistingVendorProfileByPhone } from './vendorDashboardAccess';

const AUTH_TIMEOUT_MS = 12000;
const PROFILE_TIMEOUT_MS = 10000;
const DEMO_VENDOR_PASSWORD = 'Demo@12345';

const uniqueValues = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim())));

const demoEmailsFromName = (name: string | null | undefined): string[] => {
  if (!name?.trim()) return [];
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const emails = [`${parts[0]}@demo.artisan.market`];
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    emails.unshift(`${parts[0]}.${last}@demo.artisan.market`);
    if (last[0]) emails.push(`${parts[0]}.${last[0]}@demo.artisan.market`);
  }
  return emails;
};

const vendorPasswordCandidates = (phone: string): string[] => {
  const digits = phone.replace(/\D/g, '');
  return uniqueValues([
    DEMO_VENDOR_PASSWORD,
    `vendor_${phone.trim()}_password`,
    digits ? `vendor_${digits}_password` : null,
  ]);
};

const vendorEmailCandidates = async (profile: UserProfile, name: string, phone: string): Promise<string[]> => {
  const digits = phone.replace(/\D/g, '');
  const emails = uniqueValues([
    ...demoEmailsFromName(profile.full_name),
    ...demoEmailsFromName(name),
    `${phone.trim()}@artisan.local`,
    `${phone.trim()}@sampark.local`,
    digits ? `${digits}@artisan.local` : null,
    digits ? `${digits}@sampark.local` : null,
  ]);

  try {
    const { data } = await supabase.from('profiles').select('email').eq('id', profile.id).maybeSingle();
    const email = data && typeof (data as { email?: unknown }).email === 'string'
      ? (data as { email: string }).email
      : null;
    if (email) emails.unshift(email.trim().toLowerCase());
  } catch {
    // profiles.email is optional and may not exist.
  }

  try {
    const { data } = await supabase
      .from('vendor_applications')
      .select('email, phone')
      .eq('status', 'approved');
    (data || []).forEach((row) => {
      const application = row as { email?: string | null; phone?: string | null };
      const applicationDigits = (application.phone || '').replace(/\D/g, '');
      const applicationEmail = application.email?.trim().toLowerCase();
      if (!applicationEmail || !applicationDigits) return;
      if (applicationDigits === digits || applicationDigits.endsWith(digits) || digits.endsWith(applicationDigits)) {
        emails.unshift(applicationEmail);
      }
    });
  } catch {
    // Applications are often hidden until a session exists.
  }

  return uniqueValues(emails);
};

const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, operation: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${operation} timed out. Please check your internet connection.`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    console.log("fetchProfile called for userId:", userId);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('id, role, full_name, phone_number, preferred_language, location_state')
          .eq('id', userId)
          .maybeSingle(),
        PROFILE_TIMEOUT_MS,
        'Fetching profile'
      );

      if (error || !data) {
        console.warn('Profile not found in DB:', error);
        setProfile(null);
        return null;
      }
      const updatedProfile = data as UserProfile;
      console.log("Found profile in DB:", updatedProfile);
      setProfile(updatedProfile);
      return updatedProfile;
    } catch (e) {
      console.error("Error in fetchProfile:", e);
      setProfile(null);
      return null;
    }
  }, []);

  const restoreMockSession = useCallback((): boolean => {
    const mockVendorSession = localStorage.getItem('artisan_mock_session');
    if (!mockVendorSession) return false;
    try {
      const parsed = JSON.parse(mockVendorSession);
      if (parsed.version === 2 && parsed.profile?.role !== 'admin') {
        setUser(parsed.user);
        setProfile(parsed.profile);
        return true;
      }
      localStorage.removeItem('artisan_mock_session');
    } catch (e) {
      console.error('Failed to parse mock vendor session:', e);
      localStorage.removeItem('artisan_mock_session');
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          'Restoring session',
        );
        if (cancelled) return;
        if (session?.user) {
          localStorage.removeItem('artisan_mock_session');
          setUser(session.user);
          const prof = await fetchProfile(session.user.id);
          if (!cancelled) setProfile(prof);
          return;
        }
      } catch (err) {
        console.error('Initial session restore failed:', err);
      }

      if (!cancelled && !restoreMockSession()) {
        setUser(null);
        setProfile(null);
      }
    };

    void restoreSession().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return;

      if (session?.user) {
        localStorage.removeItem('artisan_mock_session');
        setUser(session.user);
        fetchProfile(session.user.id).catch((err) => {
          console.error('Profile refresh failed after auth change:', err);
        });
        setLoading(false);
        return;
      }

      if (event !== 'SIGNED_OUT') return;

      if (restoreMockSession()) {
        setLoading(false);
        return;
      }

      setUser(null);
      setProfile(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile, restoreMockSession]);

  const adoptAuthenticatedVendor = useCallback((sessionUser: User, vendorProfile: UserProfile) => {
    localStorage.removeItem('artisan_mock_session');
    setUser(sessionUser);
    setProfile(vendorProfile);
    return vendorProfile;
  }, []);

  const signInExistingVendor = useCallback(async (vendorProfile: UserProfile, name: string, phone: string): Promise<User | null> => {
    const emails = await vendorEmailCandidates(vendorProfile, name, phone);
    const passwords = vendorPasswordCandidates(phone);

    for (const email of emails) {
      for (const password of passwords) {
        try {
          const { data, error } = await withTimeout(
            supabase.auth.signInWithPassword({ email, password }),
            AUTH_TIMEOUT_MS,
            'Vendor sign in',
          );
          if (error || !data.user) continue;
          if (data.user.id !== vendorProfile.id) {
            await supabase.auth.signOut();
            continue;
          }
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session?.access_token) {
            await supabase.auth.signOut();
            continue;
          }
          return data.user;
        } catch {
          // Try the next credential pair.
        }
      }
    }

    return null;
  }, []);

  const loginAsVendor = useCallback(async (name: string, phone: string, language?: 'hi' | 'bn' | 'ta' | 'te' | 'en' | 'kn', locationState?: string): Promise<UserProfile | null> => {
    setLoading(true);
    localStorage.removeItem('artisan_mock_session');

    const syntheticEmail = `${phone}@artisan.local`;
    const syntheticPassword = `vendor_${phone}_password`;

    const existingVendor = await findExistingVendorProfileByPhone(phone);

    if (existingVendor) {
      const sessionUser = await signInExistingVendor(existingVendor, name, phone);
      if (!sessionUser) {
        setLoading(false);
        throw new Error('We found your workspace, but could not open a secure session. Please try again.');
      }

      const prof = (await fetchProfile(sessionUser.id)) || existingVendor;
      setLoading(false);
      return adoptAuthenticatedVendor(sessionUser, prof);
    }

    try {
      const { data: signInData, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password: syntheticPassword,
        }),
        AUTH_TIMEOUT_MS,
        'Vendor sign in'
      );

      if (!signInError && signInData.user) {
        const prof = await fetchProfile(signInData.user.id);
        if (prof) {
          setLoading(false);
          return adoptAuthenticatedVendor(signInData.user, prof);
        }
        await supabase.auth.signOut();
      }
    } catch {
      // Continue to registration for genuinely new vendors.
    }

    try {
      const { data, error: funcError } = await withTimeout(
        supabase.functions.invoke('register-vendor', {
          body: { name, phone, language, locationState }
        }),
        AUTH_TIMEOUT_MS,
        'Vendor registration'
      );

      if (funcError) throw funcError;
      if (!data || !data.success) throw new Error(data?.error || 'Registration failed');

      if (typeof data.userId === 'string' && data.userId) {
        const registeredProfile = await fetchProfile(data.userId);
        if (registeredProfile) {
          try {
            const { data: signInData, error: signInError } = await withTimeout(
              supabase.auth.signInWithPassword({
                email: data.email,
                password: data.password,
              }),
              AUTH_TIMEOUT_MS,
              'Vendor sign in'
            );
            if (!signInError && signInData.user && signInData.user.id === registeredProfile.id) {
              return adoptAuthenticatedVendor(signInData.user, registeredProfile);
            }
            if (signInData.user && signInData.user.id !== registeredProfile.id) {
              await supabase.auth.signOut();
            }
          } catch {
            // Fall through to another sign-in attempt with the returned credentials.
          }
        }
      }

      const { data: signInData, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        }),
        AUTH_TIMEOUT_MS,
        'Vendor sign in'
      );

      if (signInError) throw signInError;

      const authUser = signInData.user;
      if (!authUser) throw new Error('Unable to authenticate user session.');

      const prof = await fetchProfile(authUser.id);
      if (!prof) throw new Error('Your account profile could not be loaded.');
      return adoptAuthenticatedVendor(authUser, prof);
    } catch {
      const mockId = crypto.randomUUID();
      const mockProfile: UserProfile = {
        id: mockId,
        role: 'vendor',
        full_name: name,
        phone_number: phone,
        preferred_language: language || null,
        location_state: locationState || null
      };

      const mockUser = {
        id: mockId,
        email: syntheticEmail,
        phone,
        user_metadata: { full_name: name, role: 'vendor' },
        aud: 'authenticated',
        role: 'authenticated'
      } as unknown as User;

      localStorage.setItem('artisan_mock_session', JSON.stringify({ version: 2, user: mockUser, profile: mockProfile }));
      setUser(mockUser);
      setProfile(mockProfile);
      return mockProfile;
    } finally {
      setLoading(false);
    }
  }, [adoptAuthenticatedVendor, fetchProfile, signInExistingVendor]);

  const loginWithEmail = useCallback(async (
    email: string,
    password: string,
    expectedRole?: 'consumer' | 'admin' | 'courier',
  ): Promise<UserProfile> => {
    setLoading(true);
    localStorage.removeItem('artisan_mock_session');

    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      AUTH_TIMEOUT_MS,
      'Sign in'
    );
    if (error) {
      setLoading(false);
      throw error;
    }

    if (!data.user) {
      setLoading(false);
      throw new Error('Unable to authenticate user session.');
    }

    const authenticatedProfile = await fetchProfile(data.user.id);
    if (!authenticatedProfile) {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setLoading(false);
      throw new Error('Your account profile could not be loaded.');
    }

    if (expectedRole === 'admin' && authenticatedProfile.role !== 'admin') {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setLoading(false);
      throw new Error('This account is not authorized for the admin workspace.');
    }

    if (expectedRole === 'courier' && authenticatedProfile.role !== 'courier') {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setLoading(false);
      throw new Error('This account is not authorized for the courier workspace.');
    }

    setUser(data.user);
    setProfile(authenticatedProfile);
    setLoading(false);
    return authenticatedProfile;
  }, [fetchProfile]);

  const signUpWithEmail = useCallback(async (email: string, password: string, fullName: string, role: 'consumer' | 'admin') => {
    setLoading(true);
    try {
      const { error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: role,
            }
          }
        }),
        AUTH_TIMEOUT_MS,
        'Sign up'
      );
      if (error) {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    localStorage.removeItem('artisan_mock_session');
    try {
      await withTimeout(supabase.auth.signOut(), AUTH_TIMEOUT_MS, 'Sign out');
    } finally {
      setUser(null);
      setProfile(null);
      setLoading(false);
    }
  }, []);

  const contextValue = useMemo(() => ({
    user,
    profile,
    loading,
    loginAsVendor,
    loginWithEmail,
    signUpWithEmail,
    logout,
    fetchProfile
  }), [user, profile, loading, loginAsVendor, loginWithEmail, signUpWithEmail, logout, fetchProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
