/**
 * Verifies deepgram-stream-token grant + browser-compatible WebSocket JWT auth.
 * Usage: node scripts/verify-deepgram-jwt-flow.mjs
 */
import 'dotenv/config';
import { WebSocket } from 'ws';

/** Must match buildDeepgramWebSocketProtocols in src/services/deepgramStreamingStt.ts */
const buildDeepgramWebSocketProtocols = (jwt) => ['bearer', jwt];

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const isJwt = (token) => {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
};

const looksLikeApiKey = (token) => /^[a-f0-9]{40}$/i.test(token);

async function fetchStreamToken() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/deepgram-stream-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ publicApplication: true }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  return { status: response.status, payload };
}

function assertBrowserProtocolsValid(protocols) {
  for (const protocol of protocols) {
    if (/\s/.test(protocol)) {
      throw new Error(`Invalid WebSocket subprotocol (contains space): "${protocol}"`);
    }
  }
  if (protocols.length !== 2 || protocols[0] !== 'bearer') {
    throw new Error(`Expected ["bearer", <jwt>], got ${JSON.stringify(protocols)}`);
  }
}

function testWebSocketWithProtocols(jwt, { sendAudio = false } = {}) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en-IN',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      endpointing: '300',
      utterance_end_ms: '1000',
      vad_events: 'true',
    });
    if (sendAudio) {
      params.set('encoding', 'linear16');
      params.set('sample_rate', '16000');
      params.set('channels', '1');
    }

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    const protocols = buildDeepgramWebSocketProtocols(jwt);
    assertBrowserProtocolsValid(protocols);

    const socket = new WebSocket(url, protocols);

    const result = {
      wsOpen: false,
      metadata: false,
      interim: false,
      final: false,
      error: null,
      protocols,
    };

    const timeout = setTimeout(() => {
      socket.close();
      resolve(result);
    }, sendAudio ? 20000 : 8000);

    socket.on('open', async () => {
      result.wsOpen = true;
      if (!sendAudio) return;

      try {
        const audioRes = await fetch('https://dpgr.am/spacewalk.wav');
        const audio = Buffer.from(await audioRes.arrayBuffer());
        const chunkSize = 4096;
        for (let i = 0; i < audio.length; i += chunkSize) {
          socket.send(audio.subarray(i, i + chunkSize));
        }
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'CloseStream' }));
          }
        }, 500);
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
      }
    });

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === 'Metadata') result.metadata = true;
        if (msg.type === 'Results') {
          const transcript = msg.channel?.alternatives?.[0]?.transcript?.trim();
          if (!transcript) return;
          if (msg.is_final) result.final = true;
          else result.interim = true;
        }
        if (msg.type === 'Error') {
          result.error = msg.message || JSON.stringify(msg);
        }
      } catch {
        // ignore
      }
    });

    socket.on('error', (err) => {
      result.error = err.message;
    });

    socket.on('close', (code, reason) => {
      clearTimeout(timeout);
      if (!result.error && code !== 1000 && code !== 1005) {
        result.error = `closed ${code}: ${reason?.toString() || ''}`;
      }
      resolve(result);
    });

    if (!sendAudio) {
      setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'CloseStream' }));
          setTimeout(() => socket.close(), 500);
        }
      }, 2000);
    }
  });
}

async function main() {
  console.log('=== Deepgram JWT flow verification ===\n');

  const { status, payload } = await fetchStreamToken();
  console.log('Grant endpoint HTTP status:', status);

  if (status !== 200) {
    console.log('Response:', JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const { accessToken, tokenType, expiresIn } = payload;
  const jwt = accessToken;
  const jwtFormat = isJwt(jwt);
  const apiKeyLeak = looksLikeApiKey(jwt);

  console.log('Token type:', tokenType);
  console.log('Expires in:', expiresIn);
  console.log('Is JWT format:', jwtFormat);
  console.log('Looks like permanent API key:', apiKeyLeak);

  if (tokenType !== 'bearer' || !jwtFormat || apiKeyLeak) {
    console.error('\nFAIL: Expected bearer JWT, got something else.');
    process.exit(1);
  }

  const protocols = buildDeepgramWebSocketProtocols(jwt);
  console.log('\nBrowser WebSocket subprotocols:', JSON.stringify(protocols.map((p, i) => (i === 1 ? '<jwt>' : p))));

  try {
    assertBrowserProtocolsValid(protocols);
    console.log('Browser subprotocol validation: PASS');
  } catch (err) {
    console.error('Browser subprotocol validation: FAIL', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('\nTesting WebSocket authentication (Metadata)...');
  const wsResult = await testWebSocketWithProtocols(jwt);
  console.log('WebSocket open:', wsResult.wsOpen);
  console.log('Metadata received:', wsResult.metadata);
  if (wsResult.error) console.log('WebSocket error:', wsResult.error);

  console.log('\nTesting streamed audio (interim + final)...');
  const sttResult = await testWebSocketWithProtocols(jwt, { sendAudio: true });
  console.log('Interim transcript:', sttResult.interim);
  console.log('Final transcript:', sttResult.final);
  if (sttResult.error) console.log('STT error:', sttResult.error);

  const wsOk = wsResult.wsOpen && wsResult.metadata && !wsResult.error;
  const sttOk = sttResult.interim && sttResult.final && !sttResult.error;

  console.log('\n=== Summary ===');
  console.log('Deepgram grant status: 200');
  console.log('Token type: JWT (bearer)');
  console.log('WebSocket authentication:', wsOk ? 'working' : 'NOT working');
  console.log('Live STT (interim/final):', sttOk ? 'working' : 'NOT working');
  console.log('Permanent API key in browser response:', apiKeyLeak ? 'YES (bad)' : 'NO');

  process.exit(wsOk && sttOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
