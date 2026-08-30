import { useCallback, useMemo, useRef, useState } from 'react';
import { CatalogConversationService } from '../services/catalogConversation.service';
import {
  CatalogConversationRequest,
  CatalogConversationResponse,
  ConversationState,
  GeneratedListing,
  SupportedLanguageCode,
  createInitialConversationState,
} from '../types/catalogConversation';

type RecordingStatus = 'idle' | 'listening' | 'processing';

interface UseCatalogConversationOptions {
  productId: string;
  selectedLanguage: SupportedLanguageCode;
  productImageUrl?: string | null;
  initialState?: Partial<ConversationState>;
}

const mergeState = (base: ConversationState, response: CatalogConversationResponse): ConversationState => {
  const merged: ConversationState = {
    ...base,
    ...response.extractedFields,
    confidence: {
      ...base.confidence,
      ...response.confidence,
    },
    missingRequiredFields: response.missingRequiredFields,
    conversationComplete: response.conversationComplete,
    completedFields: base.completedFields,
  };

  const completed = new Set<string>();
  const fields: Array<keyof ConversationState> = [
    'productName',
    'category',
    'material',
    'description',
    'quantity',
    'color',
    'dimensions',
    'weight',
    'craftsmanship',
    'origin',
    'careInstructions',
    'customization',
    'materialCost',
    'labourDays',
  ];

  fields.forEach((field) => {
    const value = merged[field];
    if (value !== null && value !== undefined && `${value}`.trim() !== '') {
      completed.add(field);
    }
  });

  merged.completedFields = Array.from(completed);
  return merged;
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export const useCatalogConversation = ({
  productId,
  selectedLanguage,
  productImageUrl,
  initialState,
}: UseCatalogConversationOptions) => {
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [assistantMessage, setAssistantMessage] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [error, setError] = useState('');
  const [listing, setListing] = useState<GeneratedListing | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [conversationState, setConversationState] = useState<ConversationState>({
    ...createInitialConversationState(),
    ...initialState,
    confidence: {
      ...createInitialConversationState().confidence,
      ...(initialState?.confidence || {}),
    },
  });

  const submitTurn = useCallback(
    async (payload: { audioBlob?: Blob; durationSec?: number; textInput?: string; skipCurrentQuestion?: boolean }) => {
      try {
        setError('');
        setRecordingStatus('processing');

        const requestPayload: CatalogConversationRequest = {
          productId,
          selectedLanguage,
          productImageUrl: productImageUrl || undefined,
          conversationState,
          skipCurrentQuestion: payload.skipCurrentQuestion,
        };

        if (payload.audioBlob) {
          requestPayload.audioBase64 = await blobToBase64(payload.audioBlob);
          requestPayload.audioMimeType = payload.audioBlob.type || 'audio/webm';
          requestPayload.audioDurationSec = payload.durationSec;
        }

        if (payload.textInput && payload.textInput.trim().length > 0) {
          requestPayload.textInput = payload.textInput.trim();
        }

        const response = await CatalogConversationService.sendTurn(requestPayload);

        setLastTranscript(response.transcript || '');
        setAssistantMessage(response.assistantMessage || '');
        setListing(response.listing || null);
        setConversationState((prev) => mergeState(prev, response));
        if (response.audioBase64) {
          const audioBytes = Uint8Array.from(atob(response.audioBase64), (character) => character.charCodeAt(0));
          const audio = new Audio(URL.createObjectURL(new Blob([audioBytes], { type: response.audioMimeType || 'audio/mpeg' })));
          audioRef.current?.pause();
          audioRef.current = audio;
          audio.play().catch(() => undefined);
        }
        setRecordingStatus('idle');
        return response;
      } catch (err) {
        setRecordingStatus('idle');
        setError(err instanceof Error ? err.message : 'Unable to process your response. Please try again.');
        throw err;
      }
    },
    [conversationState, productId, productImageUrl, selectedLanguage]
  );

  const setListening = useCallback(() => {
    setError('');
    setRecordingStatus('listening');
  }, []);

  const resetToIdle = useCallback(() => {
    setRecordingStatus('idle');
  }, []);

  const progress = useMemo(() => {
    const required = ['productName', 'category', 'material', 'description', 'quantity'];
    const done = required.filter((field) => !conversationState.missingRequiredFields.includes(field)).length;
    return { done, total: required.length };
  }, [conversationState.missingRequiredFields]);

  return {
    recordingStatus,
    assistantMessage,
    lastTranscript,
    error,
    listing,
    progress,
    conversationState,
    submitTurn,
    setListening,
    resetToIdle,
  };
};
