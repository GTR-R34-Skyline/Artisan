export interface ProductData {
  title?: string;
  material?: string;
  raw_description?: string;
  quantity?: number;
  material_cost?: number;
  labour_days?: number;
}

type ConversationLanguage = 'en' | 'hi' | 'kn' | 'bn' | 'ta' | 'te';

export interface ConversationMessage {
  id: string;
  sender: 'ai' | 'vendor';
  text: string;
  timestamp: string;
  fieldBeingAsked?: keyof ProductData;
  isConfirmation?: boolean;
  suggestedValue?: ProductData[keyof ProductData];
}

// Translations for standard questions and confirmation prompts
const QUESTIONS = {
  welcome: {
    en: "Tell me about your product. (e.g., What is it? What is it made of? How much did materials cost? How long did it take to craft?)",
    hi: "मुझे अपने उत्पाद के बारे में बताएं। (जैसे, यह क्या है? यह किस सामग्री से बना है? सामग्री की लागत क्या थी? इसे बनाने में कितना समय लगा?)",
    kn: "ನಿಮ್ಮ ಉತ್ಪನ್ನದ ಬಗ್ಗೆ ನನಗೆ ತಿಳಿಸಿ. (ಉದಾ. ಇದು ಏನು? ಇದು ಯಾವ ವಸ್ತುವಿನಿಂದ ಮಾಡಲ್ಪಟ್ಟಿದೆ? ಕಚ್ಚಾ ಸಾಮಗ್ರಿಗಳ ಬೆಲೆ ಎಷ್ಟು? ತಯಾರಿಸಲು ಎಷ್ಟು ಸಮಯ ತೆಗೆದುಕೊಂಡಿತು?)",
    bn: "আপনার পণ্য সম্পর্কে আমাকে বলুন। (যেমন, এটি কী? এটি কী উপাদান দিয়ে তৈরি? কাঁচামালের খরচ কত ছিল? এটি তৈরি করতে কত সময় লেগেছে?)",
    ta: "உங்கள் தயாரிப்பைப் பற்றி என்னிடம் கூறுங்கள். (எ.கா., அது என்ன? அது எதனால் செய்யப்பட்டது? பொருட்களின் விலை என்ன? அதைச் செய்ய எவ்வளவு நேரம் எடுத்தது?)",
    te: "మీ ఉత్పత్తి గురించి నాకు చెప్పండి. (ఉదా. ఇది ఏమిటి? ఇది ఏ పదార్థంతో చేయబడింది? ముడి పదార్థాల ఖరీదు ఎంత? తయారు చేయడానికి ఎంత సమయం పట్టింది?)"
  },
  title: {
    en: "What is the name of your product?",
    hi: "आपके उत्पाद का नाम क्या है?",
    kn: "ನಿಮ್ಮ ಉತ್ಪನ್ನದ ಹೆಸರೇನು?",
    bn: "আপনার পণ্যের নাম কি?",
    ta: "உங்கள் தயாரிப்பின் பெயர் என்ன?",
    te: "మీ ఉత్పత్తి పేరు ఏమిటి?"
  },
  material: {
    en: "What material is it made of?",
    hi: "यह किस सामग्री से बना है?",
    kn: "ಇದು ಯಾವ ವಸ್ತುವಿನಿಂದ ಮಾಡಲ್ಪಟ್ಟಿದೆ?",
    bn: "এটি কি উপাদান দিয়ে তৈরি?",
    ta: "இது என்ன பொருளால் செய்யப்பட்டுள்ளது?",
    te: "ఇది ఏ పదార్థంతో చేయబడింది?"
  },
  raw_description: {
    en: "Can you briefly describe how you crafted it?",
    hi: "वर्णन करें कि आपने इसे कैसे बनाया?",
    kn: "ನೀವು ಅದನ್ನು ಹೇಗೆ ತಯಾರಿಸಿದ್ದೀರಿ ಎಂಬುದನ್ನು ಸಂಕ್ಷಿಪ್ತವಾಗಿ ವಿವರಿಸಬಹುದೇ?",
    bn: "আপনি এটি কিভাবে তৈরি করেছেন তা সংক্ষেপে বর্ণনা করতে পারেন?",
    ta: "அதை நீங்கள் எவ்வாறு தயாரித்தீர்கள் என்பதை சுருக்கமாக விவரிக்க முடியுமா?",
    te: "మీరు దానిని ఎలా తయారు చేసారో క్లుప్తంగా వివరించగలరా?"
  },
  quantity: {
    en: "How many pieces do you have ready?",
    hi: "आपके पास कितने पीस तैयार हैं?",
    kn: "ನಿಮ್ಮ ಬಳಿ ಎಷ್ಟು ತುಣುಕುಗಳು ಸಿದ್ಧವಾಗಿವೆ?",
    bn: "আপনার কাছে কত পিস প্রস্তুত আছে?",
    ta: "உங்களிடம் எத்தனை துண்டுகள் தயாராக உள்ளன?",
    te: "మీ వద్ద ఎన్ని ముక్కలు సిద్ధంగా ఉన్నాయి?"
  },
  material_cost: {
    en: "How much did the raw materials cost in total (₹)?",
    hi: "कच्चे माल की कुल लागत (₹) कितनी थी?",
    kn: "ಕಚ್ಚಾ ವಸ್ತುಗಳ ಒಟ್ಟು ವೆಚ್ಚ (₹) ಎಷ್ಟು?",
    bn: "কাঁচামালের মোট খরচ (₹) কত ছিল?",
    ta: "மூலப்பொருட்களின் மொத்த செலவு (₹) எவ்வளவு?",
    te: "ముడి పదార్థాల మొత్తం ఖరీదు (₹) ఎంత?"
  },
  labour_days: {
    en: "How many days did it take to make/craft it?",
    hi: "इसे बनाने में कितने दिन लगे?",
    kn: "ಇದನ್ನು ತಯಾರಿಸಲು ಎಷ್ಟು ದಿನಗಳು ಬೇಕಾಯಿತು?",
    bn: "এটি তৈরি করতে কত দিন লেগেছে?",
    ta: "அதை தயாரிக்க எத்தனை நாட்கள் ஆனது?",
    te: "దీనిని తయారు చేయడానికి ఎన్ని రోజులు పట్టింది?"
  }
};

