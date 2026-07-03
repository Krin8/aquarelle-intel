import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/router';
import { runAllSearches } from './search-orchestrator';

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
  targetCountry?: string,
  category?: string
): Promise<DiscoveredBrand[]> {
  let browser;
  let allSearchResults: { title: string; snippet: string; url: string }[] = [];
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    // ─── STEP 1: Research Trade Fairs & Databases ─────────────────────────────
    console.log(`[RegionDiscovery] Phase 1: Researching Industry Sources for "${targetCountry || region}"...`);
    const industrySources = await discoverIndustrySources(browser, region, targetCountry);
    console.log(`[RegionDiscovery] Found ${industrySources.length} sources:`, industrySources);

  // ─── STEP 2: Generate targeted search queries ─────────────────────────────
  const searchQueries = buildSearchQueries(region, maxBrands, industrySources, targetCountry);
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
        
        // --- DEEP SCRAPE ENRICHMENT ---
        // Scrape the first 5 websites for richer context
        for (let i = 0; i < Math.min(5, results.length); i++) {
          try {
            if (browser) {
              const page = await browser.newPage();
              const targetUrl = results[i].url.startsWith('http') ? results[i].url : `https://${results[i].url}`;
              await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
              const pageText = await page.evaluate(() => document.body.innerText.substring(0, 1500));
              if (pageText && pageText.trim().length > 0) {
                results[i].snippet += "\n[WEBSITE PREVIEW]: " + pageText.replace(/\n+/g, ' ');
              }
              await page.close();
            }
          } catch (scrapeErr) {
            console.warn(`[RegionDiscovery] Failed to preview ${results[i].url} for enrichment.`);
          }
        }
        // ------------------------------
        
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

  // De-duplicate search results by Exact URL (not domain, since directories have many brands!)
  const seenUrls = new Set<string>();
  const uniqueResults = allSearchResults.filter(r => {
    try {
      // Remove trailing slash for better deduplication
      const cleanUrl = r.url.toLowerCase().replace(/\/$/, '');
      if (seenUrls.has(cleanUrl)) return false;
      seenUrls.add(cleanUrl);
      return true;
    } catch {
      return false;
    }
  });

  console.log(`[RegionDiscovery] ${allSearchResults.length} total results → ${uniqueResults.length} unique domains`);

  // ─── STEP 3: AI extraction — extract brand names + websites from results ──
  const brands = await extractBrandsFromResults(uniqueResults, region, maxBrands, category);

  console.log(`[RegionDiscovery] AI extracted ${brands.length} brands for "${region}"`);
  return brands;
}

