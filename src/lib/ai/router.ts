import { generateStructuredResponse as geminiGenerate } from './gemini-client';

export async function generateStructuredResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  parseFunc: (text: string) => T,
  useGoogleSearch?: boolean
): Promise<{ result: T; rawResponse: string; model: string }> {
  return geminiGenerate(systemPrompt, userPrompt, parseFunc, useGoogleSearch);
}
