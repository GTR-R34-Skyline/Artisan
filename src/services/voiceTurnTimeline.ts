const ENABLED = import.meta.env.DEV;

export type VoiceTurnStage =
  | 'microphone_started'
  | 'first_deepgram_interim'
  | 'first_deepgram_final'
  | 'speech_stopped'
  | 'final_transcript_ready'
  | 'gemini_started'
  | 'first_gemini_chunk'
  | 'first_tts_request'
  | 'first_audio_chunk'
  | 'audio_playback_started'
  | 'turn_completed';

export class VoiceTurnTimeline {
  private readonly startedAt = Date.now();
  private readonly marks = new Map<VoiceTurnStage, number>();
  private geminiRequestCount = 0;

  constructor(private readonly turnId: number) {}

  mark(stage: VoiceTurnStage, detail: Record<string, unknown> = {}): void {
    const ms = Date.now() - this.startedAt;
    if (!this.marks.has(stage)) this.marks.set(stage, ms);
    if (!ENABLED) return;
    console.info(`[profile-voice] ${stage}`, { turnId: this.turnId, ms, ...detail });
  }

  markGeminiRequest(): void {
    this.geminiRequestCount += 1;
    if (this.geminiRequestCount > 1 && ENABLED) {
      console.error('[profile-voice] gemini_called_more_than_once', {
        turnId: this.turnId,
        count: this.geminiRequestCount,
      });
    }
  }

  complete(detail: Record<string, unknown> = {}): void {
    this.mark('turn_completed', detail);
    if (!ENABLED) return;
    console.info('[profile-voice] turn_timing_summary', {
      turnId: this.turnId,
      timeline: Object.fromEntries(this.marks),
      geminiRequestCount: this.geminiRequestCount,
      ...detail,
    });
  }
}
