export type SupportedLanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'bn';

export interface ConversationState {
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
    careInstructions?: string | null;
  };
  hindi: {
    title: string;
    description: string;
    careInstructions?: string | null;
  };
}

export interface CatalogConversationRequest {
  productId: string;
  selectedLanguage?: SupportedLanguageCode;
  audioBase64?: string;
  audioMimeType?: string;
  audioDurationSec?: number;
  textInput?: string;
  productImageUrl?: string;
  conversationState?: Partial<ConversationState>;
  skipCurrentQuestion?: boolean;
}

export interface CatalogConversationResponse {
  transcript: string;
  assistantMessage: string;
  conversationComplete: boolean;
  extractedFields: Partial<ConversationState>;
  missingRequiredFields: string[];
  confidence: Record<string, number>;
  listing: GeneratedListing | null;
  audioBase64?: string;
  audioMimeType?: string;
  metadata?: {
    selectedLanguage: SupportedLanguageCode;
    transcriptionProvider: 'deepgram' | 'text';
    speechProvider: 'cartesia';
  };
}

export const createInitialConversationState = (): ConversationState => ({
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
