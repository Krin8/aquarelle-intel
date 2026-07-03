import prisma from '@/lib/db';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/router';
import { runAllSearches } from './search-orchestrator';
import type { Browser } from 'puppeteer';

puppeteer.use(StealthPlugin());

interface CompetitorCrawlSettings {
  maxDepth: number;
  maxCompetitorsPerScan: number;
}

interface DiscoveredCompetitor {
  name: string;
  website: string;
  industry: string;
  parentCompany?: string;
  countryOfOrigin?: string;
  city?: string;
  state?: string;
  turnover?: string;
  storesCount?: number;
  retailPriceMensShirt?: string;
  productType?: string;
  targetCustomers: string;
  businessModel: string;
  marketPosition: string;
  swotStrengths: string[];
  swotWeaknesses: string[];
  swotOpps: string[];
  swotThreats: string[];
  pricingStrategy?: string;
  reasoning: string;
  scores: Array<{ metricName: string; score: number; evidence: string }>;
}

export async function startCompetitorDiscovery(targetBrandId: string, settings: CompetitorCrawlSettings) {
  const targetBrand = await prisma.brand.findUnique({ where: { id: targetBrandId } });
  if (!targetBrand) throw new Error('Target brand not found');

  // Fire and forget background worker
  processCompetitorQueue(targetBrandId, targetBrand.name, settings).catch(console.error);

  return { success: true, message: 'Competitor discovery started in background' };
}

