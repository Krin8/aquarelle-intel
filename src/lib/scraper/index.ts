import { checkRobotsTxt } from './robots-checker';
import crypto from 'crypto';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';

const execAsync = util.promisify(exec);

export interface ScrapedContact {
  email?: string;
  phone?: string;
  name: string;
  role?: string;
  confidence: number;
  source_url: string;
  type: string;
}

export interface ScrapedDocument {
  title: string;
  url: string;
  type: string;
}

export interface ScrapedContent {
  pageTitle: string;
  metaDescription: string;
  headings: string[];
  bodyText: string;
  markdown: string;
  emails: string[];
  phones: string[];
  links: { text: string; href: string }[];
  images: { alt: string; src: string }[];
  contentLength: number;
  extractedContacts?: ScrapedContact[];
  extractedDocuments?: ScrapedDocument[];
}

export interface ScrapeResult {
  success: boolean;
  content?: ScrapedContent;
  method: 'scrapy' | 'puppeteer';
  contentHash?: string;
  error?: string;
  robotsCheck: {
    allowed: boolean;
    robotsTxtFound: boolean;
  };
}

// Simple rate limiter
const lastScrapeTime: Record<string, number> = {};
const MIN_DELAY_MS = 2000; // 2 seconds between requests to same domain

async function rateLimitCheck(url: string): Promise<void> {
  const domain = new URL(url).hostname;
  const lastTime = lastScrapeTime[domain] || 0;
  const elapsed = Date.now() - lastTime;
  
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  
  lastScrapeTime[domain] = Date.now();
}

export async function scrapeUrl(url: string, corporateUrl?: string | null): Promise<ScrapeResult> {
  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return {
      success: false,
      method: 'scrapy',
      error: 'Invalid URL format',
      robotsCheck: { allowed: false, robotsTxtFound: false },
    };
  }

  // Check robots.txt
  const robotsCheck = await checkRobotsTxt(url);
  if (!robotsCheck.allowed) {
    return {
      success: false,
      method: 'scrapy',
      error: 'Blocked by robots.txt',
      robotsCheck: {
        allowed: false,
        robotsTxtFound: robotsCheck.robotsTxtFound,
      },
    };
  }

  // Rate limit
  await rateLimitCheck(url);

  // Attempt Scrapy scraping first
  try {
    const pythonScript = path.join(process.cwd(), 'python-scraper', 'run_spider.py');
    const venvPython = path.join(process.cwd(), 'python-scraper', 'venv', 'bin', 'python3');
    
    // Build arguments. We pass corporateUrl as the second arg if it exists.
    const args = `"${venvPython}" "${pythonScript}" "${url}"` + (corporateUrl ? ` "${corporateUrl}"` : "");
    const { stdout, stderr } = await execAsync(args, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
    
    // Scrapy logs go to stderr, but our JSON goes to stdout
    const result = JSON.parse(stdout);
    
    if (!result.success || !result.data) {
        throw new Error(result.error || 'Scrapy failed to extract content');
    }
    
    const pages = result.data.pages || [];
    const contacts = result.data.contacts || [];
    const documents = result.data.documents || [];

    if (pages.length === 0) {
        throw new Error('Scrapy extracted 0 pages (maybe blocked or empty)');
    }

    const firstPage = pages[0];
    
    const content: ScrapedContent = {
      pageTitle: firstPage.title || '',
      metaDescription: firstPage.meta_desc || '',
      headings: pages.flatMap((p: any) => p.headings || []),
      bodyText: pages.map((p: any) => p.body_text).join('\n\n'),
      markdown: pages.map((p: any) => p.markdown).join('\n\n---\n\n'),
      emails: contacts.filter((c: any) => c.email).map((c: any) => c.email),
      phones: contacts.filter((c: any) => c.phone).map((c: any) => c.phone),
      links: [],
      images: [],
      contentLength: pages.reduce((acc: number, p: any) => acc + (p.content_length || 0), 0),
      extractedContacts: contacts,
      extractedDocuments: documents
    };

    const contentHash = crypto
      .createHash('md5')
      .update(content.bodyText.slice(0, 1000))
      .digest('hex');

    return {
      success: true,
      content,
      method: 'scrapy',
      contentHash,
      robotsCheck: {
        allowed: true,
        robotsTxtFound: robotsCheck.robotsTxtFound,
      },
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown scraping error';
    
    // Fallback to Puppeteer if Scrapy fails (bot protection or rendering issues)
    console.log(`Scrapy blocked or failed with ${errMsg}, falling back to Puppeteer stealth...`);
    try {
      const { scrapeWithPuppeteer } = await import('./puppeteer-scraper');
      const content = await scrapeWithPuppeteer(url);
      const contentHash = crypto
        .createHash('md5')
        .update(content.bodyText.slice(0, 1000))
        .digest('hex');

      return {
        success: true,
        content,
        method: 'puppeteer',
        contentHash,
        robotsCheck: {
          allowed: true,
          robotsTxtFound: robotsCheck.robotsTxtFound,
        },
      };
    } catch (fallbackError) {
      return {
        success: false,
        method: 'puppeteer',
        error: fallbackError instanceof Error ? fallbackError.message : 'Puppeteer fallback failed',
        robotsCheck: {
          allowed: true,
          robotsTxtFound: robotsCheck.robotsTxtFound,
        },
      };
    }
  }
}
