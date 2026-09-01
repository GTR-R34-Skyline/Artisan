import { supabase } from '../lib/supabase';
import { SupportedLanguageCode } from '../types/catalogConversation';
import { logVoiceTiming } from './profileVoiceTiming';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const DEEPGRAM_MODEL = 'nova-3';
const MEDIA_SLICE_MS = 250;
const CLOSE_STREAM_WAIT_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 1;

const DEEPGRAM_LANGUAGE: Record<SupportedLanguageCode, string> = {
  en: 'en-IN',
  hi: 'hi',
  bn: 'bn',
  ta: 'ta',
  te: 'te',
  kn: 'kn',
};

type DeepgramMessage = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string }> };
};

export type DeepgramTranscriptUpdate = {
  finalized: string;
  interim: string;
  display: string;
};

const fetchAccessToken = async (publicApplication: boolean): Promise<string> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/deepgram-stream-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ publicApplication }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'Unable to start Deepgram live transcription.');
  }

  const payload = await response.json() as { accessToken?: string; tokenType?: string };
  if (!payload.accessToken) throw new Error('Deepgram live transcription token was missing.');
  if (payload.tokenType !== 'bearer') {
    throw new Error('Deepgram live transcription requires a short-lived JWT.');
  }
  return payload.accessToken;
};

/**
 * Deepgram browser WebSocket auth via Sec-WebSocket-Protocol.
 * @see https://developers.deepgram.com/docs/using-the-sec-websocket-protocol
 * JWT access tokens use two subprotocols: "bearer" + the token (not "Bearer <jwt>" as one string).
 */
export const buildDeepgramWebSocketProtocols = (jwt: string): [string, string] => ['bearer', jwt];

const buildListenUrl = (language: SupportedLanguageCode): string => {
  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    language: DEEPGRAM_LANGUAGE[language],
    interim_results: 'true',
    smart_format: 'true',
    punctuate: 'true',
    endpointing: '300',
    utterance_end_ms: '1000',
    vad_events: 'true',
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
};

/** Join finalized Deepgram segments without duplicating identical consecutive segments. */
export const mergeFinalSegments = (segments: string[]): string =>
  segments.filter((segment, index, all) => segment.trim() && segment.trim() !== all[index - 1]?.trim())
    .map((segment) => segment.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

export class DeepgramStreamingStt {
  private socket: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private finalSegments: string[] = [];
  private interim = '';
  private startedAt = 0;
  private firstInterimAt: number | null = null;
  private stopping = false;
  private stopResolve: ((result: { transcript: string; durationMs: number }) => void) | null = null;
  private reconnectAttempts = 0;

  constructor(
    private language: SupportedLanguageCode,
    private onUpdate: (update: DeepgramTranscriptUpdate) => void,
    private onError: (message: string) => void,
    private options: { publicApplication?: boolean } = {},
  ) {}

  async start(): Promise<void> {
    this.finalSegments = [];
    this.interim = '';
    this.startedAt = Date.now();
    this.firstInterimAt = null;
    this.stopping = false;
    this.reconnectAttempts = 0;

    logVoiceTiming('stt_recording_started', { provider: 'deepgram-live', language: this.language });

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const jwt = await fetchAccessToken(Boolean(this.options.publicApplication));
    await this.openSocket(jwt);
  }

  private async openSocket(jwt: string): Promise<void> {
    const url = buildListenUrl(this.language);
    const socket = new WebSocket(url, buildDeepgramWebSocketProtocols(jwt));
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const fail = (message: string) => {
        socket.close();
        reject(new Error(message));
      };

      socket.onopen = () => {
        logVoiceTiming('deepgram_ws_open', { ms: Date.now() - this.startedAt });
        if (!this.stream) {
          fail('Microphone stream was unavailable.');
          return;
        }

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
        const recorder = new MediaRecorder(this.stream, { mimeType });
        this.recorder = recorder;

        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        });

        recorder.start(MEDIA_SLICE_MS);
        resolve();
      };

      socket.onmessage = (event) => {
        this.handleMessage(String(event.data));
      };

      socket.onerror = () => {
        if (!this.stopping) {
          this.onError('Deepgram live transcription connection error.');
        }
      };

      socket.onclose = () => {
        if (this.stopping && this.stopResolve) {
          const durationMs = this.startedAt ? Date.now() - this.startedAt : 0;
          const transcript = mergeFinalSegments(this.finalSegments);
          logVoiceTiming('stt_final_transcript', { ms: durationMs, chars: transcript.length, provider: 'deepgram-live' });
          this.stopResolve({ transcript, durationMs });
        }
      };
    }).catch(async (error) => {
      if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts += 1;
        logVoiceTiming('deepgram_ws_reconnect', { attempt: this.reconnectAttempts });
        const jwt = await fetchAccessToken(Boolean(this.options.publicApplication));
        await this.openSocket(jwt);
        return;
      }
      throw error;
    });
  }

  private handleMessage(raw: string): void {
    let payload: DeepgramMessage;
    try {
      payload = JSON.parse(raw) as DeepgramMessage;
    } catch {
      return;
    }

    if (payload.type === 'Metadata') return;

    if (payload.type === 'Results') {
      const transcript = payload.channel?.alternatives?.[0]?.transcript?.trim() || '';
      if (!transcript) return;

      if (payload.is_final) {
        const last = this.finalSegments[this.finalSegments.length - 1];
        if (transcript !== last) {
          this.finalSegments.push(transcript);
        }
        this.interim = '';
      } else {
        this.interim = transcript;
        if (this.firstInterimAt === null) {
          this.firstInterimAt = Date.now();
          logVoiceTiming('stt_first_interim', { ms: this.firstInterimAt - this.startedAt, provider: 'deepgram-live' });
        }
      }

      const finalized = mergeFinalSegments(this.finalSegments);
      const display = [finalized, this.interim].filter(Boolean).join(' ').trim();
      this.onUpdate({ finalized, interim: this.interim, display });
    }
  }

  stop(): Promise<{ transcript: string; durationMs: number }> {
    if (this.stopping && !this.stopResolve) {
      return Promise.resolve({ transcript: mergeFinalSegments(this.finalSegments), durationMs: Date.now() - this.startedAt });
    }
    this.stopping = true;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: { transcript: string; durationMs: number }) => {
        if (settled) return;
        settled = true;
        this.stopResolve = null;
        resolve(result);
      };

      this.stopResolve = finish;

      try {
        this.recorder?.stop();
      } catch {
        // ignore
      }

      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.recorder = null;

      const durationMs = this.startedAt ? Date.now() - this.startedAt : 0;
      const result = () => ({ transcript: mergeFinalSegments(this.finalSegments), durationMs });

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ type: 'CloseStream' }));
        } catch {
          finish(result());
          return;
        }
        window.setTimeout(() => {
          try {
            this.socket?.close();
          } catch {
            finish(result());
          }
        }, CLOSE_STREAM_WAIT_MS);
        window.setTimeout(() => finish(result()), CLOSE_STREAM_WAIT_MS + 500);
      } else {
        finish(result());
      }
    });
  }

  abort(): void {
    this.stopping = true;
    try {
      this.recorder?.stop();
    } catch {
      // ignore
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
    this.socket = null;
    this.stopResolve = null;
  }
}
