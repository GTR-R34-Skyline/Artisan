// public/piper.worker.js
import * as tts from 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm';

let isReady = false;
let currentVoice = null;
const generationQueue = [];
let isGenerating = false;

async function processQueue() {
  if (isGenerating || generationQueue.length === 0) return;
  isGenerating = true;

  const req = generationQueue.shift();
  try {
    // Generate the audio blob
    const wavBlob = await tts.predict({
      text: req.text,
      voiceId: req.voice_id || 'en_US-lessac-medium',
    });

    // Convert to ArrayBuffer for lightning-fast transfer to the main thread
    const arrayBuffer = await wavBlob.arrayBuffer();

    self.postMessage({
      type: 'AUDIO_CHUNK',
      audioData: arrayBuffer,
      text: req.text,
      msgId: req.msgId
    }, [arrayBuffer]); // Transferable object
  } catch (err) {
    console.error('Error generating Piper audio', err);
    self.postMessage({ type: 'ERROR', error: err.message || String(err) });
  }

  isGenerating = false;
  processQueue(); // Process next item in queue
}

self.addEventListener('message', async (e) => {
  const { type, text, voice_id } = e.data;

  if (type === 'INIT') {
    try {
      if (currentVoice !== voice_id) {
        self.postMessage({ type: 'STATUS', message: `Downloading Piper model...` });

        // Cache and download the ONNX model
        await tts.download(voice_id, (progress) => {
          const percent = Math.round(progress.loaded * 100 / progress.total);
          self.postMessage({ type: 'STATUS', message: `Downloading Piper... ${percent}%` });
        });

        self.postMessage({ type: 'STATUS', message: `Compiling AI Engine (may take 1-2s)...` });
        // WARM-UP INFERENCE: Run a dummy punctuation mark to force ONNX to compile the graph NOW and save it to the cache
        await tts.predict({ text: '.', voiceId: voice_id });

        currentVoice = voice_id;
      }
      isReady = true;
      self.postMessage({ type: 'READY' });
    } catch (err) {
      self.postMessage({ type: 'ERROR', error: err.message || String(err) });
    }
  } else if (type === 'GENERATE') {
    if (!isReady) {
      self.postMessage({ type: 'ERROR', error: 'Piper TTS not initialized yet' });
      return;
    }

    generationQueue.push(e.data);
    processQueue();
  }
});
