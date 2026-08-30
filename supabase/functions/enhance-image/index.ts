import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_IMAGE_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') || 'gemini-3.1-flash-image';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { productId, originalImageUrl } = await req.json();

    if (!productId || !originalImageUrl) {
      return new Response(JSON.stringify({ error: 'Missing productId or originalImageUrl' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Image enhancement is unavailable. Missing Gemini secret.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server configuration is incomplete.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: initialUpdateError } = await adminClient
      .from('products')
      .update({
        enhancement_status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (initialUpdateError) {
      throw new Error(`Failed to mark product as processing: ${initialUpdateError.message}`);
    }

    const imageFetch = await fetch(originalImageUrl);
    if (!imageFetch.ok) {
      throw new Error(`Could not download the original image: ${imageFetch.status}`);
    }

    const blob = await imageFetch.blob();
    const mimeType = blob.type || 'image/jpeg';
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const data = result.includes(',') ? result.split(',')[1] : result;
        if (!data) {
          reject(new Error('Failed to convert image to base64.'));
          return;
        }
        resolve(data);
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(blob);
    });

    const promptText = `Enhance this product photograph for use in an online marketplace.

Preserve the exact identity, shape, proportions, colors, texture, materials, patterns, labels, logos, and visible details of the original product.

Improve photographic quality only:
* improve exposure
* correct lighting
* improve white balance
* reduce noise
* reduce blur when possible
* improve clarity and sharpness
* improve contrast naturally
* improve overall visual quality
* make the product look clean and professional

Preserve the original composition and camera perspective.

Do not redesign, replace, reshape, recolor, or invent any part of the product.

Do not add objects, decorations, backgrounds, text, logos, watermarks, or accessories.

Do not remove genuine product details.

The result must remain a faithful representation of the original uploaded product photograph.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API failed: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const parts = geminiData?.candidates?.[0]?.content?.parts || [];
    let enhancedBase64: string | undefined;
    let enhancedMimeType = mimeType;

    for (const part of parts) {
      if (part.inlineData) {
        enhancedBase64 = part.inlineData.data;
        if (part.inlineData.mimeType) {
          enhancedMimeType = part.inlineData.mimeType;
        }
        break;
      }
    }

    if (!enhancedBase64) {
      throw new Error('Gemini did not return an enhanced image.');
    }

    const binaryString = atob(enhancedBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const enhancedBlob = new Blob([bytes], { type: enhancedMimeType });

    const authHeader = req.headers.get('Authorization');
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: authHeader || '' } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Unauthorized user credentials');
    }

    const fileExt = originalImageUrl.split('?')[0].split('.').pop() || 'jpg';
    const enhancedStoragePath = `enhanced/${userData.user.id}/${productId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await adminClient.storage
      .from('marketplace-images')
      .upload(enhancedStoragePath, enhancedBlob, {
        contentType: enhancedMimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failure: ${uploadError.message}`);
    }

    const { data: publicUrlData } = adminClient.storage
      .from('marketplace-images')
      .getPublicUrl(enhancedStoragePath);

    const enhancedImageUrl = publicUrlData.publicUrl;

    const { error: dbUpdateError } = await adminClient
      .from('products')
      .update({
        enhanced_image_url: enhancedImageUrl,
        enhancement_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (dbUpdateError) {
      throw new Error(`Failed to save enhanced image URL: ${dbUpdateError.message}`);
    }

    return new Response(JSON.stringify({ enhancedImageUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Enhancement error:', error);

    const body = await req.clone().json().catch(() => ({})) as { productId?: unknown };
    const productId = typeof body.productId === 'string' ? body.productId : null;

    if (productId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (supabaseUrl && serviceRoleKey) {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        await adminClient
          .from('products')
          .update({
            enhancement_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', productId);
      }
    }

    return new Response(JSON.stringify({ error: error?.message || 'Image enhancement failed.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
