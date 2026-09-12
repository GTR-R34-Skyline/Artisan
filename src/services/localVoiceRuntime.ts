import { logVoiceTiming } from './profileVoiceTiming';
import {
  addVoicePerfLlmChars,
  addVoicePerfLlmCharsIfEmpty,
  logVoicePerfReport,
  markVoicePerf,
  setVoicePerfLlmGenerationStats,
} from './voicePerf';

export const LOCAL_PIPER_VOICE_ID = 'en_US-lessac-medium';
export const LOCAL_PIPER_PUBLIC_PATH = `${import.meta.env.BASE_URL}piper.js`.replace(/\/{2,}/g, '/');

type WorkerStatusMessage = {
  type?: string;
  name?: string;
  message?: string;
  progress?: { progress?: number; status?: string };
  text?: string;
  fullResponse?: string;
  tokenCount?: number;
  durationMs?: number;
  tokensPerSec?: number;
  error?: string;
  audioData?: ArrayBuffer;
  msgId?: string;
};

type ReadyState = {
  stt: boolean;
  llm: boolean;
  tts: boolean;
};

type PendingTranscribe = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
};

type PendingGenerate = {
  onChunk: (text: string) => void;
  onDone: (fullResponse: string) => void;
  reject: (error: Error) => void;
};

type PendingSpeak = {
  resolve: (chunk: { audioData: ArrayBuffer; text?: string; msgId?: string }) => void;
  reject: (error: Error) => void;
};

const ready: ReadyState = { stt: false, llm: false, tts: false };
const status = {
  stt: 'Loading STT...',
  llm: 'Loading LLM...',
  tts: 'Initializing TTS...',
};
let initStarted = false;
let initFailed: Error | null = null;

let sttWorker: Worker | null = null;
let llmWorker: Worker | null = null;
let ttsWorker: Worker | null = null;

const transcribeQueue: PendingTranscribe[] = [];
let generatePending: PendingGenerate | null = null;
const speakQueue: PendingSpeak[] = [];
const readyWaiters: Array<() => void> = [];

export type LocalVoiceStatusSnapshot = {
  ready: ReadyState;
  status: { stt: string; llm: string; tts: string };
  failed: Error | null;
};

const statusListeners = new Set<(snapshot: LocalVoiceStatusSnapshot) => void>();

const emitStatus = (): void => {
  const snapshot: LocalVoiceStatusSnapshot = {
    ready: { ...ready },
    status: { ...status },
    failed: initFailed,
  };
  statusListeners.forEach((listener) => listener(snapshot));
};

const notifyReady = (): void => {
  if (!ready.stt || !ready.llm || !ready.tts) return;
  readyWaiters.splice(0).forEach((resolve) => resolve());
};

const failInit = (error: Error): void => {
  initFailed = error;
  emitStatus();
  readyWaiters.splice(0).forEach((resolve) => resolve());
};

const handleSttMessage = (event: MessageEvent<WorkerStatusMessage>): void => {
  const { type, message, progress, text, error } = event.data;
  if (type === 'STATUS' && message) status.stt = message;
  if (type === 'PROGRESS' && progress?.progress) {
    status.stt = `Downloading STT: ${Math.round(progress.progress)}%`;
  }
  if (type === 'READY') {
    ready.stt = true;
    status.stt = 'Ready (Whisper)';
    logVoiceTiming('local_stt_ready');
    notifyReady();
  }
  if (type === 'RESULT') {
    markVoicePerf('STT_FINAL_TRANSCRIPT');
    transcribeQueue.shift()?.resolve(String(text || ''));
  }
  if (type === 'ERROR') {
    const err = new Error(String(error || 'Local STT failed.'));
    if (!ready.stt) failInit(err);
    transcribeQueue.shift()?.reject(err);
    console.error('STT Worker Error:', error);
  }
  if (type === 'STATUS' || type === 'PROGRESS' || type === 'READY' || type === 'ERROR') emitStatus();
};

const handleLlmMessage = (event: MessageEvent<WorkerStatusMessage>): void => {
  const { type, message, progress, text, error, name } = event.data;
  if (type === 'STATUS' && message) status.llm = message;
  if (type === 'PROGRESS' && progress?.progress) {
    status.llm = `Downloading LLM: ${Math.round(progress.progress)}%`;
  }
  if (type === 'READY') {
    ready.llm = true;
    status.llm = 'Ready (SmolLM-135M)';
    logVoiceTiming('local_llm_ready');
    notifyReady();
  }
  if (type === 'PERF' && (name === 'LLM_REQUEST_RECEIVED' || name === 'LLM_INFERENCE_START')) {
    markVoicePerf(name);
  }
  if (type === 'CHUNK' && text) {
    markVoicePerf('LLM_FIRST_TOKEN');
    addVoicePerfLlmChars(text.length);
    generatePending?.onChunk(text);
  }
  if (type === 'DONE') {
    markVoicePerf('LLM_FIRST_TOKEN');
    markVoicePerf('LLM_GENERATION_COMPLETED');
    const fullResponse = String(event.data.fullResponse || event.data.text || '');
    addVoicePerfLlmCharsIfEmpty(fullResponse.length);
    setVoicePerfLlmGenerationStats({
      tokenCount: event.data.tokenCount,
      durationMs: event.data.durationMs,
    });
    const pending = generatePending;
    generatePending = null;
    pending?.onDone(fullResponse);
  }
  if (type === 'ERROR') {
    const err = new Error(String(error || 'Local LLM failed.'));
    if (!ready.llm) failInit(err);
    const pending = generatePending;
    generatePending = null;
    pending?.reject(err);
    console.error('LLM Worker Error:', error);
  }
  if (type === 'STATUS' || type === 'PROGRESS' || type === 'READY' || type === 'ERROR') emitStatus();
};

