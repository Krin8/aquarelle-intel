import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/router';
import { URL } from 'url';
import { ScrapedContact } from './index';

puppeteer.use(StealthPlugin());

export async function scrapeDataProvider(brandName: string, website: string): Promise<{ success: boolean; contacts: ScrapedContact[]; error?: string }> {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    let retailHostname = '';
    try {
      const parsedUrl = new URL(website);
      const parts = parsedUrl.hostname.split('.');
      if (parts.length >= 2) {
        retailHostname = parts.slice(-2).join('.');
      } else {
        retailHostname = parsedUrl.hostname;
      }
    } catch {}

    const page = await browser.newPage();
    
    // Step 1: Direct approach - Attempt to load ZoomInfo search
    // ZoomInfo is very aggressive, so we just check if it loads
    const directQuery = encodeURIComponent(`${brandName} ${retailHostname}`);
    const zoomInfoDirectUrl = `https://www.zoominfo.com/c/${directQuery}`;
    
    let directText = '';
    try {
      const response = await page.goto(zoomInfoDirectUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
      if (response && response.status() !== 403 && response.status() !== 401) {
        // If not immediately blocked, grab some text
        directText = await page.evaluate(() => document.body.innerText.slice(0, 5000));
      }
    } catch (e) {
      console.log(`[ZoomInfo] Direct scrape failed or timed out, falling back to SERP...`);
    }

    // Step 2: SERP Fallback - if direct text is empty or too short (likely blocked/captcha)
    let searchResults: { title: string; snippet: string }[] = [];
    if (directText.length < 500) {
      console.log(`[ZoomInfo] Using DuckDuckGo SERP fallback...`);
      const query = encodeURIComponent(`site:zoominfo.com OR site:rocketreach.co "${brandName}" OR ${retailHostname} team executives board`);
      await page.goto(`https://duckduckgo.com/html/?q=${query}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      await page.waitForSelector('.result', { timeout: 10000 }).catch(() => null);
      
      searchResults = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.result')).slice(0, 10).map((el: any) => {
          const title = el.querySelector('.result__title')?.innerText || '';
          const snippet = el.querySelector('.result__snippet')?.innerText || '';
          return { title, snippet };
        });
      });
    }

    await browser.close();

    const dataToAnalyze = directText.length >= 500 
      ? `Direct Page Text:\n${directText}` 
      : `Search Snippets:\n${JSON.stringify(searchResults, null, 2)}`;

    if (!dataToAnalyze.trim() || (directText.length < 500 && searchResults.length === 0)) {
       return { success: false, contacts: [], error: 'No data found from provider.' };
    }

    const prompt = `
Brand: ${brandName}
Website: ${website}

Raw Provider Data (ZoomInfo/RocketReach):
${dataToAnalyze}

Analyze this data and extract any key executives, founders, or B2B decision makers mentioned.
Extract their names and job titles.
Respond in JSON format: 
{ 
  "contacts": [
    { "name": "Jane Doe", "role": "CEO" }
  ] 
}
`;

    const { result } = await generateStructuredResponse<{ contacts: { name: string; role: string }[] }>(
      "You are an expert corporate researcher extracting executives from noisy text.",
      prompt,
      (text) => JSON.parse(text)
    );

    const extractedContacts: ScrapedContact[] = (result.contacts || []).map(c => ({
      name: c.name,
      role: c.role,
      confidence: 75,
      source_url: 'zoominfo', // Tag as zoominfo
      type: 'direct'
    }));

    return { success: true, contacts: extractedContacts };

  } catch (error) {
    console.error('Failed to scrape data provider:', error);
    if (browser) await browser.close().catch(() => {});
    return { success: false, contacts: [], error: error instanceof Error ? error.message : 'Provider scrape failed' };
  }
}
