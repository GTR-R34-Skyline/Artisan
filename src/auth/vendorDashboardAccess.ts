import { supabase } from '../lib/supabase';
import { UserProfile } from './AuthContext';

const PROFILE_SELECT = 'id, role, full_name, phone_number, preferred_language, location_state';

const isFilled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const digitsOnly = (value: string | null | undefined): string =>
  isFilled(value) ? value.trim().replace(/\D/g, '') : '';

const normalizeEmail = (value: string | null | undefined): string =>
  isFilled(value) ? value.trim().toLowerCase() : '';

const phonesMatch = (left: string, right: string): boolean => {
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
};

const phoneLookupValues = (phone: string): string[] => {
  const trimmed = phone.trim();
  const digits = digitsOnly(trimmed);
  const values = new Set<string>();
  if (trimmed) values.add(trimmed);
  if (digits) {
    values.add(digits);
    if (digits.length === 10) {
      values.add(`+91${digits}`);
      values.add(`91${digits}`);
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      values.add(digits.slice(2));
      values.add(`+${digits}`);
    }
  }
  return Array.from(values);
};

const asProfile = (row: unknown): UserProfile | null => {
  if (!row || typeof row !== 'object') return null;
  const source = row as Record<string, unknown>;
  if (typeof source.id !== 'string' || typeof source.role !== 'string') return null;
  if (source.role !== 'vendor' && source.role !== 'consumer' && source.role !== 'admin' && source.role !== 'courier') return null;
  return {
    id: source.id,
    role: source.role,
    full_name: typeof source.full_name === 'string' ? source.full_name : null,
    phone_number: typeof source.phone_number === 'string' ? source.phone_number : null,
    preferred_language: (source.preferred_language as UserProfile['preferred_language']) || null,
    location_state: typeof source.location_state === 'string' ? source.location_state : null,
  };
};

export const hasCompletedVendorProfile = (
  profile: Pick<UserProfile, 'preferred_language' | 'location_state'> | null | undefined,
): boolean =>
  Boolean(profile && isFilled(profile.preferred_language) && isFilled(profile.location_state));

export const findExistingVendorProfileByPhone = async (phone: string): Promise<UserProfile | null> => {
  const candidates = phoneLookupValues(phone);
  if (!candidates.length) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('role', 'vendor')
    .in('phone_number', candidates);

  if (error || !data?.length) return null;

  const match = data.find((row) => {
    const profile = asProfile(row);
    return profile && phonesMatch(digitsOnly(profile.phone_number), digitsOnly(phone));
  });

  return asProfile(match || data[0]);
};

const resolveEmail = async (email?: string | null): Promise<string | null> => {
  if (isFilled(email)) return email.trim();
  const { data } = await supabase.auth.getSession();
  const sessionEmail = data.session?.user.email;
  return isFilled(sessionEmail) ? sessionEmail.trim() : null;
};

export const hasVendorRecord = async (profileId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('vendors')
    .select('id')
    .eq('id', profileId)
    .maybeSingle();

  return !error && Boolean(data && typeof (data as { id?: unknown }).id === 'string');
};

export const hasApprovedVendorApplication = async (
  profile: Pick<UserProfile, 'phone_number'> | null | undefined,
  email?: string | null,
): Promise<boolean> => {
  const sessionEmail = normalizeEmail(await resolveEmail(email));
  const profilePhone = digitsOnly(profile?.phone_number);

  const { data, error } = await supabase
    .from('vendor_applications')
    .select('id, status, email, phone')
    .eq('status', 'approved');

  if (error || !data?.length) return false;

  return data.some((row) => {
    const application = row as { email?: string | null; phone?: string | null };
    const applicationEmail = normalizeEmail(application.email);
    const applicationPhone = digitsOnly(application.phone);
    if (sessionEmail && applicationEmail && sessionEmail === applicationEmail) return true;
    if (phonesMatch(profilePhone, applicationPhone)) return true;
    return false;
  });
};

export const isVendorDashboardReady = async (
  profile: UserProfile | null | undefined,
  email?: string | null,
): Promise<boolean> => {
  if (!profile) return false;
  if (hasCompletedVendorProfile(profile)) return true;
  if (await hasVendorRecord(profile.id)) return true;
  return hasApprovedVendorApplication(profile, email);
};
