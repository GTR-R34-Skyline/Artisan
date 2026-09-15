import { describe, expect, it } from 'vitest';
import { TextChunkEmitter } from './textChunker';

describe('TextChunkEmitter', () => {
  it('splits a multi-sentence Hindi response into all speakable chunks and flushes the tail', () => {
    const emitter = new TextChunkEmitter();
    const full =
      'नमस्ते शशांक! धन्यवाद। कृपया अपना स्थान, आप क्या शिल्प बनाते हैं, अपने अनुभव के वर्ष, अपनी कहानी, ईमेल और फोन नंबर साझा करें।';

    // Simulate arbitrary stream slices.
    const parts = [
      'नमस्ते शशांक!',
      ' धन्यवाद। कृपया अपना',
      ' स्थान, आप क्या शिल्प बनाते हैं,',
      ' अपने अनुभव के वर्ष, अपनी कहानी, ईमेल और फोन नंबर साझा करें।',
    ];

    const spoken: string[] = [];
    for (const part of parts) {
      spoken.push(...emitter.push(part));
    }
    spoken.push(...emitter.flush());

    expect(spoken.length).toBeGreaterThanOrEqual(3);
    expect(spoken[0]).toContain('नमस्ते शशांक');
    expect(spoken.some((chunk) => chunk.includes('धन्यवाद'))).toBe(true);
    expect(spoken.some((chunk) => chunk.includes('कृपया अपना स्थान'))).toBe(true);
    expect(spoken.join(' ')).toContain('ईमेल और फोन नंबर साझा करें');
    // Nothing left unspoken in the buffer.
    expect(emitter.spokenLength).toBe(emitter.buffer.length);
  });

  it('continues emitting later sentences after the first punctuation', () => {
    const emitter = new TextChunkEmitter();
    // End-of-buffer punctuation is a valid speakable boundary (needed for Hindi । / !).
    expect(emitter.push('नमस्ते शशांक!')).toEqual(['नमस्ते शशांक!']);
    const afterSecond = emitter.push(' धन्यवाद। बाकी जानकारी दें।');
    expect(afterSecond.length).toBeGreaterThanOrEqual(2);
    expect(afterSecond.join(' ')).toContain('धन्यवाद');
    expect(afterSecond.join(' ')).toContain('बाकी जानकारी');
    expect(emitter.flush()).toEqual([]);
  });

  it('splits on Hindi danda even when the next sentence has no leading space', () => {
    const emitter = new TextChunkEmitter();
    const chunks = [
      ...emitter.push('धन्यवाद।कृपया अपना स्थान बताएं।'),
      ...emitter.flush(),
    ];
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toBe('धन्यवाद।');
    expect(chunks.join(' ')).toContain('कृपया अपना स्थान');
  });

  it('speaks the full ready-to-review Hindi line after धन्यवाद।', () => {
    const emitter = new TextChunkEmitter();
    const chunks = [
      ...emitter.push('धन्यवाद। आपकी प्रोफ़ाइल समीक्षा के लिए तैयार है।'),
      ...emitter.flush(),
    ];
    expect(chunks).toEqual([
      'धन्यवाद।',
      'आपकी प्रोफ़ाइल समीक्षा के लिए तैयार है।',
    ]);
  });
});
