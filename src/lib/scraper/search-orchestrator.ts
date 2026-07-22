import type { Browser } from 'puppeteer';
import { runAiSearch } from '../ai/ai-search';
import { runDuckDuckGoSearch } from './ddg-search';
import { runGoogleAiSearch } from './google-ai-search';
import { runSerperSearch } from './serper-search';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Unified search orchestrator — fires all four search sources in parallel
 * and merges / deduplicates the results.
 *
 * Sources:
 *   1. Gemini API  (ai-search.ts)          – always attempted
 *   2. DuckDuckGo (ddg-search.ts)          – always attempted
 *   3. Google AI Mode (google-ai-search.ts) – requires browser
 *   4. Serper API (serper-search.ts)       - always attempted
 *
 * Each source is wrapped in its own try/catch — a failure in one never
 * blocks the others.
 */
export async function runAllSearches(
  browser: Browser | null,
  query: string
): Promise<SearchResult[]> {
  // Build the list of promises to race
  const tasks: { name: string; promise: Promise<SearchResult[]> }[] = [];

  // 1. Gemini API (no browser needed)
  tasks.push({
    name: 'Gemini',
    promise: runAiSearch(query).catch((e) => {
      console.warn(`[SearchOrch] Gemini failed: ${e?.message || e}`);
      return [] as SearchResult[];
    }),
  });

  // 2. Serper API
  tasks.push({
    name: 'Serper',
    promise: runSerperSearch(query).catch((e) => {
      console.warn(`[SearchOrch] Serper failed: ${e?.message || e}`);
      return [] as SearchResult[];
    }),
  });

  
  // 3. DuckDuckGo Search
  tasks.push({
    name: 'DDGSearch',
    promise: runDuckDuckGoSearch(query, browser).catch((e) => {
      console.warn(`[SearchOrch] DDG Search failed: ${e?.message || e}`);
      return [] as SearchResult[];
    }),
  });

  // 4. Google AI Mode (requires browser)
  /* Temporarily paused
  if (browser) {
    tasks.push({
      name: 'GoogleAI',
      promise: runGoogleAiSearch(browser, query).catch((e) => {
        console.warn(`[SearchOrch] Google AI failed: ${e?.message || e}`);
        return [] as SearchResult[];
      }),
    });
  }
  */

  // Fire everything in parallel
  const settled = await Promise.allSettled(tasks.map((t) => t.promise));

  // Collect results and log per-source counts
  const allResults: SearchResult[] = [];
  const sourceCounts: string[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const outcome = settled[i];
    const name = tasks[i].name;

    if (outcome.status === 'fulfilled' && outcome.value.length > 0) {
      allResults.push(...outcome.value);
      sourceCounts.push(`${name}:${outcome.value.length}`);
    } else {
      sourceCounts.push(`${name}:0`);
    }
  }

  // Deduplicate by normalised domain
  const seenDomains = new Set<string>();
  const deduplicated = allResults.filter((r) => {
    if (!r.url || r.title === 'Google AI Overview') return true; // keep AI overview entries
    try {
      const domain = new URL(
        r.url.startsWith('http') ? r.url : `https://${r.url}`
      ).hostname.replace(/^www\./, '');
      if (seenDomains.has(domain)) return false;
      seenDomains.add(domain);
      return true;
    } catch {
      return true; // keep if URL can't be parsed
    }
  });

  console.log(
    `[SearchOrch] "${query}" → ${deduplicated.length} unique (${sourceCounts.join(', ')})`
  );

  return deduplicated;
}