const CONFIRMATIONS = {
  title: {
    en: 'I heard that this product is named "{value}". Is that correct?',
    hi: 'मैंने सुना कि इस उत्पाद का नाम "{value}" है। क्या यह सही है?',
    kn: 'ಈ ಉತ್ಪನ್ನದ ಹೆಸರು "{value}" ಎಂದು ನಾನು ಕೇಳಿದೆ. ಇದು ಸರಿಯೇ?',
    bn: 'আমি শুনলাম এই পণ্যটির নাম "{value}"। এটি কি সঠিক?',
    ta: 'இந்த தயாரிப்பின் பெயர் "{value}" என்று கேள்விப்பட்டேன். அது சரியா?',
    te: 'ఈ ఉత్పత్తి పేరు "{value}" అని నేను విన్నాను. ఇది సరైనదేనా?'
  },
  material: {
    en: 'I heard that the material is "{value}". Is that correct?',
    hi: 'मैंने सुना कि सामग्री "{value}" है। क्या यह सही है?',
    kn: 'ಬಳಸಿದ ವಸ್ತು "{value}" ಎಂದು ನಾನು ಕೇಳಿದೆ. ಇದು ಸರಿಯೇ?',
    bn: 'আমি শুনলাম উপাদানটি "{value}"। এটি কি সঠিক?',
    ta: 'பொருள் "{value}" என்று கேள்விப்பட்டேன். அது சரியா?',
    te: 'உపయోగించిన పదార్థం "{value}" అని నేను విన్నాను. ఇది సరైనదేనా?'
  },
  quantity: {
    en: 'I heard that you have {value} pieces. Is that correct?',
    hi: 'मैंने सुना कि आपके पास {value} पीस हैं। क्या यह सही है?',
    kn: 'ನಿಮ್ಮ ಬಳಿ {value} ತುಣುಕುಗಳು ಇವೆ ಎಂದು ನಾನು ಕೇಳಿದೆ. ಇದು ಸರಿಯೇ?',
    bn: 'আমি শুনলাম আপনার কাছে {value} পিস আছে। এটি কি সঠিক?',
    ta: 'உங்களிடம் {value} துண்டுகள் உள்ளன என்று கேள்விப்பட்டேன். அது சரியா?',
    te: 'మీ వద్ద {value} ముక్కలు ఉన్నాయని నేను విన్నాను. ఇది సరైనదేనా?'
  },
  material_cost: {
    en: 'I heard that the materials cost ₹{value}. Is that correct?',
    hi: 'मैंने सुना कि सामग्री की लागत ₹{value} है। क्या यह सही है?',
    kn: 'ಕಚ್ಚಾ ವಸ್ತುಗಳ ವೆಚ್ಚ ₹{value} ಎಂದು ನಾನು ಕೇಳಿದೆ. ಇದು ಸರಿಯೇ?',
    bn: 'আমি শুনলাম কাঁচামালের খরচ ₹{value}। এটি কি সঠিক?',
    ta: 'பொருட்களின் விலை ₹{value} என்று கேள்விப்பட்டேன். அது சரியா?',
    te: 'ముడి పదార్థాల ఖరీదు ₹{value} అని నేను విన్నాను. ఇది సరైనదేనా?'
  },
  labour_days: {
    en: 'I heard that it took {value} days to make. Is that correct?',
    hi: 'मैंने सुना कि इसे बनाने में {value} दिन लगे। क्या यह सही है?',
    kn: 'ಇದನ್ನು ತಯಾರಿಸಲು {value} ದಿನಗಳು ಬೇಕಾಯಿತು ಎಂದು ನಾನು ಕೇಳಿದೆ. ಇದು ಸರಿಯೇ?',
    bn: 'আমি শুনলাম এটি তৈরি করতে {value} दिन লেগেছে। এটি কি সঠিক?',
    ta: 'அதை தயாரிக்க {value} நாட்கள் ஆனது என்று கேள்விப்பட்டேன். அது சரியா?',
    te: 'దీనిని తయారు చేయడానికి {value} రోజులు పట్టిందని నేను విన్నాను. ఇది సరైనదేనా?'
  }
};

