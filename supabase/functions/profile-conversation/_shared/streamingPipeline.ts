import { synthesizeWithCartesia } from '../../_shared/voiceProviders.ts';
import { SupportedLanguageCode } from '../../_shared/languageConfig.ts';
import { ProfileReasoningResult } from './geminiClient.ts';
import { NextQuestionStreamParser, TextChunkEmitter } from './textChunker.ts';

export type StreamEvent =
  | { event: 'timing'; data: Record<string, unknown> }
  | { event: 'transcript'; data: { transcript: string } }
  | { event: 'assistant_text'; data: { delta: string; text: string } }
  | { event: 'audio_chunk'; data: { index: number; audioBase64: string; audioMimeType: string; text: string } }
  | { event: 'error'; data: { message: string; stage: string } }
  | { event: 'complete'; data: Record<string, unknown> };

const encoder = new TextEncoder();
const MAX_TTS_IN_FLIGHT = 6;

/** Cartesia treats ASCII .?! as sentence ends; Devanagari danda often truncates audio. */
const normalizeForCartesia = (text: string): string =>
  text
    .replace(/\u0964/g, '.') // ।
    .replace(/\u0965/g, '.') // ॥
    .replace(/\s+/g, ' ')
    .trim();

const collapseWs = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Hindi/Bengali use danda (।). Sentence-streamed Cartesia calls have been unreliable for these
 * scripts (audio stops after the first danda). Speak the full final message in one Cartesia call.
 */
const preferSingleShotTts = (language: SupportedLanguageCode): boolean =>
  language === 'hi' || language === 'bn';

export const encodeSse = (event: StreamEvent): Uint8Array =>
  encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);

