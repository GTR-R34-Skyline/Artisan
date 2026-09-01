import { supabase } from '../lib/supabase';
import { ProfileConversationRequest, ProfileConversationResponse } from '../types/profileConversation';
import { logVoiceTiming, VoiceTurnTimer } from './profileVoiceTiming';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const STREAM_IDLE_TIMEOUT_MS = 90000;

export interface ProfileStreamHandlers {
  onTranscript?: (transcript: string) => void;
  onAssistantText?: (text: string, delta: string) => void;
  onAudioChunk?: (chunk: { index: number; audioBase64: string; audioMimeType: string; text: string }) => void;
  onTiming?: (stage: string, detail: Record<string, unknown>) => void;
  onError?: (message: string, stage: string) => void;
}

const parseSseBlock = (block: string): { event: string; data: unknown } | null => {
  const lines = block.split('\n');
  let event = 'message';
  let dataLine = '';
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) dataLine += line.slice(5).trim();
  }
  if (!dataLine) return null;
  try {
    return { event, data: JSON.parse(dataLine) };
  } catch {
    return null;
  }
};

export class ProfileConversationService {
  static async sendTurn(payload: ProfileConversationRequest): Promise<ProfileConversationResponse> {
    return ProfileConversationService.sendTurnStreaming(payload, {});
  }

  static async sendTurnStreaming(
    payload: ProfileConversationRequest,
    handlers: ProfileStreamHandlers,
    signal?: AbortSignal,
  ): Promise<ProfileConversationResponse> {
    const timer = new VoiceTurnTimer();
    timer.mark('turn_request_started');

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    signal?.addEventListener('abort', abortFromParent, { once: true });

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    };
    resetIdleTimer();

    let completePayload: ProfileConversationResponse | null = null;
    let streamError: string | null = null;
    const clientTurnId = payload.clientTurnId;
    const requestStartedAt = Date.now();

    console.info('[profile-voice] client_turn_request', {
      clientTurnId: clientTurnId ?? null,
      transcriptChars: payload.transcript?.length ?? 0,
      at: requestStartedAt,
    });

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/profile-conversation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Profile conversation failed with status ${response.status}.`);
      }

      if (!response.body) throw new Error('Streaming response returned no body.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const parsed = parseSseBlock(block.trim());
          if (!parsed) continue;

          if (parsed.event === 'timing') {
            const detail = parsed.data as Record<string, unknown>;
            handlers.onTiming?.(String(detail.stage || 'timing'), detail);
            logVoiceTiming(String(detail.stage || 'timing'), detail);
            continue;
          }

          if (parsed.event === 'transcript') {
            const transcript = (parsed.data as { transcript?: string }).transcript || '';
            handlers.onTranscript?.(transcript);
            continue;
          }

          if (parsed.event === 'assistant_text') {
            const payloadData = parsed.data as { delta?: string; text?: string };
            handlers.onAssistantText?.(payloadData.text || '', payloadData.delta || '');
            continue;
          }

          if (parsed.event === 'audio_chunk') {
            handlers.onAudioChunk?.(parsed.data as {
              index: number;
              audioBase64: string;
              audioMimeType: string;
              text: string;
            });
            continue;
          }

          if (parsed.event === 'error') {
            const err = parsed.data as { message?: string; stage?: string };
            streamError = err.message || 'Streaming error.';
            handlers.onError?.(streamError, err.stage || 'unknown');
            continue;
          }

          if (parsed.event === 'complete') {
            completePayload = parsed.data as ProfileConversationResponse;
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.info('[profile-voice] client_turn_aborted', {
          clientTurnId: clientTurnId ?? null,
          elapsedMs: Date.now() - requestStartedAt,
        });
        throw new Error('The voice request was interrupted or timed out. Please try again.');
      }
      throw error instanceof Error ? error : new Error('Unable to process your response right now.');
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      signal?.removeEventListener('abort', abortFromParent);
      timer.mark('turn_request_finished', {
        totalMs: timer.totalMs(),
        clientTurnId: clientTurnId ?? null,
      });
    }

    if (!completePayload) {
      throw new Error(streamError || 'The conversation response was incomplete. Please try again.');
    }

    if (typeof completePayload.assistantMessage !== 'string') {
      completePayload.assistantMessage = completePayload.assistantMessage || '';
    }

    return completePayload;
  }
}
