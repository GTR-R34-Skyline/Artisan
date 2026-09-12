import {
  ArtisanProfileState,
  ProfileConversationRequest,
  ProfileConversationResponse,
} from '../types/profileConversation';
import { ProfileStreamHandlers } from './profileConversation.service';
import { generateLlm, speakWithPiper, waitForLocalVoiceReady } from './localVoiceRuntime';
import { logVoiceTiming, VoiceTurnTimer } from './profileVoiceTiming';
import { markVoicePerf } from './voicePerf';

/**
 * Authoritative public join onboarding inputs.
 * Source: VoiceProfileCapture REQUIRED_FIELDS and
 * supabase profileSchema PUBLIC_REQUIRED_PROFILE_FIELDS.
 */
const PUBLIC_REQUIRED = ['name', 'email', 'phone', 'location', 'craft', 'experienceYears', 'story'] as const;
/** Vendor onboarding completion set from VendorOnboarding.completedFields. */
const VENDOR_REQUIRED = ['name', 'location', 'craft', 'experienceYears', 'story'] as const;

const hasScalarValue = (value: unknown): boolean =>
  (typeof value === 'string' && value.trim().length > 0)
  || (typeof value === 'number' && Number.isFinite(value));

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const fieldValue = (profile: Partial<ArtisanProfileState>, field: string): string => {
  const value = profile[field as keyof ArtisanProfileState];
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined || value === '') return '';
  return String(value);
};

/** Existing next-question copy for each required onboarding input. */
const nextMissingQuestion: Record<string, string> = {
  name: 'What is your name?',
  email: 'What email should we use to reach you?',
  phone: 'What phone number should we use?',
  location: 'Where are you based?',
  craft: 'What craft do you practice?',
  experienceYears: 'How many years have you been practicing this craft?',
  story: 'Tell me a little about your work and how you came to it.',
};

