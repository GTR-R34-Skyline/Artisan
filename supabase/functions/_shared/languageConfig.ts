export type SupportedLanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'bn';

export interface LanguageConfig {
  code: SupportedLanguageCode;
  iso6391: string;
  displayName: string;
  nativeDisplayName: string;
  speechRecognitionCode: string;
  enabled: boolean;
}

export const LANGUAGE_CONFIG: Record<SupportedLanguageCode, LanguageConfig> = {
  en: {
    code: 'en',
    iso6391: 'en',
    displayName: 'English',
    nativeDisplayName: 'English',
    speechRecognitionCode: 'en-US',
    enabled: true,
  },
  hi: {
    code: 'hi',
    iso6391: 'hi',
    displayName: 'Hindi',
    nativeDisplayName: 'हिन्दी',
    speechRecognitionCode: 'hi-IN',
    enabled: true,
  },
  ta: {
    code: 'ta',
    iso6391: 'ta',
    displayName: 'Tamil',
    nativeDisplayName: 'தமிழ்',
    speechRecognitionCode: 'ta-IN',
    enabled: true,
  },
  te: {
    code: 'te',
    iso6391: 'te',
    displayName: 'Telugu',
    nativeDisplayName: 'తెలుగు',
    speechRecognitionCode: 'te-IN',
    enabled: true,
  },
  kn: {
    code: 'kn',
    iso6391: 'kn',
    displayName: 'Kannada',
    nativeDisplayName: 'ಕನ್ನಡ',
    speechRecognitionCode: 'kn-IN',
    enabled: true,
  },
  bn: {
    code: 'bn',
    iso6391: 'bn',
    displayName: 'Bengali',
    nativeDisplayName: 'বাংলা',
    speechRecognitionCode: 'bn-IN',
    enabled: true,
  },
};

export const SUPPORTED_LANGUAGE_CODES = Object.keys(LANGUAGE_CONFIG) as SupportedLanguageCode[];

export const isSupportedLanguageCode = (value: string): value is SupportedLanguageCode => {
  return SUPPORTED_LANGUAGE_CODES.includes(value as SupportedLanguageCode) && LANGUAGE_CONFIG[value as SupportedLanguageCode].enabled;
};
