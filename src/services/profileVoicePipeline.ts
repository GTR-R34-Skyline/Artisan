import { DeepgramStreamingStt, DeepgramTranscriptUpdate } from './deepgramStreamingStt';
import { LocalWhisperStt } from './localWhisperStt';
import { sendLocalProfileTurn } from './localProfileConversation';
import {
  ensureLocalVoiceStarted,
  getLocalVoiceStatus,
  isLocalVoiceReady,
  waitForLocalVoiceReady,
} from './localVoiceRuntime';
import { ProfileConversationService, ProfileStreamHandlers } from './profileConversation.service';
import { ProfileConversationRequest, ProfileConversationResponse } from '../types/profileConversation';
import { SupportedLanguageCode } from '../types/catalogConversation';
import { logVoiceTiming } from './profileVoiceTiming';
import { requiresCloudLanguagePipeline } from './sellerLanguage';

export type ProfileVoiceStt = {
  start: () => Promise<void>;
  stop: () => Promise<{ transcript: string; durationMs: number }>;
  abort: () => void;
};

const isApiVoiceFallback = (): boolean => import.meta.env.VITE_VOICE_PIPELINE === 'api';

export const isLocalVoicePipelineEnabled = (): boolean => !isApiVoiceFallback();

export const startProfileVoicePipeline = (): void => {
  if (isApiVoiceFallback()) return;
  ensureLocalVoiceStarted();
};

export const createProfileVoiceStt = (
  language: SupportedLanguageCode,
  onUpdate: (update: DeepgramTranscriptUpdate) => void,
  onError: (message: string) => void,
  options: { publicApplication?: boolean } = {},
): ProfileVoiceStt => {
  // Local Whisper is Xenova/whisper-tiny.en (English-only). Using it for Tamil/Hindi/etc.
  // produces Latin garble like "Jin Nudhiya Pia Ksashank" instead of native-script transcript.
  // Non-English seller languages must use Deepgram with the selected language code.
  if (isApiVoiceFallback() || requiresCloudLanguagePipeline(language)) {
    logVoiceTiming('stt_provider_selected', {
      provider: 'deepgram-live',
      selectedLanguage: language,
      reason: requiresCloudLanguagePipeline(language)
        ? 'non_english_requires_language_stt'
        : 'api_pipeline',
    });
    return new DeepgramStreamingStt(language, onUpdate, onError, options);
  }

  const localFailed = Boolean(getLocalVoiceStatus().failed);
  if (localFailed) {
    logVoiceTiming('stt_provider_selected', {
      provider: 'deepgram-live',
      reason: 'local_init_failed',
      selectedLanguage: language,
    });
    return new DeepgramStreamingStt(language, onUpdate, onError, options);
  }

  logVoiceTiming('stt_provider_selected', { provider: 'local-whisper', selectedLanguage: language });
  return new LocalWhisperStt(language, onUpdate, onError, options);
};

export const sendProfileVoiceTurn = async (
  payload: ProfileConversationRequest,
  handlers: ProfileStreamHandlers,
  signal?: AbortSignal,
): Promise<ProfileConversationResponse> => {
  const selectedLanguage = payload.selectedLanguage;

  logVoiceTiming('language_selected', {
    selectedLanguage,
    clientTurnId: payload.clientTurnId ?? null,
  });

  if (isApiVoiceFallback()) {
    logVoiceTiming('llm_provider_selected', { provider: 'gemini-api', selectedLanguage });
    logVoiceTiming('tts_provider_selected', { provider: 'cartesia', selectedLanguage });
    return ProfileConversationService.sendTurnStreaming(payload, handlers, signal);
  }

  // Local SmolLM cannot reliably generate Indic scripts; Piper TTS is English-only.
  // Non-English seller languages must use Gemini (native-script generation) + Cartesia (language TTS).
  if (requiresCloudLanguagePipeline(selectedLanguage)) {
    logVoiceTiming('llm_provider_selected', {
      provider: 'gemini-api',
      reason: 'non_english_requires_native_script',
      selectedLanguage,
    });
    logVoiceTiming('tts_provider_selected', {
      provider: 'cartesia',
      reason: 'non_english_requires_language_tts',
      selectedLanguage,
    });
    return ProfileConversationService.sendTurnStreaming(payload, handlers, signal);
  }

  const ready = isLocalVoiceReady() || await waitForLocalVoiceReady();
  if (!ready) {
    logVoiceTiming('local_pipeline_fallback', { reason: getLocalVoiceStatus().failed?.message || 'not_ready', selectedLanguage });
    logVoiceTiming('llm_provider_selected', { provider: 'gemini-api', selectedLanguage });
    logVoiceTiming('tts_provider_selected', { provider: 'cartesia', selectedLanguage });
    return ProfileConversationService.sendTurnStreaming(payload, handlers, signal);
  }

  logVoiceTiming('llm_provider_selected', { provider: 'local-smollm', selectedLanguage });
  logVoiceTiming('tts_provider_selected', { provider: 'local-piper', selectedLanguage });
  return sendLocalProfileTurn(payload, handlers, signal);
};
