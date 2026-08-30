import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

if (!supabaseUrl || !serviceRoleKey || !geminiApiKey) {
  console.warn('Missing required env vars for image enhancement backend.');
}

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

app.post('/api/enhance-image', async (req, res) => {
  try {
    const { productId, originalImageUrl } = req.body || {};

    if (!productId || !originalImageUrl) {
      return res.status(400).json({ error: 'Missing productId or originalImageUrl' });
    }

    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Image enhancement is unavailable: GEMINI_API_KEY is missing.' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Image enhancement is unavailable: Supabase server config is missing.' });
    }

    const { error: statusError } = await supabaseAdmin
      .from('products')
      .update({ enhancement_status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', productId);

    if (statusError) {
      throw new Error(`Failed to update product status: ${statusError.message}`);
    }

    const imageResponse = await fetch(originalImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Could not download original image: ${imageResponse.status}`);
    }

    const blob = await imageResponse.blob();
    const mimeType = blob.type || 'image/jpeg';
    const arrayBuffer = await blob.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

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

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiImageModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: promptText },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }]
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API failed: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const parts = geminiData?.candidates?.[0]?.content?.parts || [];
    let enhancedBase64 = null;
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

    const enhancedBlob = Buffer.from(enhancedBase64, 'base64');

    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser();
    if (authError || !authUser?.user) {
      throw new Error('Unauthorized user credentials');
    }

    const fileExt = originalImageUrl.split('?')[0].split('.').pop() || 'jpg';
    const enhancedStoragePath = `enhanced/${authUser.user.id}/${productId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('marketplace-images')
      .upload(enhancedStoragePath, enhancedBlob, {
        contentType: enhancedMimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failure: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('marketplace-images')
      .getPublicUrl(enhancedStoragePath);

    const enhancedImageUrl = publicUrlData.publicUrl;

    const { error: dbUpdateError } = await supabaseAdmin
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

    return res.json({ enhancedImageUrl });
  } catch (error) {
    console.error('Enhancement error:', error);

    const { productId } = req.body || {};
    if (productId && supabaseAdmin) {
      await supabaseAdmin
        .from('products')
        .update({ enhancement_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', productId);
    }

    return res.status(500).json({ error: error.message || 'Image enhancement failed.' });
  }
});

app.listen(port, () => {
  console.log(`Image enhancement backend running on http://localhost:${port}`);
});