async function processCompetitorQueue(targetBrandId: string, targetBrandName: string, settings: CompetitorCrawlSettings) {
  console.log(`[CompetitorCrawler] Starting discovery for ${targetBrandName}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: './.puppeteer_data',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    // ─── STEP 1: Discover via Search Engines ─────────────────────────────────
    const queries = [
      `best alternatives to ${targetBrandName} apparel`,
      `companies like ${targetBrandName}`,
      `competitors to ${targetBrandName} fashion brand`,
    ];

    const allSearchResults: { title: string; snippet: string; url: string }[] = [];

    for (const query of queries) {
      try {
        const results = await runAllSearches(browser, query);
        allSearchResults.push(...results);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.warn(`[CompetitorCrawler] Search failed for "${query}"`);
      }
    }

    if (allSearchResults.length === 0) {
      console.log(`[CompetitorCrawler] No initial search results found.`);
      return;
    }

    // ─── STEP 2: Extract Competitor URLs using AI ────────────────────────────
    const searchContext = allSearchResults
      .slice(0, 30)
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
      .join('\n\n');

    const listPrompt = `You are a market analyst. Given the search results looking for alternatives to ${targetBrandName}, extract the names and URLs of their primary competitors.
Do NOT include review sites (like G2 or Trustpilot), generic news sites, or ${targetBrandName} itself. Only include actual competing businesses/brands.

Extract up to ${settings.maxCompetitorsPerScan} competitors. Return ONLY JSON.
Format: { "competitors": [{ "name": "Company X", "url": "https://..." }] }`;

    let discoveredUrls: { name: string; url: string }[] = [];
    try {
      const { result } = await generateStructuredResponse<{ competitors: { name: string, url: string }[] }>(
        listPrompt,
        searchContext,
        (text: string) => {
          const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          return JSON.parse(cleaned);
        }
      );
      discoveredUrls = result.competitors || [];
    } catch (e) {
      console.error(`[CompetitorCrawler] Failed to extract competitors from search results:`, e);
      return;
    }

    // ─── STEP 3: Deep Analysis of Each Competitor ────────────────────────────
    for (const comp of discoveredUrls) {
      // Check limits
      const count = await prisma.competitorProfile.count({ where: { targetBrandId } });
      if (count >= settings.maxCompetitorsPerScan) break;

      if (!comp.url || !comp.url.startsWith('http')) continue;

      // Check if already exists
      const existing = await prisma.competitorProfile.findUnique({
        where: { targetBrandId_name: { targetBrandId, name: comp.name } }
      });
      if (existing) continue;

      console.log(`[CompetitorCrawler] Deep crawling competitor: ${comp.name} -> ${comp.url}`);
      
      try {
        const pageData = await scrapeDeepDetails(browser, comp.url);
        if (!pageData.text || pageData.text.length < 200) {
           console.log(`[CompetitorCrawler] Not enough text scraped for ${comp.name}`);
           continue;
        }

        const analysis = await analyzeCompetitorProfile(pageData.text, comp.name, targetBrandName);
        
        if (!analysis || analysis.scores.length === 0) continue;

        const amazonRes = await runAllSearches(browser, `"${comp.name}" apparel site:amazon.com`);

        const alibabaRes = await runAllSearches(browser, `"${comp.name}" apparel site:alibaba.com`);
        
        let marketplaceFootprint = '';
        if (amazonRes.length > 0) marketplaceFootprint += 'Found on Amazon. ';
        if (alibabaRes.length > 0) marketplaceFootprint += 'Found on Alibaba. ';
        if (!marketplaceFootprint) marketplaceFootprint = 'No major marketplace presence detected.';

        // Persist to DB
        const profile = await prisma.competitorProfile.create({
          data: {
            targetBrandId,
            name: comp.name,
            website: comp.url,
            industry: analysis.industry,
            parentCompany: analysis.parentCompany,
            countryOfOrigin: analysis.countryOfOrigin,
            city: analysis.city,
            state: analysis.state,
            turnover: analysis.turnover,
            storesCount: analysis.storesCount,
            retailPriceMensShirt: analysis.retailPriceMensShirt,
            productType: analysis.productType,
            targetCustomers: analysis.targetCustomers,
            businessModel: analysis.businessModel,
            marketPosition: analysis.marketPosition + '\n\nMarketplaces: ' + marketplaceFootprint,
            swotStrengths: JSON.stringify(analysis.swotStrengths),
            swotWeaknesses: JSON.stringify(analysis.swotWeaknesses),
            swotOpps: JSON.stringify(analysis.swotOpps),
            swotThreats: JSON.stringify(analysis.swotThreats),
            socialLinks: JSON.stringify(pageData.socials),
            reasoning: analysis.reasoning,
            depth: 1,
            // Create Scores
            scores: {
              create: analysis.scores.map(s => ({
                metricName: s.metricName,
                score: s.score,
                evidence: s.evidence,
                confidence: 0.85
              }))
            }
          }
        });

        // Create a snapshot for historical tracking
        await prisma.competitorSnapshot.create({
          data: {
            competitorId: profile.id,
            techStack: JSON.stringify(pageData.techStack), 
            pricingData: analysis.pricingStrategy || "Unknown",
          }
        });

      } catch (err) {
        console.error(`[CompetitorCrawler] Failed to process ${comp.name}:`, err);
      }
    }

  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── AI DEEP ANALYSIS ────────────────────────────────────────────────────────
import { getAquarelleContextString } from '../knowledge/aquarelle-kb';

export async function analyzeCompetitorProfile(pageText: string, competitorName: string, targetBrandName: string): Promise<DiscoveredCompetitor | null> {
  const aquarelleCtx = getAquarelleContextString();
  const systemPrompt = `You are an elite Enterprise Sales Intelligence Analyst working for Aquarelle India.
Analyze the following webpage text of a company named ${competitorName}, which is a competitor to our prospect ${targetBrandName}.
Your objective is to perform Dual Competitive Intelligence:
1. Target Company (${targetBrandName}) vs Industry Competitor (${competitorName})
2. Target Company (${targetBrandName}) vs Aquarelle India

${aquarelleCtx}

CRITICAL INSTRUCTIONS:
- You MUST prioritize the most recent, up-to-date information available. Look for recent years (e.g., 2026, 2025, 2024) for revenue and store counts. Ignore outdated historical data if newer data is present.
- Format revenue/turnover concisely (e.g., "$1.2B", "$500M"). Do not output raw large numbers.
- If a brand is part of a larger conglomerate (e.g., Abercrombie & Fitch Co. for Hollister), specify the parent company in the parentCompany field. If independent, leave null.
- City must ONLY contain the name of the city, absolutely no other text.
- State should be standard postal abbreviation if US (e.g., "NY", "CA").
- If the provided text does not contain the answer, rely on your internal knowledge base to fill in the gaps as best as possible.

Return ONLY a JSON object with the following structure:
{
  "industry": "Apparel, E-commerce, etc.",
  "parentCompany": "Parent company name if any, else null",
  "countryOfOrigin": "e.g. USA, UK",
  "city": "e.g. San Francisco",
  "state": "e.g. CA",
  "turnover": "e.g. $1.5B (estimate if needed)",
  "storesCount": 150,
  "retailPriceMensShirt": "e.g. $45",
  "productType": "e.g. Casual Apparel, Swimwear",
  "targetCustomers": "Who do they sell to?",
  "businessModel": "D2C, Wholesale, B2B?",
  "marketPosition": "Luxury, Budget, Sustainable, etc.",
  "swotStrengths": ["Strength 1 (vs Prospect)"],
  "swotWeaknesses": ["Weakness 1 (vs Prospect)"],
  "swotOpps": ["Opportunity for Aquarelle against this competitor"],
  "swotThreats": ["Threat to Aquarelle winning this deal"],
  "pricingStrategy": "Details about their pricing, tiers, discounts, or 'Unknown'",
  "reasoning": "Why are they a competitor to ${targetBrandName}, and how can Aquarelle beat them?",
  "scores": [
    { "metricName": "Aquarelle Capability Match", "score": 90, "evidence": "Competitor lacks sustainable linen, which Aquarelle specializes in." },
    { "metricName": "Competitor Brand Strength", "score": 85, "evidence": "Strong online presence" },
    { "metricName": "Product Overlap Risk", "score": 70, "evidence": "High overlap in basic woven shirts" }
  ]
}

For scores, pick 0-100. Generate exactly 5 scores evaluating the competitor's threat level and Aquarelle's win probability.`;

  const userPrompt = `Analyze ${competitorName}'s website content:

${pageText}`;

  try {
    const { result } = await generateStructuredResponse<DiscoveredCompetitor>(
      systemPrompt,
      userPrompt,
      (text: string) => {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
      }
    );
    return result;
  } catch (error) {
    console.error(`[CompetitorCrawler] AI Profiling failed for ${competitorName}:`, error);
    return null;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export async function scrapeDeepDetails(browser: Browser, url: string): Promise<{ text: string; techStack: string[]; socials: string[] }> {
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);

    const extracted = await page.evaluate(() => {
      // 1. Extract Socials
      const socialLinks: string[] = [];
      document.querySelectorAll('a[href*="linkedin.com"], a[href*="instagram.com"], a[href*="twitter.com"], a[href*="facebook.com"]').forEach(a => {
        if (a instanceof HTMLAnchorElement && a.href) {
          socialLinks.push(a.href.split('?')[0]); // clean tracking params
        }
      });

      // 2. Extract Tech Stack heuristics
      const techStack = new Set<string>();
      const w = window as unknown as Record<string, unknown>;
      if (w.React || document.querySelector('[data-reactroot]')) techStack.add('React');
      if (w.next || document.querySelector('script[id="__NEXT_DATA__"]')) techStack.add('Next.js');
      if (w.Shopify || document.querySelector('script[src*="shopify"]')) techStack.add('Shopify');
      if (w.gtag || w.ga) techStack.add('Google Analytics');
      if (document.querySelector('script[src*="klaviyo"]')) techStack.add('Klaviyo');
      if (document.querySelector('meta[name="generator"][content*="WordPress"]')) techStack.add('WordPress');
      if (document.querySelector('script[src*="stripe"]')) techStack.add('Stripe');

      // 3. Extract Text
      document.querySelectorAll('script, style, nav, footer, header, .cookie-banner').forEach(el => el.remove());
      const text = document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 15000);

      return {
        text,
        techStack: Array.from(techStack),
        socials: Array.from(new Set(socialLinks))
      };
    });

    return extracted;
  } finally {
    await page.close().catch(() => {});
  }
}
