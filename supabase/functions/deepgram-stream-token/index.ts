import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = req.headers.get('Authorization');
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) as { publicApplication?: unknown } : {};
    const isPublicApplication = body.publicApplication === true;

    if (!isPublicApplication) {
      if (!authorization) {
        return new Response(JSON.stringify({ error: 'Unauthorized request.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      if (!supabaseUrl || !anonKey) {
        return new Response(JSON.stringify({ error: 'Server configuration is incomplete.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized request.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const apiKey = Deno.env.get('DEEPGRAM_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Speech service is not configured on the server.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const grantResponse = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 120 }),
    });

    if (!grantResponse.ok) {
      const detail = await grantResponse.text();
      console.error('[deepgram-stream-token] grant failed', grantResponse.status, detail);

      return new Response(JSON.stringify({
        error: 'Unable to start live transcription.',
        detail: grantResponse.status === 403
          ? 'Deepgram API key lacks permission to create temporary streaming tokens.'
          : undefined,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await grantResponse.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
      return new Response(JSON.stringify({ error: 'Unable to start live transcription.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      accessToken: payload.access_token,
      tokenType: 'bearer',
      expiresIn: payload.expires_in ?? 120,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[deepgram-stream-token] error:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: 'Unable to start live transcription.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
