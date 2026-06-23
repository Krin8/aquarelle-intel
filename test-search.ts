import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function searchCorporateUrl(brandName: string) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  const query = encodeURIComponent(`${brandName} corporate headquarters newsroom contact`);
  await page.goto(`https://duckduckgo.com/html/?q=${query}`);
  
  // Wait for results
  await page.waitForSelector('.result__url');
  
  const urls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.result__url')).map((el: any) => el.innerText.trim());
  });
  
  await browser.close();
  return urls;
}

searchCorporateUrl('Tommy Hilfiger').then(console.log).catch(console.error);
