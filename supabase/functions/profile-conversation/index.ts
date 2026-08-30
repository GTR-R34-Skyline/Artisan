import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isSupportedLanguageCode, SupportedLanguageCode } from '../_shared/languageConfig.ts';
import { transcribeWithDeepgram, synthesizeWithCartesia } from '../_shared/voiceProviders.ts';
import {
  ArtisanProfileState,
  coerceProfileState,
  mergeProfileState,
} from './_shared/profileSchema.ts';
import { reasonAboutProfile } from './_shared/geminiClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_AUDIO_BYTES = 2.5 * 1024 * 1024;
const ALLOWED_AUDIO_MIME_TYPES = new Set(['audio/webm', 'audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/ogg']);

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const decodeBase64 = (input: string): Uint8Array => {
  const clean = input.includes(',') ? input.split(',')[1] : input;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const stateFields = (state: ArtisanProfileState): Record<string, unknown> => ({
  name: state.name,
  email: state.email,
  phone: state.phone,
  location: state.location,
  craft: state.craft,
  category: state.category,
  experienceYears: state.experienceYears,
  skills: state.skills,
  materials: state.materials,
  specialties: state.specialties,
  products: state.products,
  productionMethods: state.productionMethods,
  story: state.story,
  languagesSpoken: state.languagesSpoken,
});

const emptyTranscriptResponse = (state: ArtisanProfileState) => ({
  transcript: '',
  assistantMessage: '',
  extractedFields: {},
  missingRequiredFields: state.missingRequiredFields,
  confidence: state.confidence,
  conversationComplete: state.conversationComplete,
  emptyTranscript: true,
  metadata: { transcriptionProvider: 'deepgram' },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = req.headers.get('Authorization');
    const body = await req.json() as {
      selectedLanguage?: unknown;
      transcript?: unknown;
      audioBase64?: unknown;
      audioMimeType?: unknown;
      profileState?: unknown;
      publicApplication?: unknown;
    };
    const isPublicApplication = body.publicApplication === true;
    if (!authorization && !isPublicApplication) return jsonResponse({ error: 'Unauthorized request.' }, 401);

    const selectedLanguage: SupportedLanguageCode = typeof body.selectedLanguage === 'string' && isSupportedLanguageCode(body.selectedLanguage)
      ? body.selectedLanguage
      : 'en';
    const currentState = coerceProfileState(body.profileState, selectedLanguage, isPublicApplication);
    const hasAudio = typeof body.audioBase64 === 'string' && body.audioBase64.trim().length > 0;
    let transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';

    if (hasAudio) {
      const mimeType = typeof body.audioMimeType === 'string' ? body.audioMimeType : 'audio/webm';
      if (![...ALLOWED_AUDIO_MIME_TYPES].some((allowedType) => mimeType.startsWith(allowedType))) {
        return jsonResponse({ error: 'Unsupported audio format. Please record again.' }, 400);
      }
      const audioBytes = decodeBase64(body.audioBase64 as string);
      if (!audioBytes.length || audioBytes.length > MAX_AUDIO_BYTES) {
        return jsonResponse({ error: 'Audio quality is not clear. Please retry with a shorter recording.' }, 400);
      }
      transcript = await transcribeWithDeepgram({ audioBytes, mimeType, selectedLanguage });
    }

    if (!transcript.trim()) return jsonResponse(emptyTranscriptResponse(currentState));

    if (!isPublicApplication) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'Server configuration is incomplete.' }, 500);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization || '' } } });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user) return jsonResponse({ error: 'Unauthorized request.' }, 401);
    }

    let reasoning;
    try {
      reasoning = await reasonAboutProfile(currentState, transcript, selectedLanguage);
    } catch (error) {
      console.error('profile reasoning error:', error instanceof Error ? error.message : error);
      return jsonResponse({
        transcript,
        assistantMessage: '',
        extractedFields: {},
        missingRequiredFields: currentState.missingRequiredFields,
        confidence: currentState.confidence,
        conversationComplete: currentState.conversationComplete,
        errorMessage: 'We could not understand that yet. Your words are saved; you can retry or continue manually.',
        metadata: { transcriptionProvider: hasAudio ? 'deepgram' : 'text' },
      });
    }

    const updates = { ...reasoning.updates };
    if (typeof updates.story === 'string' && currentState.story) {
      updates.story = `${currentState.story}\n${updates.story}`;
    }
    const nextState = mergeProfileState(currentState, updates, {}, isPublicApplication);
    const assistantMessage = nextState.conversationComplete
      ? 'Thank you. Your profile is ready to review.'
      : reasoning.nextQuestion.trim();

    if (!assistantMessage) {
      return jsonResponse({
        transcript,
        assistantMessage: '',
        extractedFields: stateFields(nextState),
        missingRequiredFields: nextState.missingRequiredFields,
        confidence: nextState.confidence,
        conversationComplete: nextState.conversationComplete,
        errorMessage: 'Your words were saved. Continue speaking when you are ready.',
        metadata: { transcriptionProvider: hasAudio ? 'deepgram' : 'text' },
      });
    }

    try {
      const audio = await synthesizeWithCartesia(assistantMessage, selectedLanguage);
      return jsonResponse({
        transcript,
        assistantMessage,
        extractedFields: stateFields(nextState),
        missingRequiredFields: nextState.missingRequiredFields,
        confidence: nextState.confidence,
        conversationComplete: nextState.conversationComplete,
        audioBase64: audio.audioBase64,
        audioMimeType: audio.audioMimeType,
        changedFields: reasoning.changedFields,
        needsConfirmation: reasoning.needsConfirmation,
        metadata: { transcriptionProvider: hasAudio ? 'deepgram' : 'text', speechProvider: 'cartesia' },
      });
    } catch (error) {
      console.error('profile speech response error:', error instanceof Error ? error.message : error);
      return jsonResponse({
        transcript,
        assistantMessage,
        extractedFields: stateFields(nextState),
        missingRequiredFields: nextState.missingRequiredFields,
        confidence: nextState.confidence,
        conversationComplete: nextState.conversationComplete,
        errorMessage: 'Your profile notes were saved, but the spoken response is unavailable. You can continue manually or retry.',
        metadata: { transcriptionProvider: hasAudio ? 'deepgram' : 'text' },
      });
    }
  } catch (error) {
    console.error('profile-conversation function error:', error instanceof Error ? error.message : error);
    return jsonResponse({ error: 'We could not process your voice right now. Please try again.' }, 500);
  }
});
