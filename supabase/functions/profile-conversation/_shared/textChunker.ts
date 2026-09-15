/**
 * Incremental speakable-chunk emitter for LLM → TTS.
 * Supports ASCII and Indic sentence punctuation (। ॥ ? ! etc.).
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

  /** Characters already removed/queued for TTS. */
  get spokenLength(): number {
    return this.spokenThrough;
  }

  /** Full buffered text so far (including already spoken prefix). */
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
        // Allow short acknowledgements ("धन्यवाद।") — only skip tiny noise.
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

      // Long phrase fallback: split at whitespace before TTS gets a giant blob.
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
      // Hindi/Bengali danda is a hard terminator even when the next grapheme is a letter
      // (models often emit "धन्यवाद।कृपया" with no space). ASCII .!? still need whitespace/EOS
      // so abbreviations/decimals are not split.
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
    // Prefer splitting after Indic/ASCII comma or whitespace.
    const comma = Math.max(window.lastIndexOf('،'), window.lastIndexOf(','));
    if (comma > 24) return comma + 1;
    const space = window.search(/\s\S*$/u);
    if (space > 24) return space + 1;
    return window.lastIndexOf(' ');
  }
}

/** Extracts the next_question string value as Gemini streams JSON. */
export class NextQuestionStreamParser {
  private buffer = '';
  private valueStart = -1;
  private closed = false;
  private lastEmittedLength = 0;

  push(delta: string): { delta: string; complete: boolean; full: string } {
    this.buffer += delta;
    if (this.closed) {
      return { delta: '', complete: true, full: this.extractFull() };
    }

    if (this.valueStart < 0) {
      const marker = '"next_question"';
      const keyIndex = this.buffer.indexOf(marker);
      if (keyIndex >= 0) {
        const colonQuote = this.buffer.indexOf('"', keyIndex + marker.length);
        if (colonQuote >= 0) {
          this.valueStart = colonQuote + 1;
        }
      }
    }

    const full = this.extractFull();
    if (this.closed) {
      const newText = full.slice(this.lastEmittedLength);
      this.lastEmittedLength = full.length;
      return { delta: newText, complete: true, full };
    }

    const partial = this.extractPartial();
    const newText = partial.slice(this.lastEmittedLength);
    this.lastEmittedLength = partial.length;
    return { delta: newText, complete: false, full: partial };
  }

  private decodeEscape(buffer: string, index: number): { char: string; advance: number } | null {
    if (buffer[index] !== '\\' || index + 1 >= buffer.length) return null;
    const next = buffer[index + 1];
    if (next === 'n') return { char: '\n', advance: 2 };
    if (next === '"') return { char: '"', advance: 2 };
    if (next === '\\') return { char: '\\', advance: 2 };
    if (next === '/') return { char: '/', advance: 2 };
    if (next === 't') return { char: '\t', advance: 2 };
    if (next === 'u' && index + 5 < buffer.length) {
      const hex = buffer.slice(index + 2, index + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        return { char: String.fromCharCode(parseInt(hex, 16)), advance: 6 };
      }
    }
    return { char: next, advance: 2 };
  }

  private extractPartial(): string {
    if (this.valueStart < 0) return '';
    let result = '';
    for (let index = this.valueStart; index < this.buffer.length; index += 1) {
      const decoded = this.decodeEscape(this.buffer, index);
      if (decoded) {
        result += decoded.char;
        index += decoded.advance - 1;
        continue;
      }
      if (this.buffer[index] === '"') {
        this.closed = true;
        break;
      }
      result += this.buffer[index];
    }
    return result;
  }

  private extractFull(): string {
    if (this.valueStart < 0) return '';
    let result = '';
    for (let index = this.valueStart; index < this.buffer.length; index += 1) {
      const decoded = this.decodeEscape(this.buffer, index);
      if (decoded) {
        result += decoded.char;
        index += decoded.advance - 1;
        continue;
      }
      if (this.buffer[index] === '"') break;
      result += this.buffer[index];
    }
    return result;
  }
}
