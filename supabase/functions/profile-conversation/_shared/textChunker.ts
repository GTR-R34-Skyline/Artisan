const SENTENCE_BOUNDARY = /([.!?؟。！？])\s+/u;

/** Accumulates streamed assistant text and yields natural TTS-sized chunks. */
export class TextChunkEmitter {
  private pending = '';
  private emittedLength = 0;

  push(delta: string): string[] {
    if (!delta) return [];
    this.pending += delta;
    return this.drain(false);
  }

  flush(): string[] {
    return this.drain(true);
  }

  private drain(force: boolean): string[] {
    const chunks: string[] = [];
    const speakable = this.pending.slice(this.emittedLength);
    if (!speakable.trim()) return chunks;

    let rest = speakable;
    while (rest.length > 0) {
      const match = rest.match(SENTENCE_BOUNDARY);
      if (match && match.index !== undefined) {
        const end = match.index + match[1].length;
        const sentence = rest.slice(0, end + 1).trim();
        if (sentence.length >= 8) {
          chunks.push(sentence);
          this.emittedLength += end + 1;
          rest = rest.slice(end + 1);
          continue;
        }
      }

      if (force && rest.trim().length >= 4) {
        chunks.push(rest.trim());
        this.emittedLength += rest.length;
      }
      break;
    }

    if (!force && rest.length >= 120) {
      const splitAt = rest.lastIndexOf(' ', 100);
      if (splitAt > 20) {
        const chunk = rest.slice(0, splitAt).trim();
        chunks.push(chunk);
        this.emittedLength += splitAt + 1;
      }
    }

    return chunks;
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

  private extractPartial(): string {
    if (this.valueStart < 0) return '';
    let result = '';
    for (let index = this.valueStart; index < this.buffer.length; index += 1) {
      const char = this.buffer[index];
      if (char === '\\' && index + 1 < this.buffer.length) {
        const next = this.buffer[index + 1];
        if (next === 'n') result += '\n';
        else if (next === '"') result += '"';
        else if (next === '\\') result += '\\';
        else result += next;
        index += 1;
        continue;
      }
      if (char === '"') {
        this.closed = true;
        break;
      }
      result += char;
    }
    return result;
  }

  private extractFull(): string {
    if (this.valueStart < 0) return '';
    let result = '';
    for (let index = this.valueStart; index < this.buffer.length; index += 1) {
      const char = this.buffer[index];
      if (char === '\\' && index + 1 < this.buffer.length) {
        const next = this.buffer[index + 1];
        if (next === 'n') result += '\n';
        else if (next === '"') result += '"';
        else if (next === '\\') result += '\\';
        else result += next;
        index += 1;
        continue;
      }
      if (char === '"') break;
      result += char;
    }
    return result;
  }
}
