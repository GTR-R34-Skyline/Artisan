import { SupportedLanguageCode } from '../../_shared/languageConfig.ts';

export interface ProductConversationState {
  productName: string | null;
  category: string | null;
  material: string | null;
  description: string | null;
  quantity: number | null;
  color: string | null;
  dimensions: string | null;
  weight: string | null;
  craftsmanship: string | null;
  origin: string | null;
  careInstructions: string | null;
  customization: string | null;
  materialCost: number | null;
  labourDays: number | null;
  confidence: Record<string, number>;
  completedFields: string[];
  missingRequiredFields: string[];
  conversationComplete: boolean;
}

export interface GeneratedListing {
  english: {
    title: string;
    description: string;
    careInstructions?: string;
  };
  hindi: {
    title: string;
    description: string;
    careInstructions?: string;
  };
}

export interface CatalogConversationResult {
  transcript: string;
  assistantMessage: string;
  conversationComplete: boolean;
  extractedFields: Partial<ProductConversationState>;
  missingRequiredFields: string[];
  confidence: Record<string, number>;
  listing: GeneratedListing | null;
}

export interface CatalogConversationRequest {
  productId: string;
  selectedLanguage?: SupportedLanguageCode;
  audioBase64?: string;
  audioMimeType?: string;
  audioDurationSec?: number;
  textInput?: string;
  conversationState?: Partial<ProductConversationState>;
  skipCurrentQuestion?: boolean;
}

export const createInitialState = (): ProductConversationState => ({
  productName: null,
  category: null,
  material: null,
  description: null,
  quantity: null,
  color: null,
  dimensions: null,
  weight: null,
  craftsmanship: null,
  origin: null,
  careInstructions: null,
  customization: null,
  materialCost: null,
  labourDays: null,
  confidence: {},
  completedFields: [],
  missingRequiredFields: ['productName', 'category', 'material', 'description', 'quantity'],
  conversationComplete: false,
});

export const coerceState = (input: unknown): ProductConversationState => {
  const base = createInitialState();
  if (!input || typeof input !== 'object') return base;

  const source = input as Record<string, unknown>;
  const pickString = (k: keyof ProductConversationState): string | null => {
    const value = source[k as string];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  };

  const pickNumber = (k: keyof ProductConversationState): number | null => {
    const value = source[k as string];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const confidenceRaw = source.confidence;
  const confidence = typeof confidenceRaw === 'object' && confidenceRaw !== null
    ? Object.fromEntries(
        Object.entries(confidenceRaw as Record<string, unknown>)
          .map(([k, v]) => [k, typeof v === 'number' ? v : Number(v)])
          .filter(([, v]) => Number.isFinite(v) && v >= 0 && v <= 1)
      )
    : {};

  return {
    ...base,
    productName: pickString('productName'),
    category: pickString('category'),
    material: pickString('material'),
    description: pickString('description'),
    quantity: pickNumber('quantity'),
    color: pickString('color'),
    dimensions: pickString('dimensions'),
    weight: pickString('weight'),
    craftsmanship: pickString('craftsmanship'),
    origin: pickString('origin'),
    careInstructions: pickString('careInstructions'),
    customization: pickString('customization'),
    materialCost: pickNumber('materialCost'),
    labourDays: pickNumber('labourDays'),
    confidence,
    completedFields: Array.isArray(source.completedFields)
      ? source.completedFields.filter((x): x is string => typeof x === 'string')
      : base.completedFields,
    missingRequiredFields: Array.isArray(source.missingRequiredFields)
      ? source.missingRequiredFields.filter((x): x is string => typeof x === 'string')
      : base.missingRequiredFields,
    conversationComplete: Boolean(source.conversationComplete),
  };
};

export const isValidCatalogResult = (result: unknown): result is CatalogConversationResult => {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  return (
    typeof r.assistantMessage === 'string' &&
    typeof r.conversationComplete === 'boolean' &&
    typeof r.extractedFields === 'object' &&
    Array.isArray(r.missingRequiredFields) &&
    typeof r.confidence === 'object' &&
    Object.prototype.hasOwnProperty.call(r, 'listing') &&
    typeof r.transcript === 'string'
  );
};
