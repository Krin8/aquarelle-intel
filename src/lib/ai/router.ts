import { generateStructuredResponse as ollamaGenerate } from './ollama-client';
import { generateStructuredResponse as geminiGenerate } from './gemini-client';
import { getModelPreference } from '@/actions/settings-actions';

export async function generateStructuredResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  parseFunc: (text: string) => T,
  forceModel?: 'ollama' | 'gemini'
): Promise<{ result: T; rawResponse: string; model: string }> {
  // Use forced model if provided, otherwise check cookie preference
  const modelToUse = forceModel || await getModelPreference();

  if (modelToUse === 'gemini') {
    return geminiGenerate(systemPrompt, userPrompt, parseFunc);
  } else {
    return ollamaGenerate(systemPrompt, userPrompt, parseFunc);
  }
}
