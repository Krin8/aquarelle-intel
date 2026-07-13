import { generateStructuredResponse } from '../ai/router';
import { URL } from 'url';
import { launchBrowser } from "@/lib/browser";

// Use stealth to avoid DDG blocks

/**
 * Automatically searches for and extracts the corporate/parent website 
 * domain for a given brand name using a hybrid Search + AI approach.
 */
export async function findCorporateUrl(brandName: string, retailUrl: string): Promise<string | null> {
  let browser;
  try {
    browser = await launchBrowser();
    
    let retailHostname = '';
    try {
      // Extract main domain (e.g., usa.tommy.com -> tommy.com)
      const parsedUrl = new URL(retailUrl);
      const parts = parsedUrl.hostname.split('.');
      if (parts.length >= 2) {
        retailHostname = parts.slice(-2).join('.');
      } else {
        retailHostname = parsedUrl.hostname;
      }
    } catch {}

    const page = await browser.newPage();
    const query = encodeURIComponent(`"${brandName}" OR ${retailHostname} corporate headquarters newsroom contact`);
    await page.goto(`https://duckduckgo.com/html/?q=${query}`, { waitUntil: 'domcontentloaded' });
    
    await page.waitForSelector('.result', { timeout: 10000 }).catch(() => null);
    
    const searchResults = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.result')).slice(0, 10).map((el: any) => {
        const title = el.querySelector('.result__title')?.innerText || '';
        const snippet = el.querySelector('.result__snippet')?.innerText || '';
        const url = el.querySelector('.result__url')?.innerText || '';
        return { title, snippet, url };
      });
    });

    await browser.close();

    if (searchResults.length === 0) return null;

    const systemPrompt = `You are a strict URL classifier. Your only job is to pick ONE url from a list of search results, or return null. You never invent URLs — you only select from what is given.`;

// ─── PRE-PROCESS: Numbered candidate list ────────────────────────────────────
// Strips full JSON noise — gives the model clean, indexed references.
// Saves ~60% context vs JSON.stringify and anchors reasoning to [N] format.
const candidateLines = searchResults.map((r: any, i: number) => {
  const url     = (r.url ?? r ?? '').trim();
  const title   = (r.title ?? '').slice(0, 80);
  const snippet = (r.snippet ?? r.description ?? '').slice(0, 120);
  return `[${i + 1}] ${url}\n     Title  : ${title}\n     Snippet: ${snippet}`;
});

const candidateBlock = candidateLines.join('\n\n');


// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
// One job. Three rules. No fluff.
const SYSTEM_PROMPT = `You are a URL classifier for Aquarelle, a shirts manufacturing division of CIEL Textile.
Your job: identify the single best corporate or B2B contact URL from a numbered candidate list.

ABSOLUTE RULES:
1. bestUrl MUST be copied verbatim from the CANDIDATES list — never modify, shorten, or invent a URL.
2. If no candidate qualifies, set bestUrl to null. Do not pick a "least bad" option.
3. Output raw JSON only — no markdown fences, no preamble, no commentary.`;


// ─── USER PROMPT ──────────────────────────────────────────────────────────────
const prompt = `## RETAIL DOMAIN TO REJECT
${retailUrl}
→ Also reject any URL sharing that hostname or its subdomains (e.g. shop.brand.com, brand.com/store).

## CANDIDATES (${candidateLines.length} total)
${candidateBlock}

## ACCEPT — pick only if the URL is one of:
- An official Contact, Press, Newsroom, or Investor Relations page
- A wholesale or B2B portal (e.g. wholesale.brand.com, b2b.brand.com)
- The parent or holding company's corporate homepage

## REJECT — discard immediately if the URL is:
- The retail domain above or any page/subdomain of it
- A third-party directory: LinkedIn, ZoomInfo, Crunchbase, RocketReach, Bloomberg, Yelp, Chamber of Commerce
- A social media profile (Instagram, Facebook, X, Pinterest...)
- A news article from a publication the brand does not own
- Any product, shop, cart, or checkout page

## PRIORITY (if multiple candidates qualify — pick only one)
1. Contact / Press / Newsroom / Investor Relations page
2. General corporate homepage
3. Wholesale or B2B portal

## NULL TRIGGER
If every candidate falls into a REJECT category, output: "bestUrl": null
Do not pick the "closest" option. Null is the correct answer when no candidate qualifies.

## OUTPUT — respond with ONLY this JSON, no extra keys:
{
  "reasoning": "Candidate [N] — <one sentence citing title or snippet as evidence>",
  "selectedIndex": <integer 1–${candidateLines.length}, or null>,
  "bestUrl": "<exact URL from candidates, or null>"
}`;


// ─── PARSER + CROSS-VALIDATION ────────────────────────────────────────────────
// selectedIndex lets us cross-check bestUrl against what was actually at that
// position — catches cases where the model copies the URL slightly wrong.
const { result } = await generateStructuredResponse<{
  reasoning: string;
  selectedIndex: number | null;
  bestUrl: string | null;
}>(
  SYSTEM_PROMPT,
  prompt,
  (text) => {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // Cross-validate: if selectedIndex given, bestUrl must match that candidate
    if (parsed.selectedIndex !== null && parsed.selectedIndex !== undefined) {
      const indexed = searchResults[parsed.selectedIndex - 1];
      const indexedUrl = (indexed?.url ?? indexed ?? '').trim();
      if (indexedUrl && indexedUrl !== parsed.bestUrl?.trim()) {
        console.warn(
          `selectedIndex [${parsed.selectedIndex}] → "${indexedUrl}" ` +
          `does not match bestUrl "${parsed.bestUrl}" — using indexed URL`
        );
        parsed.bestUrl = indexedUrl; // trust the index over the copy
      }
    }

    return parsed;
  }
);

    if (!result?.bestUrl) return null;

    let finalUrl = result.bestUrl.trim();
    if (!finalUrl.startsWith('http')) {
      finalUrl = 'https://' + finalUrl;
    }

    // Guard against picking the retail domain itself
    try {
      const finalHost = new URL(finalUrl).hostname.replace(/^www\\./, '');
      const retailHost = new URL(retailUrl).hostname.replace(/^www\\./, '');
      if (finalHost === retailHost) {
        console.warn(`Model returned the retail domain, discarding: ${finalUrl}`);
        return null;
      }
    } catch {
      // malformed URL from either side — let it through
    }

    return finalUrl;

  } catch (error) {
    console.error('Failed to find corporate URL via AI:', error);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}