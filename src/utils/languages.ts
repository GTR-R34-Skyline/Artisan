export type SupportedLanguageCode = 'hi' | 'bn' | 'ta' | 'te' | 'en' | 'kn';

export interface LanguageConfig {
  code: SupportedLanguageCode;
  iso6391: string;
  displayName: string;
  nativeDisplayName: string;
  speechRecognitionCode: string;
  enabled: boolean;
  greeting: string;
  uiLabel: string;
  flag: string;
}

export const LANGUAGE_CONFIG: Record<SupportedLanguageCode, LanguageConfig> = {
  hi: {
    code: 'hi',
    iso6391: 'hi',
    displayName: 'Hindi',
    nativeDisplayName: 'हिन्दी',
    speechRecognitionCode: 'hi-IN',
    enabled: true,
    greeting: 'सैमपार्क में आपका स्वागत है। अपनी भाषा चुनें।',
    uiLabel: 'हिन्दी (Hindi)',
    flag: '🇮🇳',
  },
  ta: {
    code: 'ta',
    iso6391: 'ta',
    displayName: 'Tamil',
    nativeDisplayName: 'தமிழ்',
    speechRecognitionCode: 'ta-IN',
    enabled: true,
    greeting: 'சம்பார்க் உங்களை வரவேற்கிறது. உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்.',
    uiLabel: 'தமிழ் (Tamil)',
    flag: '🇮🇳',
  },
  te: {
    code: 'te',
    iso6391: 'te',
    displayName: 'Telugu',
    nativeDisplayName: 'తెలుగు',
    speechRecognitionCode: 'te-IN',
    enabled: true,
    greeting: 'శాంపార్క్‌కు స్వాగతం. మీ భాషను ఎంచుకోండి.',
    uiLabel: 'తెలుగు (Telugu)',
    flag: '🇮🇳',
  },
  bn: {
    code: 'bn',
    iso6391: 'bn',
    displayName: 'Bengali',
    nativeDisplayName: 'বাংলা',
    speechRecognitionCode: 'bn-IN',
    enabled: true,
    greeting: 'স্যামপার্ক-এ আপনাকে স্বাগত জানাই। আপনার ভাষা নির্বাচন করুন।',
    uiLabel: 'বাংলা (Bengali)',
    flag: '🇮🇳',
  },
  kn: {
    code: 'kn',
    iso6391: 'kn',
    displayName: 'Kannada',
    nativeDisplayName: 'ಕನ್ನಡ',
    speechRecognitionCode: 'kn-IN',
    enabled: true,
    greeting: 'ಸ್ಯಾಂಪಾರ್ಕ್‌ಗೆ ಸ್ವಾಗತ. ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆ ಮಾಡಿ.',
    uiLabel: 'ಕನ್ನಡ (Kannada)',
    flag: '🇮🇳',
  },
  en: {
    code: 'en',
    iso6391: 'en',
    displayName: 'English',
    nativeDisplayName: 'English',
    speechRecognitionCode: 'en-US',
    enabled: true,
    greeting: 'Welcome to ARTISAN.',
    uiLabel: 'English',
    flag: '🇬🇧',
  },
};

export const SUPPORTED_LANGUAGES: LanguageConfig[] = Object.values(LANGUAGE_CONFIG).filter((lang) => lang.enabled);

export const getLanguageConfig = (code: string | null | undefined): LanguageConfig => {
  if (code && code in LANGUAGE_CONFIG) {
    return LANGUAGE_CONFIG[code as SupportedLanguageCode];
  }
  return LANGUAGE_CONFIG.en;
};

export const isSupportedLanguageCode = (code: string | null | undefined): code is SupportedLanguageCode =>
  Boolean(code && code in LANGUAGE_CONFIG);