// Word-to-number mapping for low-digital-literacy users speaking numbers
const WORD_NUMBERS: { [key: string]: number } = {
  one: 1, ek: 1, 'एक': 1, 'ಒಂದು': 1, 'একটি': 1, 'ஒன்று': 1, 'ఒకటి': 1,
  two: 2, do: 2, 'दो': 2, 'ಎರಡು': 2, 'দুটি': 2, 'இரண்டு': 2, 'రెండు': 2,
  three: 3, teen: 3, 'तीन': 3, 'ಮೂರು': 3, 'তিনটি': 3, 'மூன்று': 3, 'మూడు': 3,
  four: 4, chaar: 4, 'चार': 4, 'ನಾಲ್ಕು': 4, 'চারটি': 4, 'நான்கு': 4, 'నాలుగు': 4,
  five: 5, paanch: 5, 'पांच': 5, 'ಐದು': 5, 'পাঁচটি': 5, 'ஐந்து': 5, 'ఐదు': 5,
  six: 6, chhah: 6, 'छह': 6, 'ಆರು': 6, 'ছয়': 6, 'ஆறு': 6, 'ఆరు': 6,
  seven: 7, saat: 7, 'सात': 7, 'ಏಳು': 7, 'ಸাতটি': 7, 'ஏழு': 7, 'ఏడు': 7,
  eight: 8, aath: 8, 'आठ': 8, 'ಎಂಟು': 8, 'ಆಟಟ್ಟಿ': 8, 'எட்டு': 8, 'ఎనిమిది': 8,
  nine: 9, nau: 9, 'नौ': 9, 'ಒಂಬತ್ತು': 9, 'নয়টি': 9, 'ஒன்பது': 9, 'తొమ్మిది': 9,
  ten: 10, das: 10, 'दस': 10, 'ಹತ್ತು': 10, 'দশটি': 10, 'பத்து': 10, 'పది': 10
};

function parseNumber(text: string): number | null {
  const clean = text.toLowerCase().trim();
  
  // Direct word match
  if (WORD_NUMBERS[clean] !== undefined) {
    return WORD_NUMBERS[clean];
  }

  // Regex extract digits
  const match = clean.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }

  // Search words inside string
  for (const word of Object.keys(WORD_NUMBERS)) {
    if (clean.includes(word)) {
      return WORD_NUMBERS[word];
    }
  }

  return null;
}

