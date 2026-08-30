import { CatalogConversationResult, ProductConversationState } from './schema.ts';
import { SupportedLanguageCode } from '../../_shared/languageConfig.ts';

const requiredFields: Array<keyof ProductConversationState> = ['productName', 'category', 'material', 'description', 'quantity'];
const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const materials = ['brass', 'clay', 'cotton', 'silk', 'wood', 'wool', 'linen', 'leather', 'bamboo', 'stone', 'terracotta', 'khadi', 'metal', 'glass'];
const categories: Array<[string, string]> = [
  ['jewell?ery|brass|metalwork', 'Jewellery & metalwork'],
  ['textile|weav|cotton|silk|saree|loom', 'Textiles & handloom'],
  ['pottery|clay|terracotta|ceramic', 'Pottery & ceramics'],
  ['wood|carv|bamboo|basket', 'Wood & natural materials'],
];

const numberFrom = (value: string): number | null => /^\d+$/.test(value) ? Number(value) : numberWords[value.toLowerCase()] ?? null;
const firstMatch = (text: string, pattern: RegExp): string | null => text.match(pattern)?.[1]?.trim() || null;

const nextQuestion = (missing: string[], language: SupportedLanguageCode): string => {
  const english: Record<string, string> = {
    productName: 'What should we call this piece?',
    category: 'What kind of craft or object is it?',
    material: 'What is it made from?',
    description: 'How did you make it, and what makes it special?',
    quantity: 'How many pieces are ready?',
  };
  const translations: Record<string, Partial<Record<SupportedLanguageCode, string>>> = {
    productName: { hi: 'इस वस्तु का नाम क्या रखें?', ta: 'இந்தப் பொருளை என்னவென்று அழைக்கலாம்?', te: 'ఈ వస్తువును ఏమని పిలవాలి?' },
    category: { hi: 'यह किस तरह का शिल्प या वस्तु है?', ta: 'இது எந்த வகையான கைவினை அல்லது பொருள்?', te: 'ఇది ఏ రకమైన చేతివృత్తి లేదా వస్తువు?' },
    material: { hi: 'यह किस चीज़ से बना है?', ta: 'இது எதனால் செய்யப்பட்டது?', te: 'ఇది దేనితో తయారు చేయబడింది?' },
    description: { hi: 'इसे आपने कैसे बनाया और इसकी खासियत क्या है?', ta: 'இதை எப்படி செய்தீர்கள், இதன் சிறப்பு என்ன?', te: 'దీన్ని ఎలా తయారు చేశారు, దీని ప్రత్యేకత ఏమిటి?' },
    quantity: { hi: 'कितने टुकड़े तैयार हैं?', ta: 'எத்தனை துண்டுகள் தயார்?', te: 'ఎన్ని ముక్కలు సిద్ధంగా ఉన్నాయి?' },
  };
  const field = missing[0] || 'description';
  return translations[field]?.[language] || english[field];
};

export const understandCatalogText = (
  transcript: string,
  current: ProductConversationState,
  selectedLanguage: SupportedLanguageCode,
  skipCurrentQuestion = false,
): CatalogConversationResult => {
  const text = transcript.trim();
  const lower = text.toLowerCase();
  const extracted: Partial<ProductConversationState> = {};
  const confidence: Record<string, number> = {};
  const productName = firstMatch(text, /(?:called|name is|this is|named)\s+([^.!?,;]+)/i);
  const material = materials.find((item) => lower.includes(item));
  const quantityMatch = lower.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:pieces?|items?|units?)/i);
  const category = categories.find(([pattern]) => new RegExp(pattern, 'i').test(lower))?.[1] || null;

  if (productName && !current.productName) { extracted.productName = productName; confidence.productName = 0.85; }
  if (material && !current.material) { extracted.material = material; confidence.material = 0.9; }
  if (quantityMatch && current.quantity === null) {
    const quantity = numberFrom(quantityMatch[1]);
    if (quantity !== null) { extracted.quantity = quantity; confidence.quantity = 0.95; }
  }
  if (category && !current.category) { extracted.category = category; confidence.category = 0.72; }
  if (!skipCurrentQuestion && text && !current.description) {
    extracted.description = text;
    confidence.description = 0.65;
  }

  const merged: ProductConversationState = {
    ...current,
    ...extracted,
    confidence: { ...current.confidence, ...confidence },
  };
  const missingRequiredFields = requiredFields.filter((field) => {
    const value = merged[field];
    return value === null || value === undefined || `${value}`.trim() === '';
  }).map(String);
  const conversationComplete = missingRequiredFields.length === 0;
  const assistantMessage = conversationComplete
    ? 'Thank you. Your piece is ready to review.'
    : nextQuestion(missingRequiredFields, selectedLanguage);
  const listing = conversationComplete ? {
    english: {
      title: merged.productName || 'Untitled piece',
      description: merged.description || '',
      careInstructions: merged.careInstructions || undefined,
    },
    hindi: {
      title: merged.productName || 'Untitled piece',
      description: merged.description || '',
      careInstructions: merged.careInstructions || undefined,
    },
  } : null;

  return {
    transcript: text,
    assistantMessage,
    conversationComplete,
    extractedFields: extracted,
    missingRequiredFields,
    confidence,
    listing,
  };
};