// ─── SEARCH QUERY BUILDER ──────────────────────────────────────────────────────
// Generates multiple search queries to maximize coverage for a region.
// Focused on shirts/apparel matching Aquarelle's capabilities.
function buildSearchQueries(region: string, maxBrands: number, industrySources: string[] = [], targetCountry?: string, category?: string): string[] {
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
    'Latin America': ['Brazil', 'Colombia', 'Argentina', 'Chile', 'Peru'],
    'Oceania': ['Australia', 'New Zealand']
  };

  const countries = targetCountry ? [targetCountry] : (regionCountries[region] || [region]);
  const queries: string[] = [];

  // Add highly targeted queries for discovered trade fairs and databases
  for (const source of industrySources) {
    queries.push(`"${source}" exhibitor list apparel brands`);
    queries.push(`brands listed in "${source}" apparel fashion`);
    queries.push(`"${source}" participating brands official website`);
  }

  const catStr = category && category !== 'all' ? `${category} ` : '';
  
  // Core discovery queries — broader to catch more, but still apparel focused
  const templates = [
    (c: string) => `top ${catStr}shirt brands in ${c}`,
    (c: string) => `list of ${catStr}shirt companies ${c}`,
    (c: string) => `emerging independent ${catStr}shirt brands ${c}`,
    (c: string) => `boutique ${catStr} brands ${c}`,
    (c: string) => `mid-sized ${catStr}shirts companies ${c}`,
    (c: string) => `independent ${catStr}shirt labels ${c}`,
    (c: string) => `niche ${catStr}shirt brands based in ${c}`,
    (c: string) => `direct to consumer ${catStr}shirt brands ${c}`,
    (c: string) => `"50 best" ${catStr} shirt brands ${c}`,
    (c: string) => `"100 independent" ${catStr} shirt brands ${c}`,
    (c: string) => `${catStr} shirts brand directory ${c} -site:pinterest.com`,
    (c: string) => `"100 best" ${catStr} shirt brands ${c}`,
    (c: string) => `"100 independent" ${catStr} shirt brands ${c}`,
    (c: string) => `"75 best" ${catStr} shirt brands ${c}`,
    (c: string) => `"top 100" ${catStr} shirt companies ${c}`,
    (c: string) => `"20 best" ${catStr} startup shirt brands ${c}`,
    (c: string) => `"best new" ${catStr} shirt brands 2026 ${c}`,
    (c: string) => `${catStr} shirt brand list site:faire.com ${c}`,
    (c: string) => `${catStr} shirts exhibitor list ${c} trade show`,
    (c: string) => `${catStr} shirt brands "wholesale directory" ${c}`,
    (c: string) => `${catStr} shirt brand database ${c}`,
    (c: string) => `${catStr} shirt brands "we love" ${c} roundup`,
    (c: string) => `${catStr} shirt brands featured Business Insider ${c}`,
    (c: string) => `${catStr} shirt brands "you should know" ${c}`,
    (c: string) => `${catStr} brands "hidden gem" shirts ${c}`,
    (c: string) => `${catStr} shirt brands "we love" ${c} roundup`,
    (c: string) => `${catStr} brands "hidden gem" shirts ${c}`,
    (c: string) => `${catStr} shirt brands "top picks" ${c}`,
    (c: string) => `${catStr} brands "must try" ${c}`,
    (c: string) => `${catStr} shirt brands "up and coming" ${c}`,
    (c: string) => `${catStr} shirt brands "emerging" ${c} 2026`,
    (c: string) => `${catStr} shirt brands "up and coming" ${c} 2026`,
    (c: string) => `${catStr} brands "rising star" shirts ${c}`,
    (c: string) => `${catStr} shirt labels "startups" ${c}`,
    (c: string) => `${catStr} shirt brands "made in ${c}"`,
    (c: string) => `${catStr} shirt brands startup funding ${c} seed round`,
    (c: string) => `${catStr} DTC shirt brand raised funding ${c}`,
    (c: string) => `${catStr} shirt brand Shopify Plus case study ${c}`,
    (c: string) => `${catStr} shirt brand "sustainable certification" ${c}`,
    (c: string) => `${catStr} shirt brand "Fair Trade certified" ${c}`,
    (c: string) => `${catStr} shirt startup B Corp ${c}`,
    (c: string) => `${catStr} shirt brands "venture backed" ${c}`,
    (c: string) => `${catStr} shirt brand funding round ${c} 2026`,
    (c: string) => `${catStr} fashion tech startups ${c} funding`,
    (c: string) => `${catStr} shirt brand accelerator program ${c}`,
    (c: string) => `${catStr} shirt startup pitch deck ${c}`,
    (c: string) => `site:ankorstore.com ${catStr}shirts ${c}`,
    (c: string) => `site:faire.com ${catStr}shirts ${c}`,
    (c: string) => `site:therealreal.com OR site:goodhousekeeping.com ${catStr}brands ${c}`,
    (c: string) => `${catStr} shirt boutique "brands we carry" ${c}`,
    (c: string) => `${catStr} multi-brand store "our brands" ${c}`,
    (c: string) => `department store ${catStr}brands list ${c}`,
    (c: string) => `online ${catStr}shirts marketplace ${c}`,
    (c: string) => `fashion wholesale platform ${catStr}brands ${c}`,
    (c: string) => `curated ${catStr}shirts marketplace ${c}`,
    (c: string) => `${catStr}shirt brand collaborations ${c}`,
    (c: string) => `fashion influencer partnerships ${catStr}brands ${c}`,
    (c: string) => `micro-influencer marketing ${catStr}brands ${c}`,
    (c: string) => `sustainable ${catStr}shirt brand ${c}`,
    (c: string) => `eco-friendly ${catStr}fashion ${c} startups`,
    (c: string) => `ethical ${catStr}shirt brand ${c}`,
    (c: string) => `${catStr}shirt brand "on Instagram" ${c}`,
    (c: string) => `Instagram ${catStr}shirt brands ${c}`,
    (c: string) => `TikTok ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brands "made in ${c}" OR "designed in ${c}" -jobs -hiring`,
    (c: string) => `${catStr}shirt startups "seed funding" OR "angel investment" ${c}`,
    (c: string) => `${catStr}shirt brand "B Corp certified" OR "Fair Trade" ${c}`,
    (c: string) => `site:faire.com ${catStr}shirts ${c}`,
    (c: string) => `site:ankorstore.com ${catStr}shirts ${c}`,
    (c: string) => `site:trendsi.com ${catStr}brands ${c}`,
    (c: string) => `${catStr}shirt startup "venture backed" OR "raised funding" ${c}`,
    (c: string) => `"top 100" ${catStr}shirt brands ${c} -wikipedia -investopedia`,
    (c: string) => `${catStr}independent ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}niche ${catStr}shirt labels ${c} 2025`,
    (c: string) => `${catStr}emerging ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}DTC ${catStr}shirts ${c} brands 2025`,
    (c: string) => `"best new" ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt startup "accelerator program" ${c}`,
    (c: string) => `${catStr}sustainable ${catStr}shirt brands ${c}`,
    (c: string) => `eco-friendly ${catStr}fashion ${c}`,
    (c: string) => `ethical ${catStr}shirts ${c} brands ${c}`,
    (c: string) => `small ${catStr}shirt brands ${c} boutique`,
    (c: string) => `${catStr}boutique ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}mid-sized ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brand "wholesale directory" ${c}`,
    (c: string) => `online ${catStr}shirts ${c}`,
    (c: string) => `${catStr}shirt brands "featured in Vogue" ${c}`,
    (c: string) => `${catStr}shirt brands "featured in GQ" ${c}`,
    (c: string) => `${catStr}shirt brands "Good Housekeeping" ${c}`,
    (c: string) => `"100 best" ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brand directory ${c}`,
    (c: string) => `top ${catStr}shirt brands ${c}`,
    (c: string) => `list of ${catStr}shirt companies ${c}`,
    (c: string) => `"top 50" ${catStr}shirt brands ${c}`,
    (c: string) => `"top 25" ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt startup funding ${c}`,
    (c: string) => `${catStr}DTC shirt brand funding ${c}`,
    (c: string) => `${catStr}sustainable shirt brands ${c}`,
    (c: string) => `ethical ${catStr}shirt brands ${c}`,
    (c: string) => `emerging ${catStr}shirt brands ${c}`,
    (c: string) => `boutique ${catStr}shirts ${c}`,
    (c: string) => `small ${catStr}shirt brands ${c}`,
    (c: string) => `mid-sized ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brand "made in ${c}"`,
    (c: string) => `${catStr}shirt brand "Fair Trade" ${c}`,
    (c: string) => `${catStr}shirt brands "B Corp" ${c}`,
    (c: string) => `"Wholesale Clothing Brands" ${c}`,
    (c: string) => `"Apparel Suppliers" ${c}`,
    (c: string) => `${catStr}shirt brands "startup funding" 2026 ${c}`,
    (c: string) => `${catStr}shirt brands "seed funding" 2026 ${c}`,
    (c: string) => `${catStr}shirt brands "angel investment" 2026 ${c}`,
    (c: string) => `${catStr}shirts startup "venture backed" ${c}`,
    (c: string) => `${catStr}shirt brands "raised funding" 2026 ${c}`,
    (c: string) => `top ${catStr}shirt brands ${c}`,
    (c: string) => `best ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brands to watch ${c}`,
    (c: string) => `${catStr}shirt startups ${c}`,
    (c: string) => `${catStr}emerging ${catStr}shirt brands ${c}`,
    (c: string) => `boutique ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}independent ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}niche ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}sustainable ${catStr}shirt brands ${c}`,
    (c: string) => `eco-friendly ${catStr}shirts ${c} brands ${c}`,
    (c: string) => `ethical ${catStr}shirts ${c} brands ${c}`,
    (c: string) => `${catStr}shirt brands "made in ${c}" OR "designed in ${c}"`, 
    (c: string) => `${catStr}shirt brands "fair trade certified" ${c}`,
    (c: string) => `${catStr}shirt startups "B Corp" ${c}`,
    (c: string) => `${catStr}shirt brands "online wholesale" ${c}`,
    (c: string) => `${catStr}shirt brands "wholesale directory" ${c}`,
    (c: string) => `${catStr}shirt brand directory ${c}`,
    (c: string) => `${catStr}shirts "startup funding" ${c}`,
    (c: string) => `${catStr}shirt brands "venture funded" ${c}`,
    (c: string) => `${catStr}shirt brands "accelerator program" ${c}`,
    (c: string) => `${catStr}shirt startup "pitch deck" ${c}`,
    (c: string) => `${catStr}shirt brands "top emerging" ${c}`,
    (c: string) => `${catStr}shirt brands "rising stars" ${c}`,
    (c: string) => `${catStr}shirt brands "designers to watch" ${c}`,
    (c: string) => `"100 best" ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brands "featured in Vogue" ${c}`,
    (c: string) => `${catStr}shirt brands "featured in GQ" ${c}`,
    (c: string) => `${catStr}shirt brands "Good Housekeeping" ${c}`,
    (c: string) => `${catStr}shirt brands "Wholesale" ${c}`,
    (c: string) => `${catStr}shirt brands "B2B" ${c}`,
    (c: string) => `${catStr}shirt brand "we love" ${c}`,
    (c: string) => `${catStr}shirt brands "hidden gems" ${c}`,
    (c: string) => `${catStr}shirt brands "brands you need to know" ${c}`,
    (c: string) => `top ${catStr}shirt startups ${c}`,
    (c: string) => `best ${catStr}sustainable shirts ${c}`,
    (c: string) => `${catStr}ethical ${catStr}shirt startups ${c}`,
    (c: string) => `${catStr}shirt brands "on Instagram" ${c}`,
    (c: string) => `Instagram ${catStr}shirt brands ${c}`,
    (c: string) => `TikTok ${catStr}shirt brands ${c}`,
    (c: string) => `best ${catStr}sustainable shirt brands ${c}`,
    (c: string) => `${catStr}ethical ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brands "made in ${c}" OR "designed in ${c}"`,
    (c: string) => `${catStr}shirt brands "Fair Trade" ${c}`,
    (c: string) => `${catStr}shirt brands "B Corp" ${c}`,
    (c: string) => `top ${catStr}sustainable ${catStr}shirts ${c}`,
    (c: string) => `${catStr}ethical ${catStr}shirts ${c}`,
    (c: string) => `${catStr}eco-friendly ${catStr}fashion ${c}`,
    (c: string) => `${catStr}shirt brands "fair trade" ${c}`,
    (c: string) => `${catStr}shirt brands "B-Corp" ${c}`,
    (c: string) => `best ${catStr}ethical ${catStr}fashion ${c}`,
    (c: string) => `${catStr}sustainable ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}ethical ${catStr}shirts ${c}`,
    (c: string) => `${catStr}shirt brands "on Instagram" ${c}`,
    (c: string) => `Instagram ${catStr}shirt brands ${c}`,
    (c: string) => `TikTok ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brands "Wholesale" ${c}`,
    (c: string) => `${catStr}shirt brands "B2B" ${c}`,
    (c: string) => `${catStr}shirt brand "we love" ${c}`,
    (c: string) => `${catStr}shirt brands "hidden gems" ${c}`,
    (c: string) => `${catStr}shirt brands "brands you need to know" ${c}`,
    (c: string) => `top ${catStr}shirt startups ${c}`,
    (c: string) => `best ${catStr}sustainable shirts ${c}`,
    (c: string) => `${catStr}ethical ${catStr}shirt startups ${c}`,
    (c: string) => `${catStr}shirt brands "on Instagram" ${c}`,
    (c: string) => `Instagram ${catStr}shirt brands ${c}`,
    (c: string) => `TikTok ${catStr}shirt brands ${c}`,
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
  const targetArea = targetCountry || region;
  queries.push(`${category && category !== 'all' ? category + ' ' : ''}apparel clothing companies "${targetArea}" fashion brand list`);

  return queries;
}

