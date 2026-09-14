import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PHOTOROOM_API_KEY = Deno.env.get('PHOTOROOM_API_KEY');
const PHOTOROOM_EDIT_URL = 'https://image-api.photoroom.com/v2/edit';

/** Marketplace product cards commonly use 4:3 (see ImageFrame aspect-[4/3]). */
const OUTPUT_SIZE = '1600x1200';
const MAX_INPUT_BYTES = 7 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;
const MAX_PHOTOROOM_ATTEMPTS = 2;
const ALLOWED_INPUT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_OUTPUT_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const normalizeMimeType = (value: string | null | undefined, fallback = 'image/jpeg'): string => {
  if (!value) return fallback;
  const mime = value.split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  return mime;
};

const extensionForMime = (mimeType: string): string => {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
};

const filenameForMime = (mimeType: string): string => `product.${extensionForMime(mimeType)}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientStatus = (status: number): boolean =>
  status === 429 || status === 502 || status === 503 || status === 504;

const markEnhancementStatus = async (
  adminClient: ReturnType<typeof createClient>,
  productId: string,
  status: 'processing' | 'completed' | 'failed',
  extra: Record<string, unknown> = {}
) => {
  const { error } = await adminClient
    .from('products')
    .update({
      enhancement_status: status,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', productId);

  if (error) {
    throw new Error(`Failed to update enhancement status: ${error.message}`);
  }
};

const safeClientError = (message: string): string => {
  // Never leak credentials, raw upstream payloads, or internal identifiers.
  if (/api[_ -]?key|x-api-key|service[_ -]?role|sk_pr_|bearer\s|authorization:|stack trace/i.test(message)) {
    return 'Image enhancement failed. Please try again or continue with the original.';
  }
  return message || 'Image enhancement failed. Please try again or continue with the original.';
};

/**
 * Conservative e-commerce edit via Photoroom Image Editing API.
 * Fidelity-first: preserve product colors/details; clean white BG; soft studio framing.
 * Intentionally avoids beautify / AI backgrounds / upscale / generative redesign.
 */
const callPhotoroomEdit = async (
  imageBytes: Uint8Array,
  inputMime: string
): Promise<{ bytes: Uint8Array; mimeType: string }> => {
  if (!PHOTOROOM_API_KEY) {
    throw new Error('Image enhancement is unavailable. Missing Photoroom secret.');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_PHOTOROOM_ATTEMPTS; attempt += 1) {
    try {
      const form = new FormData();
      form.append(
        'imageFile',
        new Blob([imageBytes], { type: inputMime }),
        filenameForMime(inputMime)
      );
      form.append('removeBackground', 'true');
      form.append('background.color', 'FFFFFF');
      form.append('lighting.mode', 'ai.preserve-hue-and-saturation');
      form.append('shadow.mode', 'ai.soft');
      form.append('padding', '0.1');
      form.append('outputSize', OUTPUT_SIZE);
      form.append('horizontalAlignment', 'center');
      form.append('verticalAlignment', 'center');
      form.append('export.format', 'jpeg');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(PHOTOROOM_EDIT_URL, {
        method: 'POST',
        headers: {
          'x-api-key': PHOTOROOM_API_KEY,
          'pr-hd-background-removal': 'auto',
        },
        body: form,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.error(`Photoroom API error (attempt ${attempt}):`, response.status, errBody.slice(0, 300));

        if (response.status === 429) {
          lastError = new Error('Image enhancement is temporarily busy. Please try again in a moment.');
        } else if (response.status >= 500) {
          lastError = new Error('Image enhancement service failed. Please try again.');
        } else if (response.status === 401 || response.status === 403) {
          lastError = new Error('Image enhancement is unavailable.');
        } else {
          lastError = new Error('The photograph could not be improved. Please try another image or continue with the original.');
        }

        if (isTransientStatus(response.status) && attempt < MAX_PHOTOROOM_ATTEMPTS) {
          await sleep(500 * attempt);
          continue;
        }
        throw lastError;
      }

      const contentType = normalizeMimeType(response.headers.get('content-type'), 'image/jpeg');
      if (!ALLOWED_OUTPUT_MIME.has(contentType) && !contentType.startsWith('image/')) {
        throw new Error('Image enhancement returned an unexpected response.');
      }

      const resultBuffer = new Uint8Array(await response.arrayBuffer());
      if (resultBuffer.byteLength === 0) {
        throw new Error('Image enhancement returned an empty image.');
      }
      if (resultBuffer.byteLength > MAX_OUTPUT_BYTES) {
        throw new Error('Enhanced image was unexpectedly large.');
      }

      const mimeType = ALLOWED_OUTPUT_MIME.has(contentType) ? contentType : 'image/jpeg';
      return { bytes: resultBuffer, mimeType };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new Error('Image enhancement timed out. Please try again.');
      } else {
        lastError = error instanceof Error ? error : new Error('Image enhancement failed.');
      }

      const retryable =
        /timed out|temporarily busy|service failed|network|fetch/i.test(lastError.message);
      if (retryable && attempt < MAX_PHOTOROOM_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Image enhancement failed.');
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let productId: string | null = null;

  try {
    const body = await req.json();
    productId = typeof body.productId === 'string' ? body.productId : null;
    const originalImageUrl = typeof body.originalImageUrl === 'string' ? body.originalImageUrl : null;

    if (!productId || !originalImageUrl) {
      return new Response(JSON.stringify({ error: 'Missing productId or originalImageUrl' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!PHOTOROOM_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Image enhancement is unavailable. Missing Photoroom secret.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: 'Server configuration is incomplete.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    await markEnhancementStatus(adminClient, productId, 'processing');

    const imageFetch = await fetch(originalImageUrl);
    if (!imageFetch.ok) {
      throw new Error('Could not download the original image.');
    }

    const sourceBytes = new Uint8Array(await imageFetch.arrayBuffer());
    if (sourceBytes.byteLength === 0) {
      throw new Error('Original image was empty.');
    }
    if (sourceBytes.byteLength > MAX_INPUT_BYTES) {
      throw new Error('Original image is too large to enhance. Please upload a smaller photograph.');
    }

    const headerMime = normalizeMimeType(imageFetch.headers.get('content-type'));
    const inputMime = ALLOWED_INPUT_MIME.has(headerMime) ? headerMime : 'image/jpeg';

    const processed = await callPhotoroomEdit(sourceBytes, inputMime);

    const authHeader = req.headers.get('Authorization');
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || '' } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Unauthorized user credentials');
    }

    const fileExt = extensionForMime(processed.mimeType);
    const enhancedStoragePath = `enhanced/${userData.user.id}/${productId}/${Date.now()}.${fileExt}`;
    const enhancedBlob = new Blob([processed.bytes], { type: processed.mimeType });

    const { error: uploadError } = await adminClient.storage
      .from('marketplace-images')
      .upload(enhancedStoragePath, enhancedBlob, {
        contentType: processed.mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failure: ${uploadError.message}`);
    }

    const { data: publicUrlData } = adminClient.storage
      .from('marketplace-images')
      .getPublicUrl(enhancedStoragePath);

    const enhancedImageUrl = publicUrlData.publicUrl;

    await markEnhancementStatus(adminClient, productId, 'completed', {
      enhanced_image_url: enhancedImageUrl,
    });

    return new Response(JSON.stringify({ enhancedImageUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Enhancement error:', error);

    if (productId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (supabaseUrl && serviceRoleKey) {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        try {
          await markEnhancementStatus(adminClient, productId, 'failed');
        } catch (statusError) {
          console.error('Failed to mark enhancement as failed:', statusError);
        }
      }
    }

    const message = error instanceof Error ? error.message : 'Image enhancement failed.';
    return new Response(JSON.stringify({ error: safeClientError(message) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
