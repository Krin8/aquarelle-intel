const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

export async function checkOllamaHealth(): Promise<{
  online: boolean;
  model: string;
  modelAvailable: boolean;
}> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) throw new Error('Ollama not reachable');
    
    const data = await response.json();
    const modelAvailable = data.models.some((m: any) => m.name === OLLAMA_MODEL || m.name.startsWith(`${OLLAMA_MODEL}:`));

    return { online: true, model: OLLAMA_MODEL, modelAvailable };
  } catch (error) {
    return { online: false, model: OLLAMA_MODEL, modelAvailable: false };
  }
}

export async function generateStructuredResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  parseResponse: (text: string) => T,
  useGoogleSearch?: boolean
): Promise<{ result: T; rawResponse: string; model: string }> {
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  let response;
  try {
    response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.3
        }
      }),
      signal: controller.signal
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Ollama generation timed out after 60 seconds.');
    }
    throw new Error('Failed to connect to Ollama: ' + error.message);
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Ollama generation failed: ${response.statusText}`);
  }

  const data = await response.json();
  const rawResponse = data.response;

  if (!rawResponse) {
    throw new Error('No response text received from Ollama');
  }

  // Clean markdown code fences that might be added
  let cleanedResponse = rawResponse;
  if (cleanedResponse.startsWith('```json')) {
    cleanedResponse = cleanedResponse.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse.replace(/^```.*\n/, '').replace(/\n```$/, '');
  }

  try {
    const result = parseResponse(cleanedResponse);
    return { result, rawResponse, model: OLLAMA_MODEL };
  } catch (error: any) {
    throw new Error(`Failed to parse structured response: ${error.message}\nRaw Output: ${rawResponse}`);
  }
}
export const AI_MODEL = OLLAMA_MODEL;
