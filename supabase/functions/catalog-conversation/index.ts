import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isSupportedLanguageCode, SupportedLanguageCode } from '../_shared/languageConfig.ts';
import { CatalogConversationRequest, CatalogConversationResult, coerceState, createInitialState } from './_shared/schema.ts';
import { routeSpeechProcessing } from './_shared/providerRouter.ts';
import { understandCatalogText } from './_shared/catalogLogic.ts';
import { synthesizeWithCartesia } from '../_shared/voiceProviders.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_AUDIO_BYTES = 2.5 * 1024 * 1024; // keep each turn short to control latency and API usage
const MAX_AUDIO_DURATION_SEC = 45;
const ALLOWED_AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/ogg']);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const badRequest = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const friendlyServerError = () =>
  new Response(
    JSON.stringify({ error: 'We could not process your voice right now. Please try again.' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

const decodeBase64 = (input: string): Uint8Array => {
  const clean = input.includes(',') ? input.split(',')[1] : input;
  const binary = atob(clean);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
};

const normalizeLanguage = (input: unknown, fallback: SupportedLanguageCode): SupportedLanguageCode => {
  if (typeof input === 'string' && isSupportedLanguageCode(input)) {
    return input;
  }
  return fallback;
};

const mergeState = (base: ReturnType<typeof createInitialState>, ai: CatalogConversationResult): ReturnType<typeof createInitialState> => {
  const merged = {
    ...base,
    ...ai.extractedFields,
    confidence: {
      ...base.confidence,
      ...ai.confidence,
    },
    missingRequiredFields: ai.missingRequiredFields,
    conversationComplete: ai.conversationComplete,
  };

  const completed = new Set<string>();
  const fieldsToCheck: Array<keyof typeof merged> = [
    'productName', 'category', 'material', 'description', 'quantity',
    'color', 'dimensions', 'weight', 'craftsmanship', 'origin', 'careInstructions',
    'customization', 'materialCost', 'labourDays',
  ];

  fieldsToCheck.forEach((field) => {
    const value = merged[field];
    if (value !== null && value !== undefined && `${value}`.trim() !== '') {
      completed.add(field as string);
    }
  });

  merged.completedFields = Array.from(completed);
  return merged;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return badRequest('Unauthorized request.', 401);
    }

    const body = (await req.json()) as CatalogConversationRequest;
    if (!body?.productId || !UUID_REGEX.test(body.productId)) {
      return badRequest('Invalid product selection.');
    }

    const hasAudio = typeof body.audioBase64 === 'string' && body.audioBase64.trim().length > 0;
    const hasText = typeof body.textInput === 'string' && body.textInput.trim().length > 0;
    const isSkip = Boolean(body.skipCurrentQuestion);

    if (!hasAudio && !hasText && !isSkip) {
      return badRequest('Please record your voice or type your response.');
    }

    if (hasAudio) {
      if (!body.audioMimeType || ![...ALLOWED_AUDIO_MIME_TYPES].some((allowedType) => body.audioMimeType?.startsWith(allowedType))) {
        return badRequest('Unsupported audio format. Please record again.');
      }
      if (typeof body.audioDurationSec === 'number' && body.audioDurationSec > MAX_AUDIO_DURATION_SEC) {
        return badRequest('Voice clip is too long. Please keep each response short.');
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return badRequest('Server configuration is incomplete.', 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      return badRequest('Unauthorized request.', 401);
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, role, preferred_language')
      .eq('id', user.id)
      .maybeSingle();

    const fallbackLang = isSupportedLanguageCode(profile?.preferred_language || '')
      ? (profile?.preferred_language as SupportedLanguageCode)
      : 'en';

    const selectedLanguage = normalizeLanguage(body.selectedLanguage, fallbackLang);

    const { data: product, error: productError } = await adminClient
      .from('products')
      .select('id, vendor_id, status, language_used, conversation_state, original_image_url, studio_image_url, enhanced_image_url')
      .eq('id', body.productId)
      .maybeSingle();

    if (productError || !product) {
      return badRequest('Product draft was not found.', 404);
    }

    if (product.vendor_id !== user.id) {
      return badRequest('You cannot edit this product draft.', 403);
    }

    const persistedState = coerceState(product.conversation_state);
    const incomingState = coerceState(body.conversationState);
    const currentState = {
      ...persistedState,
      ...incomingState,
      confidence: { ...persistedState.confidence, ...incomingState.confidence },
    };

    let transcript = (body.textInput || '').trim();
    let transcriptionProvider: 'deepgram' | 'text' = 'text';

    if (hasAudio) {
      const audioBytes = decodeBase64(body.audioBase64 as string);
      if (audioBytes.byteLength === 0 || audioBytes.byteLength > MAX_AUDIO_BYTES) {
        return badRequest('Audio quality is not clear. Please retry with a shorter recording.');
      }

      const routing = await routeSpeechProcessing({
        selectedLanguage,
        audioBytes,
        audioBase64: (body.audioBase64 as string).includes(',')
          ? (body.audioBase64 as string).split(',')[1]
          : (body.audioBase64 as string),
        audioMimeType: body.audioMimeType as string,
        conversationState: currentState,
        skipCurrentQuestion: isSkip,
      });

      transcript = routing.transcript;
      transcriptionProvider = routing.transcriptionProvider;
    }

    if (!transcript && isSkip) {
      transcript = 'skip';
    }

    if (!transcript || transcript.trim().length < 2) {
      return badRequest('I could not hear that clearly. Please try again.');
    }

    const aiResult = understandCatalogText(transcript, currentState, selectedLanguage, isSkip);

    const nextState = mergeState(currentState, {
      ...aiResult,
      transcript,
    });

    const dbUpdates: Record<string, unknown> = {
      language_used: selectedLanguage,
      last_transcript: transcript,
      conversation_state: nextState,
      catalog_status: aiResult.conversationComplete ? 'complete' : 'in_progress',
      updated_at: new Date().toISOString(),
      title: nextState.productName,
      category: nextState.category,
      material: nextState.material,
      raw_description: nextState.description,
      quantity: nextState.quantity,
      material_cost: nextState.materialCost,
      labour_days: nextState.labourDays,
      materials_cost: nextState.materialCost,
      labor_days: nextState.labourDays,
    };

    if (aiResult.listing) {
      dbUpdates.title_en = aiResult.listing.english.title;
      dbUpdates.title_hi = aiResult.listing.hindi.title;
      dbUpdates.description_en = aiResult.listing.english.description;
      dbUpdates.description_hi = aiResult.listing.hindi.description;
    }

    const { error: updateError } = await adminClient
      .from('products')
      .update(dbUpdates)
      .eq('id', body.productId)
      .eq('vendor_id', user.id);

    if (updateError) {
      throw new Error(`Failed to save draft conversation: ${updateError.message}`);
    }

    const audio = await synthesizeWithCartesia(aiResult.assistantMessage, selectedLanguage);
    return new Response(
      JSON.stringify({
        transcript,
        assistantMessage: aiResult.assistantMessage,
        conversationComplete: aiResult.conversationComplete,
        extractedFields: aiResult.extractedFields,
        missingRequiredFields: aiResult.missingRequiredFields,
        confidence: aiResult.confidence,
        listing: aiResult.listing,
        audioBase64: audio.audioBase64,
        audioMimeType: audio.audioMimeType,
        metadata: {
          selectedLanguage,
          transcriptionProvider,
          speechProvider: 'cartesia',
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('catalog-conversation function error:', message);

    if (message.includes('429')) {
      return badRequest('Service is busy right now. Please retry in a few seconds.', 429);
    }

    if (message.toLowerCase().includes('timeout')) {
      return badRequest('The request took too long. Please retry.', 504);
    }

    return friendlyServerError();
  }
});
