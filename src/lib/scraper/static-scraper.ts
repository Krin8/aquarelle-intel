import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

export interface ScrapedContent {
  url: string;
  pageTitle: string;
  metaDescription: string;
  headings: string[];
  bodyText: string;
  markdown: string;
  emails: string[];
  phones: string[];
  links: { text: string; href: string }[];
  images: { alt: string; src: string }[];
  products?: any[];
  contentLength: number;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Remove scripts, styles, navs, footers from markdown conversion
turndown.remove(['script', 'style', 'nav', 'footer', 'iframe', 'noscript']);

export async function scrapeStatic(url: string): Promise<ScrapedContent> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Remove noise
  $('script, style, nav, footer, header, aside, .cookie-banner, .popup, #cookie-consent').remove();

  // Extract page title
  const pageTitle = $('title').text().trim() || $('h1').first().text().trim() || '';

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

  // Convert to markdown (limited to main content area if possible)
  const mainContent = $('main').length ? $('main').html() : $('body').html();
  const markdown = turndown.turndown(mainContent || '').slice(0, 15000); // Cap at 15k chars for LLM

  // Extract emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const rawEmails = html.match(emailRegex) || [];
  const emails = [...new Set(
    rawEmails
      .map(e => e
        // Strip Unicode escape sequences like \u003e, u003e, \\u003e
        .replace(/\\?u[0-9a-fA-F]{4}/g, '')
        // Strip any remaining non-email characters
        .replace(/[^a-zA-Z0-9._%+@-]/g, '')
      )
      .filter(e => {
        if (!e.includes('@')) return false;
        const localPart = e.split('@')[0];
        // Must start with a letter and have a reasonable length
        if (!localPart || localPart.length === 0) return false;
        if (!/^[a-zA-Z]/.test(localPart)) return false;
        // Filter out obvious non-emails (too short local parts)
        if (localPart.length < 2) return false;
        return true;
      })
  )];

  // Extract phone numbers (from visible text to avoid HTML attributes/script IDs)
  // Uses negative lookbehind/lookahead to ensure it's not part of a massive number
  const phoneRegex = /(?<!\d)\+?(?:[0-9][\s\-\.]?){9,14}[0-9](?!\d)/g;
  const rawPhones = bodyText.match(phoneRegex) || [];
  const phones = [...new Set(
    rawPhones
      .map(p => p.trim())
      .filter(p => {
        const digits = p.replace(/\D/g, '');
        const digitCount = digits.length;
        
        // Phone numbers are typically 10-15 digits
        if (digitCount < 10 || digitCount > 15) return false;
        
        // Exclude arithmetic equations or versions (e.g. "14.946-14.946")
        if (p.includes('.') || p.split('-').length > 3) return false;
        
        // Exclude long unformatted numbers (likely Shopify variant IDs)
        // A 12+ digit number with no formatting is almost never a phone number
        if (digitCount > 11 && !p.startsWith('+') && !p.includes(' ') && !p.includes('-')) {
          return false;
        }
        
        // Exclude 10-digit Unix timestamps (currently starting with 16 or 17)
        if (digitCount === 10 && (p.startsWith('16') || p.startsWith('17'))) {
          return false;
        }

        return true;
      })
  )];

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
}
