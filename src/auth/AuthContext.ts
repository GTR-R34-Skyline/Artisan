import { createContext } from 'react';
import { User } from '@supabase/supabase-js';

export type ProfileRole = 'vendor' | 'consumer' | 'courier' | 'admin';

export interface UserProfile {
  id: string;
  role: ProfileRole;
  full_name: string | null;
  phone_number: string | null;
  preferred_language: 'hi' | 'bn' | 'ta' | 'te' | 'en' | 'kn' | null;
  location_state: string | null;
}

export interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginAsVendor: (name: string, phone: string, language?: 'hi' | 'bn' | 'ta' | 'te' | 'en' | 'kn', locationState?: string) => Promise<UserProfile | null>;
  loginWithEmail: (email: string, password: string, expectedRole?: 'consumer' | 'admin' | 'courier') => Promise<UserProfile>;
  signUpWithEmail: (email: string, password: string, fullName: string, role: 'consumer' | 'admin') => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<UserProfile | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
