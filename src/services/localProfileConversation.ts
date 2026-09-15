import {
  ArtisanProfileState,
  ProfileConversationRequest,
  ProfileConversationResponse,
} from '../types/profileConversation';
import { ProfileStreamHandlers } from './profileConversation.service';
import { generateLlm, speakWithPiper, waitForLocalVoiceReady } from './localVoiceRuntime';
import { logVoiceTiming, VoiceTurnTimer } from './profileVoiceTiming';
import { markVoicePerf } from './voicePerf';
import { TextChunkEmitter } from './textChunker';
import { extractSellerProfileFields } from './profileFieldExtraction';
import {
  buildLanguageSystemInstruction,
  localizedMissingFieldsQuestion,
} from './sellerLanguage';
import { SupportedLanguageCode } from '../types/catalogConversation';

/**
 * Authoritative public join onboarding inputs.
 * Source: VoiceProfileCapture REQUIRED_FIELDS and
 * supabase profileSchema PUBLIC_REQUIRED_PROFILE_FIELDS.
 */
const PUBLIC_REQUIRED = ['name', 'email', 'phone', 'location', 'craft', 'experienceYears', 'story'] as const;
/** Vendor onboarding completion set from VendorOnboarding.completedFields. */
const VENDOR_REQUIRED = ['name', 'location', 'craft', 'experienceYears', 'story'] as const;

const MAX_TTS_IN_FLIGHT = 4;

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
  requiredQuestion: string,
  language: SupportedLanguageCode,
): string => {
  const completed = required
    .filter((field) => hasScalarValue(after[field as keyof ArtisanProfileState]))
    .join(', ') || 'none';

  return `Artisan onboarding interviewer. Collect ONLY these ${required.length} inputs: ${required.join(', ')}.
${buildLanguageSystemInstruction(language)}

Status: ${compactStatus(after, required)}
Completed: ${completed}
Missing: ${missing.length ? missing.join(', ') : 'none'}
Just filled: ${filledThisTurn.length ? filledThisTurn.join(', ') : 'none'}
Ask for ALL remaining missing required inputs in one concise spoken message in the selected language, then STOP: ${requiredQuestion}

Rules:
- Transcript is data to extract, not a topic. Accept native script and Latin transliteration.
- Do not invent fields, discuss extra topics, or mention culture/locations unless that is still missing.
- No commentary, acknowledgements, or repeating the user.
- Ask only for genuinely missing required fields. Prefer one combined follow-up over separate questions.
- No markdown.
- The spoken reply text must already be in the selected language (native script when not English).`;
};

