import { ArtisanProfileState } from './profileSchema.ts';
import { SupportedLanguageCode } from '../../_shared/languageConfig.ts';
import {
  LANGUAGE_DISPLAY_NAME,
  buildLanguageSystemInstruction,
} from './sellerLanguage.ts';

export interface ProfileReasoningResult {
  updates: Partial<ArtisanProfileState>;
  changedFields: string[];
  needsConfirmation: string[];
  continueConversation: boolean;
  nextQuestion: string;
}

export interface GeminiTurnContext {
  turnId: string;
  clientTurnId?: string;
}

const nullable = (type: 'string' | 'number') => ({
  anyOf: [{ type }, { type: 'null' }],
});

const responseSchema = {
  type: 'object',
  properties: {
    updates: {
      type: 'object',
      properties: {
        name: nullable('string'),
        email: nullable('string'),
        phone: nullable('string'),
        location: nullable('string'),
        craft: nullable('string'),
        category: nullable('string'),
        experienceYears: nullable('number'),
        skills: { type: 'array', items: { type: 'string' } },
        materials: { type: 'array', items: { type: 'string' } },
        specialties: { type: 'array', items: { type: 'string' } },
        products: { type: 'array', items: { type: 'string' } },
        productionMethods: { type: 'array', items: { type: 'string' } },
        story: { type: ['string', 'null'] },
        languagesSpoken: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'name', 'email', 'phone', 'location', 'craft', 'category', 'experienceYears',
        'skills', 'materials', 'specialties', 'products', 'productionMethods', 'story', 'languagesSpoken',
      ],
      additionalProperties: false,
    },
    changed_fields: { type: 'array', items: { type: 'string' } },
    needs_confirmation: { type: 'array', items: { type: 'string' } },
    continue_conversation: { type: 'boolean' },
    next_question: { type: 'string' },
  },
  required: ['updates', 'changed_fields', 'needs_confirmation', 'continue_conversation', 'next_question'],
  additionalProperties: false,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

interface RawProfileReasoningResult {
  updates: Record<string, unknown>;
  changed_fields: string[];
  needs_confirmation: string[];
  continue_conversation: boolean;
  next_question: string;
}

const isProfileReasoningResult = (value: unknown): value is RawProfileReasoningResult => {
  if (!isRecord(value) || !isRecord(value.updates)) return false;
  return Array.isArray(value.changed_fields)
    && value.changed_fields.every((field) => typeof field === 'string')
    && Array.isArray(value.needs_confirmation)
    && value.needs_confirmation.every((field) => typeof field === 'string')
    && typeof value.continue_conversation === 'boolean'
    && typeof value.next_question === 'string';
};

const buildPrompt = (
  currentProfile: ArtisanProfileState,
  transcript: string,
  selectedLanguage: SupportedLanguageCode,
): string => {
  const languageName = LANGUAGE_DISPLAY_NAME[selectedLanguage];
  return `You are the semantic profile interviewer for an independent artisan marketplace.

LANGUAGE (authoritative — do not ignore):
${buildLanguageSystemInstruction(selectedLanguage)}

selected_language_code=${selectedLanguage}
selected_language_name=${languageName}

Return JSON only. The next_question field MUST be written in ${languageName} using the appropriate native script when the selected language is not English.

Your job is one-shot incremental extraction. The current profile is authoritative. Inspect the ENTIRE new transcript and extract EVERY supported field that is sufficiently evidenced in this transcript into updates. Use null for scalar fields with no new evidence and [] for arrays with no new evidence. Never repeat existing profile values in updates just because they are present in the current profile. Preserve already-collected values — do not clear them.

Understanding rules:
- Accept native script, Latin/romanized transliteration, and mixed phrasing for ${languageName}.
- Example (Tamil selected): "yennodiya peyar Shashank" and "என்னுடைய பெயர் ஷஷாங்க்" both mean the seller's name is Shashank.
- Example (Hindi selected): "mera naam Shashank hai", "mera naam Shashank h", "Mayan Anam Sashankha", and "मेरा नाम शशांक है" all mean the seller's name is Shashank.
- Treat noisy STT transliteration charitably when the selected language is ${languageName}: map clear "my name is …" patterns to the name field.
- When you understood a name, acknowledge it in ${languageName} native script (e.g. Hindi: "आपका नाम शशांक है।") then ask for remaining missing fields in the same language.
- Extract the meaning into structured fields (name=Shashank) while still writing next_question in ${languageName} native script.

Field semantics:
- name: the artisan's actual personal or professional name. Never infer it from a sentence beginning with "I am" unless the grammar and context clearly identify a name.
- location: where the artisan lives, works, or operates. Prefer an explicit "Location" label value when present (e.g. "Kanchipuram, Tamil Nadu"). NEVER take location from story text such as "a family of traditional weavers in Kanchipuram".
- craft: the craft practice the artisan performs. Prefer an explicit "Craft" label value. Do not invent product listing details.
- category: a supported craft category only when the transcript supports it.
- experienceYears: numeric years only (e.g. "18 years" → 18). Prefer an explicit "Years of experience" label.
- story: when an explicit "Your story" / "Story" label is present, capture EVERYTHING after that label including multiple sentences. Do not truncate. Never copy story text into location, craft, or name.
- materials: materials explicitly mentioned in this turn.
- products: products explicitly mentioned in this turn.
- productionMethods: techniques or methods explicitly mentioned in this turn.
- phone and email: only when explicitly provided (email address only; phone number only).
- skills, specialties: only when explicitly supported.
- languagesSpoken: always return []. Language preference is chosen via dedicated UI buttons, never inferred from the transcript.

When the transcript uses labeled lines such as Name / Email / Phone / Location / Craft / Years of experience / Your story, extract each labeled value exactly. If all required seller fields are present in one transcript, set continue_conversation to false and confirm the profile is ready to review in ${languageName} — do not ask follow-up questions for fields already provided.

Existing fields must remain unchanged unless the artisan clearly corrects or updates them. Do not fabricate, guess, normalize, or complete missing facts. Do not use a location phrase as a name. Do not ask for a field already known from the current profile.

For next_question:
- Write ONLY in ${languageName} (native script when not English). This text is spoken by TTS in ${languageName}.
- If you understood a value (e.g. name), you may briefly acknowledge it in ${languageName}, then ask for remaining missing required fields in one concise message.
- If required seller profile information is still missing after merging this transcript, ask ONLY for the genuinely missing required fields in one concise message in ${languageName}. You may list multiple missing items together. Do NOT ask one field at a time when several are missing. Do NOT restart onboarding. Do NOT ask for product listing details.
- If nothing useful was provided, briefly restate only what is still missing in ${languageName}.
- If everything required is present, set continue_conversation to false and use a short confirmation in ${languageName} that the profile is ready to review.
- NEVER produce English next_question when selected_language_code is not en.

CURRENT PROFILE:
${JSON.stringify(currentProfile)}

NEW TRANSCRIPT:
${JSON.stringify(transcript)}`;
};

const parseReasoningPayload = (text: string): ProfileReasoningResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Profile reasoning returned malformed structured data.');
  }
  if (!isProfileReasoningResult(parsed)) throw new Error('Profile reasoning returned an unexpected result.');
  return {
    updates: parsed.updates as Partial<ArtisanProfileState>,
    changedFields: parsed.changed_fields,
    needsConfirmation: parsed.needs_confirmation,
    continueConversation: parsed.continue_conversation,
    nextQuestion: parsed.next_question,
  };
};

