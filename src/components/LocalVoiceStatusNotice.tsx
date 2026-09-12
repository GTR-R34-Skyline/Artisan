import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { getLocalVoiceStatus, subscribeLocalVoiceStatus } from '../services/localVoiceRuntime';
import { isLocalVoicePipelineEnabled } from '../services/profileVoicePipeline';

const ENGINES = [
  { key: 'stt' as const, label: 'STT', installed: 'Installed · Whisper' },
  { key: 'llm' as const, label: 'LLM', installed: 'Installed · SmolLM' },
  { key: 'tts' as const, label: 'TTS', installed: 'Installed · Piper' },
];

export const LocalVoiceStatusNotice: React.FC = () => {
  const [snapshot, setSnapshot] = useState(getLocalVoiceStatus);

  useEffect(() => {
    if (!isLocalVoicePipelineEnabled()) return undefined;
    return subscribeLocalVoiceStatus(setSnapshot);
  }, []);

  if (!isLocalVoicePipelineEnabled()) return null;

  const allReady = snapshot.ready.stt && snapshot.ready.llm && snapshot.ready.tts && !snapshot.failed;
  const heading = snapshot.failed
    ? 'On-device voice failed to install'
    : allReady
      ? 'STT, LLM, and TTS are installed'
      : 'Installing on-device STT, LLM, and TTS';

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-y border-stone-300 bg-[#f4f1ea] py-4"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{heading}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {ENGINES.map((engine) => {
          const isReady = snapshot.ready[engine.key];
          const detail = snapshot.failed && !isReady
            ? snapshot.failed.message
            : isReady
              ? engine.installed
              : snapshot.status[engine.key];
          return (
            <div key={engine.key} className="flex items-start gap-2 text-sm leading-6 text-stone-700">
              {isReady
                ? <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-forest" strokeWidth={1.75} />
                : <Loader2 className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin text-stone-400" strokeWidth={1.75} />}
              <p>
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{engine.label}</span>
                {detail}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
