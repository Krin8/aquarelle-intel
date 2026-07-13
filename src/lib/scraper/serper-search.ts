import { getApiKey } from '@/lib/settings';
import type { SearchResult } from './search-orchestrator';

/**
 * Runs a search using the Serper.dev API (Google Search).
 * Requires SERPER_API_KEY environment variable.
 */
export async function runSerperSearch(query: string): Promise<SearchResult[]> {
  const apiKey = await getApiKey('SERPER');
  if (!apiKey) {
    console.warn('[SerperSearch] SERPER_API_KEY not found. Skipping Serper search.');
    return [];
  }

  // Serper free tier restricts advanced query operators like excessive quotes.
  // We remove quotes to prevent 400 "Query pattern not allowed" errors.
  const cleanQuery = query.replace(/"/g, '');
  const allResults: SearchResult[] = [];

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: cleanQuery,
        num: 20 // Fetch up to 20 results per query
      }),
    });

    if (!response.ok) {
      console.warn(`[SerperSearch] API error: ${response.status} ${response.statusText}`);
      return allResults;
    }

    const data = await response.json();
    
    if (data.organic && Array.isArray(data.organic)) {
      for (const item of data.organic) {
        if (item.title && item.link) {
          allResults.push({
            title: item.title,
            url: item.link,
            snippet: item.snippet || '',
          });
        }
      }
    }

    return allResults;
  } catch (error) {
    console.warn(`[SerperSearch] Exception: ${error instanceof Error ? error.message : error}`);
    return allResults;
  }
}
