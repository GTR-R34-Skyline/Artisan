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
  let ttsIndex = 0;
  let firstGeminiChunkAt: number | null = null;
  let firstTtsSentAt: number | null = null;
  let firstAudioAt: number | null = null;
  let reasoning: ProfileReasoningResult;

  const speakChunks = async function* (textChunks: string[]): AsyncGenerator<StreamEvent> {
    for (const text of textChunks) {
      if (!text.trim()) continue;
      if (firstTtsSentAt === null) {
        firstTtsSentAt = Date.now();
        yield {
          event: 'timing',
          data: { stage: 'tts_first_chunk_sent', at: firstTtsSentAt, elapsedMs: firstTtsSentAt - geminiStarted },
        };
      }
      try {
        const audio = await synthesizeWithCartesia(text, input.selectedLanguage);
        if (firstAudioAt === null) {
          firstAudioAt = Date.now();
          yield {
            event: 'timing',
            data: { stage: 'tts_first_audio', at: firstAudioAt, elapsedMs: firstAudioAt - geminiStarted },
          };
        }
        yield {
          event: 'audio_chunk',
          data: {
            index: ttsIndex,
            audioBase64: audio.audioBase64,
            audioMimeType: audio.audioMimeType,
            text,
          },
        };
        ttsIndex += 1;
      } catch (error) {
        yield {
          event: 'error',
          data: {
            stage: 'tts',
            message: error instanceof Error ? error.message : 'Speech synthesis failed for a response chunk.',
          },
        };
      }
    }
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
        for (const chunk of chunkEmitter.push(parsed.delta)) {
          yield* speakChunks([chunk]);
        }
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

  const assistantMessage = input.resolveAssistantMessage(reasoning);
  const streamedQuestion = questionParser.push('').full;
  if (assistantMessage.length > streamedQuestion.length) {
    const remainder = assistantMessage.slice(streamedQuestion.length);
    if (remainder.trim()) {
      yield { event: 'assistant_text', data: { delta: remainder, text: assistantMessage } };
      for (const chunk of chunkEmitter.push(remainder)) {
        yield* speakChunks([chunk]);
      }
    }
  } else if (!streamedQuestion && assistantMessage.trim()) {
    yield { event: 'assistant_text', data: { delta: assistantMessage, text: assistantMessage } };
    for (const chunk of chunkEmitter.push(assistantMessage)) {
      yield* speakChunks([chunk]);
    }
  }

  for (const chunk of chunkEmitter.flush()) {
    yield* speakChunks([chunk]);
  }

  yield {
    event: 'complete',
    data: input.buildCompletePayload(reasoning, assistantMessage),
  };

  yield {
    event: 'timing',
    data: {
      stage: 'pipeline_complete',
      geminiMs: input.timings.geminiMs,
      firstGeminiChunkMs: firstGeminiChunkAt ? firstGeminiChunkAt - geminiStarted : null,
      firstTtsSentMs: firstTtsSentAt ? firstTtsSentAt - geminiStarted : null,
      firstAudioMs: firstAudioAt ? firstAudioAt - geminiStarted : null,
    },
  };
}
