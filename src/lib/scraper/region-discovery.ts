import { generateStructuredResponse } from '../ai/router';
import { runAllSearches } from './search-orchestrator';
import { launchBrowser } from "@/lib/browser";

// Domains that will never contain useful brand data — skip instantly to save time
const SKIP_ENRICHMENT_DOMAINS = new Set([
  'tiktok.com', 'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
  'pinterest.com', 'reddit.com', 'youtube.com', 'threads.net',
  'amazon.com', 'ebay.com', 'etsy.com', 'aliexpress.com', 'alibaba.com',
  'kaggle.com', 'github.com', 'medium.com',
  'steamcommunity.com', 'archive.org', 'lusha.com', 'zoominfo.com', 'crunchbase.com', 'glassdoor.com',
  'indeed.com', 'monster.com',
]);


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
  let browser: any;
  let allSearchResults: { title: string; snippet: string; url: string }[] = [];
  try {
    browser = await launchBrowser();

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
    // Track URLs already enriched across queries to avoid redundant visits
    const enrichedUrls = new Set<string>();

    // Adaptive timeout: learns from actual page load times
    const loadTimeSamples: number[] = [];
    const getAdaptiveTimeout = () => {
      if (loadTimeSamples.length < 5) return 10000; // Start with 10s until we have enough data
      const avg = loadTimeSamples.reduce((a, b) => a + b, 0) / loadTimeSamples.length;
      // 3× average, clamped between 5s and 15s
      return Math.min(15000, Math.max(5000, Math.round(avg * 3)));
    };

    for (const query of searchQueries) {
      if ((globalThis as any).regionScanProgress && !(globalThis as any).regionScanProgress.isScanning) {
        console.log('[RegionDiscovery] Scan cancelled, stopping query loop.');
        break;
      }

      try {
        if (!browser || !browser.connected) {
          console.warn('[RegionDiscovery] Browser disconnected. Relaunching...');
          browser = await launchBrowser();
        }

        const results = await runAllSearches(browser, query);

        // --- DEEP SCRAPE ENRICHMENT (parallel batches of 5 tabs) ---
        // Filter out blocklisted domains and already-enriched URLs
        const enrichTargets = results.slice(0, 30).filter(r => {
          try {
            // Skip empty URLs
            if (!r.url || !r.url.trim()) return false;
            const urlStr = r.url.startsWith('http') ? r.url : `https://${r.url}`;
            const hostname = new URL(urlStr).hostname.replace(/^www\./, '');
            // Skip blocklisted domains
            if (SKIP_ENRICHMENT_DOMAINS.has(hostname) ||
              [...SKIP_ENRICHMENT_DOMAINS].some(d => hostname.endsWith('.' + d))) {
              return false;
            }
            // Skip already-enriched URLs
            const cleanUrl = urlStr.toLowerCase().replace(/\/$/, '');
            if (enrichedUrls.has(cleanUrl)) return false;
            enrichedUrls.add(cleanUrl);
            return true;
          } catch {
            return false;
          }
        });
        console.log(`[RegionDiscovery] Enriching ${enrichTargets.length}/${results.length} URLs (skipped ${results.length - enrichTargets.length} blocked/duplicate)`);
        const BATCH_SIZE = 5;
        for (let batchStart = 0; batchStart < enrichTargets.length; batchStart += BATCH_SIZE) {
          if ((globalThis as any).regionScanProgress && !(globalThis as any).regionScanProgress.isScanning) break;
          if (!browser || !browser.connected) break;

          const batch = enrichTargets.slice(batchStart, batchStart + BATCH_SIZE);
          await Promise.allSettled(batch.map(async (result) => {
            let page: any;
            try {
              if (!browser.connected) return;

              // Wrap the entire tab lifecycle in a hard timeout to prevent indefinite hangs
              const adaptiveTimeout = getAdaptiveTimeout();
              const startTime = Date.now();

              const enrichmentTask = (async () => {
                page = await browser.newPage();
                // Request interception removed — it caused deadlocks on some websites

                const targetUrl = result.url.startsWith('http') ? result.url : `https://${result.url}`;
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: adaptiveTimeout });

                const scrapeData = await page.evaluate(() => {
                  const text = document.body.innerText.substring(0, 6000);
                  const links = Array.from(document.querySelectorAll('a'))
                    .map(a => a.href)
                    .filter(href => href.startsWith('http') && !href.includes(window.location.hostname))
                    .filter(href => !href.includes('facebook.com') && !href.includes('instagram.com') && !href.includes('twitter.com') && !href.includes('linkedin.com') && !href.includes('pinterest.com'));
                  const uniqueLinks = [...new Set(links)].slice(0, 40);
                  return { text, uniqueLinks };
                });

                // Record successful load time for adaptive timeout
                loadTimeSamples.push(Date.now() - startTime);
                // Keep only the last 20 samples so it adapts to recent network conditions
                if (loadTimeSamples.length > 20) loadTimeSamples.shift();

                if (scrapeData.text && scrapeData.text.trim().length > 0) {
                  result.snippet += "\n[WEBSITE PREVIEW]: " + scrapeData.text.replace(/\n+/g, ' ');
                }
                if (scrapeData.uniqueLinks.length > 0) {
                  result.snippet += "\n[EXTERNAL LINKS DETECTED]: " + scrapeData.uniqueLinks.join(', ');
                }
              })();

              // Suppress unhandled rejections if the task throws an error AFTER the timeout has already triggered
              enrichmentTask.catch(() => { });

              await Promise.race([
                enrichmentTask,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Enrichment hard timeout')), adaptiveTimeout))
              ]);
            } catch (scrapeErr) {
              console.warn(`[RegionDiscovery] Failed to preview ${result.url} for enrichment.`);
            } finally {
              if (page && !page.isClosed()) {
                // Do not await page.close() — if the browser tab is deadlocked, it will hang the entire batch
                page.close().catch(() => { });
              }
            }
          }));
        }
        // ------------------------------

        allSearchResults.push(...results);
        console.log(`[RegionDiscovery] Query "${query}" → ${results.length} results (total: ${allSearchResults.length})`);
        // Small delay between searches
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.warn(`[RegionDiscovery] Search query failed: "${query}"`, e instanceof Error ? e.message : e);
      }
    }
    // End of discovery loop

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
    const brands = await extractBrandsFromResults(uniqueResults, region, maxBrands, category, targetCountry);

    console.log(`[RegionDiscovery] AI extracted ${brands.length} candidate brands. Starting Two-Pass Verification...`);

    const verifiedBrands = await verifyDiscoveredBrands(brands, browser, region, category, targetCountry);

    console.log(`[RegionDiscovery] Two-Pass Verification complete. ${verifiedBrands.length} verified brands for "${region}"`);
    return verifiedBrands;

  } finally {
    if (browser) {
      // Wrap browser.close() in a timeout because deadlocked tabs can cause it to hang forever
      await Promise.race([
        browser.close(),
        new Promise(r => setTimeout(r, 3000))
      ]).catch(() => { });
    }
  }
}