export const extractProfileFieldsFromTranscript = (transcript: string): Partial<ArtisanProfileState> => {
  const text = transcript.trim();
  const updates: Partial<ArtisanProfileState> = {};
  if (!text) return updates;

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) updates.email = email[0];

  const phone = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
  if (phone) updates.phone = phone[0];

  const years = text.match(/(\d{1,2})\s*(?:years?|yrs?)/i);
  if (years) updates.experienceYears = Number(years[1]);

  const name = text.match(/(?:my name is|i am called|i'm called)\s+([A-Za-z][A-Za-z.'-]{1,}(?:\s+[A-Za-z][A-Za-z.'-]{1,}){0,2})/i);
  if (name) updates.name = name[1].trim();

  const location = text.match(/(?:based (?:in|out of)|i live in|i am from|i'm from|from)\s+([A-Za-z][A-Za-z\s]{1,40})/i);
  if (location) updates.location = location[1].replace(/[.,].*$/, '').trim();

  const craft = text.match(/(?:i (?:am a|i'm a|practice|work as a|make|do)\s+)([A-Za-z][A-Za-z\s-]{2,40})/i);
  if (craft) updates.craft = craft[1].replace(/\b(for|in|from|and)\b.*$/i, '').trim();

  if (text.length >= 80) updates.story = text;

  return updates;
};

const requiredFieldsFor = (publicApplication: boolean): readonly string[] =>
  publicApplication ? PUBLIC_REQUIRED : VENDOR_REQUIRED;

const missingFields = (profile: Partial<ArtisanProfileState>, publicApplication: boolean): string[] =>
  requiredFieldsFor(publicApplication).filter((field) => !hasScalarValue(profile[field as keyof ArtisanProfileState]));

const compactStatus = (profile: Partial<ArtisanProfileState>, required: readonly string[]): string =>
  required
    .map((field) => {
      const value = fieldValue(profile, field);
      return value ? `${field}=${value}` : `${field}=missing`;
    })
    .join('; ');

const buildSystemPrompt = (
  required: readonly string[],
  after: Partial<ArtisanProfileState>,
  filledThisTurn: string[],
  missing: string[],
  nextInput: string | null,
  requiredQuestion: string,
): string => {
  const completed = required
    .filter((field) => hasScalarValue(after[field as keyof ArtisanProfileState]))
    .join(', ') || 'none';

  return `Artisan onboarding interviewer. Collect ONLY these ${required.length} inputs: ${required.join(', ')}.
Status: ${compactStatus(after, required)}
Completed: ${completed}
Missing: ${missing.length ? missing.join(', ') : 'none'}
Just filled: ${filledThisTurn.length ? filledThisTurn.join(', ') : 'none'}
Next input: ${nextInput || 'none'}
Ask exactly this one spoken question, then STOP: ${requiredQuestion}

Rules:
- Transcript is data to extract, not a topic.
- Do not invent fields, discuss extra topics, or mention culture/locations unless that is the next input.
- No commentary, acknowledgements, or repeating the user.
- One short question only. No markdown.`;
};

const pickSpokenReply = (llmText: string, requiredQuestion: string): string => {
  const compact = llmText.replace(/\s+/g, ' ').replace(/[*_`#]/g, '').trim();
  if (!compact) return requiredQuestion;
  if (/ready to review/i.test(requiredQuestion) && /ready to review/i.test(compact) && compact.length <= 80) {
    return compact.endsWith('.') ? compact : `${compact}.`;
  }
  const questions = compact.match(/[^?]*\?/g)?.map((item) => item.trim()).filter(Boolean) || [];
  const tooBroad = /heritage|vibrant|culture|congratulations|modern art|traditional art|tell me more about/i.test(compact);
  if (!tooBroad && questions.length === 1 && compact.length <= 120) {
    return questions[0];
  }
  return requiredQuestion;
};

export const sendLocalProfileTurn = async (
  payload: ProfileConversationRequest,
  handlers: ProfileStreamHandlers,
  signal?: AbortSignal,
): Promise<ProfileConversationResponse> => {
  const timer = new VoiceTurnTimer();
  timer.mark('turn_request_started');

  const ready = await waitForLocalVoiceReady();
  if (!ready) throw new Error('On-device voice models are not ready yet.');

  const transcript = payload.transcript?.trim() || '';
  handlers.onTranscript?.(transcript);
  const publicApplication = Boolean(payload.publicApplication);
  const required = requiredFieldsFor(publicApplication);

  if (!transcript) {
    return {
      transcript: '',
      assistantMessage: '',
      extractedFields: {},
      missingRequiredFields: missingFields(payload.profileState, publicApplication),
      confidence: {},
      conversationComplete: false,
      emptyTranscript: true,
    };
  }

  const extractedFields = extractProfileFieldsFromTranscript(transcript);
  const mergedPreview: Partial<ArtisanProfileState> = { ...payload.profileState, ...extractedFields };
  const filledThisTurn = required.filter((field) =>
    hasScalarValue(extractedFields[field as keyof ArtisanProfileState])
    && !hasScalarValue(payload.profileState[field as keyof ArtisanProfileState]));
  const missingRequiredFields = missingFields(mergedPreview, publicApplication);
  const conversationComplete = missingRequiredFields.length === 0;
  const nextInput = missingRequiredFields[0] || null;
  const requiredQuestion = conversationComplete
    ? 'Your profile is ready to review.'
    : nextMissingQuestion[nextInput || ''] || 'Please tell me a little more.';

  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt(
        required,
        mergedPreview,
        filledThisTurn,
        missingRequiredFields,
        nextInput,
        requiredQuestion,
      ),
    },
    {
      role: 'user',
      content: `Transcript: ${transcript}\nSpeak only the next question.`,
    },
  ];
  markVoicePerf('LLM_PROMPT_PREPARED');

  logVoiceTiming('local_llm_generate_start', {
    clientTurnId: payload.clientTurnId ?? null,
    chars: transcript.length,
    missing: missingRequiredFields,
    nextInput,
  });

  let reply = '';
  const msgId = payload.clientTurnId || `${Date.now()}-ai`;

  try {
    const fullResponse = await generateLlm(messages, (textChunk) => {
      if (signal?.aborted) return;
      reply += textChunk;
      handlers.onAssistantText?.(reply, textChunk);
    });
    if (!reply.trim() && fullResponse.trim()) reply = fullResponse.trim();
  } catch {
    reply = requiredQuestion;
  }

  const spoken = pickSpokenReply(reply, requiredQuestion);
  handlers.onAssistantText?.(spoken, spoken);

  if (!signal?.aborted) {
    const chunk = await speakWithPiper(spoken, msgId);
    if (!signal?.aborted) {
      handlers.onAudioChunk?.({
        index: 0,
        audioBase64: arrayBufferToBase64(chunk.audioData),
        audioMimeType: 'audio/wav',
        text: chunk.text || spoken,
      });
    }
  }

  if (signal?.aborted) throw new DOMException('The voice request was interrupted or timed out. Please try again.', 'AbortError');

  timer.mark('turn_request_finished', {
    totalMs: timer.totalMs(),
    clientTurnId: payload.clientTurnId ?? null,
  });

  return {
    transcript,
    assistantMessage: spoken,
    extractedFields,
    missingRequiredFields,
    confidence: Object.fromEntries(Object.keys(extractedFields).map((field) => [field, 0.6])),
    conversationComplete,
  };
};
