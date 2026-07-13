import { generateStructuredResponse } from '../ai/router';
import { URL } from 'url';
import { launchBrowser } from "@/lib/browser";

// Use stealth to avoid DDG blocks

/**
 * Automatically searches for and extracts the official LinkedIn company page
 * using a hybrid Search + AI approach.
 */
export async function findLinkedinUrl(brandName: string, retailUrl: string): Promise<string | null> {
  let browser;
  try {
    browser = await launchBrowser();
    
    let retailHostname = '';
    try {
      const parsedUrl = new URL(retailUrl);
      const parts = parsedUrl.hostname.split('.');
      if (parts.length >= 2) {
        retailHostname = parts.slice(-2).join('.');
      } else {
        retailHostname = parsedUrl.hostname;
      }
    } catch {}

    const page = await browser.newPage();
    const query = encodeURIComponent(`site:linkedin.com/company "${brandName}" OR ${retailHostname}`);
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

    if (searchResults.length === 0) {
      console.log(`[Scrape] Puppeteer search returned 0 results. Falling back to Gemini Search...`);
      return fallbackToGeminiSearch(brandName, retailUrl);
    }

    const systemPrompt = `You are a strict URL classifier. Your only job is to pick ONE url from a list of search results, or return null. You never invent URLs — you only select from what is given.`;

const prompt = `Brand: ${brandName}
Retail URL (for reference, to help confirm this is the right company — not to reject this domain): ${retailUrl}

Search Results:
${JSON.stringify(searchResults, null, 2)}

TASK: From the search results above, identify the single BEST official LinkedIn COMPANY page URL for this exact brand.

A valid match looks like: https://www.linkedin.com/company/{slug}
(slug may have a trailing /, /about/, /posts/, etc. — that's still valid, just treat it as the company page)

REJECT these LinkedIn URL types even if they mention the brand:
- Personal profiles: linkedin.com/in/...
- Showcase pages: linkedin.com/showcase/... (these are sub-pages for product lines or divisions, not the main company)
- School/education pages: linkedin.com/school/...
- Job postings: linkedin.com/jobs/...
- Individual posts/articles: linkedin.com/posts/... , linkedin.com/pulse/...
- Groups: linkedin.com/groups/...
- Any non-LinkedIn URL

DISAMBIGUATION RULES:
1. Brand names can collide with unrelated companies. Only select a LinkedIn page if the result's title, snippet, or surrounding context confirms it belongs to THIS brand (matching industry, products, or the retail URL's domain context) — not just a name match.
2. If multiple distinct /company/ pages appear for what might be the same brand (e.g. regional subsidiaries, "Brand US" vs "Brand Global"), prefer the one that appears to be the global/parent/headquarters page based on the title or snippet.
3. Only choose a URL that appears verbatim in the search results above. Never modify, guess, or construct a slug yourself, even if you're confident what it would be.
4. If no result is clearly a /company/ page for this specific brand, return null. Do not settle for a "close enough" personal profile, showcase page, or unrelated company.

Respond with ONLY this exact JSON shape. No markdown fences, no preamble:
{"reasoning": "<one short sentence>", "bestUrl": "<exact linkedin.com/company/... url from results, or null>"}

EXAMPLES:

Input results: ["linkedin.com/in/jane-doe-acme-ceo", "linkedin.com/company/acme-corp", "linkedin.com/showcase/acme-sustainability"]
Output: {"reasoning": "acme-corp is the main company page; the others are a personal profile and a showcase sub-page.", "bestUrl": "https://linkedin.com/company/acme-corp"}

Input results: ["linkedin.com/jobs/view/acme-software-engineer-123", "linkedin.com/posts/acme-corp_hiring-activity"]
Output: {"reasoning": "Only a job posting and a post are present, no main company page.", "bestUrl": null}

Now respond with the JSON only.`;

    const { result } = await generateStructuredResponse<{ reasoning: string; bestUrl: string | null }>(
      systemPrompt,
      prompt,
      (text) => {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleaned);
      }
    );

    if (!result?.bestUrl) return null;

    let finalUrl = result.bestUrl.trim();
    if (!finalUrl.startsWith('http')) {
      finalUrl = 'https://' + finalUrl;
    }

    // Removed anti-hallucination guard as per user request to use the model's inferred URL
    // Structural guard: must actually be a /company/ page, not /in/, /showcase/, /jobs/, etc.
    const isCompanyPage = /linkedin\.com\/company\//i.test(finalUrl);
    if (!isCompanyPage) {
      console.warn(`Model returned a non-company LinkedIn URL, discarding: ${finalUrl}. Falling back to Gemini Search...`);
      return fallbackToGeminiSearch(brandName, retailUrl);
    }

    return finalUrl;

  } catch (error) {
    console.error('Failed to find LinkedIn URL via AI:', error);
    if (browser) await browser.close().catch(() => {});
    return fallbackToGeminiSearch(brandName, retailUrl);
  }
}

async function fallbackToGeminiSearch(brandName: string, retailUrl: string): Promise<string | null> {
  console.log(`[Scrape] Executing Gemini Google Search for LinkedIn URL: ${brandName}`);
  try {
    const systemPrompt = `You are a strict URL finder. Your job is to find the official LinkedIn company page URL for a brand using Google Search.`;
    const prompt = `Brand: ${brandName}\nRetail URL: ${retailUrl}\nFind the exact official LinkedIn company page. It MUST start with https://www.linkedin.com/company/...\nRespond with ONLY a JSON object: {"bestUrl": "<url>"} or {"bestUrl": null} if you cannot confidently find it.`;

    const { result } = await generateStructuredResponse<{ bestUrl: string | null }>(
      systemPrompt,
      prompt,
      (text) => {
        try {
          const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          return JSON.parse(cleaned);
        } catch {
          return { bestUrl: null };
        }
      },
      true
    );

    if (result?.bestUrl && /linkedin\.com\/company\//i.test(result.bestUrl)) {
      return result.bestUrl.trim();
    }
  } catch (e) {
    console.warn('[Scrape] Gemini search fallback failed:', e);
  }
  return null;
}