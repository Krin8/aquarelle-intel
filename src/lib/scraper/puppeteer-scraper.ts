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

async function extractPageData(page: puppeteer.Page, url: string, isSubpage: boolean = false) {
  // Go to URL and wait until network is mostly idle
  const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  
  if (response && !response.ok() && response.status() !== 304 && !isSubpage) {
    throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
  }

  // Scroll to the bottom
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
      }, 50); // Faster scroll for speed
    });
  });

  const html = await page.content();
  const $ = cheerio.load(html);

  $('script, style, nav, footer, header, aside, .cookie-banner, .popup, #cookie-consent').remove();

  const pageTitle = await page.title() || $('h1').first().text().trim() || '';
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || '';

  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(text);
  });

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const mainContent = $('main').length ? $('main').html() : $('body').html();
  const markdown = turndown.turndown(mainContent || '').slice(0, 15000);

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const rawEmails = html.match(emailRegex) || [];
  const emails = [...new Set(rawEmails.map(e => e.replace(/\\u[\dA-F]{4}/gi, '').replace(/[^a-zA-Z0-9._%+-@]/g, '')).filter(e => e.includes('@') && e.split('@')[0].length > 0))];

  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
  const rawPhones = html.match(phoneRegex) || [];
  const phones = [...new Set(rawPhones.filter(p => p.replace(/\D/g, '').length >= 7))];

  const links: { text: string; href: string }[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (href && text && !href.startsWith('#') && !href.startsWith('javascript:')) {
      try {
        links.push({ text: text.slice(0, 100), href: new URL(href, url).href });
      } catch (e) {
        // Ignore invalid URLs
      }
    }
  });

  return {
    url,
    pageTitle,
    metaDescription,
    headings,
    bodyText,
    markdown,
    emails,
    phones,
    links,
    contentLength: html.length,
  };
}

export async function scrapeWithPuppeteer(mainUrl: string): Promise<ScrapedContent> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`[DeepCrawl] Scraping main page: ${mainUrl}`);
    const mainData = await extractPageData(page, mainUrl);

    // Find sub-pages to crawl (About, Contact, Team, Wholesale)
    const keywords = ['about', 'contact', 'team', 'investor', 'wholesale', 'leadership', 'our-story'];
    const targetLinks = mainData.links
      .filter(l => l.href.startsWith('http') && l.href.includes(new URL(mainUrl).hostname))
      .filter(l => keywords.some(k => l.href.toLowerCase().includes(k) || l.text.toLowerCase().includes(k)))
      // Deduplicate by href
      .filter((v, i, a) => a.findIndex(t => (t.href === v.href)) === i)
      .slice(0, 3); // Max 3 sub-pages

    const subpagesData = [];

    if (targetLinks.length > 0) {
      console.log(`[DeepCrawl] Found ${targetLinks.length} target sub-pages. Crawling...`);
      // We process sequentially to avoid overwhelming memory/CPU on local machine
      for (const link of targetLinks) {
        try {
          console.log(`[DeepCrawl] -> ${link.href}`);
          const subPage = await browser.newPage();
          await subPage.setViewport({ width: 1280, height: 800 });
          const data = await extractPageData(subPage, link.href, true);
          subpagesData.push(data);
          await subPage.close();
        } catch (e) {
          console.log(`[DeepCrawl] Failed to scrape sub-page ${link.href}`);
        }
      }
    }

    // Combine all data
    const allEmails = [...new Set([...mainData.emails, ...subpagesData.flatMap(d => d.emails)])];
    const allPhones = [...new Set([...mainData.phones, ...subpagesData.flatMap(d => d.phones)])];
    const allHeadings = [...mainData.headings, ...subpagesData.flatMap(d => d.headings)].slice(0, 100);
    const combinedMarkdown = [
      `# MAIN PAGE (${mainData.url})`, 
      mainData.markdown, 
      ...subpagesData.map(d => `\n\n---\n\n# SUB-PAGE (${d.url})\n\n${d.markdown}`)
    ].join('\n\n').slice(0, 45000); // Max ~45k chars so we don't blow up context

    return {
      url: mainUrl,
      pageTitle: mainData.pageTitle,
      metaDescription: mainData.metaDescription,
      headings: allHeadings,
      bodyText: mainData.bodyText.slice(0, 5000), // We only need bodyText for basic hashing
      markdown: combinedMarkdown,
      emails: allEmails.slice(0, 30),
      phones: allPhones.slice(0, 15),
      links: mainData.links.slice(0, 100),
      images: [], // Images are less important for our AI extraction, keeping empty to save space
      contentLength: mainData.contentLength + subpagesData.reduce((acc, d) => acc + d.contentLength, 0),
    };
  } finally {
    await browser.close();
  }
}
