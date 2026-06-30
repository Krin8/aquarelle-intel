import puppeteer from 'puppeteer-extra';
import { Browser } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function runDuckDuckGoSearch(query: string, existingBrowser?: Browser | null): Promise<SearchResult[]> {
  let browser = existingBrowser;
  let browserCreatedHere = false;

  try {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      browserCreatedHere = true;
    }

    const page = await browser.newPage();
    const encodedQuery = encodeURIComponent(query);
    
    await page.goto(`https://duckduckgo.com/html/?q=${encodedQuery}`, { waitUntil: 'domcontentloaded' });
    
    await page.waitForSelector('.result', { timeout: 10000 }).catch(() => null);
    
    const searchResults = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.result')).slice(0, 10).map((el: any) => {
        const title = el.querySelector('.result__title')?.innerText || '';
        const snippet = el.querySelector('.result__snippet')?.innerText || '';
        const url = el.querySelector('.result__url')?.innerText || '';
        return { title, snippet, url };
      });
    });

    await page.close();
    
    if (browserCreatedHere && browser) {
      await browser.close();
    }

    return searchResults;
  } catch (error) {
    console.warn(`[DDGSearch] Exception during search for "${query}":`, error);
    if (browserCreatedHere && browser) {
      await browser.close().catch(() => {});
    }
    return [];
  }
}
