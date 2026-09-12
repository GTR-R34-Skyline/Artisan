import { SupportedLanguageCode } from '../types/catalogConversation';
import { DeepgramTranscriptUpdate } from './deepgramStreamingStt';
import { logVoiceTiming } from './profileVoiceTiming';
import { transcribePcm, waitForLocalVoiceReady } from './localVoiceRuntime';
import { markVoicePerf, resetVoicePerf } from './voicePerf';

const TARGET_SAMPLE_RATE = 16000;

const downsampleTo16k = (input: Float32Array, inputRate: number): Float32Array => {
  if (inputRate === TARGET_SAMPLE_RATE) return input;
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const output = new Float32Array(Math.max(1, Math.floor(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    output[index] = input[Math.min(input.length - 1, Math.floor(index * ratio))];
  }
  return output;
};

const concatFloat32 = (chunks: Float32Array[]): Float32Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
};

/**
 * Microphone capture that feeds PCM into the SIH_PIPELINE Whisper STT worker.
 * Public methods match DeepgramStreamingStt so the existing profile UI can swap providers.
 */
export class LocalWhisperStt {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private muteGain: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private startedAt = 0;
  private stopping = false;

  constructor(
    private language: SupportedLanguageCode,
    private onUpdate: (update: DeepgramTranscriptUpdate) => void,
    private onError: (message: string) => void,
    options: { publicApplication?: boolean } = {},
  ) {
    void options;
  }

  async start(): Promise<void> {
    this.teardown();
    this.chunks = [];
    this.stopping = false;
    this.startedAt = Date.now();

    const ready = await waitForLocalVoiceReady();
    if (!ready) throw new Error('Local speech recognition is still loading. Please try again in a moment.');

    logVoiceTiming('stt_recording_started', { provider: 'local-whisper', language: this.language });

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    resetVoicePerf();
    markVoicePerf('USER_STARTED_LISTENING');
    const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    this.audioContext = audioContext;
    this.source = audioContext.createMediaStreamSource(this.stream);
    this.processor = audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (event) => {
      if (this.stopping) return;
      const input = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(input));
    };

    this.source.connect(this.processor);
    // Keep ScriptProcessor in the graph without monitoring the mic through speakers.
    this.muteGain = audioContext.createGain();
    this.muteGain.gain.value = 0;
    this.processor.connect(this.muteGain);
    this.muteGain.connect(audioContext.destination);
  }

  async stop(): Promise<{ transcript: string; durationMs: number }> {
    markVoicePerf('USER_STOPPED_LISTENING');
    this.stopping = true;
    const durationMs = this.startedAt ? Date.now() - this.startedAt : 0;
    const sampleRate = this.audioContext?.sampleRate || TARGET_SAMPLE_RATE;
    const pcm = concatFloat32(this.chunks);
    this.teardown();

    if (pcm.length < TARGET_SAMPLE_RATE / 5) {
      markVoicePerf('STT_FINAL_TRANSCRIPT');
      logVoiceTiming('stt_final_transcript', { ms: durationMs, chars: 0, provider: 'local-whisper' });
      return { transcript: '', durationMs };
    }

    const audioData = downsampleTo16k(pcm, sampleRate);

    try {
      const text = (await transcribePcm(audioData)).trim();
      this.onUpdate({ finalized: text, interim: '', display: text });
      logVoiceTiming('stt_final_transcript', { ms: durationMs, chars: text.length, provider: 'local-whisper' });
      return { transcript: text, durationMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local transcription failed.';
      this.onError(message);
      throw error;
    }
  }

  abort(): void {
    this.stopping = true;
    this.teardown();
  }

  private teardown(): void {
    try {
      this.processor?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.source?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.muteGain?.disconnect();
    } catch {
      // ignore
    }
    if (this.audioContext) {
      void this.audioContext.close();
    }
    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });
    this.processor = null;
    this.source = null;
    this.muteGain = null;
    this.audioContext = null;
    this.stream = null;
    this.chunks = [];
  }
}
