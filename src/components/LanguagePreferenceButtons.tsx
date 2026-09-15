import React from 'react';
import { SupportedLanguageCode } from '../utils/languages';
import { LANGUAGE_CONFIG } from '../utils/languages';

/** Stable display order matching the product language-preference UI. */
export const LANGUAGE_PREFERENCE_ORDER: SupportedLanguageCode[] = ['en', 'hi', 'bn', 'ta', 'te', 'kn'];

interface LanguagePreferenceButtonsProps {
  selected?: SupportedLanguageCode | null;
  onSelect: (language: SupportedLanguageCode) => void;
  className?: string;
  label?: string;
}

/** Dedicated button grid for seller language preference — not free-text, not LLM-extracted. */
const LanguagePreferenceButtons: React.FC<LanguagePreferenceButtonsProps> = ({
  selected = null,
  onSelect,
  className = '',
  label,
}) => (
  <div className={className}>
    {label ? (
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
    ) : null}
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${label ? 'mt-4' : ''}`}>
      {LANGUAGE_PREFERENCE_ORDER.map((code) => {
        const language = LANGUAGE_CONFIG[code];
        const isActive = selected === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onSelect(code)}
            aria-pressed={isActive}
            className={`border px-3 py-3 text-center text-sm transition-colors ${
              isActive
                ? 'border-stone-950 bg-stone-950 text-white'
                : 'border-stone-300 bg-transparent text-stone-950 hover:border-stone-950'
            }`}
          >
            <span className="block font-medium leading-tight">{language.nativeDisplayName}</span>
            {language.nativeDisplayName !== language.displayName ? (
              <span className={`mt-1 block text-[10px] uppercase tracking-[0.12em] ${isActive ? 'text-white/70' : 'text-stone-500'}`}>
                {language.displayName}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  </div>
);

export default LanguagePreferenceButtons;