async function verifyDiscoveredBrands(
  brands: DiscoveredBrand[],
  browser: any,
  region: string,
  category?: string,
  targetCountry?: string
): Promise<DiscoveredBrand[]> {
  const verifiedBrands: DiscoveredBrand[] = [];

  if (!browser) return brands;

  console.log(`[Verification] Verifying ${brands.length} brands against strict criteria...`);
  const BATCH_SIZE = 5;
  for (let i = 0; i < brands.length; i += BATCH_SIZE) {
    if ((globalThis as any).regionScanProgress && !(globalThis as any).regionScanProgress.isScanning) {
      console.log('[Verification] Scan cancelled, stopping verification.');
      break;
    }

    const batch = brands.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (brand) => {
      let page: any;
      try {
        if (!browser.connected) {
          console.warn('[Verification] Browser disconnected. Falling back for this brand.');
          return brand;
        }

        page = await browser.newPage();
        const targetUrl = brand.website.startsWith('http') ? brand.website : `https://${brand.website}`;

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const websiteText = await page.evaluate(() => document.body.innerText.substring(0, 6000));

        const targetLocation = targetCountry || region;
        const systemPrompt = `You are a strict brand verification AI. 
Analyze the website text of "${brand.name}".
RULES:
1. Verify if they actually sell t-shirts, polos, knits, or activewear. If they only sell formal woven shirts, suits, shoes, or accessories, reject them.
2. Verify they are NOT a massive global fast-fashion giant (like Zara, H&M, Shein).
3. ULTRA-STRICT GEOGRAPHY RULE: Verify they are headquartered or originally founded in the EXACT COUNTRY: "${targetLocation}". If they are based anywhere else and just ship/operate there, REJECT them immediately.
Output JSON: { "is_valid": true, "reason": "brief reason why" } or { "is_valid": false, "reason": "brief reason why" }`;

        const userPrompt = `Website Text for ${brand.name} (${brand.website}):\n\n${websiteText.substring(0, 5000)}`;

        const { result } = await generateStructuredResponse<{ is_valid: boolean }>(
          systemPrompt,
          userPrompt,
          (text) => {
            const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            try {
              return JSON.parse(cleaned);
            } catch (e) {
              return { is_valid: true };
            }
          }
        );

        if (result.is_valid === false) {
          console.log(`[Verification] Rejected ${brand.name}: Failed criteria (Sportswear, Fast Fashion, or wrong region)`);
          return null;
        } else {
          return brand;
        }
      } catch (err) {
        console.warn(`[Verification] Scrape failed for ${brand.name}, attempting Gemini Search verification fallback...`);
        try {
          const targetLocation = targetCountry || region;
          const systemPrompt = `You are a strict brand verification AI. 
Research the apparel brand "${brand.name}".
RULES:
1. ANTI-HALLUCINATION: Do NOT guess or make up information. If you cannot find concrete proof that this brand exists and sells apparel online, you MUST reject it.
2. Verify if they actually sell t-shirts, polos, knits, or activewear. If they only sell formal woven shirts, suits, shoes, or accessories, reject them.
3. Verify they are NOT a massive global fast-fashion giant (like Zara, H&M, Shein).
4. ULTRA-STRICT GEOGRAPHY RULE: Verify they are headquartered or originally founded in the EXACT COUNTRY: "${targetLocation}". If they are based anywhere else and just ship/operate there, REJECT them immediately.
Output JSON: { "is_valid": true, "reason": "brief reason why" } or { "is_valid": false, "reason": "brief reason why" }`;

          const userPrompt = `Research the apparel brand ${brand.name} (website: ${brand.website}). Are they a valid apparel brand originating in ${targetLocation} according to the rules?`;

          const { result } = await generateStructuredResponse<{ is_valid: boolean }>(
            systemPrompt,
            userPrompt,
            (text) => {
              const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
              try {
                return JSON.parse(cleaned);
              } catch (e) {
                return { is_valid: true };
              }
            },
            true // Enable Google Search
          );

          if (result.is_valid === false) {
            console.log(`[Verification] Rejected ${brand.name} via Gemini Fallback: Failed criteria`);
            return null;
          } else {
            console.log(`[Verification] Approved ${brand.name} via Gemini Fallback.`);
            return brand;
          }
        } catch (geminiErr) {
          console.warn(`[Verification] Gemini fallback also failed for ${brand.name}, keeping as final fallback.`);
          return brand;
        }
      } finally {
        if (page && !page.isClosed()) {
          // Do not await to prevent deadlocks
          page.close().catch(() => { });
        }
      }
    });

    const results = await Promise.all(batchPromises);
    verifiedBrands.push(...(results.filter(b => b !== null) as DiscoveredBrand[]));
  }

  return verifiedBrands;
}

