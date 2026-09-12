export type VoiceTurnPhase = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'AI_SPEAKING' | 'WAITING_FOR_USER';

const PHASE_LOG: Record<VoiceTurnPhase, string> = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  AI_SPEAKING: 'AI SPEAKING',
  WAITING_FOR_USER: 'WAITING FOR USER',
};

export class VoiceTurnMachine {
  private phase: VoiceTurnPhase = 'IDLE';

  get current(): VoiceTurnPhase {
    return this.phase;
  }

  set(next: VoiceTurnPhase, detail: Record<string, unknown> = {}): void {
    this.phase = next;
    console.info(`[VOICE] ${PHASE_LOG[next]}`, detail);
  }

  logFinalTranscript(transcript: string): void {
    console.info('[VOICE] FINAL TRANSCRIPT', { chars: transcript.length, transcript });
  }

  canStartListening(): boolean {
    return this.phase === 'IDLE' || this.phase === 'WAITING_FOR_USER';
  }

  isAiTurnActive(): boolean {
    return this.phase === 'PROCESSING' || this.phase === 'AI_SPEAKING';
  }
}
