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
      userDataDir: './.puppeteer_data',
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
    
    console.log(`[LinkedIn] Using DuckDuckGo Search API for employee search...`);
    // Search for decision makers working at this company on LinkedIn
    const query = `site:linkedin.com/in "${brandName}" OR ${retailHostname}`;
    const { runDuckDuckGoSearch } = await import('./ddg-search');
    
    const ddgResults = await runDuckDuckGoSearch(query);
    
    const searchResults = ddgResults.map(r => ({
      title: r.title,
      snippet: r.snippet,
      url: r.url
    }));

    await browser.close();

    if (searchResults.length === 0) {
       return { success: false, contacts: [], error: 'No LinkedIn employee data found.' };
    }

  const systemPrompt = `You are a precise B2B research assistant. You extract facts ONLY from the text given to you — you never invent names, titles, locations, or context not present in the source. The ONE exception is corporate email addresses, which you are explicitly asked to construct using a stated pattern — that is a deliberate guess, not an extraction, and you should treat it differently from every other field.`;

const prompt = `Brand: ${brandName}
Corporate email domain to use for guessing (NOT necessarily the retail/storefront domain): ${retailHostname || website}

LinkedIn Search Results:
${JSON.stringify(searchResults, null, 2)}

TASK: From the search snippets above, extract people who appear to CURRENTLY work at ${brandName} in a B2B sourcing/manufacturing/supply-chain decision-making role.

STEP 1 — ROLE FILTER (apply strictly):

INCLUDE roles like:
- Sourcing Director / Sourcing Manager / Buying Manager / Merchandiser
- Product Development Manager / Technical Manager / Quality Manager
- Sustainability Manager / Sustainability Team lead
- Country or Regional Sourcing Head
- VP of Supply Chain / VP of Operations / Head of Procurement
- Founder / Co-Founder / Owner (any title, since they are always a relevant decision maker)

EXCLUDE roles like:
- Store Associate, Sales Associate, Cashier, Retail Staff
- Intern, Working Student, Trainee
- Marketing, PR, Social Media, Customer Service roles (unrelated to sourcing/manufacturing)
- Anyone whose title is unclear, generic ("Employee", "Team Member"), or not given at all

STEP 2 — CURRENCY CHECK:
- Only include a person if the snippet indicates this is their CURRENT role. If the snippet says "Former", "Ex-", "previously", or shows a past date range, EXCLUDE them.
- If currency is ambiguous, include them but do not state certainty in reportingStructure.

STEP 3 — EXTRACTION (for these fields, ONLY use what is explicitly in the text — never infer or guess):
- name: full name exactly as written
- role: title exactly as written
- linkedinUrl: must be copied verbatim from the search results, never modified or invented
- officeLocation: only if explicitly mentioned in the snippet; otherwise omit the field entirely (do not write "Unknown" or guess a likely city)
- reportingStructure: only if the snippet explicitly mentions seniority/reporting context; otherwise omit the field entirely

STEP 4 — EMAIL GUESS (this field is different — you ARE expected to construct it, not extract it):
- Take the person's name and the domain given above.
- Build the email using this pattern, in priority order — use the FIRST one that makes sense, and use the SAME pattern for every person in this response for consistency: 
  1. firstname.lastname@domain (e.g. jane.doe@acme.com)
- Normalize: lowercase, strip spaces/accents/special characters, use only the first and last name (ignore middle names/initials).
- This is always a guess. Do not skip it just because you're unsure — always produce your best-guess email using the pattern above.

OUTPUT — respond with ONLY this JSON shape, no markdown fences, no preamble:
{
  "contacts": [
    {
      "name": "Jane Doe",
      "role": "Sourcing Manager",
      "linkedinUrl": "https://linkedin.com/in/janedoe",
      "officeLocation": "New York, NY",
      "reportingStructure": "Reports to VP of Supply Chain",
      "email": "jane.doe@example.com"
    }
  ]
}

If no one in the results passes the role filter and currency check, return {"contacts": []}.
Otherwise, extract as many valid contacts as possible up to a maximum cap of 15-20. If you can only find 7, that is perfectly fine, just ensure you extract at least 5 if they exist.

EXAMPLE:
Input snippet: "Jane Doe - Sourcing Manager at Acme Corp. New York, NY. Reports to VP of Supply Chain. 500+ connections."
Other snippet: "John Smith - Former Sourcing Director at Acme Corp (2018-2021)."
Other snippet: "Mary Lee - Store Associate at Acme Corp."

Correct output:
{"contacts": [{"name": "Jane Doe", "role": "Sourcing Manager", "linkedinUrl": "https://linkedin.com/in/janedoe", "officeLocation": "New York, NY", "reportingStructure": "Reports to VP of Supply Chain", "email": "jane.doe@example.com"}]}
(John Smith excluded — former role. Mary Lee excluded — unrelated role.)

Now extract from the actual search results above and respond with the JSON only.`;

    const { result } = await generateStructuredResponse<{
      contacts: { name: string; role: string; email: string; linkedinUrl: string; officeLocation?: string; reportingStructure?: string }[]
    }>(
      systemPrompt,
      prompt,
      (text) => {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleaned);
      }
    );

    const domain = (retailHostname || website || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    const allResultUrls = searchResults.map((r: any) => r.url ?? r);

    const dedupedByLinkedinUrl = new Map<string, typeof result.contacts[number]>();

    for (const c of (result.contacts || [])) {
      if (!c.name || !c.linkedinUrl) continue;

      // Anti-hallucination guard: LinkedIn URL must exist verbatim in search results
      const normalize = (s: string) => s.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');
      const urlExisted = allResultUrls.some((u: string) => u && normalize(u) === normalize(c.linkedinUrl));
      if (!urlExisted) {
        console.warn(`Discarding contact with hallucinated LinkedIn URL: ${c.name} — ${c.linkedinUrl}`);
        continue;
      }

      // Validate the guessed email actually uses the expected domain —
      // catches cases where the model invented a different domain
      let email: string | undefined = c.email;
      if (email && domain && !email.toLowerCase().endsWith('@' + domain.toLowerCase())) {
        console.warn(`Email domain mismatch for ${c.name}, rebuilding from name + known domain`);
        const parts = c.name.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (parts.length >= 2 && domain) {
          const first = parts[0].replace(/[^a-z]/g, '');
          const last = parts[parts.length - 1].replace(/[^a-z]/g, '');
          email = `${first}.${last}@${domain}`;
        } else {
          email = undefined;
        }
      }

      // Dedup by LinkedIn URL, keeping the entry with more fields populated
      const existing = dedupedByLinkedinUrl.get(c.linkedinUrl);
      if (!existing || Object.keys(c).length > Object.keys(existing).length) {
        dedupedByLinkedinUrl.set(c.linkedinUrl, { ...c, email: email || '' });
      }
    }

    const extractedContacts: ScrapedContact[] = await Promise.all(
      Array.from(dedupedByLinkedinUrl.values()).map(async (c) => {
        let confidence = 70; // lowered because email is always a guess
        let source_url = c.linkedinUrl || 'linkedin';

        if (c.email && process.env.HUNTER_API_KEY) {
          try {
            const res = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(c.email)}&api_key=${process.env.HUNTER_API_KEY}`);
            if (res.ok) {
              const data = await res.json();
              if (data?.data?.status === 'valid') {
                confidence = 95;
                source_url = 'hunter_verified';
              } else if (data?.data?.status === 'invalid') {
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
      })
    );

    return { success: true, contacts: extractedContacts };

  } catch (error) {
    console.error('Failed to scrape LinkedIn employees:', error);
    return { success: false, contacts: [], error: error instanceof Error ? error.message : 'LinkedIn employee scrape failed' };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}