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
  if (isApiVoiceFallback()) {
    logVoiceTiming('stt_provider_selected', { provider: 'deepgram-live' });
    return new DeepgramStreamingStt(language, onUpdate, onError, options);
  }

  const localFailed = Boolean(getLocalVoiceStatus().failed);
  if (localFailed) {
    logVoiceTiming('stt_provider_selected', { provider: 'deepgram-live', reason: 'local_init_failed' });
    return new DeepgramStreamingStt(language, onUpdate, onError, options);
  }

  logVoiceTiming('stt_provider_selected', { provider: 'local-whisper' });
  return new LocalWhisperStt(language, onUpdate, onError, options);
};

export const sendProfileVoiceTurn = async (
  payload: ProfileConversationRequest,
  handlers: ProfileStreamHandlers,
  signal?: AbortSignal,
): Promise<ProfileConversationResponse> => {
  if (isApiVoiceFallback()) {
    return ProfileConversationService.sendTurnStreaming(payload, handlers, signal);
  }

  const ready = isLocalVoiceReady() || await waitForLocalVoiceReady();
  if (!ready) {
    logVoiceTiming('local_pipeline_fallback', { reason: getLocalVoiceStatus().failed?.message || 'not_ready' });
    return ProfileConversationService.sendTurnStreaming(payload, handlers, signal);
  }

  logVoiceTiming('llm_provider_selected', { provider: 'local-smollm' });
  logVoiceTiming('tts_provider_selected', { provider: 'local-piper' });
  return sendLocalProfileTurn(payload, handlers, signal);
};
