import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

import os from "os";

export async function launchBrowser() {
  const isMac = os.platform() === 'darwin';
  const defaultPath = isMac 
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" 
    : "/usr/bin/google-chrome";

  return puppeteer.launch({
    executablePath: process.env.CHROME_BIN || defaultPath,
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
}
