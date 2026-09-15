import { describe, expect, it } from 'vitest';
import {
  buildLanguageSystemInstruction,
  localizedMissingFieldsQuestion,
  localizedReadyToReview,
  requiresCloudLanguagePipeline,
} from './sellerLanguage';

describe('sellerLanguage', () => {
  it('routes non-English languages to the cloud LLM/TTS pipeline', () => {
    expect(requiresCloudLanguagePipeline('en')).toBe(false);
    expect(requiresCloudLanguagePipeline('ta')).toBe(true);
    expect(requiresCloudLanguagePipeline('hi')).toBe(true);
  });

  it('builds explicit Tamil language instructions for the LLM', () => {
    const instruction = buildLanguageSystemInstruction('ta');
    expect(instruction).toMatch(/Tamil \(ta\)/);
    expect(instruction).toMatch(/Latin\/romanized transliteration/i);
    expect(instruction).toMatch(/native script/i);
    expect(instruction).not.toMatch(/Respond naturally in English/);
  });

  it('localizes missing-field follow-ups for Tamil', () => {
    const question = localizedMissingFieldsQuestion(['email', 'phone'], 'ta');
    expect(question).toMatch(/மின்னஞ்சல்/);
    expect(question).toMatch(/தொலைபேசி/);
    expect(question).not.toMatch(/Please also share/i);
  });

  it('localizes ready-to-review for Hindi', () => {
    expect(localizedReadyToReview('hi')).toMatch(/प्रोफ़ाइल/);
  });
});
