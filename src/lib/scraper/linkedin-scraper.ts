import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/ollama-client';
import { URL } from 'url';
import { ScrapedContact } from './index';

puppeteer.use(StealthPlugin());

export async function scrapeLinkedinEmployees(brandName: string, website: string): Promise<{ success: boolean; contacts: ScrapedContact[]; error?: string }> {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    let retailHostname = '';
    try {
      const parsedUrl = new URL(website);
      const parts = parsedUrl.hostname.split('.');
      if (parts.length >= 2) {
        retailHostname = parts.slice(-2).join('.');
      } else {
        retailHostname = parsedUrl.hostname;
      }
    } catch {}

    const page = await browser.newPage();
    
    console.log(`[LinkedIn] Using DuckDuckGo SERP for employee search...`);
    // Search for decision makers working at this company on LinkedIn
    const query = encodeURIComponent(`site:linkedin.com/in "${brandName}" OR ${retailHostname}`);
    await page.goto(`https://duckduckgo.com/?q=${query}&t=h_&ia=web`, { waitUntil: 'networkidle2', timeout: 15000 });
    
    await page.waitForSelector('[data-testid="result"]', { timeout: 10000 }).catch(() => null);
    
    const searchResults = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid="result"]')).slice(0, 10).map((el: any) => {
        const title = el.querySelector('h2')?.innerText || '';
        const url = el.querySelector('a')?.href || '';
        const snippet = el.innerText || '';
        return { title, url, snippet };
      });
    });

    await browser.close();

    if (searchResults.length === 0) {
       return { success: false, contacts: [], error: 'No LinkedIn employee data found.' };
    }

  const prompt = `
Brand: ${brandName}
Website Domain: ${retailHostname || website}

LinkedIn Search Results:
${JSON.stringify(searchResults, null, 2)}

Analyze these LinkedIn profile search results. Extract the identities of people who currently work at ${brandName}.
STRICT FILTER: ONLY include decision makers relevant for a B2B sourcing/manufacturing deal (e.g., Sourcing Director, Sourcing Manager, Buying Manager, Product Development Manager, Technical Manager, Sustainability Team, Country/Regional Sourcing Head, VP of Supply Chain, Founder).
Do NOT include store associates, interns, or unrelated roles.

For each valid contact, extract their full name, job title, and their LinkedIn URL.
If the snippet mentions their location, extract it into 'officeLocation'. If it mentions who they report to or their seniority context, extract it to 'reportingStructure'.
CRITICAL: You must mathematically GUESS their corporate email address based on the brand's domain (e.g., firstname@domain.com, first.last@domain.com).

Respond in JSON format: 
{ 
  "contacts": [
    { 
      "name": "Jane Doe", 
      "role": "Sourcing Manager", 
      "email": "jane.doe@example.com",
      "linkedinUrl": "https://linkedin.com/in/janedoe",
      "officeLocation": "New York, NY",
      "reportingStructure": "Reports to VP of Supply Chain"
    }
  ] 
}
`;

    const { result } = await generateStructuredResponse<{ contacts: { name: string; role: string; email: string; linkedinUrl: string; officeLocation?: string; reportingStructure?: string }[] }>(
      "You are an expert corporate researcher extracting B2B decision makers from LinkedIn search snippets and estimating their corporate email addresses.",
      prompt,
      (text) => JSON.parse(text)
    );

    const extractedContacts: ScrapedContact[] = await Promise.all((result.contacts || []).map(async (c) => {
      let confidence = 70; // Confidence lowered slightly because emails are guessed
      let source_url = c.linkedinUrl || 'linkedin';

      // Verify email with Hunter.io if API key is present
      if (c.email && process.env.HUNTER_API_KEY) {
        try {
          const res = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(c.email)}&api_key=${process.env.HUNTER_API_KEY}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.data?.status === 'valid') {
              confidence = 95;
              source_url = 'hunter_verified';
            } else if (data?.data?.status === 'invalid') {
              // We could remove it, but let's keep it with a very low confidence
              confidence = 30;
            }
          }
        } catch (e) {
          console.error('[Hunter.io] Failed to verify email:', e);
        }
      }

      return {
        name: c.name,
        role: c.role,
        email: c.email,
        confidence,
        source_url, 
        type: 'direct',
        officeLocation: c.officeLocation,
        reportingStructure: c.reportingStructure
      } as any;
    }));

    return { success: true, contacts: extractedContacts };

  } catch (error) {
    console.error('Failed to scrape LinkedIn employees:', error);
    if (browser) await browser.close().catch(() => {});
    return { success: false, contacts: [], error: error instanceof Error ? error.message : 'LinkedIn employee scrape failed' };
  }
}
