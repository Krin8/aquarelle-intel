import { GoogleGenAI } from '@google/genai';
import { getApiKey } from '@/lib/settings';

// We'll use gemini-2.5-flash as the default model since it's fast and highly capable for these tasks
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let geminiInstance: GoogleGenAI | null = null;
let lastKeyUsed: string | null = null;

export async function getGemini(): Promise<GoogleGenAI> {
  const apiKey = await getApiKey('GEMINI');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in settings');
  }

  // Re-initialize if key changed (or if it's the first time)
  if (!geminiInstance || lastKeyUsed !== apiKey) {
    geminiInstance = new GoogleGenAI({ apiKey });
    lastKeyUsed = apiKey;
  }
  return geminiInstance;
}

export async function checkGeminiHealth(): Promise<{
  online: boolean;
  model: string;
  modelAvailable: boolean;
}> {
  try {
    // A simple prompt to check if the API is reachable and key is valid
    const ai = await getGemini();
    await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: 'ping',
      config: { maxOutputTokens: 1 },
    });
    return { online: true, model: GEMINI_MODEL, modelAvailable: true };
  } catch (error) {
    return { online: false, model: GEMINI_MODEL, modelAvailable: false };
  }
}

async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, initialDelay = 1500): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const is503 = error?.status === 503 || error?.message?.includes('503') || error?.status === 'UNAVAILABLE';
      const is429 = error?.status === 429 || error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED';
      
      if (!is503 && !is429) {
        if (error instanceof Error) {
          throw error;
        } else {
          console.error("Gemini API Error Object:", error);
          throw new Error(`Gemini API Error: ${typeof error === 'object' ? JSON.stringify(error) : String(error)}`);
        }
      }
      
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`Gemini API busy (attempt ${attempt + 1}/${maxRetries}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  const isQuota = lastError?.status === 429 || lastError?.message?.includes('429') || lastError?.status === 'RESOURCE_EXHAUSTED' || lastError?.message?.includes('quota') || lastError?.message?.includes('Quota');
  if (isQuota) {
    throw new Error('API_KEYS_EXHAUSTED');
  }
  throw new Error(`Gemini API error after ${maxRetries} attempts: ${lastError?.message || lastError}`);
}

export async function generateStructuredResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  parseResponse: (text: string) => T,
  useGoogleSearch?: boolean
): Promise<{ result: T; rawResponse: string; model: string }> {
  const ai = await getGemini();

  const response = await withRetry(() => ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.3,
      maxOutputTokens: 8192,
      ...(useGoogleSearch ? {} : { responseMimeType: 'application/json' }),
      ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {})
    },
  }));

  const rawResponse = response.text;
  if (!rawResponse) {
    throw new Error('No response text received from Gemini');
  }

  // Clean markdown code fences that Gemini sometimes adds despite responseMimeType
  let cleanedResponse = rawResponse.trim();
  if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '');
  }

  const result = parseResponse(cleanedResponse);

  return {
    result,
    rawResponse,
    model: GEMINI_MODEL,
  };
}

export async function generateTextResponse(
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; model: string }> {
  const ai = await getGemini();

  const response = await withRetry(() => ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.5,
      maxOutputTokens: 2048,
    },
  }));

  if (!response.text) {
    throw new Error('No response text received from Gemini');
  }

  return {
    text: response.text,
    model: GEMINI_MODEL,
  };
}

export { GEMINI_MODEL };
