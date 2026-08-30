import { transcribeWithDeepgram } from '../../_shared/voiceProviders.ts';
import { SupportedLanguageCode } from '../../_shared/languageConfig.ts';

export interface ProviderRoutingResult {
  transcript: string;
  transcriptionProvider: 'deepgram';
}

export const routeSpeechProcessing = async (input: {
  selectedLanguage: SupportedLanguageCode;
  audioBytes: Uint8Array;
  audioMimeType: string;
}): Promise<ProviderRoutingResult> => ({
  transcript: await transcribeWithDeepgram({
    audioBytes: input.audioBytes,
    mimeType: input.audioMimeType,
    selectedLanguage: input.selectedLanguage,
  }),
  transcriptionProvider: 'deepgram',
});
