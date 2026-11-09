import { config } from '../config';

interface ExplainWordRequest {
  word: string;
  sentence: string;
  paragraph?: string;
  previousSentence?: string;
  nextSentence?: string;
  targetLanguage?: string;
  userLevel?: string;
}

interface ContextualExplanation {
  word: string;
  contextualMeaning: string;
  simpleEnglish: string;
  pronunciation: string;
  partOfSpeech: string;
  synonyms: string[];
  example: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface WordExplanation extends ContextualExplanation {
  translation: string;
}

const CONTEXT_SYSTEM_INSTRUCTION = `You are a vocabulary assistant in a book reader.
Use the selected word, its exact sentence, and any supplied nearby text to explain the meaning the word has in that passage. Make contextualMeaning a clear, detailed explanation in natural English, not a dictionary list. Keep simpleEnglish easy to understand. Identify the part of speech and pronunciation for the word as used in the sentence. Do not translate any field.
Return only valid JSON with exactly the requested keys.`;

const TRANSLATION_SYSTEM_INSTRUCTION = `You are a dictionary translator. Translate only the supplied word into the requested language.
Return the most common, standard dictionary equivalent in 1 to 3 words. Do not explain it, give alternatives, use examples, or add punctuation or surrounding text. The word is supplied without a sentence: do not infer or invent any context.
Return only valid JSON in the requested structure.`;

const buildContextPrompt = (req: ExplainWordRequest): string => `Explain this word as used in the supplied book passage.

Word/Phrase: "${req.word}"
Sentence: "${req.sentence}"
${req.paragraph ? `Surrounding paragraph: "${req.paragraph.substring(0, 500)}"` : ''}
${req.previousSentence ? `Previous sentence: "${req.previousSentence}"` : ''}
${req.nextSentence ? `Next sentence: "${req.nextSentence}"` : ''}
Reader's English level: ${req.userLevel || 'intermediate'}

Return ONLY this JSON structure:
{
  "word": "${req.word}",
  "contextualMeaning": "a detailed natural-English explanation of the meaning in this passage",
  "simpleEnglish": "a simpler English explanation",
  "pronunciation": "phonetic pronunciation",
  "partOfSpeech": "part of speech in this usage",
  "synonyms": ["synonym1", "synonym2", "synonym3"],
  "example": "a short new example showing this same usage",
  "difficulty": "easy|medium|hard"
}`;

const buildTranslationPrompt = (word: string, targetLanguage: string): string => `Translate this word into ${targetLanguage}.

Word: "${word}"
Target language: ${targetLanguage}

Return ONLY this JSON structure:
{
  "translation": "one standard, commonly understood dictionary equivalent in ${targetLanguage}, 1 to 3 words"
}`;

const requestJson = async <T>(systemInstruction: string, prompt: string): Promise<T> => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: ['Bearer ', config.groqApiKey].join(''),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.groqModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) throw new Error(`Groq API returned ${response.status}`);

  const result = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = result.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq API returned an empty response');

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Failed to parse AI response');
  }
};

const getMockContext = (
  req: ExplainWordRequest,
  reason: 'missing' | 'error'
): ContextualExplanation => {
  const message = reason === 'error'
    ? 'Groq API call failed. Check the backend console for the full error.'
    : 'Please configure GROQ_API_KEY to enable AI-powered word explanations.';
  return {
    word: req.word,
    contextualMeaning: `[AI unavailable] ${message}`,
    simpleEnglish: message,
    pronunciation: `/${req.word}/`,
    partOfSpeech: 'unknown',
    synonyms: [],
    example: req.sentence,
    difficulty: 'medium',
  };
};

export const explainWordInContext = async (req: ExplainWordRequest): Promise<ContextualExplanation> => {
  if (!config.groqApiKey) {
    console.warn('[AI] GROQ_API_KEY is not set in .env — returning mock explanation.');
    return getMockContext(req, 'missing');
  }

  try {
    return await requestJson<ContextualExplanation>(CONTEXT_SYSTEM_INSTRUCTION, buildContextPrompt(req));
  } catch (error) {
    console.error('[AI] Context explanation failed:', error instanceof Error ? error.message : error);
    return getMockContext(req, 'error');
  }
};

export const translateWord = async (word: string, targetLanguage: string): Promise<string> => {
  if (!config.groqApiKey) {
    console.warn('[AI] GROQ_API_KEY is not set in .env — returning mock translation.');
    return `[${targetLanguage} translation — AI unavailable]`;
  }

  try {
    const result = await requestJson<{ translation: string }>(
      TRANSLATION_SYSTEM_INSTRUCTION,
      buildTranslationPrompt(word, targetLanguage)
    );
    if (typeof result.translation !== 'string' || !result.translation.trim()) {
      throw new Error('AI returned an invalid translation');
    }
    return result.translation.trim().split(/\s+/).slice(0, 3).join(' ');
  } catch (error) {
    console.error('[AI] Word translation failed:', error instanceof Error ? error.message : error);
    return `[${targetLanguage} translation — AI unavailable]`;
  }
};

export const explainWord = async (req: ExplainWordRequest): Promise<WordExplanation> => {
  const targetLanguage = req.targetLanguage || 'Hindi';
  const [context, translation] = await Promise.all([
    explainWordInContext(req),
    translateWord(req.word, targetLanguage),
  ]);
  return { ...context, translation };
};
