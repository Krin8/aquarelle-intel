import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import type { ScrapedContent } from './static-scraper';
import { findShirtCategoryLinks } from './category-finder';

// We share the same Turndown configuration and logic, so we extract it or just duplicate the conversion for now
import TurndownService from 'turndown';

puppeteer.use(StealthPlugin());

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});
turndown.remove(['script', 'style', 'nav', 'footer', 'iframe', 'noscript']);

async function extractJsonLdProducts(page: Page, pageUrl: string) {
  return page.evaluate((url) => {
    const results: any[] = [];

    function pushProduct(node: any) {
      if (!node || node['@type'] !== 'Product') return;
      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      const image = Array.isArray(node.image) ? node.image[0] : node.image;
      if (!image) return;

      const price = offers?.price ? parseFloat(offers.price) : null;
      const currency = offers?.priceCurrency || 'USD';
      const productUrl = node.url || url;

      results.push({
        name: node.name || 'Product',
        localPrice: price,
        currency,
        priceMin: price,
        imageUrl: typeof image === 'string' ? image : image?.url,
        sourceUrl: productUrl.startsWith('http') ? productUrl : new URL(productUrl, url).href,
        category: ''
      });
    }

    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || '');
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Product') {
            pushProduct(item);
          } else if (item['@graph']) {
            // some sites nest products inside @graph
            for (const g of item['@graph']) pushProduct(g);
          } else if (item.itemListElement) {
            // ItemList of products (common on category pages)
            for (const el of item.itemListElement) {
              pushProduct(el.item || el);
            }
          }
        }
      } catch {
        // malformed JSON-LD, skip this script tag
      }
    }
    return results;
  }, pageUrl);
}

async function extractPageData(page: Page, url: string, isSubpage: boolean = false) {
  // Go to URL and wait until network is mostly idle
  const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null);
  
  // Bypass interstitials (e.g. G-Star "Choose store")
  try {
    const interstitialBypassed = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if ((text.includes('continue to') && text.includes('global')) || text.includes('accept all')) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });
    if (interstitialBypassed) {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    }
  } catch {}
  
  if (response && !response.ok() && response.status() !== 304 && !isSubpage) {
    throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
  }

  // Scroll to the bottom
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400; // bigger jumps to actually trigger lazy-load thresholds
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 25000) {
          clearInterval(timer);
          resolve();
        }
      }, 250); // slower interval gives IntersectionObservers time to fire
    });
  });
  // give images one more beat to swap in after the final scroll
  await new Promise(r => setTimeout(r, 1500));

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
  const emails = [...new Set(rawEmails.map((e: string) => e.replace(/\\u[\dA-F]{4}/gi, '').replace(/[^a-zA-Z0-9._%+-@]/g, '')).filter((e: string) => e.includes('@') && e.split('@')[0].length > 0))];

  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
  const rawPhones = html.match(phoneRegex) || [];
  const phones = [...new Set(rawPhones.filter((p: string) => p.replace(/\D/g, '').length >= 7))];

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


  const images: { src: string; alt: string }[] = [];
  const seenSrcs = new Set<string>();
  $('img').each((_, el) => {
    // Try src, data-src, data-lazy-src (common lazy-loading patterns)
    let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
    
    // Try srcset as fallback (take the first URL)
    if (!src) {
      const srcset = $(el).attr('srcset') || '';
      const firstEntry = srcset.split(',')[0]?.trim().split(/\s+/)[0];
      if (firstEntry) src = firstEntry;
    }
    
    if (!src || src.startsWith('data:')) return; // Skip data URIs and empty
    
    // Resolve relative URLs to absolute
    try {
      src = new URL(src, url).href;
    } catch { return; }
    
    // Skip tiny tracking pixels and icons (usually < 100px in name or dimensions)
    const alt = $(el).attr('alt') || '';
    const width = parseInt($(el).attr('width') || '0');
    const height = parseInt($(el).attr('height') || '0');
    if ((width > 0 && width < 50) || (height > 0 && height < 50)) return;
    if (src.includes('pixel') || src.includes('spacer') || src.includes('tracking')) return;
    
    if (!seenSrcs.has(src)) {
      seenSrcs.add(src);
      images.push({ src, alt: alt.slice(0, 100) });
    }
  });

  // Generic Product Extraction (fallback for sites like G-Star)
  const products = await page.evaluate(() => {
    const prods: any[] = [];
    const seenUrls = new Set<string>();
    
    // Find all links containing an image
    const productLinks = Array.from(document.querySelectorAll('a')).filter(a => {
      const img = a.querySelector('img');
      if (!img) return false;
      const src = img.src || img.getAttribute('data-src') || '';
      return src.length > 0 && !src.includes('pixel') && !src.includes('tracking');
    });

    for (const link of productLinks) {
      const sourceUrl = link.href;
      if (!sourceUrl || sourceUrl.startsWith('javascript:') || seenUrls.has(sourceUrl)) continue;
      
      const img = link.querySelector('img');
      const imageUrl = img?.src || img?.getAttribute('data-src') || img?.getAttribute('srcset')?.split(' ')[0] || '';
      if (!imageUrl || imageUrl.startsWith('data:')) continue;
      
      // Look for text inside or near the link
      const textContainer = link.parentElement?.parentElement || link;
      const textContent = textContainer.textContent || '';
      
      // Try to find a price
      const priceMatch = textContent.match(/([$€£₹])\s?(\d+(?:[,.]\d{2})?)/);
      let localPrice = null;
      let currency = 'USD';
      
      if (priceMatch) {
        const symbol = priceMatch[1];
        if (symbol === '€') currency = 'EUR';
        else if (symbol === '£') currency = 'GBP';
        else if (symbol === '₹') currency = 'INR';
        else currency = 'USD'; // Default to USD for $
        
        localPrice = parseFloat(priceMatch[2].replace(/[^0-9.]/g, ''));
      }
      
      // Try to find a name (longest text node that isn't a price)
      let name = img?.getAttribute('alt') || 'Product';
      if (name.length < 5 || name.toLowerCase().includes('product')) {
         const texts = textContent.split('\n').map(t => t.trim()).filter(t => t.length > 5 && !/[$€£₹]/.test(t));
         if (texts.length > 0) name = texts[0];
      }
      
      prods.push({
        name: name.slice(0, 100),
        localPrice,
        currency,
        priceMin: localPrice, // Fallback for compatibility, will be overwritten by FX
        imageUrl,
        sourceUrl,
        category: ''
      });
      seenUrls.add(sourceUrl);
      
      if (prods.length >= 120) break;
    }
    return prods;
  });

  const jsonLdProducts = await extractJsonLdProducts(page, url);
  const finalProducts = jsonLdProducts.length > 0 ? jsonLdProducts : products;

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
    images,
    products: finalProducts,
    contentLength: html.length,
  };
}

