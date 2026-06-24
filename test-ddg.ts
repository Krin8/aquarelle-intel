import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent('site:linkedin.com/in "Snitch" OR snitch.com')}&t=h_&ia=web`, { waitUntil: 'networkidle2' });
  
  const results = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid="result"]')).slice(0, 10).map((el: any) => {
        const title = el.querySelector('h2')?.innerText || '';
        const url = el.querySelector('a')?.href || '';
        const snippet = el.innerText || '';
        return { title, url, snippet };
      });
  });
  console.log("Results:", results);
  
  await browser.close();
}
main();
