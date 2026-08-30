import { SupportedLanguageCode } from './catalogConversation';

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

export interface ProfileConversationRequest {
  selectedLanguage: SupportedLanguageCode;
  transcript?: string;
  audioBase64?: string;
  audioMimeType?: string;
  profileState: Partial<ArtisanProfileState>;
  publicApplication?: boolean;
}

export interface ProfileConversationResponse {
  transcript: string;
  assistantMessage: string;
  extractedFields: Partial<ArtisanProfileState>;
  missingRequiredFields: string[];
  confidence: Record<string, number>;
  conversationComplete: boolean;
  audioBase64?: string;
  audioMimeType?: string;
  emptyTranscript?: boolean;
  errorMessage?: string;
  changedFields?: string[];
  needsConfirmation?: string[];
}

export const createInitialProfileState = (selectedLanguage?: SupportedLanguageCode): ArtisanProfileState => ({
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
  languagesSpoken: selectedLanguage ? [selectedLanguage] : [],
  confidence: {},
  completedFields: [],
  missingRequiredFields: ['name', 'location', 'craft', 'experienceYears', 'story'],
  conversationComplete: false,
});