export async function scrapeWithPuppeteer(mainUrl: string, target: string = 'all'): Promise<ScrapedContent> {
  const browser = await puppeteer.launch({
      headless: true,
      userDataDir: './.puppeteer_data',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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

    if (targetLinks.length > 0 && target !== 'images') {
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

    const hostname = new URL(mainUrl).hostname;
    let categoryProducts: any[] = [];

    if (target === 'images' || target === 'all') {
      const shirtCategoryLinks = findShirtCategoryLinks(mainData.links, hostname);
      console.log(`[DeepCrawl] Found ${shirtCategoryLinks.length} candidate shirt category pages from homepage`);

      // Track all crawled URLs to avoid re-crawling
      const crawledUrls = new Set<string>();
      
      for (const link of shirtCategoryLinks) {
        try {
          const normalizedHref = link.href.split('?')[0];
          if (crawledUrls.has(normalizedHref)) continue;
          crawledUrls.add(normalizedHref);
          
          console.log(`[DeepCrawl] -> category: ${link.href}`);
          const catPage = await browser.newPage();
          await catPage.setViewport({ width: 1280, height: 800 });
          const data = await extractPageData(catPage, link.href, true);
          categoryProducts.push(...(data.products || []));
          
          // SUB-CATEGORY DISCOVERY: Look for shirt-specific sub-nav links
          // on this category page (e.g., /tops/ page links to /shirts-flannels/)
          const subCatLinks = findShirtCategoryLinks(data.links, hostname);
          for (const subLink of subCatLinks) {
            const subNorm = subLink.href.split('?')[0];
            if (crawledUrls.has(subNorm)) continue;
            crawledUrls.add(subNorm);
            
            try {
              console.log(`[DeepCrawl] -> sub-category: ${subLink.href}`);
              const subPage = await browser.newPage();
              await subPage.setViewport({ width: 1280, height: 800 });
              const subData = await extractPageData(subPage, subLink.href, true);
              categoryProducts.push(...(subData.products || []));
              await subPage.close();
            } catch (e) {
              console.log(`[DeepCrawl] Failed to scrape sub-category page ${subLink.href}`);
            }
          }
          
          await catPage.close();
        } catch (e) {
          console.log(`[DeepCrawl] Failed to scrape category page ${link.href}`);
        }
      }

      // de-dupe by sourceUrl across all category pages + homepage
      const allRaw = [...(mainData.products || []), ...categoryProducts];
      const seenUrls = new Set<string>();
      categoryProducts = allRaw.filter(p => {
        if (!p.sourceUrl || seenUrls.has(p.sourceUrl)) return false;
        seenUrls.add(p.sourceUrl);
        return true;
      });

      console.log(`[DeepCrawl] Collected ${categoryProducts.length} total candidate products`);
    }

    // Combine all data
    const allEmails = [...new Set([...mainData.emails, ...subpagesData.flatMap(d => d.emails)])] as string[];
    const allPhones = [...new Set([...mainData.phones, ...subpagesData.flatMap(d => d.phones)])] as string[];
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
      images: (target === 'images' || target === 'all') ? mainData.images : [],
      extractedProducts: (target === 'images' || target === 'all') ? categoryProducts : [],
      contentLength: mainData.contentLength + subpagesData.reduce((acc, d) => acc + d.contentLength, 0),
    };
  } finally {
    await browser.close();
  }
}
