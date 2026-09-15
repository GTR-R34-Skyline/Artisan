import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Edit3, Loader2, Mic, Square } from 'lucide-react';
import { Button, Eyebrow, Field } from './DesignSystem';
import ProfilePhotoUpload from './ProfilePhotoUpload';
import LanguagePreferenceButtons from './LanguagePreferenceButtons';
import { ProgressiveAudioPlayer } from '../services/progressiveAudioPlayback';
import { createProfileVoiceStt, sendProfileVoiceTurn, startProfileVoicePipeline } from '../services/profileVoicePipeline';
import { VoiceTurnTimer } from '../services/profileVoiceTiming';
import { VoiceTurnMachine } from '../services/voiceTurnMachine';
import { LocalVoiceStatusNotice } from './LocalVoiceStatusNotice';
import {
  ArtisanProfileState,
  createInitialProfileState,
  ProfileConversationRequest,
  ProfileConversationResponse,
} from '../types/profileConversation';
import { SupportedLanguageCode } from '../types/catalogConversation';
import { LANGUAGE_CONFIG } from '../utils/languages';
import { useLocale } from '../i18n/LocaleContext';
import {
  PUBLIC_ONBOARDING_FIELD_KEYS,
  buildOnboardingRequirementsMessage,
} from '../i18n/translations';

type VoiceStatus = 'language_selection' | 'idle' | 'listening' | 'processing' | 'review' | 'submitted' | 'manual';
const MAX_RECORDING_SECONDS = 45;
const REQUIRED_FIELDS: Array<keyof ArtisanProfileState> = ['name', 'email', 'phone', 'location', 'craft', 'experienceYears', 'story'];

const mergeProfileState = (
  state: ArtisanProfileState,
  response: ProfileConversationResponse,
  language: SupportedLanguageCode,
): ArtisanProfileState => {
  const next = {
    ...state,
    ...(Object.fromEntries(
      Object.entries(response.extractedFields).filter(([key, value]) =>
        key !== 'languagesSpoken'
        && key !== 'completedFields'
        && key !== 'missingRequiredFields'
        && key !== 'conversationComplete'
        && key !== 'confidence'
        && ((typeof value === 'string' && value.trim().length > 0)
          || (typeof value === 'number' && Number.isFinite(value)))),
    ) as Partial<ArtisanProfileState>),
    skills: response.extractedFields.skills?.length ? response.extractedFields.skills : state.skills,
    materials: response.extractedFields.materials?.length ? response.extractedFields.materials : state.materials,
    specialties: response.extractedFields.specialties?.length ? response.extractedFields.specialties : state.specialties,
    products: response.extractedFields.products?.length ? response.extractedFields.products : state.products,
    productionMethods: response.extractedFields.productionMethods?.length ? response.extractedFields.productionMethods : state.productionMethods,
    languagesSpoken: Array.from(new Set([
      ...(state.languagesSpoken || []),
      language,
    ])),
    confidence: { ...state.confidence, ...response.confidence },
    missingRequiredFields: response.missingRequiredFields,
    conversationComplete: response.conversationComplete,
  };
  // Counter is always the seven seller-information fields — never language.
  next.completedFields = REQUIRED_FIELDS.filter((field) => !next.missingRequiredFields.includes(field));
  next.missingRequiredFields = REQUIRED_FIELDS.filter((field) => next.missingRequiredFields.includes(field));
  next.conversationComplete = next.missingRequiredFields.length === 0;
  return next;
};

const displayValue = (value: string | number | string[] | null | undefined): string =>
  Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : String(value);
const hasValue = (value: string | number | string[] | null | undefined): boolean =>
  Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && String(value).length > 0;

interface VoiceProfileCaptureProps {
  onSubmit: (profile: ArtisanProfileState, language: SupportedLanguageCode, profileImageUrl?: string | null) => Promise<void>;
}

