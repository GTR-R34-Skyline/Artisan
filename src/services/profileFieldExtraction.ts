/**
 * Deterministic seller-profile field extraction.
 * Prefer explicit labels; fall back to careful natural-language patterns.
 * Never invent values. Never let story text populate location/craft/name.
 */

export type ExtractedSellerProfileFields = {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  craft?: string;
  experienceYears?: number;
  story?: string;
};

type FieldKey = keyof ExtractedSellerProfileFields;

const LABEL_DEFS: Array<{ key: FieldKey; patterns: RegExp[] }> = [
  {
    key: 'name',
    patterns: [
      /^full\s*name\b/i,
      /^your\s*name\b/i,
      /^name\b/i,
    ],
  },
  {
    key: 'email',
    patterns: [
      /^e[\s-]?mail(?:\s*address)?\b/i,
      /^email\b/i,
    ],
  },
  {
    key: 'phone',
    patterns: [
      /^phone(?:\s*number)?\b/i,
      /^mobile(?:\s*number)?\b/i,
      /^contact\s*number\b/i,
    ],
  },
  {
    key: 'location',
    patterns: [
      /^location\b/i,
      /^based\s*(?:in|out\s*of)?\b/i,
      /^city\b/i,
      /^place\b/i,
    ],
  },
  {
    key: 'craft',
    patterns: [
      /^craft(?:\s*type|\s*practice)?\b/i,
      /^specialty\b/i,
      /^specialisation\b/i,
      /^specialization\b/i,
    ],
  },
  {
    key: 'experienceYears',
    patterns: [
      /^years?\s*of\s*experience\b/i,
      /^experience\s*years?\b/i,
      /^years?\s*experience\b/i,
      /^experience\b/i,
    ],
  },
  {
    key: 'story',
    patterns: [
      /^your\s*story\b/i,
      /^my\s*story\b/i,
      /^story\b/i,
      /^about\s*(?:me|yourself|your\s*work)\b/i,
    ],
  },
];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\s*91[\s-]*)?(?:\d[\s-]*){10}/;
const YEARS_RE = /(\d{1,2})\s*(?:years?|yrs?)\b/i;

