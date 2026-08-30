import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { AuthContext, UserProfile } from './AuthContext';

const AUTH_TIMEOUT_MS = 12000;
const PROFILE_TIMEOUT_MS = 10000;

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

  useEffect(() => {
    console.log("useAuth useEffect initialization starting...");
    // 1. Check if there's a stored mock/vendor session
    const mockVendorSession = localStorage.getItem('artisan_mock_session');
    if (mockVendorSession) {
      try {
        const parsed = JSON.parse(mockVendorSession);
        console.log("Found stored mock vendor session:", parsed);
        if (parsed.version === 2 && parsed.profile?.role !== 'admin') {
          setUser(parsed.user);
          setProfile(parsed.profile);
          setLoading(false);
          return;
        }
        localStorage.removeItem('artisan_mock_session');
      } catch (e) {
        console.error('Failed to parse mock vendor session:', e);
      }
    }

    // 2. Otherwise use Supabase standard session
    console.log("Getting initial session...");
    withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'Restoring session')
      .then(({ data: { session } }) => {
        console.log("Initial session response:", session);
        if (session?.user) {
          setUser(session.user);
          fetchProfile(session.user.id)
            .then(prof => {
              console.log("Profile resolved for initial session:", prof);
              setProfile(prof);
            })
            .finally(() => setLoading(false));
          return;
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Initial session restore failed:', err);
        setLoading(false);
      });

    console.log("Setting up onAuthStateChange listener...");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("onAuthStateChange event:", event, "session:", session);
      if (localStorage.getItem('artisan_mock_session')) {
        console.log("Mock session exists, keeping active");
        return;
      }
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id).catch((err) => {
          console.error('Profile refresh failed after auth change:', err);
        });
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      console.log("Unsubscribing from onAuthStateChange");
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const loginAsVendor = useCallback(async (name: string, phone: string, language?: 'hi' | 'bn' | 'ta' | 'te' | 'en' | 'kn', locationState?: string): Promise<UserProfile | null> => {
    console.log("loginAsVendor started:", { name, phone, language, locationState });
    setLoading(true);
    localStorage.removeItem('artisan_mock_session');

    const email = `${phone}@artisan.local`;
    const password = `vendor_${phone}_password`;

    // Heuristically try direct sign-in first to avoid slow Edge Function invocation
    try {
      console.log("Attempting direct sign-in with password...");
      const { data: signInData, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email,
          password,
        }),
        AUTH_TIMEOUT_MS,
        'Vendor sign in'
      );

      if (signInError) {
        console.warn("Direct sign-in returned error:", signInError);
      }

      if (!signInError && signInData.user) {
        console.log("Direct sign-in succeeded, user:", signInData.user.id);
        const prof = await fetchProfile(signInData.user.id);
        console.log("Profile after direct sign-in:", prof);
        if (prof) {
          setUser(signInData.user);
          setProfile(prof);
          setLoading(false);
          console.log("Direct sign-in complete. Redirecting...");
          return prof;
        }
      }
    } catch (e) {
      console.warn("Direct sign-in attempt failed, falling back to Edge Function:", e);
    }

    // Call Edge Function to register or get credentials
    try {
      console.log("Invoking edge function register-vendor...");
      const { data, error: funcError } = await withTimeout(
        supabase.functions.invoke('register-vendor', {
          body: { name, phone, language, locationState }
        }),
        AUTH_TIMEOUT_MS,
        'Vendor registration'
      );

      if (funcError) {
        console.error("Edge function returned error:", funcError);
        throw funcError;
      }

      console.log("Edge function response:", data);
      if (!data || !data.success) {
        throw new Error(data?.error || 'Registration failed');
      }

      // Log in with the credentials returned from the Edge Function
      console.log("Signing in with credentials from Edge Function...");
      const { data: signInData, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        }),
        AUTH_TIMEOUT_MS,
        'Vendor sign in'
      );

      if (signInError) {
        console.error("Sign in with edge credentials failed:", signInError);
        throw signInError;
      }

      const authUser = signInData.user;
      if (!authUser) {
        throw new Error('Unable to authenticate user session.');
      }

      console.log("Signed in successfully. Fetching profile for:", authUser.id);
      const prof = await fetchProfile(authUser.id);
      console.log("Profile fetched:", prof);
      setUser(authUser);
      setProfile(prof);
      return prof;
    } catch (e) {
      console.error("Edge Function login failed, falling back to local-only mock session:", e);
      
      // Local-only mock session fallback (Offline-first resilience)
      const mockId = crypto.randomUUID();
      console.log("Creating local mock session with ID:", mockId);
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
        email: `${phone}@artisan.local`,
        phone: phone,
        user_metadata: { full_name: name, role: 'vendor' },
        aud: 'authenticated',
        role: 'authenticated'
      } as unknown as User;

      const sessionObj = { version: 2, user: mockUser, profile: mockProfile };
      localStorage.setItem('artisan_mock_session', JSON.stringify(sessionObj));
      setUser(mockUser);
      setProfile(mockProfile);
      return mockProfile;
    } finally {
      console.log("loginAsVendor finished. Setting loading false.");
      setLoading(false);
    }
  }, [fetchProfile]);

  const loginWithEmail = useCallback(async (
    email: string,
    password: string,
    expectedRole?: 'consumer' | 'admin',
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