const VoiceProfileCapture: React.FC<VoiceProfileCaptureProps> = ({ onSubmit }) => {
  const { setLanguage, t } = useLocale();
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguageCode | null>(null);
  const [profileState, setProfileState] = useState<ArtisanProfileState>(() => createInitialProfileState(undefined, true));
  const [status, setStatus] = useState<VoiceStatus>('language_selection');
  const [assistantMessage, setAssistantMessage] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [manualResponse, setManualResponse] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const applicationOwnerKeyRef = useRef(crypto.randomUUID());
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const sttRef = useRef<ReturnType<typeof createProfileVoiceStt> | null>(null);
  const turnGenerationRef = useRef(0);
  const stopInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioPlayerRef = useRef(new ProgressiveAudioPlayer());
  const turnMachineRef = useRef(new VoiceTurnMachine());
  const profileStateRef = useRef(profileState);

  useEffect(() => {
    profileStateRef.current = profileState;
  }, [profileState]);

  useEffect(() => {
    startProfileVoicePipeline();
  }, []);

  useEffect(() => () => {
    sttRef.current?.abort();
    abortControllerRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    audioRef.current?.pause();
    audioPlayerRef.current.reset(turnGenerationRef.current + 1);
  }, []);

  const submitTranscript = useCallback(async (
    payload: { transcript?: string; preferClientTranscript?: boolean },
    language: SupportedLanguageCode,
  ) => {
    if (!payload.transcript?.trim()) return;

    const turnGeneration = turnGenerationRef.current + 1;
    turnGenerationRef.current = turnGeneration;
    const clientTurnId = crypto.randomUUID();
    const previousController = abortControllerRef.current;
    if (previousController) {
      console.info('[profile-voice] client_turn_superseded', {
        clientTurnId,
        turnGeneration,
        previousAborted: true,
      });
      previousController.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    audioPlayerRef.current.reset(turnGeneration);
    audioRef.current?.pause();
    sttRef.current?.abort();
    sttRef.current = null;
    startedRef.current = false;

    turnMachineRef.current.set('PROCESSING', { clientTurnId, turnGeneration });
    setStatus('processing');
    setError('');
    const timer = new VoiceTurnTimer();

    try {
      const request: ProfileConversationRequest = {
        selectedLanguage: language,
        profileState,
        publicApplication: true,
        stream: true,
        transcript: payload.transcript.trim(),
        preferClientTranscript: true,
        clientTurnId,
      };

      timer.mark('gemini_request_sent', { clientTurnId, turnGeneration });
      const response = await sendProfileVoiceTurn(
        request,
        {
          onTranscript: (transcript) => {
            setLastTranscript(transcript);
            setInterimTranscript('');
          },
          onAssistantText: () => undefined,
          onAudioChunk: (chunk) => {
            if (turnMachineRef.current.current === 'PROCESSING') {
              turnMachineRef.current.set('AI_SPEAKING', { clientTurnId, turnGeneration, index: chunk.index });
            }
            audioPlayerRef.current.enqueue(chunk.audioBase64, chunk.audioMimeType, chunk.index, turnGeneration);
          },
          onError: (message, stage) => {
            if (stage !== 'tts') setError(message);
          },
        },
        abortController.signal,
      );

      if (turnGeneration !== turnGenerationRef.current) return;

      audioPlayerRef.current.markStreamComplete(turnGeneration);

      const nextState = mergeProfileState(profileState, response, language);
      setProfileState(nextState);
      setLastTranscript(response.transcript || payload.transcript?.trim() || '');
      setInterimTranscript('');
      if (response.assistantMessage) {
        setAssistantMessage(response.assistantMessage);
      }
      if (response.emptyTranscript) {
        turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'empty_transcript' });
        setStatus('idle');
        return;
      }
      if (response.errorMessage) {
        setError(response.errorMessage);
        setShowManual(true);
        turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'error' });
        setStatus('manual');
      }
      if (!response.errorMessage) {
        setStatus(response.conversationComplete ? 'review' : 'processing');
      }
      if (turnMachineRef.current.current === 'PROCESSING' && audioPlayerRef.current.isBusy()) {
        turnMachineRef.current.set('AI_SPEAKING', { clientTurnId, turnGeneration });
      }
      await audioPlayerRef.current.waitForIdle(turnGeneration);
      if (turnGeneration !== turnGenerationRef.current) return;
      if (response.conversationComplete && !response.errorMessage) {
        turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'review' });
        setStatus('review');
      } else if (!response.errorMessage) {
        turnMachineRef.current.set('WAITING_FOR_USER', { clientTurnId, turnGeneration });
        setStatus('idle');
      }
      timer.mark('turn_complete');
    } catch (conversationError) {
      if (turnGeneration !== turnGenerationRef.current) return;
      turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'exception' });
      setStatus('manual');
      setShowManual(true);
      setError(conversationError instanceof Error ? conversationError.message : 'We could not understand that. You can type instead.');
    } finally {
      if (abortControllerRef.current === abortController) abortControllerRef.current = null;
    }
  }, [profileState]);

  const clearRecordingTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearRecording = useCallback(() => {
    sttRef.current?.abort();
    sttRef.current = null;
    clearRecordingTimer();
  }, [clearRecordingTimer]);

  const stopListeningAndSubmit = useCallback(async () => {
    if (stopInFlightRef.current) return;
    const stt = sttRef.current;
    if (!stt) return;

    stopInFlightRef.current = true;
    clearRecordingTimer();

    try {
      setStatus('processing');
      turnMachineRef.current.set('PROCESSING');
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const speechResult = await stt.stop();
      sttRef.current = null;
      startedRef.current = false;
      turnMachineRef.current.logFinalTranscript(speechResult.transcript);

      if (durationSec > MAX_RECORDING_SECONDS) {
        turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'too_long' });
        setStatus('idle');
        setError(`Please keep each response under ${MAX_RECORDING_SECONDS} seconds.`);
        return;
      }

      if (!speechResult.transcript.trim()) {
        turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'empty_transcript' });
        setStatus('idle');
        setError('We could not hear anything. Please try speaking again.');
        return;
      }

      if (selectedLanguage) {
        setLastTranscript(speechResult.transcript);
        setInterimTranscript('');
        void submitTranscript({ transcript: speechResult.transcript, preferClientTranscript: true }, selectedLanguage);
      }
    } finally {
      stopInFlightRef.current = false;
    }
  }, [clearRecordingTimer, selectedLanguage, submitTranscript]);

  const startListening = useCallback(async (language = selectedLanguage) => {
    if (!language) return;
    if (!turnMachineRef.current.canStartListening()) return;
    if (audioPlayerRef.current.isBusy() || turnMachineRef.current.isAiTurnActive()) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('manual');
      setShowManual(true);
      setError('Voice recognition is unavailable in this browser. You can continue by typing instead.');
      return;
    }
    try {
      sttRef.current?.abort();
      sttRef.current = null;
      setInterimTranscript('');
      setLastTranscript('');
      startedAtRef.current = Date.now();
      turnMachineRef.current.set('LISTENING', { language });

      const stt = createProfileVoiceStt(
        language,
        ({ finalized, interim }) => {
          setLastTranscript(finalized);
          setInterimTranscript(interim);
        },
        (message) => setError(message),
        { publicApplication: true },
      );
      sttRef.current = stt;
      await stt.start();
      if (turnMachineRef.current.current !== 'LISTENING') {
        stt.abort();
        sttRef.current = null;
        startedRef.current = false;
        return;
      }
      startedRef.current = true;
      setStatus('listening');

      timerRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        if (seconds >= MAX_RECORDING_SECONDS) {
          clearRecordingTimer();
          void stopListeningAndSubmit();
        }
      }, 250);
    } catch (recordingError) {
      clearRecording();
      turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'mic_error' });
      setStatus('manual');
      setShowManual(true);
      setError(recordingError instanceof Error ? recordingError.message : 'Microphone permission is required.');
    }
  }, [clearRecording, clearRecordingTimer, selectedLanguage, stopListeningAndSubmit]);

  const chooseLanguage = (language: SupportedLanguageCode, options: { preserveProfile?: boolean } = {}) => {
    setSelectedLanguage(language);
    setLanguage(language);
    if (!options.preserveProfile) {
      setProfileState(createInitialProfileState(language, true));
      setLastTranscript('');
      setInterimTranscript('');
      setAssistantMessage(buildOnboardingRequirementsMessage(language, PUBLIC_ONBOARDING_FIELD_KEYS));
      turnMachineRef.current.set('IDLE', { language });
      setStatus('idle');
      return;
    }
    setProfileState((state) => ({
      ...state,
      languagesSpoken: Array.from(new Set([language, ...state.languagesSpoken])),
    }));
    if (!profileStateRef.current.conversationComplete && profileStateRef.current.missingRequiredFields.length) {
      setAssistantMessage(buildOnboardingRequirementsMessage(language, profileStateRef.current.missingRequiredFields));
    } else if (!profileStateRef.current.conversationComplete && profileStateRef.current.completedFields.length === 0) {
      setAssistantMessage(buildOnboardingRequirementsMessage(language, PUBLIC_ONBOARDING_FIELD_KEYS));
    }
    turnMachineRef.current.set('IDLE', { language });
    if (status === 'language_selection') setStatus('idle');
  };

  const updateField = (field: keyof ArtisanProfileState, value: string) => {
    setProfileState((state) => {
      const nextValue = field === 'experienceYears' ? (value ? Number(value) : null) : value || null;
      const nextState = { ...state, [field]: nextValue } as ArtisanProfileState;
      if (field === 'skills' || field === 'materials' || field === 'specialties' || field === 'languagesSpoken') {
        return { ...state, [field]: value.split(',').map((item) => item.trim()).filter(Boolean) };
      }
      nextState.missingRequiredFields = REQUIRED_FIELDS.filter((requiredField) => {
        const requiredValue = nextState[requiredField];
        return requiredValue === null || requiredValue === undefined || requiredValue === '';
      }).map(String);
      nextState.completedFields = REQUIRED_FIELDS.filter((requiredField) => !nextState.missingRequiredFields.includes(requiredField));
      nextState.conversationComplete = nextState.missingRequiredFields.length === 0;
      return nextState;
    });
  };

  const submitManual = () => {
    if (!selectedLanguage || !manualResponse.trim()) return;
    const response = manualResponse.trim();
    setManualResponse('');
    void submitTranscript({ transcript: response }, selectedLanguage);
  };

  const submitProfile = async () => {
    if (!selectedLanguage || profileState.missingRequiredFields.length > 0 || editing) return;
    setSubmitError('');
    try {
      await onSubmit(profileState, selectedLanguage, profileImageUrl);
      setStatus('submitted');
    } catch (submissionError) {
      setSubmitError(submissionError instanceof Error ? submissionError.message : 'We could not submit your application. Please try again.');
    }
  };

  if (status === 'submitted') {
    return (
      <div className="success-panel mx-auto max-w-3xl border-y border-stone-300 py-20">
        <Eyebrow>{t('onboarding.applicationReceived')}</Eyebrow>
        <h1 className="mt-5 font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">{t('onboarding.onItsWay')}</h1>
        <p className="mt-6 max-w-md text-sm leading-7 text-stone-600">{t('onboarding.reviewSoon')}</p>
      </div>
    );
  }

  if (status === 'language_selection' || !selectedLanguage) {
    return (
      <div className="onboarding-page mx-auto grid max-w-5xl gap-14 py-10 lg:grid-cols-[0.7fr_1fr] lg:py-24">
        <div className="border-t border-stone-300 pt-7">
          <Eyebrow>{t('onboarding.joinEyebrow')}</Eyebrow>
          <h1 className="mt-5 max-w-md font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">{t('onboarding.makeRoom')}</h1>
          <p className="mt-7 max-w-sm text-sm leading-7 text-stone-600">{t('onboarding.languagePrompt')}</p>
          <div className="mt-8">
            <LocalVoiceStatusNotice />
          </div>
        </div>
        <div className="border-y border-stone-300 py-7">
          <Eyebrow>{t('onboarding.oneChoice')}</Eyebrow>
          <h2 className="mt-4 font-display text-4xl leading-none">{t('onboarding.whichLanguage')}</h2>
          <LanguagePreferenceButtons
            className="mt-10"
            label={t('onboarding.preferredLanguage')}
            selected={selectedLanguage}
            onSelect={(language) => chooseLanguage(language, {
              preserveProfile: profileState.completedFields.length > 0 || Boolean(profileState.name || profileState.story),
            })}
          />
        </div>
      </div>
    );
  }

  const statusLabel = status === 'listening'
    ? t('onboarding.listening')
    : status === 'processing'
      ? t('onboarding.understanding')
      : status === 'review'
        ? t('onboarding.readyReview')
        : t('onboarding.speakNaturally');
  const isListening = status === 'listening';

  return (
    <div className="onboarding-page mx-auto max-w-6xl pb-24 pt-10 lg:pt-20">
      <header className="workspace-header flex flex-col gap-5 border-b border-stone-300 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>{t('onboarding.voiceIntro')}</Eyebrow>
          <h1 className="mt-4 font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">{t('onboarding.tellStory')}</h1>
        </div>
        <p className="max-w-xs text-sm leading-7 text-stone-600">{t('onboarding.voiceDoesIntro')}</p>
      </header>

      <div className="grid gap-14 py-12 lg:grid-cols-[1fr_0.8fr] lg:gap-20">
        <section>
          <div className="voice-panel border-y border-stone-300 py-8">
            <div className="flex items-center justify-between">
              <Eyebrow>{statusLabel}</Eyebrow>
              <span className="text-[10px] uppercase tracking-[0.16em] text-stone-400">{LANGUAGE_CONFIG[selectedLanguage].displayName}</span>
            </div>
            <div className="mt-6 whitespace-pre-line border-l-2 border-forest/40 pl-4 text-sm leading-7 text-stone-700">
              {assistantMessage}
            </div>
            <div className="mt-6">
              <LocalVoiceStatusNotice />
            </div>
            <div className="mt-10 flex flex-col items-center border-y border-stone-300 py-14">
              <button
                type="button"
                aria-label={isListening ? 'Stop listening' : 'Start speaking'}
                onClick={() => (isListening ? stopListeningAndSubmit() : void startListening())}
                disabled={status === 'processing'}
                className={`relative flex h-40 w-40 items-center justify-center rounded-full border border-stone-950 transition-colors ${isListening ? 'bg-forest text-white' : 'bg-stone-950 text-white'} disabled:opacity-60`}
              >
                {status === 'processing' ? <Loader2 className="h-9 w-9 animate-spin" strokeWidth={1.25} /> : isListening ? <Square className="h-8 w-8" strokeWidth={1.25} /> : <Mic className="h-9 w-9" strokeWidth={1.25} />}
                {isListening && <span className="absolute inset-[-14px] rounded-full border border-forest/30" />}
              </button>
              <p className="mt-7 text-sm text-stone-600">{isListening ? t('onboarding.tapStop') : status === 'processing' ? t('onboarding.processingWords') : t('onboarding.tapSpeak')}</p>
            </div>
            {(lastTranscript || interimTranscript) && (
              <div className="border-b border-stone-300 py-5 text-sm leading-7 text-stone-700">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{t('onboarding.youSaid')}</span>
                {lastTranscript} <span className="text-stone-400">{interimTranscript}</span>
              </div>
            )}
            {error && <p className="mt-6 border-l-2 border-amber-700 pl-4 text-sm leading-6 text-stone-700">{error}</p>}
            <div className="mt-7 flex flex-wrap gap-6">
              <button type="button" onClick={() => setShowManual((value) => !value)} className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 underline decoration-stone-300 underline-offset-4">{t('onboarding.typeInstead')}</button>
              <button type="button" onClick={() => setStatus('language_selection')} className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 underline decoration-stone-300 underline-offset-4">{t('onboarding.changeLanguage')}</button>
            </div>
            <p className="mt-4 text-xs leading-6 text-stone-500">{t('onboarding.interfaceNote')}</p>
            {showManual && (
              <div className="mt-7 border-b border-stone-300 pb-2">
                <textarea value={manualResponse} onChange={(event) => setManualResponse(event.target.value)} placeholder="Write your answer here" rows={3} className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-stone-400" />
                <button type="button" onClick={submitManual} className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950">{t('onboarding.continue')}</button>
              </div>
            )}
          </div>
        </section>

        <aside className="lg:pt-8">
          <div className="border-t border-stone-300 pt-7">
            <div className="flex items-start justify-between gap-4">
              <div><Eyebrow>{t('onboarding.yourProfile')}</Eyebrow><h2 className="mt-3 font-display text-4xl">{t('onboarding.takingShape')}</h2></div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{profileState.completedFields.length}/{REQUIRED_FIELDS.length} {t('onboarding.captured')}</span>
            </div>
            <div className="mt-8 border-y border-stone-300">
              {[
                [t('onboarding.field.name'), profileState.name],
                [t('onboarding.field.email'), profileState.email],
                [t('onboarding.field.phone'), profileState.phone],
                [t('onboarding.field.location'), profileState.location],
                [t('onboarding.field.craft'), profileState.craft],
                [t('onboarding.field.experienceYears'), profileState.experienceYears ? `${profileState.experienceYears}` : null],
                [t('onboarding.field.story'), profileState.story],
              ].map(([label, value]) => hasValue(value) ? (
                <div key={label as string} className="border-b border-stone-200 py-4 last:border-0">
                  <div className="flex items-center justify-between gap-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p></div>
                  <p className="mt-2 text-sm leading-6 text-stone-950">{displayValue(value)}</p>
                </div>
              ) : null)}
              {!profileState.completedFields.length && <p className="py-8 text-sm leading-7 text-stone-500">{t('onboarding.intro.oneShot')}</p>}
            </div>
          </div>

          {status === 'review' && (
            <div className="mt-10 border-t border-stone-300 pt-7">
              <LanguagePreferenceButtons
                label={t('onboarding.preferredLanguage')}
                selected={selectedLanguage}
                onSelect={(language) => chooseLanguage(language, { preserveProfile: true })}
              />
              <div className="mt-8">
                <ProfilePhotoUpload
                  ownerKey={applicationOwnerKeyRef.current}
                  value={profileImageUrl}
                  onChange={setProfileImageUrl}
                />
              </div>
              {editing && (
                <div className="mt-7 space-y-7">
                  <Field label={t('onboarding.field.name')} value={displayValue(profileState.name)} onChange={(event) => updateField('name', event.target.value)} />
                  <Field label={t('onboarding.field.email')} value={displayValue(profileState.email)} onChange={(event) => updateField('email', event.target.value)} type="email" />
                  <Field label={t('onboarding.field.phone')} value={displayValue(profileState.phone)} onChange={(event) => updateField('phone', event.target.value)} type="tel" />
                  <Field label={t('onboarding.field.location')} value={displayValue(profileState.location)} onChange={(event) => updateField('location', event.target.value)} />
                  <Field label={t('onboarding.field.craft')} value={displayValue(profileState.craft)} onChange={(event) => updateField('craft', event.target.value)} />
                  <Field label={t('onboarding.field.experienceYears')} value={displayValue(profileState.experienceYears)} onChange={(event) => updateField('experienceYears', event.target.value)} type="number" />
                  <Field label={t('onboarding.field.story')} value={displayValue(profileState.story)} onChange={(event) => updateField('story', event.target.value)} textarea />
                </div>
              )}
              {submitError && <p className="mt-6 border-l-2 border-amber-700 pl-4 text-sm leading-6 text-stone-700">{submitError}</p>}
              <div className="mt-7 flex flex-wrap gap-4">
                <Button variant="light" onClick={() => setEditing((value) => !value)}><Edit3 className="h-4 w-4" strokeWidth={1.5} />{editing ? t('onboarding.doneEditing') : t('onboarding.edit')}</Button>
                <Button disabled={profileState.missingRequiredFields.length > 0 || editing} onClick={() => void submitProfile()}>{t('onboarding.approve')}<Check className="h-4 w-4" strokeWidth={1.5} /></Button>
              </div>
              <button type="button" onClick={() => { turnMachineRef.current.set('WAITING_FOR_USER'); setStatus('idle'); void startListening(); }} className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 underline decoration-stone-300 underline-offset-4">{t('onboarding.continue')}</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default VoiceProfileCapture;