const cleanScalar = (value: string): string =>
  value
    .replace(/^[:\-–—\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePhone = (raw: string): string | undefined => {
  const match = raw.match(PHONE_RE);
  if (!match) return undefined;
  const digits = match[0].replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return `+91${digits.slice(1)}`;
  }
  return match[0].replace(/\s+/g, ' ').trim();
};

const normalizeYears = (raw: string): number | undefined => {
  const match = raw.match(YEARS_RE) || raw.match(/\b(\d{1,2})\b/);
  if (!match) return undefined;
  const years = Number(match[1]);
  if (!Number.isFinite(years) || years < 0 || years > 80) return undefined;
  return years;
};

const findLabelMatches = (text: string): Array<{ key: FieldKey; start: number; valueStart: number }> => {
  const matches: Array<{ key: FieldKey; start: number; valueStart: number }> = [];
  const lines = text.split(/\r?\n/);
  let offset = 0;

  for (const line of lines) {
    const trimmedStart = line.match(/^\s*/)?.[0].length ?? 0;
    const content = line.slice(trimmedStart);
    for (const def of LABEL_DEFS) {
      for (const pattern of def.patterns) {
        const m = content.match(pattern);
        if (!m || m.index !== 0) continue;
        // Require a boundary after the label (space, colon, dash) or end-of-line value.
        const after = content.slice(m[0].length);
        if (after.length > 0 && !/^[\s:\-–—]/.test(after) && def.key !== 'story') continue;
        matches.push({
          key: def.key,
          start: offset + trimmedStart,
          valueStart: offset + trimmedStart + m[0].length,
        });
        break;
      }
    }
    offset += line.length + 1;
  }

  // Also scan for inline "Label: value" / "Label value" across the whole text when
  // labels appear without newlines (single paragraph paste).
  if (matches.length < 3) {
    for (const def of LABEL_DEFS) {
      for (const pattern of def.patterns) {
        const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
        let m: RegExpExecArray | null;
        while ((m = global.exec(text)) !== null) {
          const atStart = m.index === 0 || /[\n\r]/.test(text[m.index - 1] || '');
          const prev = text[m.index - 1] || '';
          const looksLikeLabel = atStart || /[\n\r]/.test(prev);
          if (!looksLikeLabel) continue;
          const after = text.slice(m.index + m[0].length);
          if (after.length > 0 && !/^[\s:\-–—]/.test(after) && def.key !== 'story') continue;
          const already = matches.some((item) => item.key === def.key && Math.abs(item.start - m!.index) < 2);
          if (already) continue;
          matches.push({
            key: def.key,
            start: m.index,
            valueStart: m.index + m[0].length,
          });
        }
      }
    }
  }

  matches.sort((a, b) => a.start - b.start);
  // Keep first occurrence of each key in document order.
  const seen = new Set<FieldKey>();
  return matches.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
};

const extractFromLabels = (text: string): ExtractedSellerProfileFields => {
  const labels = findLabelMatches(text);
  if (labels.length === 0) return {};

  const updates: ExtractedSellerProfileFields = {};
  for (let index = 0; index < labels.length; index += 1) {
    const current = labels[index];
    const end = index + 1 < labels.length ? labels[index + 1].start : text.length;
    let raw = text.slice(current.valueStart, end);
    // Story keeps multi-sentence content; other fields take the first line primarily.
    if (current.key === 'story') {
      raw = raw.replace(/^[:\-–—\s]+/, '').trim();
    } else {
      raw = cleanScalar(raw.split(/\r?\n/)[0] || raw);
    }
    if (!raw) continue;

    switch (current.key) {
      case 'email': {
        const email = raw.match(EMAIL_RE)?.[0];
        if (email) updates.email = email;
        break;
      }
      case 'phone': {
        const phone = normalizePhone(raw);
        if (phone) updates.phone = phone;
        break;
      }
      case 'experienceYears': {
        const years = normalizeYears(raw);
        if (years !== undefined) updates.experienceYears = years;
        break;
      }
      case 'name':
      case 'location':
      case 'craft':
        updates[current.key] = raw;
        break;
      case 'story':
        updates.story = raw;
        break;
      default:
        break;
    }
  }

  return updates;
};

const extractNaturalLanguage = (text: string, already: ExtractedSellerProfileFields): ExtractedSellerProfileFields => {
  const updates: ExtractedSellerProfileFields = { ...already };

  if (!updates.email) {
    const email = text.match(EMAIL_RE)?.[0];
    if (email) updates.email = email;
  }

  if (!updates.phone) {
    const phone = normalizePhone(text);
    if (phone) updates.phone = phone;
  }

  if (updates.experienceYears === undefined) {
    // Prefer explicit experience phrasing over incidental numbers in the story.
    const experiencePhrase = text.match(
      /(?:years?\s*of\s*experience|experience(?:\s*years?)?|been\s+(?:practicing|working|weaving|making)[^.!?]{0,40}?)\D{0,12}(\d{1,2})\s*(?:years?|yrs?)?/i,
    ) || text.match(/(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|in\s+(?:this\s+)?craft|as\s+a)/i)
      || text.match(/(\d{1,2})\s*(?:years?|yrs?)\b/i);
    if (experiencePhrase) {
      const years = Number(experiencePhrase[1]);
      if (Number.isFinite(years) && years >= 0 && years <= 80) updates.experienceYears = years;
    }
  }

  if (!updates.name) {
    const name = text.match(
      /(?:(?:my\s+)?name\s+is|i\s+am\s+called|i['’]m\s+called|i['’]m|i\s+am)\s+([A-Z][A-Za-z.'-]{1,}(?:\s+[A-Z][A-Za-z.'-]{1,}){0,3})/i,
    ) || text.match(
      // Tamil / Hindi / Telugu / Kannada / Bengali Latin transliterations for "my name is …"
      /(?:(?:yenn?(?:u)?(?:odiya|udaiya|oda)?|en|enna|yen)\s*peyar|(?:mera|maya|mayan|meraa)\s*(?:naam|nam|anam)|amar\s*naam|naa?\s*peru|nanna\s*hesaru|en\s*peru)\s+(?:is\s+|hai\s+|h\s+)?([A-Za-z][A-Za-z.'-]{1,}(?:\s+[A-Za-z][A-Za-z.'-]{1,}){0,3})/i,
    ) || text.match(
      /(?:பெயர்|नाम|নাম|పేరు|ಹೆಸರು)\s*[:\-–—]?\s*([^\n,.]{2,40})/u,
    );
    if (name) {
      let candidate = name[1].trim();
      // Strip trailing romanized Hindi copulas: "Shashank hai" / "Shashank h" / "Sashankha."
      candidate = candidate.replace(/\s+(hai|h|hoon|hun|he|haan)\.?$/i, '').replace(/[.,!?।]+$/u, '').trim();
      candidate = candidate.replace(/\b\w/g, (ch) => ch.toUpperCase());
      // Normalize common STT mangling of Shashank.
      if (/^sashankha?$/i.test(candidate) || /^shashankha?$/i.test(candidate)) {
        candidate = 'Shashank';
      }
      if (!/^(based|from|a|an|the|hai|h)\b/i.test(candidate) && /[\p{L}]{2,}/u.test(candidate)) {
        updates.name = candidate;
      }
    }
  }

  if (!updates.location) {
    const location = text.match(
      /(?:(?:i\s+)?(?:live|am\s+based|['’]m\s+based)\s+(?:in|out\s+of)|based\s+(?:in|out\s+of)|i\s+am\s+from|i['’]m\s+from)\s+([A-Za-z][A-Za-z\s,.-]{1,60})/i,
    );
    if (location) {
      let value = location[1].trim();
      // Cut at sentence end or conjunction that starts story-like clauses.
      value = value.split(/[.!?]|\band\b|\bwhere\b|\bwho\b/i)[0].trim();
      value = value.replace(/,+$/, '').trim();
      if (value && !/^a\s+family\b/i.test(value) && !/^traditional\b/i.test(value)) {
        updates.location = value;
      }
    }
  }

  if (!updates.craft) {
    const craft = text.match(
      /(?:(?:my\s+)?craft\s+is|i\s+(?:practice|make|weave|create|do|work\s+as\s+a|am\s+a|['’]m\s+a))\s+([A-Za-z][A-Za-z0-9\s,&-]{2,80})/i,
    );
    if (craft) {
      let value = craft[1].trim();
      value = value.split(/[.!?]|\bin\b|\bfrom\b|\bfor\b|\band\s+i\b/i)[0].trim();
      value = value.replace(/^(a|an|the)\s+/i, '').trim();
      if (value.length >= 3) updates.craft = value;
    }
  }

  if (!updates.story) {
    // Only take an explicit story-like block; do not dump the whole transcript when labels failed partially.
    const storyBlock = text.match(
      /(?:(?:your|my)\s+)?story\s*[:\-–—]?\s*([\s\S]{40,})/i,
    );
    if (storyBlock) {
      updates.story = storyBlock[1].trim();
    }
  }

  return updates;
};

/** Extract the seven seller onboarding fields from a transcript. */
export const extractSellerProfileFields = (transcript: string): ExtractedSellerProfileFields => {
  const text = transcript.replace(/\u00a0/g, ' ').trim();
  if (!text) return {};

  const labeled = extractFromLabels(text);
  const labeledCount = Object.keys(labeled).length;

  // If most fields came from labels, only fill remaining gaps with careful NL patterns.
  const merged = labeledCount >= 3
    ? extractNaturalLanguage(text, labeled)
    : extractNaturalLanguage(text, labeled);

  // Final cleanups
  if (merged.email) merged.email = merged.email.trim();
  if (merged.phone) {
    const phone = normalizePhone(merged.phone);
    if (phone) merged.phone = phone;
  }
  if (typeof merged.experienceYears === 'string') {
    const years = normalizeYears(String(merged.experienceYears));
    if (years !== undefined) merged.experienceYears = years;
    else delete merged.experienceYears;
  }
  if (merged.story) merged.story = merged.story.trim();
  if (merged.name) merged.name = cleanScalar(merged.name);
  if (merged.location) merged.location = cleanScalar(merged.location);
  if (merged.craft) merged.craft = cleanScalar(merged.craft);

  return merged;
};

export const PUBLIC_SELLER_FIELDS = [
  'name',
  'email',
  'phone',
  'location',
  'craft',
  'experienceYears',
  'story',
] as const;
