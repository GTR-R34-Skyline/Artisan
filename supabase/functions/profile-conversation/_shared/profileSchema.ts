import { SupportedLanguageCode } from '../../_shared/languageConfig.ts';

export interface ArtisanProfileState {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  craft: string | null;
  category: string | null;
  experienceYears: number | null;
  skills: string[];
  materials: string[];
  specialties: string[];
  products: string[];
  productionMethods: string[];
  story: string | null;
  languagesSpoken: string[];
  confidence: Record<string, number>;
  completedFields: string[];
  missingRequiredFields: string[];
  conversationComplete: boolean;
}

export const REQUIRED_PROFILE_FIELDS = ['name', 'location', 'craft', 'experienceYears', 'story'] as const;
export const PUBLIC_REQUIRED_PROFILE_FIELDS = [...REQUIRED_PROFILE_FIELDS, 'email', 'phone'] as const;

export const createInitialProfileState = (
  language: SupportedLanguageCode,
  publicApplication = false,
): ArtisanProfileState => ({
  name: null,
  email: null,
  phone: null,
  location: null,
  craft: null,
  category: null,
  experienceYears: null,
  skills: [],
  materials: [],
  specialties: [],
  products: [],
  productionMethods: [],
  story: null,
  languagesSpoken: [language],
  confidence: {},
  completedFields: [],
  missingRequiredFields: [...(publicApplication ? PUBLIC_REQUIRED_PROFILE_FIELDS : REQUIRED_PROFILE_FIELDS)],
  conversationComplete: false,
});

const toString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : [];

export const coerceProfileState = (
  input: unknown,
  language: SupportedLanguageCode,
  publicApplication = false,
): ArtisanProfileState => {
  const base = createInitialProfileState(language, publicApplication);
  if (!input || typeof input !== 'object') return base;
  const source = input as Record<string, unknown>;
  return {
    ...base,
    name: toString(source.name),
    email: toString(source.email),
    phone: toString(source.phone),
    location: toString(source.location),
    craft: toString(source.craft),
    category: toString(source.category),
    experienceYears: toNumber(source.experienceYears),
    skills: toStringArray(source.skills),
    materials: toStringArray(source.materials),
    specialties: toStringArray(source.specialties),
    products: toStringArray(source.products),
    productionMethods: toStringArray(source.productionMethods),
    story: toString(source.story),
    languagesSpoken: [...new Set([...base.languagesSpoken, ...toStringArray(source.languagesSpoken)])],
    confidence: typeof source.confidence === 'object' && source.confidence !== null
      ? Object.fromEntries(Object.entries(source.confidence as Record<string, unknown>).filter(([, value]) => typeof value === 'number'))
      : {},
    completedFields: toStringArray(source.completedFields),
    missingRequiredFields: [...(publicApplication ? PUBLIC_REQUIRED_PROFILE_FIELDS : REQUIRED_PROFILE_FIELDS)],
    conversationComplete: false,
  };
};

const hasScalarValue = (value: unknown): boolean =>
  (typeof value === 'string' && value.trim().length > 0)
  || (typeof value === 'number' && Number.isFinite(value));

export const normalizeIndianPhone = (value: string): string => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) return `+91${digits.slice(1)}`;
  if (digits.length >= 10 && trimmed.startsWith('+')) return `+${digits}`;
  return trimmed;
};

export const mergeProfileState = (
  current: ArtisanProfileState,
  updates: Partial<ArtisanProfileState>,
  confidence: Record<string, number>,
  publicApplication = false,
): ArtisanProfileState => {
  const merged: ArtisanProfileState = { ...current };
  const scalarFields = ['name', 'email', 'phone', 'location', 'craft', 'category', 'experienceYears', 'story'] as const;
  scalarFields.forEach((field) => {
    const rawValue = updates[field];
    const value = field === 'phone' && typeof rawValue === 'string'
      ? normalizeIndianPhone(rawValue)
      : rawValue;
    if (hasScalarValue(value)) {
      merged[field] = (typeof value === 'string' ? value.trim() : value) as never;
    }
  });

  const arrayFields = ['skills', 'materials', 'specialties', 'products', 'productionMethods', 'languagesSpoken'] as const;
  arrayFields.forEach((field) => {
    const value = toStringArray(updates[field]);
    if (value.length > 0) {
      merged[field] = Array.from(new Set(value)) as never;
    }
  });
  merged.languagesSpoken = Array.from(new Set([...current.languagesSpoken, ...toStringArray(updates.languagesSpoken)]));
  merged.confidence = { ...current.confidence, ...confidence };

  const requiredFields = publicApplication ? PUBLIC_REQUIRED_PROFILE_FIELDS : REQUIRED_PROFILE_FIELDS;
  merged.missingRequiredFields = requiredFields.filter((field) => !hasScalarValue(merged[field]));
  merged.completedFields = requiredFields.filter((field) => !merged.missingRequiredFields.includes(field));
  merged.conversationComplete = merged.missingRequiredFields.length === 0;
  return merged;
};