// ─── INDUSTRY SOURCES DISCOVERY ────────────────────────────────────────────────
async function discoverIndustrySources(browser: any, region: string, targetCountry?: string): Promise<string[]> {
  let allSearchResults: { title: string; snippet: string; url: string }[] = [];

  try {
    const targetArea = targetCountry || region;
    const queries = [
      `top apparel trade shows in ${targetArea} 2026, 2025, 2024`,
      `fashion brand directories databases ${targetArea}`,
      `apparel industry B2B portals list ${targetArea}`
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

  const userPrompt = `Extract all the major apparel trade fairs or industry databases for the region: ${region}.
  
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
      }
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
  category?: string): Promise<DiscoveredBrand[]> {
  
  const CHUNK_SIZE = 40;
  const chunks: { title: string; snippet: string; url: string }[][] = [];
  for (let i = 0; i < searchResults.length; i += CHUNK_SIZE) {
    chunks.push(searchResults.slice(i, i + CHUNK_SIZE));
  }

  const systemPrompt = `You are a brand discovery analyst.
Your job: extract actual apparel/fashion brand companies from search results.

RULES:
1. Only extract REAL brand companies — not directories, news articles, blog posts, or marketplace listings.
2. The URL must be the brand's official website (not social media, not a third-party directory).
3. Skip brands that are purely: workwear, footwear-only, accessories-only, luxury haute couture with in-house production, or fast-fashion giants (Zara, H&M, Shein).
4. CRITICAL PRODUCT RULE: You MUST ONLY extract brands that sell SHIRTS. If they do not sell shirts, you MUST set sells_shirts to false.
5. CRITICAL GEOGRAPHY RULE: You MUST verify the brand is originally founded, headquartered, or primarily native to: ${region}. DO NOT include massive global conglomerates just because they operate there. If a brand is NOT native to ${region}, you MUST set matches_region to false.
6. CRITICAL CATEGORY RULE: ${category && category !== 'all' ? `You MUST ONLY extract brands that sell ${category}. If they do not sell ${category}, set matches_category to false.` : 'Extract brands selling menswear or womenswear.'}
7. Output raw JSON only — no markdown fences, no preamble.`;

  const allExtractedBrands: DiscoveredBrand[] = [];

  // We run in small batches to not overwhelm the LLM (which gets lazy on large lists)
  for (let i = 0; i < chunks.length; i += 3) {
    if (allExtractedBrands.length >= maxBrands) break;
    
    const batchChunks = chunks.slice(i, i + 3);
    const batchPromises = batchChunks.map(async (chunk) => {
      const resultsText = chunk
        .map((r, idx) => `[${idx + 1}] URL: ${r.url}\n    Title: ${r.title}\n    Snippet: ${r.snippet}`)
        .join('\n\n');

      const userPrompt = `Extract apparel/fashion brand companies from these search results for the region: ${region}

SEARCH RESULTS:
${resultsText}

CRITICAL MAX BRANDS GOAL: We have a strict target to find hundreds of brands (up to ${maxBrands}), so DO NOT HOLD BACK—extract EVERY SINGLE VALID BRAND you see in this batch. For each brand, provide:
- name: the brand's actual name
- website: the brand's official website URL
- country: the specific country this brand is based in
- is_actual_apparel_brand: true only if it is a real clothing brand. false if it is a directory.
- sells_shirts: true ONLY if the brand sells shirts/blouses.
- matches_region: true ONLY if the brand is native to ${region}.
- matches_category: true ONLY if the brand sells the target category (${category || 'apparel'}).

Respond with ONLY this JSON (Do NOT include reasoning or descriptions to save space):
{
  "brands": [
    {
      "name": "Brand Name",
      "website": "https://example.com",
      "country": "Country",
      "is_actual_apparel_brand": true,
      "sells_shirts": true,
      "matches_region": true,
      "matches_category": true
    }
  ]
}`;

      try {
        const { result } = await generateStructuredResponse<{ brands: any[] }>(
          systemPrompt,
          userPrompt,
          (text: string) => {
            const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            
                        let parsed;
            try {
              parsed = JSON.parse(cleaned);
            } catch (parseError) {
              console.warn('[RegionDiscovery] JSON parse failed, salvaging via Regex...', parseError);
              try {
                const salvagedBrands = [];
                const blocks = cleaned.split('{');
                for (const block of blocks) {
                  const nameMatch = block.match(/"name"\s*:\s*"([^"]+)"/);
                  const webMatch = block.match(/"website"\s*:\s*"([^"]+)"/);
                  const countryMatch = block.match(/"country"\s*:\s*"([^"]+)"/);
                  const actualMatch = block.match(/"is_actual_apparel_brand"\s*:\s*(true|false)/);
                  const shirtsMatch = block.match(/"sells_shirts"\s*:\s*(true|false)/);
                  const regionMatch = block.match(/"matches_region"\s*:\s*(true|false)/);
                  const catMatch = block.match(/"matches_category"\s*:\s*(true|false)/);
                  
                  if (nameMatch && webMatch) {
                    salvagedBrands.push({
                      name: nameMatch[1].trim(),
                      website: webMatch[1].trim(),
                      country: countryMatch ? countryMatch[1].trim() : region,
                      is_actual_apparel_brand: actualMatch ? actualMatch[1] === 'true' : true,
                      sells_shirts: shirtsMatch ? shirtsMatch[1] === 'true' : true,
                      matches_region: regionMatch ? regionMatch[1] === 'true' : true,
                      matches_category: catMatch ? catMatch[1] === 'true' : true,
                    });
                  }
                }
                parsed = { brands: salvagedBrands };
                if (salvagedBrands.length === 0) throw new Error('Regex found 0 brands');
              } catch (e2) {
                console.error('[RegionDiscovery] Regex Salvage failed, skipping chunk.');
                return { brands: [] };
              }
            }

            if (!Array.isArray(parsed.brands)) return { brands: [] };

            const validBrands = parsed.brands
              .filter((b: any) => 
                b && 
                typeof b.name === 'string' && 
                typeof b.website === 'string' &&
                b.is_actual_apparel_brand === true &&
                b.sells_shirts === true &&
                b.matches_region === true &&
                (b.matches_category === true || b.matches_category === undefined)
              )
              .map((b: any) => ({
                name: b.name.trim(),
                website: normalizeUrl(b.website.trim()),
                country: String(b.country || region).trim(),
                description: 'Apparel brand discovered during region scan.'
              }))
              .slice(0, 50);

            return { brands: validBrands };
          }
        );
        return result.brands;
      } catch (error) {
        console.error('[RegionDiscovery] LLM chunk extraction completely failed:', error);
        return [];
      }
    });

    const results = await Promise.all(batchPromises);
    
    // Deduplicate on the fly
    for (const chunkBrands of results) {
      for (const brand of chunkBrands) {
        if (allExtractedBrands.length >= maxBrands) break;
        if (!allExtractedBrands.some(b => b.website === brand.website || b.name.toLowerCase() === brand.name.toLowerCase())) {
          allExtractedBrands.push(brand);
        }
      }
    }
  }

  return allExtractedBrands;
}

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
