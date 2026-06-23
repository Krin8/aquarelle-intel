import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from './src/lib/ai/ollama-client';
import { z } from 'zod';

puppeteer.use(StealthPlugin());

async function test() {
  const brandName = "Tommy Hilfiger";
  console.log("Searching DDG...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  const query = encodeURIComponent(`${brandName} corporate headquarters newsroom contact`);
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

  console.log("Found results:", searchResults.length);
  
  const prompt = `
Brand: ${brandName}
Search Results:
${JSON.stringify(searchResults, null, 2)}

Analyze these search results and identify the single BEST official corporate, newsroom, or wholesale contact URL for the brand. 
We want the B2B or corporate parent site, NOT the retail B2C store (e.g. newsroom.brand.com, pvh.com, corporate.brand.com).
If none are valid, return null.
Respond in JSON format: { "bestUrl": "https://..." }
`;

  console.log("Asking Ollama...");
  const res = await generateStructuredResponse(
    "You are an expert corporate researcher.",
    prompt,
    (text) => JSON.parse(text)
  );

  console.log("Ollama returned:", res.result);
}

test().catch(console.error);