const handleTtsMessage = (event: MessageEvent<WorkerStatusMessage>): void => {
  const { type, message, error, audioData, text, msgId } = event.data;
  if (type === 'STATUS' && message) status.tts = message;
  if (type === 'READY') {
    ready.tts = true;
    status.tts = 'Ready (Piper CPU)';
    logVoiceTiming('local_tts_ready');
    notifyReady();
  }
  if (type === 'AUDIO_CHUNK' && audioData) {
    markVoicePerf('PIPER_FIRST_AUDIO');
    speakQueue.shift()?.resolve({ audioData, text, msgId });
  }
  if (type === 'ERROR') {
    const err = new Error(String(error || 'Local Piper TTS failed.'));
    if (!ready.tts) failInit(err);
    speakQueue.shift()?.reject(err);
    console.error('Piper Worker Error:', error);
  }
  if (type === 'STATUS' || type === 'READY' || type === 'ERROR') emitStatus();
};

const createPiperWorker = (): Worker =>
  new Worker(LOCAL_PIPER_PUBLIC_PATH, { type: 'module' });

export const ensureLocalVoiceStarted = (): void => {
  if (initStarted) return;
  initStarted = true;

  sttWorker = new Worker(new URL('../workers/stt.worker.ts', import.meta.url), { type: 'module' });
  llmWorker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' });
  ttsWorker = createPiperWorker();

  sttWorker.onerror = (event) => {
    console.error('STT Worker Script Error:', event);
    failInit(new Error('Local STT worker failed to load.'));
  };
  llmWorker.onerror = (event) => {
    console.error('LLM Worker Script Error:', event);
    failInit(new Error('Local LLM worker failed to load.'));
  };
  ttsWorker.onerror = (event) => {
    console.warn('Piper Worker Script Error:', event);
    failInit(new Error('Piper worker failed to load from /piper.js.'));
  };

  sttWorker.onmessage = handleSttMessage;
  llmWorker.onmessage = handleLlmMessage;
  ttsWorker.onmessage = handleTtsMessage;

  sttWorker.postMessage({ type: 'INIT' });
  llmWorker.postMessage({ type: 'INIT' });
  ttsWorker.postMessage({ type: 'INIT', voice_id: LOCAL_PIPER_VOICE_ID });
  emitStatus();
};

export const getLocalVoiceStatus = (): LocalVoiceStatusSnapshot => ({
  ready: { ...ready },
  status: { ...status },
  failed: initFailed,
});

export const subscribeLocalVoiceStatus = (
  listener: (snapshot: LocalVoiceStatusSnapshot) => void,
): (() => void) => {
  statusListeners.add(listener);
  listener(getLocalVoiceStatus());
  return () => {
    statusListeners.delete(listener);
  };
};

export const isLocalVoiceReady = (): boolean => ready.stt && ready.llm && ready.tts && !initFailed;

export const waitForLocalVoiceReady = async (timeoutMs = 180000): Promise<boolean> => {
  ensureLocalVoiceStarted();
  if (isLocalVoiceReady()) return true;
  if (initFailed) return false;

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(isLocalVoiceReady()), timeoutMs);
    readyWaiters.push(() => {
      window.clearTimeout(timer);
      resolve(isLocalVoiceReady());
    });
  });
};

export const transcribePcm = (audioData: Float32Array): Promise<string> => {
  const worker = sttWorker;
  if (!worker) return Promise.reject(new Error('Local STT worker is not started.'));
  return new Promise((resolve, reject) => {
    transcribeQueue.push({ resolve, reject });
    worker.postMessage({ type: 'TRANSCRIBE', audioData });
  });
};

export const generateLlm = (
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
): Promise<string> => {
  const worker = llmWorker;
  if (!worker) return Promise.reject(new Error('Local LLM worker is not started.'));
  return new Promise((resolve, reject) => {
    generatePending = {
      onChunk,
      onDone: (fullResponse) => resolve(fullResponse),
      reject,
    };
    markVoicePerf('LLM_REQUEST_STARTED');
    worker.postMessage({ type: 'GENERATE', messages });
  });
};

export const speakWithPiper = (text: string, msgId: string): Promise<{ audioData: ArrayBuffer; text?: string; msgId?: string }> => {
  const worker = ttsWorker;
  if (!worker) return Promise.reject(new Error('Piper worker is not started.'));
  return new Promise((resolve, reject) => {
    speakQueue.push({
      resolve: (chunk) => {
        markVoicePerf('PIPER_COMPLETED');
        logVoicePerfReport();
        resolve(chunk);
      },
      reject,
    });
    markVoicePerf('PIPER_STARTED');
    worker.postMessage({
      type: 'GENERATE',
      text,
      voice_id: LOCAL_PIPER_VOICE_ID,
      msgId,
    });
  });
};
