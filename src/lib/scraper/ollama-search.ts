export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

/**
 * Uses a local Ollama instance to generate search-like results from its
 * training knowledge.  This is a supplementary source — useful when external
 * APIs are rate-limited and browser automation is blocked.
 *
 * Returns the same { title, snippet, url }[] shape as other search modules.
 * If Ollama is offline the function returns [] without throwing.
 */
export async function runOllamaSearch(query: string): Promise<SearchResult[]> {
  try {
    const systemPrompt = `You are a web search results generator. Given a search query, return realistic search results based on your training knowledge. Each result must be a real company/organization that you know exists. Do NOT invent fictional companies or URLs.

Return ONLY a JSON array (no markdown, no backticks, no explanation) with up to 5 objects:
[
  {
    "title": "Page Title",
    "snippet": "A brief summary of what this page/company is about",
    "url": "https://actual-domain.com"
  }
]

If you don't have confident knowledge about the query, return an empty array: []`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: systemPrompt,
        prompt: query,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[OllamaSearch] Ollama returned ${response.status}. Skipping.`);
      return [];
    }

    const data = await response.json();
    let raw = (data.response || '').trim();

    // Clean markdown fences if present
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    const parsed = JSON.parse(raw);

    // Handle both array and { results: [...] } shapes
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.results)
        ? parsed.results
        : [];

    const validated: SearchResult[] = arr
      .filter(
        (r: any) =>
          r &&
          typeof r.title === 'string' &&
          typeof r.url === 'string' &&
          r.url.startsWith('http')
      )
      .slice(0, 5)
      .map((r: any) => ({
        title: String(r.title).trim(),
        snippet: String(r.snippet || '').trim(),
        url: String(r.url).trim(),
      }));

    console.log(`[OllamaSearch] Returned ${validated.length} results for "${query}"`);
    return validated;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.warn(`[OllamaSearch] Timed out for query "${query}".`);
    } else if (
      error?.cause?.code === 'ECONNREFUSED' ||
      error?.message?.includes('ECONNREFUSED')
    ) {
      // Ollama is not running — completely silent
    } else {
      console.warn(`[OllamaSearch] Failed for "${query}":`, error?.message || error);
    }
    return [];
  }
}
