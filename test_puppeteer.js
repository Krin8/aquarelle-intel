const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.g-star.com', { waitUntil: 'networkidle2' });
  const html = await page.content();
  console.log(html.includes('Choose store') ? 'INTERSTITIAL' : 'SUCCESS');
  await browser.close();
})();