export async function* runStreamingProfileTurn(input: {
  selectedLanguage: SupportedLanguageCode;
  streamReason: () => AsyncGenerator<string, ProfileReasoningResult, void>;
  buildCompletePayload: (reasoning: ProfileReasoningResult, assistantMessage: string) => Record<string, unknown>;
  resolveAssistantMessage: (reasoning: ProfileReasoningResult) => string;
  timings: Record<string, number>;
  turnId?: string;
  clientTurnId?: string;
}): AsyncGenerator<StreamEvent> {
  const geminiStarted = Date.now();
  yield {
    event: 'timing',
    data: {
      stage: 'gemini_started',
      at: geminiStarted,
      elapsedMs: 0,
      turnId: input.turnId ?? null,
      clientTurnId: input.clientTurnId ?? null,
    },
  };

  const questionParser = new NextQuestionStreamParser();
  const chunkEmitter = new TextChunkEmitter();
  const singleShot = preferSingleShotTts(input.selectedLanguage);
  let ttsIndex = 0;
  /** Text successfully synthesized (Cartesia returned audio). Never credit on schedule alone. */
  let spokenOk = '';
  let firstGeminiChunkAt: number | null = null;
  let firstTtsSentAt: number | null = null;
  let firstAudioAt: number | null = null;
  let reasoning: ProfileReasoningResult;

  const completedAudio = new Map<number, StreamEvent>();
  let nextAudioEmit = 0;
  let ttsInFlight = 0;

  const emitReadyAudio = function* (): Generator<StreamEvent> {
    while (completedAudio.has(nextAudioEmit)) {
      yield completedAudio.get(nextAudioEmit)!;
      completedAudio.delete(nextAudioEmit);
      nextAudioEmit += 1;
    }
  };

  const scheduleTts = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const cartesiaText = normalizeForCartesia(trimmed);
    if (!cartesiaText) return;

    const index = ttsIndex;
    ttsIndex += 1;
    if (firstTtsSentAt === null) {
      firstTtsSentAt = Date.now();
    }
    console.info('[profile-voice] tts_chunk_scheduled', {
      selectedLanguage: input.selectedLanguage,
      index,
      chars: cartesiaText.length,
      preview: cartesiaText.slice(0, 80),
      totalScheduled: ttsIndex,
      singleShot,
    });
    ttsInFlight += 1;
    void synthesizeWithCartesia(cartesiaText, input.selectedLanguage)
      .then((audio) => {
        if (firstAudioAt === null) {
          firstAudioAt = Date.now();
        }
        if (audio.audioBase64) {
          spokenOk = `${spokenOk}${spokenOk ? ' ' : ''}${trimmed}`.trim();
        }
        completedAudio.set(index, {
          event: 'audio_chunk',
          data: {
            index,
            audioBase64: audio.audioBase64,
            audioMimeType: audio.audioMimeType,
            text: trimmed,
          },
        });
      })
      .catch((error) => {
        console.error('[profile-voice] tts_chunk_failed', {
          selectedLanguage: input.selectedLanguage,
          index,
          message: error instanceof Error ? error.message : 'tts_failed',
        });
        completedAudio.set(index, {
          event: 'audio_chunk',
          data: {
            index,
            audioBase64: '',
            audioMimeType: 'audio/mpeg',
            text: trimmed,
          },
        });
      })
      .finally(() => {
        ttsInFlight -= 1;
      });
  };

  const splitOnIndicDanda = (text: string): string[] => {
    const parts: string[] = [];
    let buffer = '';
    for (const char of text) {
      buffer += char;
      const code = char.codePointAt(0);
      if (code === 0x0964 || code === 0x0965) {
        const trimmed = buffer.trim();
        if (trimmed) parts.push(trimmed);
        buffer = '';
      }
    }
    const tail = buffer.trim();
    if (tail) parts.push(tail);
    return parts;
  };

  const enqueueSpeakableChunks = (textChunks: string[]) => {
    if (singleShot) return; // Hindi/Bengali: defer until full canonical message.
    for (const chunk of textChunks) {
      for (const piece of splitOnIndicDanda(chunk)) {
        scheduleTts(piece);
      }
    }
  };

  const waitForTtsCapacity = async function* (): AsyncGenerator<StreamEvent, void, void> {
    while (ttsInFlight >= MAX_TTS_IN_FLIGHT) {
      yield* emitReadyAudio();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };

  const drainAudioQueue = async function* (): AsyncGenerator<StreamEvent> {
    while (ttsInFlight > 0 || completedAudio.size > 0) {
      yield* emitReadyAudio();
      if (ttsInFlight > 0 || completedAudio.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    yield* emitReadyAudio();
  };

  const unsokenRemainder = (canonical: string, spoken: string): string => {
    const normCanonical = collapseWs(canonical);
    const normSpoken = collapseWs(spoken);
    if (!normCanonical) return '';
    if (!normSpoken) return normCanonical;
    if (normCanonical.startsWith(normSpoken)) {
      return normCanonical.slice(normSpoken.length).trim();
    }
    // Spoken prefix may differ slightly (punctuation/spacing). If we clearly under-covered, speak all.
    if (normSpoken.length < normCanonical.length * 0.6) {
      return normCanonical;
    }
    return '';
  };

  try {
    const generator = input.streamReason();
    while (true) {
      const step = await generator.next();
      if (step.done) {
        reasoning = step.value;
        break;
      }
      const token = step.value;
      if (firstGeminiChunkAt === null && token) {
        firstGeminiChunkAt = Date.now();
        yield {
          event: 'timing',
          data: { stage: 'gemini_first_chunk', at: firstGeminiChunkAt, elapsedMs: firstGeminiChunkAt - geminiStarted },
        };
      }

      const parsed = questionParser.push(token);
      if (parsed.delta) {
        yield { event: 'assistant_text', data: { delta: parsed.delta, text: parsed.full } };
        enqueueSpeakableChunks(chunkEmitter.push(parsed.delta));
        yield* emitReadyAudio();
        yield* waitForTtsCapacity();
      }
    }
  } catch (error) {
    yield {
      event: 'error',
      data: {
        stage: 'gemini',
        message: error instanceof Error ? error.message : 'Profile reasoning failed.',
      },
    };
    return;
  }

  const geminiCompleted = Date.now();
  input.timings.geminiMs = geminiCompleted - geminiStarted;
  yield {
    event: 'timing',
    data: { stage: 'gemini_completed', at: geminiCompleted, elapsedMs: input.timings.geminiMs },
  };

  const assistantMessage = input.resolveAssistantMessage(reasoning).trim();
  const streamedQuestion = questionParser.push('').full.trim();
  const canonical = (assistantMessage || streamedQuestion).trim();

  if (!singleShot) {
    if (canonical && canonical !== streamedQuestion) {
      if (!spokenOk && !chunkEmitter.buffer.trim()) {
        yield { event: 'assistant_text', data: { delta: canonical, text: canonical } };
        enqueueSpeakableChunks(chunkEmitter.push(canonical));
      } else if (canonical.startsWith(streamedQuestion) && canonical.length > streamedQuestion.length) {
        const remainder = canonical.slice(streamedQuestion.length);
        if (remainder.trim()) {
          yield { event: 'assistant_text', data: { delta: remainder, text: canonical } };
          enqueueSpeakableChunks(chunkEmitter.push(remainder));
        }
      }
    } else if (canonical && !streamedQuestion) {
      yield { event: 'assistant_text', data: { delta: canonical, text: canonical } };
      enqueueSpeakableChunks(chunkEmitter.push(canonical));
    }
    enqueueSpeakableChunks(chunkEmitter.flush());
  }

  // Hindi/Bengali: one Cartesia call for the full final reply (danda normalized to '.').
  // Other languages: coverage pass so failed mid-stream chunks still get spoken.
  if (singleShot) {
    if (canonical) {
      console.info('[profile-voice] tts_single_shot', {
        selectedLanguage: input.selectedLanguage,
        chars: canonical.length,
        preview: normalizeForCartesia(canonical).slice(0, 100),
      });
      scheduleTts(canonical);
    }
  } else {
    const remainder = unsokenRemainder(canonical, spokenOk || collapseWs(chunkEmitter.buffer));
    // Flush path may have scheduled but not completed yet — drain first then re-check.
    yield* drainAudioQueue();
    const afterDrainRemainder = unsokenRemainder(canonical, spokenOk);
    if (afterDrainRemainder.length >= 2) {
      console.info('[profile-voice] tts_flush_unsaid_remainder', {
        selectedLanguage: input.selectedLanguage,
        remainderChars: afterDrainRemainder.length,
        preview: afterDrainRemainder.slice(0, 80),
      });
      scheduleTts(afterDrainRemainder);
    } else if (remainder.length >= 2 && !spokenOk) {
      scheduleTts(remainder);
    }
  }

  if (firstTtsSentAt !== null) {
    yield {
      event: 'timing',
      data: { stage: 'tts_first_chunk_sent', at: firstTtsSentAt, elapsedMs: firstTtsSentAt - geminiStarted },
    };
  }

  console.info('[profile-voice] tts_schedule_complete', {
    selectedLanguage: input.selectedLanguage,
    chunks: ttsIndex,
    spokenOkChars: spokenOk.length,
    assistantChars: canonical.length,
    singleShot,
  });

  yield* drainAudioQueue();

  // Final coverage: if Cartesia still under-spoke, one last full-message attempt.
  const finalGap = unsokenRemainder(canonical, spokenOk);
  if (finalGap.length >= 2 && finalGap !== collapseWs(canonical)) {
    // Partial success — speak only the gap.
    scheduleTts(finalGap);
    yield* drainAudioQueue();
  } else if (finalGap.length >= 2 && !spokenOk) {
    scheduleTts(canonical);
    yield* drainAudioQueue();
  } else if (canonical && spokenOk && collapseWs(spokenOk).length < collapseWs(canonical).length * 0.5) {
    // Severely truncated (classic danda cut-off) — resynthesize the entire reply once.
    console.info('[profile-voice] tts_resynthesize_full_reply', {
      selectedLanguage: input.selectedLanguage,
      spokenOkChars: spokenOk.length,
      canonicalChars: canonical.length,
    });
    spokenOk = '';
    scheduleTts(canonical);
    yield* drainAudioQueue();
  }

  if (firstAudioAt !== null) {
    yield {
      event: 'timing',
      data: { stage: 'tts_first_audio', at: firstAudioAt, elapsedMs: firstAudioAt - geminiStarted },
    };
  }

  yield {
    event: 'complete',
    data: input.buildCompletePayload(reasoning, assistantMessage || canonical),
  };

  yield {
    event: 'timing',
    data: {
      stage: 'pipeline_complete',
      geminiMs: input.timings.geminiMs,
      firstGeminiChunkMs: firstGeminiChunkAt ? firstGeminiChunkAt - geminiStarted : null,
      firstTtsSentMs: firstTtsSentAt ? firstTtsSentAt - geminiStarted : null,
      firstAudioMs: firstAudioAt ? firstAudioAt - geminiStarted : null,
      ttsChunks: ttsIndex,
      spokenOkChars: spokenOk.length,
    },
  };
}
