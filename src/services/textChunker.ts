/**
 * Incremental speakable-chunk emitter for LLM → TTS (client copy).
 * Keep in sync with supabase/.../textChunker.ts TextChunkEmitter.
 */

const isAsciiSentenceEnd = (char: string): boolean =>
  char === '.' || char === '!' || char === '?';

/** Devanagari danda (।) / double danda (॥) — hard sentence terminators in Hindi/Bengali. */
const isIndicDanda = (char: string): boolean => {
  const code = char.codePointAt(0);
  return code === 0x0964 || code === 0x0965;
};

const isOtherSentenceEnd = (char: string): boolean => {
  const code = char.codePointAt(0);
  return code === 0x061F // Arabic ؟
    || code === 0x3002 // Ideographic 。
    || code === 0xFF01 // Fullwidth ！
    || code === 0xFF1F; // Fullwidth ？
};

const isSentenceEnd = (char: string): boolean =>
  isAsciiSentenceEnd(char) || isIndicDanda(char) || isOtherSentenceEnd(char);

export class TextChunkEmitter {
  private pending = '';
  private spokenThrough = 0;

  push(delta: string): string[] {
    if (!delta) return [];
    this.pending += delta;
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  get spokenLength(): number {
    return this.spokenThrough;
  }

  get buffer(): string {
    return this.pending;
  }

  private drain(force: boolean): string[] {
    const chunks: string[] = [];
    let rest = this.pending.slice(this.spokenThrough);
    if (!rest.trim()) return chunks;

    while (rest.length > 0) {
      const boundary = this.findBoundary(rest);
      if (boundary) {
        const raw = rest.slice(0, boundary.consume);
        const sentence = raw.trim();
        if (sentence.length >= 2) {
          chunks.push(sentence);
          this.spokenThrough += boundary.consume;
          rest = this.pending.slice(this.spokenThrough);
          continue;
        }
      }

      if (force) {
        const trailing = rest.trim();
        if (trailing.length >= 1) {
          chunks.push(trailing);
          this.spokenThrough = this.pending.length;
        }
        break;
      }

      if (rest.length >= 80) {
        const splitAt = this.findPhraseSplit(rest, 60);
        if (splitAt > 24) {
          const chunk = rest.slice(0, splitAt).trim();
          if (chunk) {
            chunks.push(chunk);
            this.spokenThrough += splitAt;
            rest = this.pending.slice(this.spokenThrough);
            continue;
          }
        }
      }
      break;
    }

    return chunks;
  }

  private findBoundary(text: string): { consume: number } | null {
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (!isSentenceEnd(char)) continue;

      const next = text[index + 1];
      // Hindi/Bengali danda is a hard terminator even with no following space.
      if (isIndicDanda(char) || next === undefined || /\s/u.test(next)) {
        let consume = index + 1;
        while (consume < text.length && /\s/u.test(text[consume])) consume += 1;
        return { consume };
      }
    }
    return null;
  }

  private findPhraseSplit(text: string, preferred: number): number {
    const window = text.slice(0, preferred);
    const comma = Math.max(window.lastIndexOf('،'), window.lastIndexOf(','));
    if (comma > 24) return comma + 1;
    const space = window.search(/\s\S*$/u);
    if (space > 24) return space + 1;
    return window.lastIndexOf(' ');
  }
}