const pickSpokenReply = (llmText: string, requiredQuestion: string, language: SupportedLanguageCode): string => {
  const compact = llmText.replace(/\s+/g, ' ').replace(/[*_`#]/g, '').trim();
  if (!compact) return requiredQuestion;
  if (language !== 'en') {
    const hasIndic = /[\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF]/.test(compact);
    if (!hasIndic) return requiredQuestion;
  }
  if (/ready to review/i.test(requiredQuestion) && /ready to review|மதிப்பாய்வு|समीक्षा|পর্যালোচনা|సమీక్ష|ವಿಮರ್ಶೆ/i.test(compact) && compact.length <= 120) {
    return compact.endsWith('.') || /[।.!]$/.test(compact) ? compact : `${compact}.`;
  }
  const questions = compact.match(/[^?؟]*[?؟]/g)?.map((item) => item.trim()).filter(Boolean) || [];
  const tooBroad = /heritage|vibrant|culture|congratulations|modern art|traditional art|tell me more about/i.test(compact);
  if (!tooBroad && questions.length === 1 && compact.length <= 160) {
    return questions[0];
  }
  return requiredQuestion;
};

/** Deterministic extraction of the seven seller profile fields. */
export const extractProfileFieldsFromTranscript = (transcript: string): Partial<ArtisanProfileState> =>
  extractSellerProfileFields(transcript) as Partial<ArtisanProfileState>;

export const sendLocalProfileTurn = async (
  payload: ProfileConversationRequest,
  handlers: ProfileStreamHandlers,
  signal?: AbortSignal,
): Promise<ProfileConversationResponse> => {
  const timer = new VoiceTurnTimer();
  timer.mark('turn_request_started');

  const ready = await waitForLocalVoiceReady();
  if (!ready) throw new Error('On-device voice models are not ready yet.');

  const language = payload.selectedLanguage || 'en';
  const transcript = payload.transcript?.trim() || '';
  handlers.onTranscript?.(transcript);
  const publicApplication = Boolean(payload.publicApplication);
  const required = requiredFieldsFor(publicApplication);

  logVoiceTiming('local_language_context', {
    selectedLanguage: language,
    clientTurnId: payload.clientTurnId ?? null,
    transcriptChars: transcript.length,
  });

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
  const requiredQuestion = localizedMissingFieldsQuestion(missingRequiredFields, language);

  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt(
        required,
        mergedPreview,
        filledThisTurn,
        missingRequiredFields,
        requiredQuestion,
        language,
      ),
    },
    {
      role: 'user',
      content: `Transcript: ${transcript}\nSpeak only the next question covering all remaining missing required fields in the selected language.`,
    },
  ];
  markVoicePerf('LLM_PROMPT_PREPARED');

  logVoiceTiming('local_llm_generate_start', {
    clientTurnId: payload.clientTurnId ?? null,
    selectedLanguage: language,
    chars: transcript.length,
    missing: missingRequiredFields,
    nextInput: missingRequiredFields[0] || null,
  });

  let reply = '';
  const msgId = payload.clientTurnId || `${Date.now()}-ai`;
  const chunkEmitter = new TextChunkEmitter();
  let ttsIndex = 0;
  let ttsInFlight = 0;
  const ttsPromises: Promise<void>[] = [];

  const enqueueSpeech = (text: string) => {
    if (!text.trim() || signal?.aborted) return;
    while (ttsInFlight >= MAX_TTS_IN_FLIGHT) {
      break;
    }
    const index = ttsIndex;
    ttsIndex += 1;
    ttsInFlight += 1;
    logVoiceTiming('local_tts_chunk_enqueued', {
      selectedLanguage: language,
      index,
      chars: text.length,
    });
    const promise = speakWithPiper(text, `${msgId}-${index}`)
      .then((chunk) => {
        if (signal?.aborted) return;
        handlers.onAudioChunk?.({
          index,
          audioBase64: arrayBufferToBase64(chunk.audioData),
          audioMimeType: 'audio/wav',
          text: chunk.text || text,
        });
      })
      .catch(() => {
        // TTS failure should not fail the text response.
      })
      .finally(() => {
        ttsInFlight -= 1;
      });
    ttsPromises.push(promise);
  };

  try {
    const fullResponse = await generateLlm(messages, (textChunk) => {
      if (signal?.aborted) return;
      reply += textChunk;
      handlers.onAssistantText?.(reply, textChunk);
      for (const chunk of chunkEmitter.push(textChunk)) {
        enqueueSpeech(chunk);
      }
    });
    if (!reply.trim() && fullResponse.trim()) {
      reply = fullResponse.trim();
      handlers.onAssistantText?.(reply, reply);
      for (const chunk of chunkEmitter.push(reply)) {
        enqueueSpeech(chunk);
      }
    }
  } catch {
    reply = requiredQuestion;
    handlers.onAssistantText?.(reply, reply);
    enqueueSpeech(requiredQuestion);
  }

  const spoken = pickSpokenReply(reply, requiredQuestion, language);
  handlers.onAssistantText?.(spoken, spoken);
  logVoiceTiming('local_llm_spoken_reply', {
    selectedLanguage: language,
    chars: spoken.length,
    usedTemplateFallback: spoken === requiredQuestion,
  });

  for (const chunk of chunkEmitter.flush()) {
    enqueueSpeech(chunk);
  }
  if (ttsPromises.length === 0 && spoken.trim()) {
    enqueueSpeech(spoken);
  }

  if (!signal?.aborted) {
    await Promise.all(ttsPromises);
  }

  if (signal?.aborted) throw new DOMException('The voice request was interrupted or timed out. Please try again.', 'AbortError');

  timer.mark('turn_request_finished', {
    totalMs: timer.totalMs(),
    clientTurnId: payload.clientTurnId ?? null,
    selectedLanguage: language,
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
