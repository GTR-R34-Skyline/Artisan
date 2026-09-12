import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Edit3, Loader2, Mic, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ArrowButton, Button, Eyebrow, Field } from './DesignSystem';
import { useAuth } from '../auth/useAuthHook';
import { isVendorDashboardReady } from '../auth/vendorDashboardAccess';
import { supabase } from '../lib/supabase';
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
import { SUPPORTED_LANGUAGES } from '../utils/languages';

type OnboardingStatus = 'language_selection' | 'idle' | 'listening' | 'processing' | 'asking_followup' | 'review' | 'submitted' | 'manual';
const MAX_RECORDING_SECONDS = 45;

const mergeProfileState = (state: ArtisanProfileState, response: ProfileConversationResponse, language: SupportedLanguageCode): ArtisanProfileState => {
  const next = {
    ...state,
    ...(Object.fromEntries(
      Object.entries(response.extractedFields).filter(([, value]) =>
        (typeof value === 'string' && value.trim().length > 0)
        || (typeof value === 'number' && Number.isFinite(value))),
    ) as Partial<ArtisanProfileState>),
    skills: response.extractedFields.skills?.length ? response.extractedFields.skills : state.skills,
    materials: response.extractedFields.materials?.length ? response.extractedFields.materials : state.materials,
    specialties: response.extractedFields.specialties?.length ? response.extractedFields.specialties : state.specialties,
    products: response.extractedFields.products?.length ? response.extractedFields.products : state.products,
    productionMethods: response.extractedFields.productionMethods?.length ? response.extractedFields.productionMethods : state.productionMethods,
    languagesSpoken: Array.from(new Set([...(state.languagesSpoken || []), ...(response.extractedFields.languagesSpoken || []), language])),
    confidence: { ...state.confidence, ...response.confidence },
    missingRequiredFields: response.missingRequiredFields,
    conversationComplete: response.conversationComplete,
  };
  next.completedFields = ['name', 'location', 'craft', 'experienceYears', 'story'].filter((field) => !next.missingRequiredFields.includes(field));
  return next;
};

const profileFieldValue = (value: string | number | string[] | null | undefined) => {
  if (Array.isArray(value)) return value.join(', ');
  return value === null || value === undefined ? '' : String(value);
};

const VendorOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, fetchProfile } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguageCode | null>(() => {
    const stored = sessionStorage.getItem('artisan_onboarding_language');
    return stored && SUPPORTED_LANGUAGES.map((language) => language.code).includes(stored as SupportedLanguageCode) ? stored as SupportedLanguageCode : null;
  });
  const [profileState, setProfileState] = useState<ArtisanProfileState>(() => createInitialProfileState());
  const [status, setStatus] = useState<OnboardingStatus>(() => (sessionStorage.getItem('artisan_onboarding_language') ? 'idle' : 'language_selection'));
  const [assistantMessage, setAssistantMessage] = useState('Welcome. Let’s get your craft online. Tell us about yourself.');
  const [lastTranscript, setLastTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [manualResponse, setManualResponse] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const hydratedRef = useRef(false);
  const sttRef = useRef<ReturnType<typeof createProfileVoiceStt> | null>(null);
  const turnGenerationRef = useRef(0);
  const stopInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioPlayerRef = useRef(new ProgressiveAudioPlayer());
  const turnMachineRef = useRef(new VoiceTurnMachine());

  useEffect(() => {
    startProfileVoicePipeline();
  }, []);

  useEffect(() => {
    if (!profile || hydratedRef.current) return;
    hydratedRef.current = true;
    setProfileState((state) => ({
      ...state,
      name: profile.full_name || state.name,
      location: profile.location_state || state.location,
      languagesSpoken: profile.preferred_language ? [profile.preferred_language] : state.languagesSpoken,
    }));
  }, [profile]);

  useEffect(() => {
    if (!profile) return undefined;

    let cancelled = false;
    void isVendorDashboardReady(profile, user?.email).then((ready) => {
      if (!cancelled && ready) navigate('/vendor/dashboard', { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate, profile, user?.email]);

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
          onAssistantText: (text) => setAssistantMessage(text),
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

      const nextState = mergeProfileState(profileState, response, language);
      setProfileState(nextState);
      setLastTranscript(response.transcript || payload.transcript?.trim() || '');
      setInterimTranscript('');
      setAssistantMessage(response.assistantMessage || assistantMessage);
      if (response.emptyTranscript) {
        turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'empty_transcript' });
        setStatus('idle');
        return;
      }
      if (response.errorMessage) {
        turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'error' });
        setStatus('manual');
        setShowManual(true);
        setError(response.errorMessage);
      } else {
        setStatus('processing');
      }
      sessionStorage.setItem('artisan_onboarding_state', JSON.stringify(nextState));
      if (turnMachineRef.current.current === 'PROCESSING' && audioPlayerRef.current.isBusy()) {
        turnMachineRef.current.set('AI_SPEAKING', { clientTurnId, turnGeneration });
      }
      await audioPlayerRef.current.waitForIdle(turnGeneration);
      if (turnGeneration !== turnGenerationRef.current) return;
      if (response.errorMessage) {
        // already waiting in manual
      } else if (response.conversationComplete) {
        turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'review' });
        setStatus('review');
      } else {
        turnMachineRef.current.set('WAITING_FOR_USER', { clientTurnId, turnGeneration });
        setStatus('asking_followup');
      }
      timer.mark('turn_complete');
    } catch (conversationError) {
      if (turnGeneration !== turnGenerationRef.current) return;
      turnMachineRef.current.set('WAITING_FOR_USER', { reason: 'exception' });
      setStatus('manual');
      setShowManual(true);
      setError(conversationError instanceof Error ? conversationError.message : 'We could not understand that. You can type your answer instead.');
    } finally {
      if (abortControllerRef.current === abortController) abortControllerRef.current = null;
    }
  }, [assistantMessage, profileState]);

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
      setError('Voice recording is unavailable in this browser. You can continue by typing below.');
      return;
    }
    setInterimTranscript('');
    setLastTranscript('');
    try {
      sttRef.current?.abort();
      sttRef.current = null;
      startedAtRef.current = Date.now();
      turnMachineRef.current.set('LISTENING', { language });
      const stt = createProfileVoiceStt(
        language,
        ({ finalized, interim }) => {
          setLastTranscript(finalized);
          setInterimTranscript(interim);
        },
        (message) => setError(message),
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

  const chooseLanguage = (language: SupportedLanguageCode) => {
    setSelectedLanguage(language);
    sessionStorage.setItem('artisan_onboarding_language', language);
    setProfileState((state) => ({ ...state, languagesSpoken: Array.from(new Set([...state.languagesSpoken, language])) }));
    setAssistantMessage('Tell us about yourself. You can speak naturally.');
    turnMachineRef.current.set('IDLE', { language });
    setStatus('idle');
  };

  const submitManual = () => {
    if (!selectedLanguage || !manualResponse.trim()) return;
    const response = manualResponse.trim();
    setManualResponse('');
    void submitTranscript({ transcript: response }, selectedLanguage);
  };

  const updateField = (field: keyof ArtisanProfileState, value: string) => {
    setProfileState((state) => {
      if (field === 'experienceYears') return { ...state, experienceYears: value ? Number(value) : null };
      if (field === 'skills' || field === 'materials' || field === 'specialties' || field === 'languagesSpoken') return { ...state, [field]: value.split(',').map((item) => item.trim()).filter(Boolean) };
      return { ...state, [field]: value || null };
    });
  };

  const approveAndSubmit = async () => {
    if (!user || !selectedLanguage || profileState.missingRequiredFields.length > 0) return;
    setSubmitting(true);
    setError('');
    try {
      const email = user.email || `${profile?.phone_number || user.phone || 'artisan'}@artisan.local`;
      const specialties = Array.from(new Set([...profileState.skills, ...profileState.specialties])).filter(Boolean);
      const { error: profileError } = await supabase.from('profiles').update({
        full_name: profileState.name,
        location_state: profileState.location,
        preferred_language: selectedLanguage,
      }).eq('id', user.id);
      if (profileError) throw profileError;
      const { error: vendorError } = await supabase.from('vendors').upsert([{
        id: user.id,
        craft_type: profileState.craft,
        verification_status: 'pending',
      }]);
      if (vendorError) throw vendorError;
      const { error: applicationError } = await supabase.from('vendor_applications').insert([{
        name: profileState.name,
        email,
        phone: profile?.phone_number || user.phone || '',
        service_type: 'marketplace',
        description: profileState.story,
        specialties,
        languages: profileState.languagesSpoken,
        experience_years: profileState.experienceYears,
        location: profileState.location,
        status: 'pending',
      }]);
      if (applicationError) throw applicationError;
      await fetchProfile(user.id);
      sessionStorage.removeItem('artisan_onboarding_state');
      setStatus('submitted');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not submit your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusCopy: Record<OnboardingStatus, string> = {
    language_selection: 'Choose a spoken language',
    idle: 'Ready when you are',
    listening: 'Listening…',
    processing: 'Understanding…',
    asking_followup: 'One more thing…',
    review: 'Your profile is ready to review.',
    submitted: 'Profile submitted',
    manual: 'Continue manually',
  };

  if (status === 'submitted') {
    return (
      <div className="success-panel mx-auto max-w-3xl border-y border-stone-300 py-20">
        <Eyebrow>Thank you</Eyebrow>
        <h1 className="mt-5 font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">Your story is ready.</h1>
        <p className="mt-6 max-w-md text-sm leading-7 text-stone-600">Your profile has been sent for review. You can begin preparing your first piece while we take a look.</p>
        <ArrowButton to="/vendor/wizard" className="mt-9">Create a piece</ArrowButton>
      </div>
    );
  }

  if (status === 'language_selection') {
    return (
      <div className="onboarding-page mx-auto grid max-w-4xl gap-12 py-12 lg:grid-cols-[0.65fr_1fr] lg:py-24">
        <div className="border-t border-stone-300 pt-7">
          <Eyebrow>Begin here</Eyebrow>
          <h1 className="mt-5 font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-7xl">Let’s make room for your voice.</h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-stone-600">The interface stays in English. Your spoken language guides the conversation.</p>
          <div className="mt-8">
            <LocalVoiceStatusNotice />
          </div>
        </div>
        <div className="border-y border-stone-300 py-7">
          <Eyebrow>One choice</Eyebrow>
          <h2 className="mt-4 font-display text-4xl">Which language would you like to speak?</h2>
          <div className="mt-10 border-t border-stone-300">
            {SUPPORTED_LANGUAGES.map((languageConfig) => {
              const language = languageConfig.code;
              return (
              <button key={language} type="button" onClick={() => chooseLanguage(language)} className="flex w-full items-center justify-between border-b border-stone-300 py-5 text-left text-sm text-stone-950 transition-colors hover:text-forest">
                <span>{languageConfig.displayName}</span>
                <ArrowRight className="h-4 w-4 text-stone-400" strokeWidth={1.5} />
              </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-page mx-auto max-w-6xl px-6 pb-28 pt-12 lg:px-10 lg:pt-20">
      <header className="workspace-header flex flex-col gap-8 border-b border-stone-300 pb-9 sm:flex-row sm:items-end sm:justify-between">
        <div><Eyebrow>Artisan introduction</Eyebrow><h1 className="mt-4 font-display text-6xl leading-[0.9] tracking-[-0.05em] sm:text-8xl">Tell us your story.</h1></div>
        <p className="max-w-xs text-sm leading-7 text-stone-600">Speak naturally. We will gather the details and leave the final word with you.</p>
      </header>

      <div className="grid gap-14 py-12 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
        <section>
          <div className="voice-panel border-y border-stone-300 py-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{statusCopy[status]}</p>
            <h2 className="mt-5 max-w-xl font-display text-4xl leading-tight text-stone-950">{assistantMessage}</h2>
            <div className="mt-6">
              <LocalVoiceStatusNotice />
            </div>
            <div className="mt-12 flex flex-col items-center border-y border-stone-300 py-10">
              <div className={`flex h-28 w-28 items-center justify-center border border-stone-950 ${status === 'listening' ? 'bg-forest text-white' : 'bg-stone-950 text-white'}`}>
                {status === 'processing' ? <Loader2 className="h-8 w-8 animate-spin" strokeWidth={1.25} /> : status === 'listening' ? <Square className="h-7 w-7" strokeWidth={1.25} /> : <Mic className="h-8 w-8" strokeWidth={1.25} />}
              </div>
              <p className="mt-5 text-sm text-stone-600">{status === 'listening' ? 'Tap stop when you are finished.' : status === 'processing' ? 'Your words are being shaped into profile notes.' : 'Tap to speak'}</p>
              {status !== 'processing' && <button type="button" onClick={() => status === 'listening' ? stopListeningAndSubmit() : void startListening()} className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950 underline decoration-stone-300 underline-offset-4">{status === 'listening' ? 'Stop listening' : 'Begin speaking'}</button>}
            </div>
            {(lastTranscript || interimTranscript) && <div className="border-b border-stone-300 py-5 text-sm leading-7 text-stone-700"><span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">You said</span>{lastTranscript} <span className="text-stone-400">{interimTranscript}</span></div>}
            {error && <p className="mt-6 border-l-2 border-amber-700 pl-4 text-sm leading-6 text-stone-700">{error}</p>}
            <div className="mt-7 flex flex-wrap gap-6">
              <button type="button" onClick={() => setShowManual((show) => !show)} className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 underline decoration-stone-300 underline-offset-4">Type instead</button>
              <button type="button" onClick={() => setStatus('language_selection')} className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 underline decoration-stone-300 underline-offset-4">Change language</button>
            </div>
            {showManual && <div className="mt-7 flex border-b border-stone-300 pb-2"><input value={manualResponse} onChange={(event) => setManualResponse(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitManual(); }} placeholder="Write your answer" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400" /><button type="button" onClick={submitManual} className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-950">Send</button></div>}
          </div>
        </section>

        <aside className="lg:pt-8">
          <div className="border-t border-stone-300 pt-7">
            <div className="flex items-start justify-between gap-4"><div><Eyebrow>Your profile</Eyebrow><h2 className="mt-3 font-display text-4xl">Taking shape.</h2></div><span className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{profileState.completedFields.length}/5</span></div>
            <div className="mt-8 border-y border-stone-300">
              {[
                ['Name', profileState.name],
                ['Location', profileState.location],
                ['Craft', profileState.craft],
                ['Experience', profileState.experienceYears ? `${profileState.experienceYears} years` : null],
                ['Specialities', profileState.specialties.length ? profileState.specialties : profileState.skills],
                ['Materials', profileState.materials],
                ['Story', profileState.story],
              ].map(([label, value]) => value ? <div key={label as string} className="border-b border-stone-200 py-4 last:border-0"><div className="flex items-center justify-between gap-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p><span className="text-[10px] text-forest">Captured · verify</span></div><p className="mt-2 text-sm leading-6 text-stone-950">{profileFieldValue(value)}</p></div> : null)}
              {!profileState.completedFields.length && <p className="py-8 text-sm leading-7 text-stone-500">Your details will appear here as you speak.</p>}
            </div>
          </div>
          {status === 'review' && (
            <div className="mt-10 border-t border-stone-300 pt-7">
              <p className="text-sm leading-7 text-stone-600">Here’s what we’ve understood. Review every detail before sending it.</p>
              {editing && <div className="mt-7 space-y-7"><Field label="Name" value={profileFieldValue(profileState.name)} onChange={(event) => updateField('name', event.target.value)} /><Field label="Location" value={profileFieldValue(profileState.location)} onChange={(event) => updateField('location', event.target.value)} /><Field label="Craft" value={profileFieldValue(profileState.craft)} onChange={(event) => updateField('craft', event.target.value)} /><Field label="Years of experience" value={profileFieldValue(profileState.experienceYears)} onChange={(event) => updateField('experienceYears', event.target.value)} type="number" /><Field label="Story" value={profileFieldValue(profileState.story)} onChange={(event) => updateField('story', event.target.value)} textarea /></div>}
              <div className="mt-7 flex flex-wrap gap-6"><Button variant="light" onClick={() => setEditing((value) => !value)}><Edit3 className="h-4 w-4" strokeWidth={1.5} /> {editing ? 'Done editing' : 'Edit'}</Button><Button disabled={submitting || editing || profileState.missingRequiredFields.length > 0} onClick={() => void approveAndSubmit()}>{submitting ? 'Submitting' : 'Approve & submit'} <Check className="h-4 w-4" strokeWidth={1.5} /></Button></div>
              <button type="button" onClick={() => { turnMachineRef.current.set('WAITING_FOR_USER'); setStatus('asking_followup'); void startListening(); }} className="mt-6 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 hover:text-stone-950">Continue speaking <Mic className="h-4 w-4" strokeWidth={1.5} /></button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export { VendorOnboarding };
