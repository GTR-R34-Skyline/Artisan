import React from 'react';
import { SUPPORTED_LANGUAGES } from '../utils/languages';
import { useLocale } from '../i18n/LocaleContext';

interface LanguageSelectorProps {
  className?: string;
  /** When true, changing language also updates onboarding spoken language via callback. */
  onLanguageChange?: (code: ReturnType<typeof useLocale>['language']) => void;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ className = '', onLanguageChange }) => {
  const { language, setLanguage, t } = useLocale();

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="sr-only">{t('language.label')}</span>
      <select
        aria-label={t('language.label')}
        value={language}
        onChange={(event) => {
          const next = event.target.value as typeof language;
          setLanguage(next);
          onLanguageChange?.(next);
        }}
        className="min-w-[7.5rem] max-w-[11rem] cursor-pointer truncate border border-stone-300 bg-ivory px-2 py-1.5 text-[11px] font-medium text-stone-800 outline-none transition-colors hover:border-stone-500 focus:border-forest"
      >
        {SUPPORTED_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeDisplayName}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSelector;
