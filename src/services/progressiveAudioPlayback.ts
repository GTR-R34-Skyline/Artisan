import { logVoiceTiming } from './profileVoiceTiming';

/** Plays audio chunks sequentially by index; supports cancellation between chunks. */
export class ProgressiveAudioPlayer {
  private queue = new Map<number, { url: string; index: number }>();
  private playing = false;
  private cancelled = false;
  private currentAudio: HTMLAudioElement | null = null;
  private generation = 0;
  private nextIndex = 0;
  private firstPlaybackStarted = false;
  private streamComplete = false;
  private highestSeenIndex = -1;
  private pumpQueued = false;

  reset(generation: number): void {
    this.generation = generation;
    this.cancelled = true;
    this.queue.forEach((item) => URL.revokeObjectURL(item.url));
    this.queue.clear();
    this.playing = false;
    this.currentAudio?.pause();
    this.currentAudio = null;
    this.firstPlaybackStarted = false;
    this.nextIndex = 0;
    this.streamComplete = false;
    this.highestSeenIndex = -1;
    this.pumpQueued = false;
    this.cancelled = false;
  }

  /** Producer finished scheduling every chunk for this generation. */
  markStreamComplete(generation: number): void {
    if (generation !== this.generation) return;
    this.streamComplete = true;
    void this.pump(generation);
  }

  /** Advance past a failed/missing chunk so later audio is not blocked forever. */
  skipIndex(index: number, generation: number): void {
    if (generation !== this.generation) return;
    this.highestSeenIndex = Math.max(this.highestSeenIndex, index);
    if (index === this.nextIndex && !this.queue.has(index)) {
      this.nextIndex += 1;
      void this.pump(generation);
    }
  }

  enqueue(base64: string, mimeType: string, index: number, generation: number): void {
    if (generation !== this.generation) return;
    this.highestSeenIndex = Math.max(this.highestSeenIndex, index);

    if (!base64) {
      this.skipIndex(index, generation);
      return;
    }

    if (this.queue.has(index)) return;
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'audio/mpeg' }));
    this.queue.set(index, { url, index });
    logVoiceTiming('tts_chunk_enqueued', {
      index,
      queued: this.queue.size,
      nextIndex: this.nextIndex,
    });
    void this.pump(generation);
  }

  private async pump(generation: number): Promise<void> {
    if (this.pumpQueued) return;
    this.pumpQueued = true;
    try {
      while (generation === this.generation && !this.cancelled) {
        if (this.playing) return;

        const next = this.queue.get(this.nextIndex);
        if (!next) {
          // Stream finished but this index never arrived — skip so later chunks still play.
          if (this.streamComplete && this.nextIndex <= this.highestSeenIndex) {
            logVoiceTiming('tts_playback_skip_missing', {
              index: this.nextIndex,
              highestSeenIndex: this.highestSeenIndex,
            });
            this.nextIndex += 1;
            continue;
          }
          if (this.streamComplete && this.nextIndex > this.highestSeenIndex) return;
          return;
        }

        this.queue.delete(this.nextIndex);
        this.playing = true;
        if (!this.firstPlaybackStarted) {
          this.firstPlaybackStarted = true;
          logVoiceTiming('tts_playback_started', { index: next.index });
        }

        await new Promise<void>((resolve) => {
          if (generation !== this.generation) {
            URL.revokeObjectURL(next.url);
            resolve();
            return;
          }
          const audio = new Audio(next.url);
          this.currentAudio = audio;
          let settled = false;
          let safetyTimer: ReturnType<typeof setTimeout> | null = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (safetyTimer !== null) clearTimeout(safetyTimer);
            URL.revokeObjectURL(next.url);
            this.currentAudio = null;
            resolve();
          };
          audio.onended = finish;
          audio.onerror = finish;
          // Fallback only if onended never fires (some short MP3s).
          audio.onloadedmetadata = () => {
            if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
            safetyTimer = setTimeout(finish, Math.ceil(audio.duration * 1000) + 2500);
          };
          audio.play().catch(finish);
        });

        this.playing = false;
        if (generation !== this.generation) return;
        this.nextIndex += 1;
        logVoiceTiming('tts_chunk_played', { index: next.index, nextIndex: this.nextIndex });
      }
    } finally {
      this.pumpQueued = false;
      if (
        generation === this.generation
        && !this.cancelled
        && !this.playing
        && (this.queue.has(this.nextIndex)
          || (this.streamComplete && this.nextIndex <= this.highestSeenIndex))
      ) {
        void this.pump(generation);
      }
    }
  }

  async waitForIdle(generation: number): Promise<void> {
    while (generation === this.generation) {
      const waitingForKnownChunk = this.nextIndex <= this.highestSeenIndex;
      const hasWork = this.playing || this.queue.size > 0 || (waitingForKnownChunk && !this.streamComplete);
      if (!hasWork && this.streamComplete && this.nextIndex > this.highestSeenIndex) break;
      if (!hasWork && this.streamComplete && !waitingForKnownChunk) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  isBusy(): boolean {
    return this.playing || this.queue.size > 0;
  }
}