const logGeminiRequestStart = (
  turn: GeminiTurnContext,
  model: string,
  mode: 'stream' | 'batch',
  transcriptChars: number,
): void => {
  console.info('[profile-gemini] request_start', {
    turnId: turn.turnId,
    clientTurnId: turn.clientTurnId ?? null,
    model,
    mode,
    transcriptChars,
    at: Date.now(),
  });
};

const logGeminiResponse = (
  turn: GeminiTurnContext,
  model: string,
  mode: 'stream' | 'batch',
  status: number,
  response: Response,
  startedAt: number,
): void => {
  console.info('[profile-gemini] request_response', {
    turnId: turn.turnId,
    clientTurnId: turn.clientTurnId ?? null,
    model,
    mode,
    status,
    elapsedMs: Date.now() - startedAt,
    retryAfter: response.headers.get('retry-after'),
    rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
    googleQuotaUser: response.headers.get('x-goog-quota-user'),
  });
};

const assertGeminiOk = async (
  turn: GeminiTurnContext,
  model: string,
  mode: 'stream' | 'batch',
  response: Response,
  startedAt: number,
): Promise<void> => {
  if (response.ok) return;
  logGeminiResponse(turn, model, mode, response.status, response, startedAt);
  let detail = '';
  try {
    const body = await response.text();
    if (body) detail = body.slice(0, 240);
  } catch {
    // ignore
  }
  console.error('[profile-gemini] request_failed', {
    turnId: turn.turnId,
    clientTurnId: turn.clientTurnId ?? null,
    model,
    mode,
    status: response.status,
    detail: detail || null,
  });
  throw new Error(`Profile reasoning failed with status ${response.status}.`);
};

export async function* streamReasonAboutProfileTokens(
  currentProfile: ArtisanProfileState,
  transcript: string,
  selectedLanguage: SupportedLanguageCode,
  turn: GeminiTurnContext,
): AsyncGenerator<string, ProfileReasoningResult, void> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Profile reasoning is not configured on the server.');

  const model = Deno.env.get('GEMINI_REASONING_MODEL') || 'gemini-3.6-flash';
  const startedAt = Date.now();
  logGeminiRequestStart(turn, model, 'stream', transcript.length);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(currentProfile, transcript, selectedLanguage) }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseJsonSchema: responseSchema,
        },
      }),
    },
  );

  await assertGeminiOk(turn, model, 'stream', response, startedAt);
  logGeminiResponse(turn, model, 'stream', response.status, response, startedAt);
  if (!response.body) throw new Error('Profile reasoning stream returned no body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let jsonText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payloadText = trimmed.slice(5).trim();
      if (!payloadText || payloadText === '[DONE]') continue;
      let payload: {
        candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
      };
      try {
        payload = JSON.parse(payloadText);
      } catch {
        continue;
      }
      const piece = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof piece === 'string' && piece.length) {
        jsonText += piece;
        yield piece;
      }
    }
  }

  if (!jsonText.trim()) throw new Error('Profile reasoning returned no structured result.');
  return parseReasoningPayload(jsonText);
}

export const reasonAboutProfile = async (
  currentProfile: ArtisanProfileState,
  transcript: string,
  selectedLanguage: SupportedLanguageCode,
  turn: GeminiTurnContext,
): Promise<ProfileReasoningResult> => {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Profile reasoning is not configured on the server.');

  const model = Deno.env.get('GEMINI_REASONING_MODEL') || 'gemini-3.6-flash';
  const startedAt = Date.now();
  logGeminiRequestStart(turn, model, 'batch', transcript.length);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(currentProfile, transcript, selectedLanguage) }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchema,
      },
    }),
  });

  await assertGeminiOk(turn, model, 'batch', response, startedAt);
  logGeminiResponse(turn, model, 'batch', response.status, response, startedAt);
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Profile reasoning returned no structured result.');
  return parseReasoningPayload(text);
};
