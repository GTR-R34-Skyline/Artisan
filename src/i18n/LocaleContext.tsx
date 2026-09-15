import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuthHook';
import { SupportedLanguageCode, isSupportedLanguageCode } from '../utils/languages';
import { TRANSLATIONS } from './translations';
import { TranslationKey } from './types';

const LOCALE_STORAGE_KEY = 'artisan.ui.locale';

interface LocaleContextValue {
  language: SupportedLanguageCode;
  setLanguage: (language: SupportedLanguageCode) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const readStoredLocale = (): SupportedLanguageCode => {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isSupportedLanguageCode(stored)) return stored;
  } catch {
    // ignore
  }
  return 'en';
};

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const [language, setLanguageState] = useState<SupportedLanguageCode>(() => readStoredLocale());
  const [hydratedFromProfile, setHydratedFromProfile] = useState(false);

  useEffect(() => {
    if (hydratedFromProfile) return;
    const preferred = profile?.preferred_language;
    if (preferred && isSupportedLanguageCode(preferred)) {
      const hasExplicitChoice = Boolean(localStorage.getItem(LOCALE_STORAGE_KEY));
      if (!hasExplicitChoice) {
        setLanguageState(preferred);
      }
      setHydratedFromProfile(true);
    }
  }, [hydratedFromProfile, profile?.preferred_language]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, language);
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((next: SupportedLanguageCode) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>) => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
    let value = dict[key] || TRANSLATIONS.en[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([name, replacement]) => {
        value = value.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(replacement));
      });
    }
    return value;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = (): LocaleContextValue => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
};
