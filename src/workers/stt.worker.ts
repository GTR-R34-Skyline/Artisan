/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipeline, env } from '@huggingface/transformers';

// Configure environment for mobile/browser execution
env.allowLocalModels = false;
// For WASM execution, limiting threads can prevent memory issues on mobile
if (env.backends.onnx.wasm) {
  // Let it use the default number of threads
}

let transcriber: any = null;

self.addEventListener('message', async (e) => {
  const { type, audioData } = e.data;
  
  if (type === 'INIT') {
    self.postMessage({ type: 'STATUS', message: 'Loading STT (Whisper)...' });
    try {
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        device: 'wasm',
        dtype: 'fp32', // Fixes Missing required scale error in WASM for q4/q8 quantized nodes
        progress_callback: (progress: any) => {
          if (progress.status === 'done') {
            self.postMessage({ type: 'STATUS', message: `Compiling STT Engine (may take a moment)...` });
          } else {
            self.postMessage({ type: 'PROGRESS', progress });
          }
        }
      });
      self.postMessage({ type: 'READY' });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: String(err.message || err) });
    }
  } else if (type === 'TRANSCRIBE') {
    if (!transcriber) return;
    try {
      // audioData must be a Float32Array containing PCM audio at 16000Hz
      const result = await transcriber(audioData);
      self.postMessage({ type: 'RESULT', text: result.text });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: String(err.message || err) });
    }
  }
});
