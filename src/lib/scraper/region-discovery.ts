import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/router';
import { runAllSearches } from './search-orchestrator';
import { getAquarelleContextString } from '../knowledge/aquarelle-kb';

puppeteer.use(StealthPlugin());

export interface DiscoveredBrand {
  name: string;
  website: string;
  country: string;
  description: string;
}

/**
 * Uses DuckDuckGo + AI to discover apparel/shirts brands in a given region.
 * Returns de-duplicated list of brand name + website URL pairs.
 */
export async function discoverBrandsInRegion(
  region: string,
  maxBrands: number = 20,
  modelPref: 'ollama' | 'gemini' = 'ollama'
): Promise<DiscoveredBrand[]> {
  let browser;
  let allSearchResults: { title: string; snippet: string; url: string }[] = [];
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    // ─── STEP 1: Research Trade Fairs & Databases ─────────────────────────────
    console.log(`[RegionDiscovery] Phase 1: Researching Industry Sources for "${region}"...`);
    const industrySources = await discoverIndustrySources(browser, region, modelPref);
    console.log(`[RegionDiscovery] Found ${industrySources.length} sources:`, industrySources);

  // ─── STEP 2: Generate targeted search queries ─────────────────────────────
  const searchQueries = buildSearchQueries(region, maxBrands, industrySources);
  console.log(`[RegionDiscovery] Phase 2: Starting brand discovery with ${searchQueries.length} queries (max ${maxBrands} brands)`);
  
  // Update global progress state if it exists
  if ((globalThis as any).regionScanProgress) {
    (globalThis as any).regionScanProgress.phase = 'discovering';
    (globalThis as any).regionScanProgress.currentBrand = 'Searching Brands...';
  }

  // ─── STEP 2: Run searches via AI Search and DDG ──────────────────────────

    for (const query of searchQueries) {
      try {
        const results = await runAllSearches(browser, query);
        allSearchResults.push(...results);
        console.log(`[RegionDiscovery] Query "${query}" → ${results.length} results`);
        // Small delay between searches to be respectful
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.warn(`[RegionDiscovery] Search query failed: "${query}"`, e instanceof Error ? e.message : e);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  if (allSearchResults.length === 0) {
    console.warn(`[RegionDiscovery] No search results found for region "${region}"`);
    return [];
  }

  // De-duplicate search results by URL domain
  const seenDomains = new Set<string>();
  const uniqueResults = allSearchResults.filter(r => {
    try {
      const domain = new URL(r.url.startsWith('http') ? r.url : `https://${r.url}`).hostname.replace(/^www\./, '');
      if (seenDomains.has(domain)) return false;
      seenDomains.add(domain);
      return true;
    } catch {
      return false;
    }
  });

  console.log(`[RegionDiscovery] ${allSearchResults.length} total results → ${uniqueResults.length} unique domains`);

  // ─── STEP 3: AI extraction — extract brand names + websites from results ──
  const brands = await extractBrandsFromResults(uniqueResults, region, maxBrands, modelPref);

  console.log(`[RegionDiscovery] AI extracted ${brands.length} brands for "${region}"`);
  return brands;
}

// ─── SEARCH QUERY BUILDER ──────────────────────────────────────────────────────
// Generates multiple search queries to maximize coverage for a region.
// Focused on shirts/apparel matching Aquarelle's capabilities.
function buildSearchQueries(region: string, maxBrands: number, industrySources: string[] = []): string[] {
  // Map regions to specific countries for more targeted searches
  const regionCountries: Record<string, string[]> = {
    'Southeast Asia': ['Vietnam', 'Thailand', 'Indonesia', 'Philippines', 'Malaysia', 'Cambodia'],
    'South Asia': ['India', 'Bangladesh', 'Sri Lanka', 'Pakistan'],
    'Europe': ['UK', 'France', 'Germany', 'Italy', 'Spain', 'Sweden', 'Denmark', 'Netherlands', 'Poland', 'Portugal'],
    'North America': ['USA', 'Canada', 'Mexico'],
    'Middle East': ['UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Israel'],
    'Australia': ['Australia', 'New Zealand'],
    'East Asia': ['Japan', 'South Korea', 'China', 'Hong Kong', 'Taiwan'],
    'Africa': ['South Africa', 'Kenya', 'Nigeria', 'Morocco', 'Egypt'],
    'Latin America': ['Brazil', 'Mexico', 'Colombia', 'Argentina', 'Chile'],
  };

  const countries = regionCountries[region] || [region];
  const queries: string[] = [];

  // Add highly targeted queries for discovered trade fairs and databases
  for (const source of industrySources) {
    queries.push(`"${source}" exhibitor list apparel brands`);
    queries.push(`brands listed in "${source}" apparel fashion`);
    queries.push(`"${source}" participating brands official website`);
  }

  // Core discovery queries — broader to catch more, but still apparel focused
  const templates = [
    (c: string) => `top apparel brands in ${c}`,
    (c: string) => `list of clothing companies ${c}`,
    (c: string) => `fashion brands based in ${c} casual wear`,
    (c: string) => `${c} fashion brand official website`,
    (c: string) => `clothing companies ${c} shirts denim`,
    (c: string) => `leading apparel fashion brands ${c} shirts`,
  ];

  // We roughly need 1 query per 3 requested brands to get enough valid results
  // We already have some queries from trade fairs, so we subtract that
  const targetQueries = Math.max(5, Math.ceil(maxBrands / 3));
  
  // Cycle through countries and templates until we hit our target query count
  let cIdx = 0;
  let tIdx = 0;
  
  while (queries.length < targetQueries) {
    const country = countries[cIdx];
    const template = templates[tIdx];
    queries.push(template(country));
    
    tIdx++;
    if (tIdx >= templates.length) {
      tIdx = 0;
      cIdx++;
      if (cIdx >= countries.length) {
        // If we run out of countries and templates, just break to avoid infinite loop
        break; 
      }
    }
  }

  // Always add one broad regional query
  queries.push(`apparel clothing companies "${region}" fashion brand list`);

  return queries;
}

// ─── INDUSTRY SOURCES DISCOVERY ────────────────────────────────────────────────
async function discoverIndustrySources(browser: puppeteer.Browser, region: string, modelPref: 'ollama' | 'gemini'): Promise<string[]> {
  let allSearchResults: { title: string; snippet: string; url: string }[] = [];

  try {
    const queries = [
      `top apparel trade shows in ${region} 2024`,
      `fashion brand directories databases ${region}`,
      `apparel industry B2B portals list ${region}`
    ];

    for (const query of queries) {
      try {
        const results = await runAllSearches(browser, query);
        allSearchResults.push(...results);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.warn(`[RegionDiscovery] Source search failed: "${query}"`);
      }
    }
  } catch (err) {
    console.error('[RegionDiscovery] Source search loop failed:', err);
  }

  if (allSearchResults.length === 0) return [];

  // Use AI to extract Source names
  const resultsText = allSearchResults
    .slice(0, 25) 
    .map((r, i) => `[${i + 1}] Title: ${r.title}\n    Snippet: ${r.snippet}`)
    .join('\n\n');

  const systemPrompt = `You are a fashion industry analyst. Extract the names of actual B2B apparel/fashion trade shows, exhibitions, and industry databases/directories from the search results. Only return the official names of the sources (e.g., "Premiere Vision", "Pitti Uomo", "Kompass", "Europages"). Do NOT return brand names or clothing companies. Output raw JSON.`;

  const userPrompt = `Extract up to 6 major apparel trade fairs or industry databases for the region: ${region}.
  
SEARCH RESULTS:
${resultsText}

Respond with ONLY this JSON format:
{
  "sources": ["Source Name 1", "Source Name 2"]
}`;

  try {
    const { result } = await generateStructuredResponse<{ sources: string[] }>(
      systemPrompt,
      userPrompt,
      (text: string) => {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed.sources)) return { sources: [] };
        return { sources: parsed.sources.filter((f: any) => typeof f === 'string').slice(0, 6) };
      },
      modelPref
    );
    return result.sources;
  } catch (error) {
    console.error('[RegionDiscovery] Source AI extraction failed:', error);
    return [];
  }
}

