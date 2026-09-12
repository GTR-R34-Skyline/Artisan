type VoicePerfMark =
  | 'USER_STARTED_LISTENING'
  | 'USER_STOPPED_LISTENING'
  | 'STT_FINAL_TRANSCRIPT'
  | 'LLM_PROMPT_PREPARED'
  | 'LLM_REQUEST_STARTED'
  | 'LLM_REQUEST_RECEIVED'
  | 'LLM_INFERENCE_START'
  | 'LLM_FIRST_TOKEN'
  | 'LLM_GENERATION_COMPLETED'
  | 'PIPER_STARTED'
  | 'PIPER_FIRST_AUDIO'
  | 'PIPER_COMPLETED';

type VoicePerfReport = {
  sttFinalLatencyMs: number | null;
  llmPromptPrepMs: number | null;
  llmInferenceStartMs: number | null;
  llmFirstTokenMs: number | null;
  llmFirstTokenFromInferenceMs: number | null;
  llmTotalMs: number | null;
  llmOutputChars: number;
  llmOutputTokens: number;
  llmTokensPerSec: number | null;
  piperStartupMs: number | null;
  firstAudioMs: number | null;
  totalUserToAudioMs: number | null;
  marks: Partial<Record<VoicePerfMark, number>>;
};

const enabled = import.meta.env.DEV;
const marks = new Map<VoicePerfMark, number>();
let llmOutputChars = 0;
let llmOutputTokens = 0;
let llmGenerationDurationMs: number | null = null;
let lastReport: VoicePerfReport | null = null;

const delta = (from: VoicePerfMark, to: VoicePerfMark): number | null => {
  const start = marks.get(from);
  const end = marks.get(to);
  if (start === undefined || end === undefined) return null;
  return Math.round(end - start);
};

const formatMs = (value: number | null): string =>
  value === null ? 'n/a' : `${value}ms`;

export const resetVoicePerf = (): void => {
  if (!enabled) return;
  marks.clear();
  llmOutputChars = 0;
  llmOutputTokens = 0;
  llmGenerationDurationMs = null;
};

export const markVoicePerf = (name: VoicePerfMark): void => {
  if (!enabled) return;
  if (marks.has(name)) return;
  const now = performance.now();
  marks.set(name, now);
  const origin = marks.get('USER_STARTED_LISTENING');
  const sinceStart = origin === undefined ? '' : ` +${Math.round(now - origin)}ms`;
  console.info(`[VOICE PERF] ${name}${sinceStart}`);
};

export const addVoicePerfLlmChars = (count: number): void => {
  if (!enabled || count <= 0) return;
  llmOutputChars += count;
};

/** Use only on LLM DONE so we don't double-count streamed chunks. */
export const addVoicePerfLlmCharsIfEmpty = (count: number): void => {
  if (!enabled || llmOutputChars > 0 || count <= 0) return;
  llmOutputChars = count;
};

export const setVoicePerfLlmGenerationStats = (stats: {
  tokenCount?: number;
  durationMs?: number;
}): void => {
  if (!enabled) return;
  if (typeof stats.tokenCount === 'number' && stats.tokenCount >= 0) {
    llmOutputTokens = stats.tokenCount;
  }
  if (typeof stats.durationMs === 'number' && stats.durationMs > 0) {
    llmGenerationDurationMs = stats.durationMs;
  }
};

export const getLastVoicePerfReport = (): VoicePerfReport | null => lastReport;

export const logVoicePerfReport = (): VoicePerfReport | null => {
  if (!enabled) return null;

  const chars = llmOutputChars;
  const tokens = llmOutputTokens > 0
    ? llmOutputTokens
    : (chars > 0 ? Math.max(1, Math.round(chars / 4)) : 0);
  const generationMs = llmGenerationDurationMs ?? delta('LLM_INFERENCE_START', 'LLM_GENERATION_COMPLETED');
  const tokensPerSec = tokens > 0 && generationMs && generationMs > 0
    ? Math.round((tokens / generationMs) * 1000 * 10) / 10
    : null;

  const report: VoicePerfReport = {
    sttFinalLatencyMs: delta('USER_STOPPED_LISTENING', 'STT_FINAL_TRANSCRIPT'),
    llmPromptPrepMs: delta('STT_FINAL_TRANSCRIPT', 'LLM_PROMPT_PREPARED'),
    llmInferenceStartMs: delta('LLM_REQUEST_STARTED', 'LLM_INFERENCE_START'),
    llmFirstTokenMs: delta('STT_FINAL_TRANSCRIPT', 'LLM_FIRST_TOKEN'),
    llmFirstTokenFromInferenceMs: delta('LLM_INFERENCE_START', 'LLM_FIRST_TOKEN'),
    llmTotalMs: delta('LLM_REQUEST_STARTED', 'LLM_GENERATION_COMPLETED'),
    llmOutputChars: chars,
    llmOutputTokens: tokens,
    llmTokensPerSec: tokensPerSec,
    piperStartupMs: delta('LLM_GENERATION_COMPLETED', 'PIPER_STARTED'),
    firstAudioMs: delta('USER_STOPPED_LISTENING', 'PIPER_FIRST_AUDIO'),
    totalUserToAudioMs: delta('USER_STOPPED_LISTENING', 'PIPER_FIRST_AUDIO'),
    marks: Object.fromEntries(marks) as VoicePerfReport['marks'],
  };
  lastReport = report;

  console.info(
    `[VOICE PERF]
STT final latency: ${formatMs(report.sttFinalLatencyMs)}
LLM prompt prep: ${formatMs(report.llmPromptPrepMs)}
LLM inference start: ${formatMs(report.llmInferenceStartMs)}
LLM first token: ${formatMs(report.llmFirstTokenMs)}
LLM first token (from inference): ${formatMs(report.llmFirstTokenFromInferenceMs)}
LLM total: ${formatMs(report.llmTotalMs)}
LLM output: ${report.llmOutputTokens} tokens (${report.llmOutputChars} chars)
LLM tokens/sec: ${tokensPerSec === null ? 'n/a' : tokensPerSec}
Piper startup: ${formatMs(report.piperStartupMs)}
First audio: ${formatMs(report.firstAudioMs)}
Total user→audio: ${formatMs(report.totalUserToAudioMs)}`,
  );

  return report;
};

if (enabled) {
  (globalThis as {
    __VOICE_PERF__?: {
      getLastReport: typeof getLastVoicePerfReport;
      logReport: typeof logVoicePerfReport;
      reset: typeof resetVoicePerf;
      mark: typeof markVoicePerf;
    };
  }).__VOICE_PERF__ = {
    getLastReport: getLastVoicePerfReport,
    logReport: logVoicePerfReport,
    reset: resetVoicePerf,
    mark: markVoicePerf,
  };
}
