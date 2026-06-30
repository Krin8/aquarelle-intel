import { GoogleGenAI } from '@google/genai';
import { GEMINI_MODEL, getGemini } from './gemini-client';

export async function runAiSearch(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  try {
    const ai = getGemini();
    const prompt = `Perform a Google Search for the following query: "${query}"
Extract the top 5 most relevant results.
Return ONLY a valid JSON array of objects, with no markdown formatting or backticks.
Each object must match this interface:
{
  "title": "Page Title",
  "snippet": "A short description or summary of the page content",
  "url": "The actual URL of the website"
}`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        // tools: [{ googleSearch: {} }],
        temperature: 0.1
      }
    });

    let raw = response.text || '[]';
    // Clean up possible markdown fences
    if (raw.includes('```')) {
      raw = raw.replace(/```(json)?/gi, '').replace(/```/g, '').trim();
    }

    const results = JSON.parse(raw);
    if (Array.isArray(results)) {
      return results;
    }
    return [];
  } catch (error: any) {
    if (error?.status === 429 || error?.message?.includes('429') || error?.status === 'RESOURCE_EXHAUSTED') {
      console.warn(`[runAiSearch] Gemini Quota Exceeded for query "${query}". Skipping AI search and relying on DDG.`);
    } else {
      console.error(`[runAiSearch] Failed for query "${query}":`, error?.message || error);
    }
    return [];
  }
}