export const ProductExtractionService = {
  extract: (text: string, currentData: ProductData, fieldBeingAsked?: keyof ProductData): ProductData => {
    const updated = { ...currentData };
    const cleanText = text.toLowerCase().trim();

    // If we are specifically asking for a field, try to extract that first
    if (fieldBeingAsked) {
      if (fieldBeingAsked === 'quantity') {
        const val = parseNumber(cleanText);
        if (val !== null) {
          updated.quantity = val;
          return updated;
        }
      }
      if (fieldBeingAsked === 'material_cost') {
        const val = parseNumber(cleanText);
        if (val !== null) {
          updated.material_cost = val;
          return updated;
        }
      }
      if (fieldBeingAsked === 'labour_days') {
        const val = parseNumber(cleanText);
        if (val !== null) {
          updated.labour_days = val;
          return updated;
        }
      }
      if (fieldBeingAsked === 'title') {
        updated.title = text.trim();
        return updated;
      }
      if (fieldBeingAsked === 'material') {
        updated.material = text.trim();
        return updated;
      }
      if (fieldBeingAsked === 'raw_description') {
        updated.raw_description = text.trim();
        return updated;
      }
    }

    // General parsing of conversational text block
    // 1. Material detection
    const materials = ['cotton', 'silk', 'clay', 'terracotta', 'wood', 'brass', 'wool', 'linen', 'khadi', 'leather', 'stone', 'bamboo'];
    for (const m of materials) {
      if (cleanText.includes(m)) {
        updated.material = m.charAt(0).toUpperCase() + m.slice(1);
        break;
      }
    }

    // 2. Quantity extraction (e.g. "three pieces", "have 5 pcs", "quantity is 2")
    const qtyMatch = cleanText.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:pieces|piece|pcs|units|units|qty|quantity|saree|sarees|pots|pot|items)/);
    if (qtyMatch) {
      const parsed = parseNumber(qtyMatch[1]);
      if (parsed !== null) updated.quantity = parsed;
    }

    // 3. Cost extraction (e.g. "cost around 700 rupees", "700 rupees", "₹ 700")
    const costMatch = cleanText.match(/(?:cost|price|rupees|rs\.?|₹|around)\s*(\d+)/) || cleanText.match(/(\d+)\s*(?:rupees|rs\.?|₹)/);
    if (costMatch) {
      updated.material_cost = parseInt(costMatch[1], 10);
    }

    // 4. Labor days extraction (e.g. "took me five days", "5 days", "days: 4")
    const daysMatch = cleanText.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|day|days spent|labor days|days of labor)/);
    if (daysMatch) {
      const parsed = parseNumber(daysMatch[1]);
      if (parsed !== null) updated.labour_days = parsed;
    }

    // 5. Title & Description fallback
    if (!updated.raw_description) {
      updated.raw_description = text;
    } else {
      updated.raw_description += `\n${text}`;
    }

    // Guess a name / title if not set
    if (!updated.title) {
      const titleMatch = text.match(/(?:this is a|i made a)\s+([a-zA-Z\s]+)(?:\.|\s+using|\s+it)/i);
      if (titleMatch && titleMatch[1]) {
        updated.title = titleMatch[1].trim().split(' ').slice(0, 4).join(' ');
      } else {
        // Fallback to first few words
        updated.title = text.split(' ').slice(0, 3).join(' ');
      }
    }

    return updated;
  }
};

export const ConversationService = {
  getWelcomeMessage: (lang: string): string => {
    return QUESTIONS.welcome[lang as ConversationLanguage] || QUESTIONS.welcome.en;
  },

  getNextStep: (data: ProductData, preferredLang: string): { 
    question: string; 
    field?: keyof ProductData; 
    type: 'question' | 'confirmation' | 'completed';
    suggestedValue?: ProductData[keyof ProductData];
  } => {
    const lang = preferredLang as ConversationLanguage;

    // Check name
    if (!data.title || data.title.trim().length === 0) {
      return {
        question: QUESTIONS.title[lang] || QUESTIONS.title['en'],
        field: 'title',
        type: 'question'
      };
    }

    // Check material
    if (!data.material || data.material.trim().length === 0) {
      return {
        question: QUESTIONS.material[lang] || QUESTIONS.material['en'],
        field: 'material',
        type: 'question'
      };
    }

    // Check description
    if (!data.raw_description || data.raw_description.trim().length === 0) {
      return {
        question: QUESTIONS.raw_description[lang] || QUESTIONS.raw_description['en'],
        field: 'raw_description',
        type: 'question'
      };
    }

    // Check quantity
    if (data.quantity === undefined || data.quantity === null) {
      return {
        question: QUESTIONS.quantity[lang] || QUESTIONS.quantity['en'],
        field: 'quantity',
        type: 'question'
      };
    }

    // Check cost
    if (data.material_cost === undefined || data.material_cost === null) {
      return {
        question: QUESTIONS.material_cost[lang] || QUESTIONS.material_cost['en'],
        field: 'material_cost',
        type: 'question'
      };
    }

    // Check days
    if (data.labour_days === undefined || data.labour_days === null) {
      return {
        question: QUESTIONS.labour_days[lang] || QUESTIONS.labour_days['en'],
        field: 'labour_days',
        type: 'question'
      };
    }

    return {
      question: lang === 'hi' ? "उत्पाद की जानकारी पूरी हो गई है! समीक्षा करने के लिए आगे बढ़ें।" : "Product information is complete! Continue to review.",
      type: 'completed'
    };
  },

  getConfirmationMessage: (field: keyof ProductData, value: ProductData[keyof ProductData], preferredLang: string): string => {
    const lang = preferredLang as ConversationLanguage;
    const template = CONFIRMATIONS[field as keyof typeof CONFIRMATIONS]?.[lang] || CONFIRMATIONS[field as keyof typeof CONFIRMATIONS]?.['en'] || 'Is {value} correct?';
    return template.replace('{value}', String(value));
  }
};
