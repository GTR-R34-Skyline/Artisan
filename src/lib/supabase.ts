import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SUPABASE_REQUEST_TIMEOUT_MS = 20000;

const timeoutFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);

  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Supabase request timed out. Please retry with a stable internet connection.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: timeoutFetch,
  },
});

export type Vendor = {
  id: string;
  name: string;
  phone: string;
  email: string;
  service_type: 'guide' | 'marketplace';
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  approved_at?: string;
};

export type VendorPhoto = {
  id: string;
  vendor_id: string;
  photo_url: string;
  photo_type: 'profile' | 'document' | 'gallery';
  created_at: string;
};

export type Review = {
  id: string;
  vendor_id: string;
  customer_name: string;
  rating: number;
  comment?: string;
  created_at: string;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  created_at: string;
};

export const testSupabaseConnection = async (): Promise<{
  dbOk: boolean;
  dbLatencyMs: number;
  dbError?: string;
  authOk: boolean;
  authLatencyMs: number;
  authError?: string;
  storageOk: boolean;
  storageLatencyMs: number;
  storageError?: string;
}> => {
  let dbOk = false;
  let dbLatencyMs = -1;
  let dbError: string | undefined;

  let authOk = false;
  let authLatencyMs = -1;
  let authError: string | undefined;

  let storageOk = false;
  let storageLatencyMs = -1;
  let storageError: string | undefined;

  // 1. Test Auth
  try {
    const authStart = Date.now();
    const { error } = await supabase.auth.getSession();
    authLatencyMs = Date.now() - authStart;
    if (error) {
      authError = error.message;
    } else {
      authOk = true;
    }
  } catch (err) {
    authError = err instanceof Error ? err.message : String(err);
  }

  // 2. Test DB Query (profiles table)
  try {
    const dbStart = Date.now();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    dbLatencyMs = Date.now() - dbStart;
    if (error) {
      dbError = error.message;
    } else {
      dbOk = true;
    }
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  // 3. Test Storage (list items in marketplace-images)
  try {
    const storageStart = Date.now();
    const { error } = await supabase.storage.from('marketplace-images').list('', { limit: 1 });
    storageLatencyMs = Date.now() - storageStart;
    if (error) {
      storageError = error.message;
    } else {
      storageOk = true;
    }
  } catch (err) {
    storageError = err instanceof Error ? err.message : String(err);
  }

  return {
    dbOk,
    dbLatencyMs,
    dbError,
    authOk,
    authLatencyMs,
    authError,
    storageOk,
    storageLatencyMs,
    storageError,
  };
};