// ─── AI BRAND EXTRACTION ───────────────────────────────────────────────────────
// Takes raw search results and uses AI to extract structured brand data.
async function extractBrandsFromResults(
  searchResults: { title: string; snippet: string; url: string }[],
  region: string,
  maxBrands: number,
  modelPref: 'ollama' | 'gemini'
): Promise<DiscoveredBrand[]> {
  // Format results for the AI
  const resultsText = searchResults
    .map((r, i) => `[${i + 1}] URL: ${r.url}\n    Title: ${r.title}\n    Snippet: ${r.snippet}`)
    .join('\n\n');

  const systemPrompt = `You are a brand discovery analyst for Aquarelle, a shirts manufacturing company.
Your job: extract actual apparel/fashion brand companies from search results.

${getAquarelleContextString()}

RULES:
1. Only extract REAL brand companies — not directories, news articles, blog posts, or marketplace listings.
2. The URL must be the brand's official website (not social media, not a third-party directory).
3. Focus on brands that could potentially need shirt manufacturing services: casual wear, denim, fashion shirts, sportswear shirts, casual-luxury brands.
4. Skip brands that are purely: footwear-only, accessories-only, luxury haute couture with in-house production, or fast-fashion giants (Zara, H&M, Shein).
5. CRITICAL GEOGRAPHY RULE: You MUST verify the brand is originally founded, headquartered, or primarily native to the requested region. DO NOT include massive global conglomerates (like Aditya Birla, PVH, VF Corp) just because they happen to operate or were mentioned in that region.
6. AQUARELLE MATCH RULE: STRICTLY use the Aquarelle Knowledge Base provided above. ONLY return brands that are HIGHLY RELATED to Aquarelle's capabilities and represent a strong B2B business opportunity (i.e. they sell products heavily overlapping with our Product Portfolio and Fabric Expertise). If a brand does not sell products we can manufacture, DO NOT include them.
7. Output raw JSON only — no markdown fences, no preamble.`;

  const userPrompt = `Extract apparel/fashion brand companies from these search results for the region: ${region}

SEARCH RESULTS:
${resultsText}

Extract up to ${maxBrands} unique brands. For each brand, provide:
- name: the brand's actual name (not the parent company unless the brand IS the company)
- website: the brand's official website URL from the search results (must start with http or be a clean domain)
- country: the specific country this brand is based in or primarily operates from
- reasoning: Explain exactly why this is a brand that designs and sells clothing, rather than a directory, trade show, or magazine.
- is_actual_apparel_brand: true only if it is a real clothing brand/label. false if it is a directory, search engine, B2B portal, or magazine.
- description: one sentence about what they sell, based on the search snippet

Respond with ONLY this JSON:
{
  "brands": [
    {
      "name": "Brand Name",
      "website": "https://example.com",
      "country": "Country",
      "reasoning": "This company designs and sells casual wear directly to consumers...",
      "is_actual_apparel_brand": true,
      "description": "Brief description of the brand"
    }
  ]
}`;

  try {
    const { result } = await generateStructuredResponse<{ brands: DiscoveredBrand[] }>(
      systemPrompt,
      userPrompt,
      (text: string) => {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        // Validate and clean up
        if (!Array.isArray(parsed.brands)) {
          return { brands: [] };
        }

        const validBrands = parsed.brands
          .filter((b: any) => 
            b && 
            typeof b.name === 'string' && 
            typeof b.website === 'string' &&
            b.is_actual_apparel_brand === true
          )
          .map((b: any) => ({
            name: b.name.trim(),
            website: normalizeUrl(b.website.trim()),
            country: String(b.country || region).trim(),
            description: String(b.description || '').trim(),
          }))
          .filter((b: any) => {
            const url = b.website.toLowerCase();
            return !url.includes('directory') && 
                   !url.includes('search') && 
                   !url.includes('portal') && 
                   !url.includes('list') &&
                   !url.includes('magazine');
          })
          .slice(0, maxBrands);

        return { brands: validBrands };
      },
      modelPref
    );

    // Final de-duplication by domain
    const seen = new Set<string>();
    return result.brands.filter(b => {
      try {
        const domain = new URL(b.website).hostname.replace(/^www\./, '');
        if (seen.has(domain)) return false;
        seen.add(domain);
        return true;
      } catch {
        return false;
      }
    });
  } catch (error) {
    console.error('[RegionDiscovery] AI extraction failed:', error);
    return [];
  }
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function normalizeUrl(url: string): string {
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    return parsed.origin + (parsed.pathname !== '/' ? parsed.pathname : '');
  } catch {
    return url;
  }
}
