import { Browser } from 'puppeteer';
import { launchBrowser } from "@/lib/browser";


export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function runDuckDuckGoSearch(query: string, existingBrowser?: Browser | null): Promise<SearchResult[]> {
  let browser = existingBrowser;
  let browserCreatedHere = false;

  try {
    if (!browser || !browser.connected) {
      browser = await launchBrowser();
      browserCreatedHere = true;
    }

    const page = await browser.newPage();
    const encodedQuery = encodeURIComponent(query);
    
    await page.goto(`https://duckduckgo.com/html/?q=${encodedQuery}`, { waitUntil: 'domcontentloaded' });
    
    let allResults: SearchResult[] = [];
    
    for (let pageNum = 0; pageNum < 5; pageNum++) {
      await page.waitForSelector('.result', { timeout: 10000 }).catch(() => null);
      
      const pageResults = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.result')).slice(0, 300).map((el: any) => {
          const title = el.querySelector('.result__title')?.innerText || '';
          const snippet = el.querySelector('.result__snippet')?.innerText || '';
          const url = el.querySelector('.result__url')?.innerText || '';
          return { title, snippet, url };
        });
      });
      
      allResults = [...allResults, ...pageResults];
      
      const hasNext = await page.evaluate(() => !!document.querySelector('input[value="Next"]'));
      if (!hasNext || pageNum === 4) break;
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
        page.click('input[value="Next"]')
      ]);
    }

    await page.close();
    
    if (browserCreatedHere && browser) {
      await browser.close();
    }

    return allResults;
  } catch (error) {
    console.warn(`[DDGSearch] Exception during search for "${query}":`, error);
    if (browserCreatedHere && browser) {
      await browser.close().catch(() => {});
    }
    return [];
  }
}
