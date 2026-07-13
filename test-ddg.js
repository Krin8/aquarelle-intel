const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
  });
  const page = await browser.newPage();
  await page.goto('https://duckduckgo.com/html/?q=test', { waitUntil: 'domcontentloaded' });
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('ddg-page.html', html);
  await browser.close();
  console.log("Done");
})();
