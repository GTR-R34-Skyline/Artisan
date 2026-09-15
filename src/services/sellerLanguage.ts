import { SupportedLanguageCode } from '../utils/languages';

export const LANGUAGE_DISPLAY_NAME: Record<SupportedLanguageCode, string> = {
  en: 'English',
  hi: 'Hindi',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
};

export const LANGUAGE_SCRIPT_NAME: Record<SupportedLanguageCode, string> = {
  en: 'Latin (English)',
  hi: 'Devanagari (Hindi)',
  bn: 'Bengali script',
  ta: 'Tamil script',
  te: 'Telugu script',
  kn: 'Kannada script',
};

/** True when the on-device SmolLM + English-only Piper cannot serve this language. */
export const requiresCloudLanguagePipeline = (language: SupportedLanguageCode | null | undefined): boolean =>
  Boolean(language && language !== 'en');

const READY_TO_REVIEW: Record<SupportedLanguageCode, string> = {
  en: 'Thank you. Your profile is ready to review.',
  hi: 'धन्यवाद। आपकी प्रोफ़ाइल समीक्षा के लिए तैयार है।',
  bn: 'ধন্যবাদ। আপনার প্রোফাইল পর্যালোচনার জন্য প্রস্তুত।',
  ta: 'நன்றி. உங்கள் சுயவிவரம் மதிப்பாய்வுக்கு தயாராக உள்ளது.',
  te: 'ధన్యవాదాలు. మీ ప్రొఫైల్ సమీక్షకు సిద్ధంగా ఉంది.',
  kn: 'ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ವಿಮರ್ಶೆಗೆ ಸಿದ್ಧವಾಗಿದೆ.',
};

const FIELD_LABELS: Record<SupportedLanguageCode, Record<string, string>> = {
  en: {
    name: 'name',
    email: 'email',
    phone: 'phone',
    location: 'location',
    craft: 'craft',
    experienceYears: 'years of experience',
    story: 'your story',
  },
  hi: {
    name: 'नाम',
    email: 'ईमेल',
    phone: 'फ़ोन',
    location: 'स्थान',
    craft: 'शिल्प',
    experienceYears: 'अनुभव के वर्ष',
    story: 'आपकी कहानी',
  },
  bn: {
    name: 'নাম',
    email: 'ইমেইল',
    phone: 'ফোন',
    location: 'অবস্থান',
    craft: 'কারুশিল্প',
    experienceYears: 'অভিজ্ঞতার বছর',
    story: 'আপনার গল্প',
  },
  ta: {
    name: 'பெயர்',
    email: 'மின்னஞ்சல்',
    phone: 'தொலைபேசி',
    location: 'இடம்',
    craft: 'கைவினை',
    experienceYears: 'அனுபவ ஆண்டுகள்',
    story: 'உங்கள் கதை',
  },
  te: {
    name: 'పేరు',
    email: 'ఇమెయిల్',
    phone: 'ఫోన్',
    location: 'స్థానం',
    craft: 'హస్తకళ',
    experienceYears: 'అనుభవ సంవత్సరాలు',
    story: 'మీ కథ',
  },
  kn: {
    name: 'ಹೆಸರು',
    email: 'ಇಮೇಲ್',
    phone: 'ಫೋನ್',
    location: 'ಸ್ಥಳ',
    craft: 'ಕರಕುಶಲ',
    experienceYears: 'ಅನುಭವದ ವರ್ಷಗಳು',
    story: 'ನಿಮ್ಮ ಕಥೆ',
  },
};

const SINGLE_FIELD_QUESTION: Record<SupportedLanguageCode, Record<string, string>> = {
  en: {
    name: 'What is your name?',
    email: 'What email should we use to reach you?',
    phone: 'What phone number should we use?',
    location: 'Where are you based?',
    craft: 'What craft do you practice?',
    experienceYears: 'How many years have you been practicing this craft?',
    story: 'Tell me a little about your work and how you came to it.',
  },
  hi: {
    name: 'आपका नाम क्या है?',
    email: 'हम आपसे किस ईमेल पर संपर्क करें?',
    phone: 'आपका फ़ोन नंबर क्या है?',
    location: 'आप कहाँ रहते या काम करते हैं?',
    craft: 'आप कौन सा शिल्प करते हैं?',
    experienceYears: 'आपको इस शिल्प का कितने वर्षों का अनुभव है?',
    story: 'अपने काम और अपनी यात्रा के बारे में थोड़ा बताइए।',
  },
  bn: {
    name: 'আপনার নাম কী?',
    email: 'আমরা কোন ইমেইলে আপনার সঙ্গে যোগাযোগ করব?',
    phone: 'আপনার ফোন নম্বর কী?',
    location: 'আপনি কোথায় থাকেন বা কাজ করেন?',
    craft: 'আপনি কোন কারুশিল্প করেন?',
    experienceYears: 'এই কাজে আপনার কত বছরের অভিজ্ঞতা?',
    story: 'আপনার কাজ এবং যাত্রা সম্পর্কে একটু বলুন।',
  },
  ta: {
    name: 'உங்கள் பெயர் என்ன?',
    email: 'உங்களை தொடர்பு கொள்ள எந்த மின்னஞ்சலைப் பயன்படுத்தலாம்?',
    phone: 'உங்கள் தொலைபேசி எண் என்ன?',
    location: 'நீங்கள் எங்கு இருக்கிறீர்கள்?',
    craft: 'நீங்கள் எந்த கைவினையைச் செய்கிறீர்கள்?',
    experienceYears: 'இந்த கைவினையில் உங்களுக்கு எத்தனை ஆண்டுகள் அனுபவம்?',
    story: 'உங்கள் வேலை மற்றும் பயணம் பற்றி சிறிது சொல்லுங்கள்.',
  },
  te: {
    name: 'మీ పేరు ఏమిటి?',
    email: 'మిమ్మల్ని సంప్రదించడానికి ఏ ఇమెయిల్ ఉపయోగించాలి?',
    phone: 'మీ ఫోన్ నంబర్ ఏమిటి?',
    location: 'మీరు ఎక్కడ ఉన్నారు?',
    craft: 'మీరు ఏ హస్తకళ చేస్తారు?',
    experienceYears: 'ఈ హస్తకళలో మీకు ఎన్ని సంవత్సరాల అనుభవం ఉంది?',
    story: 'మీ పని మరియు ప్రయాణం గురించి కొంచెం చెప్పండి.',
  },
  kn: {
    name: 'ನಿಮ್ಮ ಹೆಸರೇನು?',
    email: 'ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸಲು ಯಾವ ಇಮೇಲ್ ಬಳಸಬೇಕು?',
    phone: 'ನಿಮ್ಮ ಫೋನ್ ಸಂಖ್ಯೆ ಏನು?',
    location: 'ನೀವು ಎಲ್ಲಿ ಇದ್ದೀರಿ?',
    craft: 'ನೀವು ಯಾವ ಕರಕುಶಲ ಕೆಲಸ ಮಾಡುತ್ತೀರಿ?',
    experienceYears: 'ಈ ಕರಕುಶಲದಲ್ಲಿ ನಿಮಗೆ ಎಷ್ಟು ವರ್ಷಗಳ ಅನುಭವ?',
    story: 'ನಿಮ್ಮ ಕೆಲಸ ಮತ್ತು ಪ್ರಯಾಣದ ಬಗ್ಗೆ ಸ್ವಲ್ಪ ಹೇಳಿ.',
  },
};

