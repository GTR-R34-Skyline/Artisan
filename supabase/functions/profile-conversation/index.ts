import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isSupportedLanguageCode, SupportedLanguageCode } from '../_shared/languageConfig.ts';
import { transcribeWithDeepgram, synthesizeWithCartesia } from '../_shared/voiceProviders.ts';
import {
  ArtisanProfileState,
  coerceProfileState,
  mergeProfileState,
} from './_shared/profileSchema.ts';
import { reasonAboutProfile, streamReasonAboutProfileTokens } from './_shared/geminiClient.ts';
import { encodeSse, runStreamingProfileTurn } from './_shared/streamingPipeline.ts';

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

const emptyTranscriptResponse = (state: ArtisanProfileState, provider: string) => ({
  transcript: '',
  assistantMessage: '',
  extractedFields: {},
  missingRequiredFields: state.missingRequiredFields,
  confidence: state.confidence,
  conversationComplete: state.conversationComplete,
  emptyTranscript: true,
  metadata: { transcriptionProvider: provider },
});

const buildAssistantMessage = (nextState: ArtisanProfileState, nextQuestion: string): string =>
  nextState.conversationComplete ? 'Thank you. Your profile is ready to review.' : nextQuestion.trim();

const applyReasoning = (
  currentState: ArtisanProfileState,
  reasoning: Awaited<ReturnType<typeof reasonAboutProfile>>,
  isPublicApplication: boolean,
) => {
  const updates = { ...reasoning.updates };
  if (typeof updates.story === 'string' && currentState.story) {
    updates.story = `${currentState.story}\n${updates.story}`;
  }
  const nextState = mergeProfileState(currentState, updates, {}, isPublicApplication);
  const assistantMessage = buildAssistantMessage(nextState, reasoning.nextQuestion);
  return { nextState, assistantMessage, reasoning };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const pipelineStarted = Date.now();

  try {
    const authorization = req.headers.get('Authorization');
    const body = await req.json() as {
      selectedLanguage?: unknown;
      transcript?: unknown;
      audioBase64?: unknown;
      audioMimeType?: unknown;
      profileState?: unknown;
      publicApplication?: unknown;
      stream?: unknown;
      preferClientTranscript?: unknown;
      clientTurnId?: unknown;
    };
    const isPublicApplication = body.publicApplication === true;
    const useStream = body.stream !== false;
    const clientTurnId = typeof body.clientTurnId === 'string' && body.clientTurnId.trim()
      ? body.clientTurnId.trim()
      : undefined;
    const turnId = crypto.randomUUID();
    if (!authorization && !isPublicApplication) return jsonResponse({ error: 'Unauthorized request.' }, 401);

    const selectedLanguage: SupportedLanguageCode = typeof body.selectedLanguage === 'string' && isSupportedLanguageCode(body.selectedLanguage)
      ? body.selectedLanguage
      : 'en';
    const currentState = coerceProfileState(body.profileState, selectedLanguage, isPublicApplication);
    const hasAudio = typeof body.audioBase64 === 'string' && body.audioBase64.trim().length > 0;
    const clientTranscript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    const preferClientTranscript = body.preferClientTranscript === true;
    let transcript = clientTranscript;
    let transcriptionProvider = preferClientTranscript && clientTranscript ? 'deepgram-live' : 'text';

    const sttStarted = Date.now();
    if (hasAudio && !(preferClientTranscript && clientTranscript.length >= 2)) {
      const mimeType = typeof body.audioMimeType === 'string' ? body.audioMimeType : 'audio/webm';
      if (![...ALLOWED_AUDIO_MIME_TYPES].some((allowedType) => mimeType.startsWith(allowedType))) {
        return jsonResponse({ error: 'Unsupported audio format. Please record again.' }, 400);
      }
      const audioBytes = decodeBase64(body.audioBase64 as string);
      if (!audioBytes.length || audioBytes.length > MAX_AUDIO_BYTES) {
        return jsonResponse({ error: 'Audio quality is not clear. Please retry with a shorter recording.' }, 400);
      }
      transcript = await transcribeWithDeepgram({ audioBytes, mimeType, selectedLanguage });
      transcriptionProvider = 'deepgram';
    }
    const sttMs = Date.now() - sttStarted;
    console.info('[profile-voice] stt_complete', {
      turnId,
      clientTurnId: clientTurnId ?? null,
      ms: sttMs,
      provider: transcriptionProvider,
      chars: transcript.length,
    });

    if (!transcript.trim()) {
      const empty = emptyTranscriptResponse(currentState, transcriptionProvider);
      return useStream
        ? new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encodeSse({ event: 'timing', data: { stage: 'stt_complete', ms: sttMs, provider: transcriptionProvider } }));
              controller.enqueue(encodeSse({ event: 'complete', data: empty }));
              controller.close();
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } },
        )
        : jsonResponse(empty);
    }

    if (!isPublicApplication) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'Server configuration is incomplete.' }, 500);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization || '' } } });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user) return jsonResponse({ error: 'Unauthorized request.' }, 401);
    }

    const buildCompletePayload = (
      reasoning: Awaited<ReturnType<typeof reasonAboutProfile>>,
      assistantMessage: string,
      nextState: ArtisanProfileState,
      errorMessage?: string,
    ) => ({
      transcript,
      assistantMessage,
      extractedFields: stateFields(nextState),
      missingRequiredFields: nextState.missingRequiredFields,
      confidence: nextState.confidence,
      conversationComplete: nextState.conversationComplete,
      changedFields: reasoning.changedFields,
      needsConfirmation: reasoning.needsConfirmation,
      errorMessage,
      metadata: {
        transcriptionProvider,
        speechProvider: 'cartesia',
        sttMs,
        stream: useStream,
      },
    });

    if (useStream) {
      const timings: Record<string, number> = { sttMs };
      let geminiInvokeCount = 0;
      const geminiTurn = { turnId, clientTurnId };
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: Parameters<typeof encodeSse>[0]) => controller.enqueue(encodeSse(event));
          send({
            event: 'timing',
            data: {
              stage: 'stt_complete',
              ms: sttMs,
              provider: transcriptionProvider,
              transcriptLength: transcript.length,
              turnId,
              clientTurnId: clientTurnId ?? null,
            },
          });
          send({ event: 'transcript', data: { transcript } });

          try {
            for await (const event of runStreamingProfileTurn({
              selectedLanguage,
              timings,
              turnId,
              clientTurnId,
              streamReason: () => {
                geminiInvokeCount += 1;
                console.info('[profile-voice] gemini_invoke', {
                  turnId,
                  clientTurnId: clientTurnId ?? null,
                  geminiInvokeCount,
                  transcriptChars: transcript.length,
                  at: Date.now(),
                });
                if (geminiInvokeCount > 1) {
                  console.warn('[profile-voice] duplicate_gemini_invoke', {
                    turnId,
                    clientTurnId: clientTurnId ?? null,
                    geminiInvokeCount,
                  });
                }
                return streamReasonAboutProfileTokens(currentState, transcript, selectedLanguage, geminiTurn);
              },
              resolveAssistantMessage: (reasoning) => applyReasoning(currentState, reasoning, isPublicApplication).assistantMessage,
              buildCompletePayload: (reasoning, assistantMessage) => {
                const { nextState } = applyReasoning(currentState, reasoning, isPublicApplication);
                return buildCompletePayload(reasoning, assistantMessage, nextState);
              },
            })) {
              if (event.event === 'error' && event.data.stage === 'gemini') {
                send(event);
                send({
                  event: 'complete',
                  data: {
                    transcript,
                    assistantMessage: '',
                    extractedFields: stateFields(currentState),
                    missingRequiredFields: currentState.missingRequiredFields,
                    confidence: currentState.confidence,
                    conversationComplete: currentState.conversationComplete,
                    errorMessage: event.data.message,
                    metadata: { transcriptionProvider, sttMs },
                  },
                });
                break;
              }
              send(event);
            }
          } catch (error) {
            send({
              event: 'error',
              data: {
                stage: 'pipeline',
                message: error instanceof Error ? error.message : 'Streaming pipeline failed.',
              },
            });
          } finally {
            send({ event: 'timing', data: { stage: 'pipeline_total', ms: Date.now() - pipelineStarted } });
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    let reasoning;
    try {
      reasoning = await reasonAboutProfile(currentState, transcript, selectedLanguage, { turnId, clientTurnId });
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
        metadata: { transcriptionProvider, sttMs },
      });
    }

    const { nextState, assistantMessage } = applyReasoning(currentState, reasoning, isPublicApplication);
    if (!assistantMessage) {
      return jsonResponse(buildCompletePayload(reasoning, '', nextState, 'Your words were saved. Continue speaking when you are ready.'));
    }

    try {
      const audio = await synthesizeWithCartesia(assistantMessage, selectedLanguage);
      return jsonResponse({
        ...buildCompletePayload(reasoning, assistantMessage, nextState),
        audioBase64: audio.audioBase64,
        audioMimeType: audio.audioMimeType,
      });
    } catch (error) {
      console.error('profile speech response error:', error instanceof Error ? error.message : error);
      return jsonResponse(buildCompletePayload(
        reasoning,
        assistantMessage,
        nextState,
        'Your profile notes were saved, but the spoken response is unavailable. You can continue manually or retry.',
      ));
    }
  } catch (error) {
    console.error('profile-conversation function error:', error instanceof Error ? error.message : error);
    return jsonResponse({ error: 'We could not process your voice right now. Please try again.' }, 500);
  }
});
