const puppeteer = require('puppeteer');

async function testAe() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('https://www.ae.com/intl/en', { waitUntil: 'networkidle2' });
  
  await page.screenshot({ path: 'ae-screenshot.png' });
  await browser.close();
}

testAe();
