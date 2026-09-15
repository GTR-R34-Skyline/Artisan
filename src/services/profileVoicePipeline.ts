import { DeepgramStreamingStt, DeepgramTranscriptUpdate } from './deepgramStreamingStt';
import { ensureLocalVoiceStarted } from './localVoiceRuntime';
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
  logVoiceTiming('stt_provider_selected', {
    provider: 'deepgram-live',
    selectedLanguage: language,
    reason: 'using_deepgram_for_all_languages',
  });
  return new DeepgramStreamingStt(language, onUpdate, onError, options);
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

  logVoiceTiming('llm_provider_selected', { provider: 'gemini-api', selectedLanguage });
  logVoiceTiming('tts_provider_selected', { provider: 'cartesia', selectedLanguage });
  return ProfileConversationService.sendTurnStreaming(payload, handlers, signal);
};
