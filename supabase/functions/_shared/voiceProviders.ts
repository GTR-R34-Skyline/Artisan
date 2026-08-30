import { SupportedLanguageCode } from './languageConfig.ts';

const DEEPGRAM_LANGUAGE: Record<SupportedLanguageCode, string> = {
  en: 'en-IN',
  hi: 'hi',
  bn: 'bn',
  ta: 'ta',
  te: 'te',
  kn: 'kn',
};

const CARTESIA_LANGUAGE: Record<SupportedLanguageCode, string> = {
  en: 'en',
  hi: 'hi',
  bn: 'bn',
  ta: 'ta',
  te: 'te',
  kn: 'kn',
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

export const transcribeWithDeepgram = async ({
  audioBytes,
  mimeType,
  selectedLanguage,
}: {
  audioBytes: Uint8Array;
  mimeType: string;
  selectedLanguage: SupportedLanguageCode;
}): Promise<string> => {
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
  if (!apiKey) throw new Error('Speech service is not configured on the server.');

  const model = Deno.env.get('DEEPGRAM_MODEL') || 'nova-3';
  const params = new URLSearchParams({
    model,
    language: DEEPGRAM_LANGUAGE[selectedLanguage],
    smart_format: 'true',
    punctuate: 'true',
  });
  const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mimeType,
    },
    body: audioBytes,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Deepgram transcription failed with status ${response.status}: ${detail}`);
  }

  const payload = await response.json() as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
  };
  const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';
  return transcript.length >= 2 ? transcript : '';
};

export const synthesizeWithCartesia = async (
  transcript: string,
  selectedLanguage: SupportedLanguageCode,
): Promise<{ audioBase64: string; audioMimeType: string }> => {
  const apiKey = Deno.env.get('CARTESIA_API_KEY');
  const voiceId = Deno.env.get('CARTESIA_VOICE_ID');
  if (!apiKey || !voiceId) throw new Error('Voice response service is not configured on the server.');

  const modelId = Deno.env.get('CARTESIA_MODEL') || 'sonic-3.5';
  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2026-03-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: modelId,
      transcript,
      voice: { mode: 'id', id: voiceId },
      language: CARTESIA_LANGUAGE[selectedLanguage],
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Cartesia synthesis failed with status ${response.status}: ${detail}`);
  }

  return {
    audioBase64: bytesToBase64(new Uint8Array(await response.arrayBuffer())),
    audioMimeType: 'audio/mpeg',
  };
};