export const localizedReadyToReview = (language: SupportedLanguageCode): string =>
  READY_TO_REVIEW[language] || READY_TO_REVIEW.en;

export const localizedMissingFieldsQuestion = (
  missing: string[],
  language: SupportedLanguageCode,
): string => {
  if (!missing.length) return localizedReadyToReview(language);
  const labels = FIELD_LABELS[language] || FIELD_LABELS.en;
  const singles = SINGLE_FIELD_QUESTION[language] || SINGLE_FIELD_QUESTION.en;

  if (missing.length === 1) {
    return singles[missing[0]] || singles.name;
  }

  const named = missing.map((field) => labels[field] || field);
  if (language === 'en') {
    if (named.length === 2) return `Please also share your ${named[0]} and ${named[1]}.`;
    return `Please also share your ${named.slice(0, -1).join(', ')}, and ${named[named.length - 1]}.`;
  }
  if (language === 'hi') {
    if (named.length === 2) return `कृपया अपना ${named[0]} और ${named[1]} भी बताइए।`;
    return `कृपया अपना ${named.slice(0, -1).join(', ')}, और ${named[named.length - 1]} भी बताइए।`;
  }
  if (language === 'bn') {
    if (named.length === 2) return `অনুগ্রহ করে আপনার ${named[0]} এবং ${named[1]}-ও জানান।`;
    return `অনুগ্রহ করে আপনার ${named.slice(0, -1).join(', ')}, এবং ${named[named.length - 1]}-ও জানান।`;
  }
  if (language === 'ta') {
    if (named.length === 2) return `தயவுசெய்து உங்கள் ${named[0]} மற்றும் ${named[1]}-ஐயும் பகிரவும்.`;
    return `தயவுசெய்து உங்கள் ${named.slice(0, -1).join(', ')}, மற்றும் ${named[named.length - 1]}-ஐயும் பகிரவும்.`;
  }
  if (language === 'te') {
    if (named.length === 2) return `దయచేసి మీ ${named[0]} మరియు ${named[1]} కూడా చెప్పండి.`;
    return `దయచేసి మీ ${named.slice(0, -1).join(', ')}, మరియు ${named[named.length - 1]} కూడా చెప్పండి.`;
  }
  if (named.length === 2) return `ದಯವಿಟ್ಟು ನಿಮ್ಮ ${named[0]} ಮತ್ತು ${named[1]} ಅನ್ನು ಕೂಡ ಹಂಚಿಕೊಳ್ಳಿ.`;
  return `ದಯವಿಟ್ಟು ನಿಮ್ಮ ${named.slice(0, -1).join(', ')}, ಮತ್ತು ${named[named.length - 1]} ಅನ್ನು ಕೂಡ ಹಂಚಿಕೊಳ್ಳಿ.`;
};

/** Build explicit LLM language instructions for the selected seller preference. */
export const buildLanguageSystemInstruction = (language: SupportedLanguageCode): string => {
  const name = LANGUAGE_DISPLAY_NAME[language];
  const script = LANGUAGE_SCRIPT_NAME[language];
  if (language === 'en') {
    return `The seller selected English (en). Understand the seller's message in English (including informal phrasing). Respond naturally in English.`;
  }
  return `The seller has selected ${name} (${language}).
Understand the seller's message regardless of whether ${name} is written in ${script} OR Latin/romanized transliteration OR mixed with English names/numbers.
Respond naturally in ${name} using ${script}. Prefer native script for the generated response text.
Do NOT respond in English unless the seller explicitly asks for English.
Do NOT transliterate an English sentence as the final response.
Do NOT send English text to speech — the spoken reply text itself must be in ${name}.`;
};
