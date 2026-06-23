import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// We'll use gemini-2.5-flash as the default model since it's fast and highly capable for these tasks
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let geminiInstance: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!geminiInstance) {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    geminiInstance = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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
    const ai = getGemini();
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

export async function generateStructuredResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  parseResponse: (text: string) => T
): Promise<{ result: T; rawResponse: string; model: string }> {
  const ai = getGemini();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.3,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

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
  const ai = getGemini();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.5,
      maxOutputTokens: 2048,
    },
  });

  if (!response.text) {
    throw new Error('No response text received from Gemini');
  }

  return {
    text: response.text,
    model: GEMINI_MODEL,
  };
}

export { GEMINI_MODEL };
