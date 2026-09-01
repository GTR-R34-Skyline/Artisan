const ENABLED = import.meta.env.DEV;

export const logVoiceTiming = (stage: string, detail: Record<string, unknown> = {}): void => {
  if (!ENABLED) return;
  console.info(`[profile-voice] ${stage}`, detail);
};

export class VoiceTurnTimer {
  private started = Date.now();

  mark(stage: string, detail: Record<string, unknown> = {}): void {
    logVoiceTiming(stage, { ms: Date.now() - this.started, ...detail });
  }

  totalMs(): number {
    return Date.now() - this.started;
  }
}
