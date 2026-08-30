import React, { useMemo, useRef, useState } from 'react';
import { Check, Loader2, MessageSquare, Mic, RotateCcw, Send, SkipForward, Square } from 'lucide-react';
import { useCatalogConversation } from '../hooks/useCatalogConversation';
import { CatalogConversationResponse, ConversationState, GeneratedListing, SupportedLanguageCode } from '../types/catalogConversation';

interface ConversationalCatalogerProps {
  productId: string;
  selectedLanguage: SupportedLanguageCode;
  productImageUrl?: string | null;
  initialConversationState?: Partial<ConversationState>;
  initialAssistantMessage?: string;
  onConversationUpdate?: (state: ConversationState, listing: GeneratedListing | null) => void;
  onComplete?: (state: ConversationState, listing: GeneratedListing | null) => void;
}

const MAX_DURATION_SEC = 45;

export const ConversationalCataloger: React.FC<ConversationalCatalogerProps> = ({
  productId,
  selectedLanguage,
  productImageUrl,
  initialConversationState,
  initialAssistantMessage,
  onConversationUpdate,
  onComplete,
}) => {
  const [showTypeInput, setShowTypeInput] = useState(false);
  const [typedResponse, setTypedResponse] = useState('');
  const [localError, setLocalError] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
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
  } = useCatalogConversation({
    productId,
    selectedLanguage,
    productImageUrl,
    initialState: initialConversationState,
  });

  const currentAssistantMessage = assistantMessage || initialAssistantMessage || 'Tell us about your product.';
  const getNextConversationState = (response: CatalogConversationResponse): ConversationState => ({
    ...conversationState,
    ...response.extractedFields,
    confidence: { ...conversationState.confidence, ...response.confidence },
    missingRequiredFields: response.missingRequiredFields,
    conversationComplete: response.conversationComplete,
  });
  const recordingLabel = useMemo(() => {
    if (recordingStatus === 'processing') return 'Preparing your notes';
    if (recordingStatus === 'listening') return `Listening · ${recordingSeconds}s`;
    return 'Tap to speak';
  }, [recordingSeconds, recordingStatus]);

  const clearRecording = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecordingSeconds(0);
  };

  const startRecording = async () => {
    setLocalError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('Voice recording is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start();
      setListening();
      timerRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch (recordingError) {
      clearRecording();
      setLocalError(recordingError instanceof Error ? recordingError.message : 'Microphone permission is required.');
      resetToIdle();
    }
  };

  const stopRecordingAndSubmit = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = () => {
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      clearRecording();
      if (durationSec > MAX_DURATION_SEC) {
        setLocalError(`Please keep each response under ${MAX_DURATION_SEC} seconds.`);
        resetToIdle();
        return;
      }
      void submitTurn({ audioBlob, durationSec })
        .then((response) => {
          const nextState = getNextConversationState(response);
          onConversationUpdate?.(nextState, response.listing || null);
          if (response.conversationComplete) onComplete?.(nextState, response.listing || null);
        })
        .catch(() => undefined);
    };
    recorder.stop();
  };

  const submitText = () => {
    if (!typedResponse.trim()) return;
    void submitTurn({ textInput: typedResponse.trim() })
      .then((response) => {
        setTypedResponse('');
        const nextState = getNextConversationState(response);
        onConversationUpdate?.(nextState, response.listing || null);
        if (response.conversationComplete) onComplete?.(nextState, response.listing || null);
      })
      .catch(() => undefined);
  };

  const skipQuestion = () => {
    void submitTurn({ skipCurrentQuestion: true, textInput: 'skip' })
      .then((response) => {
        const nextState = getNextConversationState(response);
        onConversationUpdate?.(nextState, response.listing || null);
        if (response.conversationComplete) onComplete?.(nextState, response.listing || null);
      })
      .catch(() => undefined);
  };

  return (
    <div className="space-y-8">
      {productImageUrl && <img src={productImageUrl} alt="Product" className="aspect-[4/3] w-full object-cover" />}
      <div className="border-y border-stone-300 py-8">
        <div className="space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Catalog notes</p>
          <h3 className="max-w-xl font-display text-4xl leading-tight text-stone-950">{currentAssistantMessage}</h3>
        </div>
        <div className="mt-10 flex items-center gap-5">
          <button
            type="button"
            disabled={recordingStatus === 'processing'}
            onClick={recordingStatus === 'listening' ? stopRecordingAndSubmit : startRecording}
            className={`flex h-20 w-20 shrink-0 items-center justify-center border border-stone-950 transition-colors ${recordingStatus === 'listening' ? 'bg-forest text-white' : 'bg-stone-950 text-white hover:bg-forest'}`}
            aria-label={recordingStatus === 'listening' ? 'Stop recording' : 'Start recording'}
          >
            {recordingStatus === 'processing' ? <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.5} /> : recordingStatus === 'listening' ? <Square className="h-6 w-6" strokeWidth={1.5} /> : <Mic className="h-7 w-7" strokeWidth={1.5} />}
          </button>
          <div>
            <p className="text-sm font-medium text-stone-950">{recordingLabel}</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">Your audio is sent securely for catalog processing.</p>
          </div>
        </div>

        <div className="mt-8 h-px bg-stone-300">
          <div className="h-px bg-forest transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{progress.done} of {progress.total} essentials captured</p>

        {(lastTranscript || error || localError) && (
          <div className="mt-7 border-l-2 border-forest pl-4 text-sm leading-6 text-stone-700">
            {lastTranscript && <p>{lastTranscript}</p>}
            {(error || localError) && <p className="mt-2 text-red-700">{error || localError}</p>}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-5">
          <button type="button" onClick={() => setShowTypeInput((show) => !show)} className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 hover:text-stone-950">
            <MessageSquare className="h-4 w-4" strokeWidth={1.5} /> Type instead
          </button>
          <button type="button" disabled={recordingStatus === 'processing'} onClick={skipQuestion} className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 hover:text-stone-950">
            <SkipForward className="h-4 w-4" strokeWidth={1.5} /> Skip
          </button>
          <button type="button" disabled={recordingStatus === 'processing'} onClick={resetToIdle} className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 hover:text-stone-950">
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} /> Retry
          </button>
        </div>

        {showTypeInput && (
          <div className="mt-6 flex border-b border-stone-300 pb-2">
            <input
              value={typedResponse}
              onChange={(event) => setTypedResponse(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submitText(); }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
              placeholder="Write your response"
            />
            <button type="button" onClick={submitText} disabled={recordingStatus === 'processing'} className="text-stone-950">
              {recordingStatus === 'processing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={1.5} />}
            </button>
          </div>
        )}

        {conversationState.conversationComplete && (
          <p className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-forest"><Check className="h-4 w-4" strokeWidth={1.5} /> Essentials captured</p>
        )}
      </div>

      {listing && (
        <div className="border-t border-stone-300 pt-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Draft listing</p>
          <h4 className="mt-3 font-display text-3xl text-stone-950">{listing.english.title}</h4>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">{listing.english.description}</p>
        </div>
      )}
    </div>
  );
};
