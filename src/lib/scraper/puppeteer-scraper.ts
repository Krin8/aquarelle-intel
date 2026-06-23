import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import type { ScrapedContent } from './static-scraper';

// We share the same Turndown configuration and logic, so we extract it or just duplicate the conversion for now
import TurndownService from 'turndown';

puppeteer.use(StealthPlugin());

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});
turndown.remove(['script', 'style', 'nav', 'footer', 'iframe', 'noscript']);

export async function scrapeWithPuppeteer(url: string): Promise<ScrapedContent> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    
    // Set a realistic viewport
    await page.setViewport({ width: 1280, height: 800 });

    // Go to URL and wait until network is mostly idle
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    if (response && !response.ok() && response.status() !== 304) {
      throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
    }

    // Scroll to the bottom to trigger lazy-loaded elements
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 5000) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // Extract HTML
    const html = await page.content();
    const $ = cheerio.load(html);

    // Remove noise
    $('script, style, nav, footer, header, aside, .cookie-banner, .popup, #cookie-consent').remove();

    // Extract page title
    const pageTitle = await page.title() || $('h1').first().text().trim() || '';

    // Extract meta description
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || 
                            $('meta[property="og:description"]').attr('content')?.trim() || '';

    // Extract headings
    const headings: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });

    // Extract body text
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    // Convert to markdown
    const mainContent = $('main').length ? $('main').html() : $('body').html();
    const markdown = turndown.turndown(mainContent || '').slice(0, 15000);

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const rawEmails = html.match(emailRegex) || [];
    const emails = [...new Set(rawEmails.map(e => e.replace(/\\u[\dA-F]{4}/gi, '').replace(/[^a-zA-Z0-9._%+-@]/g, '')).filter(e => e.includes('@') && e.split('@')[0].length > 0))];

    // Extract phone numbers
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
    const rawPhones = html.match(phoneRegex) || [];
    const phones = [...new Set(rawPhones.filter(p => p.replace(/\D/g, '').length >= 7))];

    // Extract links
    const links: { text: string; href: string }[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
        links.push({ text: text.slice(0, 100), href });
      }
    });

    // Extract images
    const images: { alt: string; src: string }[] = [];
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src') || '';
      const alt = $(el).attr('alt') || '';
      if (src) {
        images.push({ alt, src: src.startsWith('http') ? src : new URL(src, url).href });
      }
    });

    return {
      url,
      pageTitle,
      metaDescription,
      headings: headings.slice(0, 50),
      bodyText: bodyText.slice(0, 5000),
      markdown,
      emails: emails.slice(0, 20),
      phones: phones.slice(0, 10),
      links: links.slice(0, 100),
      images: images.slice(0, 50),
      contentLength: html.length,
    };
  } finally {
    await browser.close();
  }
}
