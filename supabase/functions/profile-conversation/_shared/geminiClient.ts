import { ArtisanProfileState } from './profileSchema.ts';
import { SupportedLanguageCode } from '../../_shared/languageConfig.ts';

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

const languageName = (language: SupportedLanguageCode): string => ({
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  kn: 'Kannada',
}[language]);

const buildPrompt = (
  currentProfile: ArtisanProfileState,
  transcript: string,
  selectedLanguage: SupportedLanguageCode,
): string => `You are the semantic profile interviewer for an independent artisan marketplace.
The artisan speaks in ${languageName(selectedLanguage)}. Return JSON only. Write next_question in ${languageName(selectedLanguage)}.

Your job is incremental extraction. The current profile is authoritative. Inspect the new transcript in context and return only facts sufficiently supported by this new transcript in updates. Use null for scalar fields with no new evidence and [] for arrays with no new evidence. Never repeat existing profile values in updates just because they are present in the current profile.

Field semantics:
- name: the artisan's actual personal or professional name. Never infer it from a sentence beginning with "I am" unless the grammar and context clearly identify a name.
- location: where the artisan lives, works, or operates. "I am based out of Chennai" is location, never name.
- craft: the craft practice the artisan performs.
- category: a supported craft category only when the transcript supports it.
- experienceYears: years of experience only when explicitly stated or reasonably derived.
- story: personal background or practice story explicitly provided in this turn.
- materials: materials explicitly mentioned in this turn.
- products: products explicitly mentioned in this turn.
- productionMethods: techniques or methods explicitly mentioned in this turn.
- phone and email: only when explicitly provided.
- skills, specialties, and languagesSpoken: only when explicitly supported.

Existing fields must remain unchanged unless the artisan clearly corrects or updates them (for example, "Actually, my name is Ramesh Kumar"). Do not fabricate, guess, normalize, or complete missing facts. Do not use a location phrase as a name. Do not ask for a field already known from the current profile. Ask one concise next question only for genuinely missing required information. If the transcript provides no useful fact, return no updates.

CURRENT PROFILE:
${JSON.stringify(currentProfile)}

NEW TRANSCRIPT:
${JSON.stringify(transcript)}`;

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