// ─── SEARCH QUERY BUILDER ──────────────────────────────────────────────────────
// Generates multiple search queries to maximize coverage for a region.
// Focused on shirts/apparel matching Tropic's capabilities.
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
  // NOTE: Deduplicated — each template appears exactly once.
  const templates = [
    (c: string) => `top ${catStr}shirt brands in ${c}`,
    (c: string) => `largest commercial ${catStr} brands ${c}`,
    (c: string) => `top premium high-street ${catStr} brands ${c}`,
    (c: string) => `list of ${catStr}clothing companies ${c}`,
    (c: string) => `emerging independent ${catStr}apparel brands ${c}`,
    (c: string) => `boutique ${catStr} brands ${c}`,
    (c: string) => `mid-sized ${catStr}shirts companies ${c}`,
    (c: string) => `independent ${catStr}fashion labels ${c}`,
    (c: string) => `niche ${catStr}shirt brands based in ${c}`,
    (c: string) => `direct to consumer ${catStr}apparel brands ${c}`,
    (c: string) => `"50 best" ${catStr} clothing brands ${c}`,
    (c: string) => `"100 independent" ${catStr} fashion brands ${c}`,
    (c: string) => `${catStr} shirts brand directory ${c} -site:pinterest.com`,
    (c: string) => `"100 best" ${catStr} apparel brands ${c}`,
    (c: string) => `"100 independent" ${catStr} shirt brands ${c}`,
    (c: string) => `"75 best" ${catStr} clothing brands ${c}`,
    (c: string) => `"top 100" ${catStr} shirt companies ${c}`,
    (c: string) => `"20 best" ${catStr} startup apparel brands ${c}`,
    (c: string) => `"best new" ${catStr} fashion brands 2026 ${c}`,
    (c: string) => `${catStr} clothing brand list site:faire.com ${c}`,
    (c: string) => `${catStr} apparel exhibitor list ${c} trade show`,
    (c: string) => `${catStr} shirt brands "wholesale directory" ${c}`,
    (c: string) => `${catStr} shirt brand database ${c}`,
    (c: string) => `${catStr} shirt brands "we love" ${c} roundup`,
    (c: string) => `${catStr} shirt brands featured Business Insider ${c}`,
    (c: string) => `${catStr} shirt brands "you should know" ${c}`,
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
    (c: string) => `best ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brands to watch ${c}`,
    (c: string) => `${catStr}shirt startups ${c}`,
    (c: string) => `${catStr}niche ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brands "made in ${c}" OR "designed in ${c}"`,
    (c: string) => `${catStr}shirt brands "fair trade certified" ${c}`,
    (c: string) => `${catStr}shirt startups "B Corp" ${c}`,
    (c: string) => `${catStr}shirt brands "online wholesale" ${c}`,
    (c: string) => `${catStr}shirts "startup funding" ${c}`,
    (c: string) => `${catStr}shirt brands "venture funded" ${c}`,
    (c: string) => `${catStr}shirt brands "accelerator program" ${c}`,
    (c: string) => `${catStr}shirt startup "pitch deck" ${c}`,
    (c: string) => `${catStr}shirt brands "top emerging" ${c}`,
    (c: string) => `${catStr}shirt brands "rising stars" ${c}`,
    (c: string) => `${catStr}shirt brands "designers to watch" ${c}`,
    (c: string) => `${catStr}shirt brands "Wholesale" ${c}`,
    (c: string) => `${catStr}shirt brands "B2B" ${c}`,
    (c: string) => `${catStr}shirt brand "we love" ${c}`,
    (c: string) => `${catStr}shirt brands "hidden gems" ${c}`,
    (c: string) => `${catStr}shirt brands "brands you need to know" ${c}`,
    (c: string) => `top ${catStr}shirt startups ${c}`,
    (c: string) => `best ${catStr}sustainable shirts ${c}`,
    (c: string) => `${catStr}ethical ${catStr}shirt startups ${c}`,
    (c: string) => `best ${catStr}sustainable shirt brands ${c}`,
    (c: string) => `${catStr}ethical ${catStr}shirt brands ${c}`,
    (c: string) => `${catStr}shirt brands "Fair Trade" ${c}`,
    (c: string) => `top ${catStr}sustainable ${catStr}shirts ${c}`,
    (c: string) => `${catStr}ethical ${catStr}shirts ${c}`,
    (c: string) => `${catStr}eco-friendly ${catStr}fashion ${c}`,
    (c: string) => `${catStr}shirt brands "fair trade" ${c}`,
    (c: string) => `${catStr}shirt brands "B-Corp" ${c}`,
    (c: string) => `best ${catStr}ethical ${catStr}fashion ${c}`,
  ];

  // We roughly need 1 query per 5 requested brands to get enough valid results
  // We already have some queries from trade fairs, so we subtract that
  const targetQueries = Math.max(5, Math.ceil(maxBrands / 5));

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
      if ((globalThis as any).regionScanProgress && !(globalThis as any).regionScanProgress.isScanning) {
        console.log('[RegionDiscovery] Scan cancelled, stopping industry sources search.');
        break;
      }
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
  category?: string,
  targetCountry?: string): Promise<DiscoveredBrand[]> {
  
  const targetLocation = targetCountry || region;

  const CHUNK_SIZE = 40;
  const chunks: { title: string; snippet: string; url: string }[][] = [];
  for (let i = 0; i < searchResults.length; i += CHUNK_SIZE) {
    chunks.push(searchResults.slice(i, i + CHUNK_SIZE));
  }

  const systemPrompt = `You are a brand discovery analyst.
Your job: extract actual apparel/fashion brand companies from search results.

RULES:
1. ANTI-HALLUCINATION: ONLY extract brands that literally exist in the provided SEARCH RESULTS text. Do NOT invent, guess, or hallucinate brands from your training data.
2. Only extract REAL brand companies — not directories, news articles, blog posts, or marketplace listings.
3. The URL must be the brand's official website (not social media, not a third-party directory).
4. Skip brands that are purely: formal workwear, footwear-only, accessories-only, luxury haute couture with in-house production, or fast-fashion giants (Zara, H&M, Shein).
5. CRITICAL PRODUCT RULE: DO NOT INCLUDE brands that do not sell knits, t-shirts, polos, or activewear. If the brand only sells formal woven shirts, suits, bottoms, accessories, shoes, or heavy outerwear, you MUST COMPLETELY REMOVE THEM from the JSON array. Only include them if they explicitly sell knitted apparel (t-shirts, polos, hoodies, activewear).
6. ULTRA-STRICT GEOGRAPHY RULE: The brand MUST be headquartered in or originally founded in EXACTLY THIS COUNTRY: "${targetLocation}". If the brand is headquartered in the USA, UK, France, or ANY OTHER country, and simply has stores/operates in ${targetLocation}, you MUST 100% REJECT AND REMOVE THEM. No exceptions.
7. CRITICAL CATEGORY RULE: ${category && category !== 'all' ? `You MUST ONLY extract brands that sell ${category}. If they do not, COMPLETELY REMOVE THEM.` : 'Extract brands selling menswear or womenswear.'}
8. Output raw JSON only — no markdown fences, no preamble.

EXAMPLES OF CORRECT EVALUATION:
- "Sunspel is a premium British brand known for its luxury t-shirts and polos..." -> INCLUDE (It is premium menswear, sells t-shirts/polos, and is British).
- "Castore is a premium sportswear brand based in the UK..." -> INCLUDE (It is sportswear/activewear and UK-based).
- "Zara opens new store in London..." -> EXCLUDE (It is a fast-fashion giant).
- "Charles Tyrwhitt is known for its high-quality formal woven shirts..." -> EXCLUDE (They sell formal woven shirts, not casual knits/t-shirts).
- "H&M launches new collection..." -> EXCLUDE (Fast-fashion giant).`;

  const allExtractedBrands: DiscoveredBrand[] = [];

  // We run in small batches to not overwhelm the LLM (which gets lazy on large lists)
  for (let i = 0; i < chunks.length; i += 3) {
    if (allExtractedBrands.length >= maxBrands) break;

    const batchChunks = chunks.slice(i, i + 3);
    const batchPromises = batchChunks.map(async (chunk) => {
      const resultsText = chunk
        .map((r, idx) => `[${idx + 1}] URL: ${r.url}\n    Title: ${r.title}\n    Snippet: ${r.snippet}`)
        .join('\n\n');

      const userPrompt = `Extract apparel/fashion brand companies from these search results for the country: ${targetLocation}

SEARCH RESULTS:
${resultsText}

CRITICAL MAX BRANDS GOAL: We have a strict target to find hundreds of brands (up to ${maxBrands}), so DO NOT HOLD BACK—extract EVERY SINGLE VALID BRAND you see in this batch. For each brand, provide:
- name: the brand's actual name
- website: the brand's official website URL
- country: the specific country this brand is headquartered in (MUST BE ${targetLocation})
- is_actual_apparel_brand: true only if it is a real clothing brand. false if it is a directory.
- sells_knits: true ONLY if the brand sells t-shirts, polos, knits, or activewear.
- matches_region: true ONLY if the brand is native to ${targetLocation}.
- matches_category: true ONLY if the brand sells the target category (${category || 'apparel'}).

Respond with ONLY this JSON (Do NOT include reasoning or descriptions to save space):
{
  "brands": [
    {
      "name": "Brand Name",
      "website": "https://example.com",
      "country": "Country",
      "is_actual_apparel_brand": true,
      "sells_knits": true,
      "matches_region": true,
      "matches_category": true
    }
  ]
}`;

      try {
        console.log(`[RegionDiscovery] Sending chunk to Gemini API (extracting from ${chunk.length} search results)...`);
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
        console.log(`[RegionDiscovery] Gemini returned ${result.brands.length} valid brands from this chunk.`);
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
