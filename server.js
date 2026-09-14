/**
 * Local Express helper retired.
 *
 * Image enhancement runs exclusively through the Supabase Edge Function:
 *   supabase.functions.invoke('enhance-image')
 *   → supabase/functions/enhance-image/index.ts
 *   → Photoroom Image Editing API (server-side PHOTOROOM_API_KEY)
 *
 * This stub remains so `npm run dev:server` does not crash and so any
 * accidental calls to the old local endpoint get a clear response.
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/enhance-image', (_req, res) => {
  res.status(410).json({
    error:
      'Local /api/enhance-image is retired. Use the Supabase enhance-image Edge Function (Photoroom) via supabase.functions.invoke("enhance-image").',
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, enhanceImage: 'supabase-edge-function-photoroom' });
});

app.listen(port, () => {
  console.log(`Local helper listening on http://localhost:${port} (enhance-image is handled by Supabase Edge Functions + Photoroom)`);
});
