import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/router';
import { URL } from 'url';

// Use stealth to avoid DDG blocks
puppeteer.use(StealthPlugin());

/**
 * Automatically searches for and extracts the corporate/parent website 
 * domain for a given brand name using a hybrid Search + AI approach.
 */
export async function findCorporateUrl(brandName: string, retailUrl: string, modelPref?: 'ollama' | 'gemini'): Promise<string | null> {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
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

    const prompt = `
Brand: ${brandName}
Retail URL: ${retailUrl}

Search Results:
${JSON.stringify(searchResults, null, 2)}

Analyze these search results and identify the single BEST official corporate, newsroom, or wholesale contact URL for the brand. 
We want the B2B or corporate parent site, NOT the retail B2C store.
Ignore third-party directories (LinkedIn, ZoomInfo, RocketReach, Datanyze, Chamber of Commerce).
If none are valid corporate sites, return null.
Respond in JSON format: { "bestUrl": "https://..." } (or null if none found).
`;

    const { result } = await generateStructuredResponse<{ bestUrl: string | null }>(
      "You are an expert corporate researcher.",
      prompt,
      (text) => JSON.parse(text),
      modelPref
    );

    if (!result.bestUrl) return null;

    let finalUrl = result.bestUrl;
    if (!finalUrl.startsWith('http')) {
      finalUrl = 'https://' + finalUrl;
    }

    return finalUrl;

  } catch (error) {
    console.error('Failed to find corporate URL via AI:', error);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}
