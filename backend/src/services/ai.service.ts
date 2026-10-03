import crypto from 'crypto';
import { config } from '../config';
import { redisGet, redisSet } from '../config/redis';

interface ExplainWordRequest {
  word: string;
  sentence: string;
  paragraph?: string;
  previousSentence?: string;
  nextSentence?: string;
  targetLanguage?: string;
  userLevel?: string;
}

interface WordExplanation {
  word: string;
  contextualMeaning: string;
  simpleExplanation: string;
  translation: string;
  pronunciation: string;
  partOfSpeech: string;
  synonyms: string[];
  exampleSentence: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

const CACHE_TTL = 24 * 60 * 60; // 24 hours

const getCacheKey = (req: ExplainWordRequest): string => {
  const content = JSON.stringify({
    word: req.word.toLowerCase(),
    sentence: req.sentence,
    paragraph: req.paragraph,
    previousSentence: req.previousSentence,
    nextSentence: req.nextSentence,
    targetLanguage: req.targetLanguage || 'Hindi',
    userLevel: req.userLevel || 'intermediate',
  });
  return `explain:v2:${crypto.createHash('md5').update(content).digest('hex')}`;
};

const SYSTEM_INSTRUCTION = `You are a contextual vocabulary assistant embedded inside a book reader application.
Explain the selected word or phrase using its exact sentence and surrounding book context. Determine its meaning from context first; do not default to the most common dictionary meaning. Explain idioms according to their actual use, and mention ambiguity only when the supplied context genuinely supports multiple readings. Write contextualMeaning in the requested target language, not English, unless English is the target language. Keep simpleExplanation in clear, simple English. Write translation as a natural equivalent in the requested target language. Do not include unrelated meanings or extra explanation.
Return ONLY valid JSON with exactly the requested keys, no markdown, no code blocks, and no extra text.`;

const buildPrompt = (req: ExplainWordRequest): string => {
  return `Explain the selected word or phrase as it is used in this book context.

Word/Phrase: "${req.word}"
Sentence: "${req.sentence}"
${req.paragraph ? `Surrounding paragraph: "${req.paragraph.substring(0, 500)}"` : ''}
${req.previousSentence ? `Previous sentence: "${req.previousSentence}"` : ''}
${req.nextSentence ? `Next sentence: "${req.nextSentence}"` : ''}
Target language for translation: ${req.targetLanguage || 'Hindi'}
User proficiency level: ${req.userLevel || 'intermediate'}

Return ONLY this JSON structure (no markdown or extra keys):
{
  "word": "${req.word}",
  "contextualMeaning": "the meaning used here, stated concisely in ${req.targetLanguage || 'Hindi'}",
  "simpleExplanation": "a simple explanation suited to the reader's English level",
  "translation": "natural ${req.targetLanguage || 'Hindi'} translation preserving the contextual meaning; if the target is English, give a concise English equivalent",
  "pronunciation": "phonetic pronunciation (e.g., /dɪˈklaɪn/)",
  "partOfSpeech": "part of speech in this usage",
  "synonyms": ["synonym1", "synonym2", "synonym3"],
  "exampleSentence": "a short new example showing this same usage",
  "difficulty": "easy|medium|hard"
}`;
};

export const explainWord = async (req: ExplainWordRequest): Promise<WordExplanation> => {
  const cacheKey = getCacheKey(req);

  // Check Redis cache first
  const cached = await redisGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return parsed;
    } catch {
      // Continue to API call if cache is corrupted
    }
  }

  if (!config.groqApiKey) {
    console.warn('[AI] GROQ_API_KEY is not set in .env — returning mock explanation.');
    return getMockExplanation(req, 'missing');
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groqModel,
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: buildPrompt(req) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      throw new Error(`Groq API returned ${response.status}`);
    }
    const result = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Groq API returned an empty response');

    // Parse the JSON response
    let explanation: WordExplanation;
    try {
      // Remove any potential markdown code fences
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      explanation = JSON.parse(cleaned);
    } catch {
      throw new Error('Failed to parse AI response');
    }

    // Cache the result
    await redisSet(cacheKey, JSON.stringify(explanation), CACHE_TTL);

    return explanation;
  } catch (error: any) {
    console.error('[AI] Groq API call failed:', error?.message || error);
    // Return a graceful fallback
    return getMockExplanation(req, 'error');
  }
};

const getMockExplanation = (req: ExplainWordRequest, reason: 'missing' | 'error' = 'missing'): WordExplanation => {
  const msg = reason === 'error'
    ? 'Groq API call failed. Check your GROQ_API_KEY in backend .env and the backend console for the full error.'
    : 'Please add a valid Groq API key in the backend .env file (GROQ_API_KEY=...) to enable AI-powered word explanations.';
  return {
    word: req.word,
    contextualMeaning: `[AI unavailable] ${msg}`,
    simpleExplanation: msg,
    translation: `[${req.targetLanguage || 'Hindi'} translation — AI unavailable]`,
    pronunciation: `/${req.word}/`,
    partOfSpeech: 'unknown',
    synonyms: [],
    exampleSentence: req.sentence,
    difficulty: 'medium',
  };
};
