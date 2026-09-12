/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env, TextStreamer, InterruptableStoppingCriteria } from '@huggingface/transformers';

env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
  // Let it use the default number of threads (navigator.hardwareConcurrency)
}

/** Loaded once on INIT and reused for every GENERATE. */
let generator: any = null;

const MAX_NEW_TOKENS = 30;
const QUESTION_DONE = /[?]|ready to review/i;

self.addEventListener('message', async (e) => {
  const { type, messages } = e.data;

  if (type === 'INIT') {
    self.postMessage({ type: 'STATUS', message: 'Loading LLM (SmolLM-135M)...' });
    try {
      generator = await pipeline('text-generation', 'onnx-community/SmolLM-135M-Instruct-ONNX', {
        device: 'wasm',
        dtype: 'q4',
        progress_callback: (progress: any) => {
          if (progress.status === 'done') {
            self.postMessage({ type: 'STATUS', message: `Compiling LLM Engine (this takes a moment)...` });
          } else {
            self.postMessage({ type: 'PROGRESS', progress });
          }
        },
      });
      self.postMessage({ type: 'READY' });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: String(err.message || err) });
    }
    return;
  }

  if (type !== 'GENERATE') return;

  self.postMessage({ type: 'PERF', name: 'LLM_REQUEST_RECEIVED' });

  if (!generator) {
    self.postMessage({ type: 'ERROR', error: 'Local LLM worker has no generator.' });
    return;
  }

  try {
    let fullResponse = '';
    let tokenCount = 0;
    const stopping = new InterruptableStoppingCriteria();

    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      token_callback_function: (tokens: Array<bigint | number>) => {
        tokenCount += tokens.length;
      },
      callback_function: (textChunk: string) => {
        if (!textChunk) return;
        fullResponse += textChunk;
        self.postMessage({ type: 'CHUNK', text: textChunk });
        if (QUESTION_DONE.test(fullResponse)) stopping.interrupt();
      },
    });

    self.postMessage({ type: 'PERF', name: 'LLM_INFERENCE_START' });
    const inferenceStart = performance.now();

    await generator(messages, {
      max_new_tokens: MAX_NEW_TOKENS,
      do_sample: false,
      streamer,
      stopping_criteria: stopping,
    });

    const durationMs = Math.max(1, Math.round(performance.now() - inferenceStart));
    const tokensPerSec = tokenCount > 0 ? tokenCount / (durationMs / 1000) : 0;
    self.postMessage({ type: 'DONE', fullResponse, tokenCount, durationMs, tokensPerSec });
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', error: String(err.message || err) });
  }
});
