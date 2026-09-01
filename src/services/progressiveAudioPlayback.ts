import { logVoiceTiming } from './profileVoiceTiming';

/** Plays MP3 chunks sequentially; supports cancellation between chunks. */
export class ProgressiveAudioPlayer {
  private queue: Array<{ url: string; index: number }> = [];
  private playing = false;
  private cancelled = false;
  private currentAudio: HTMLAudioElement | null = null;
  private generation = 0;
  private firstPlaybackStarted = false;

  reset(generation: number): void {
    this.generation = generation;
    this.cancelled = true;
    this.queue = [];
    this.playing = false;
    this.currentAudio?.pause();
    this.currentAudio = null;
    this.firstPlaybackStarted = false;
    this.cancelled = false;
  }

  enqueue(base64: string, mimeType: string, index: number, generation: number): void {
    if (generation !== this.generation) return;
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'audio/mpeg' }));
    this.queue.push({ url, index });
    this.queue.sort((a, b) => a.index - b.index);
    void this.pump(generation);
  }

  private async pump(generation: number): Promise<void> {
    if (this.playing || this.cancelled || generation !== this.generation) return;
    const next = this.queue.shift();
    if (!next) return;

    this.playing = true;
    if (!this.firstPlaybackStarted) {
      this.firstPlaybackStarted = true;
      logVoiceTiming('tts_playback_started', { index: next.index });
    }

    await new Promise<void>((resolve) => {
      if (generation !== this.generation) {
        resolve();
        return;
      }
      const audio = new Audio(next.url);
      this.currentAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(next.url);
        this.currentAudio = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(next.url);
        this.currentAudio = null;
        resolve();
      };
      audio.play().catch(() => resolve());
    });

    this.playing = false;
    if (generation === this.generation) {
      await this.pump(generation);
    } else {
      URL.revokeObjectURL(next.url);
    }
  }

  async waitForIdle(generation: number): Promise<void> {
    while (generation === this.generation && (this.playing || this.queue.length > 0)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
