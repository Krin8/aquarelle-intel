import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/router';
import { URL } from 'url';
import { ScrapedContact } from './index';

puppeteer.use(StealthPlugin());

export async function scrapeDataProvider(brandName: string, website: string): Promise<{ success: boolean; contacts: ScrapedContact[]; error?: string }> {
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
    
    // Step 1: Direct approach - Attempt to load ZoomInfo search
    // ZoomInfo is very aggressive, so we just check if it loads
    const directQuery = encodeURIComponent(`${brandName} ${retailHostname}`);
    const zoomInfoDirectUrl = `https://www.zoominfo.com/c/${directQuery}`;
    
    let directText = '';
    try {
      const response = await page.goto(zoomInfoDirectUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
      if (response && response.status() !== 403 && response.status() !== 401) {
        // If not immediately blocked, grab some text
        directText = await page.evaluate(() => document.body.innerText.slice(0, 5000));
      }
    } catch (e) {
      console.log(`[ZoomInfo] Direct scrape failed or timed out, falling back to SERP...`);
    }

    // Step 2: SERP Fallback - if direct text is empty or too short (likely blocked/captcha)
    let searchResults: { title: string; snippet: string }[] = [];
    if (directText.length < 500) {
      console.log(`[ZoomInfo] Using DuckDuckGo Search API fallback...`);
      const { runDuckDuckGoSearch } = await import('./ddg-search');
      const query = `site:zoominfo.com OR site:rocketreach.co "${brandName}" OR ${retailHostname} team executives board`;
      const ddgResults = await runDuckDuckGoSearch(query);
      searchResults = ddgResults.map(r => ({ title: r.title, snippet: r.snippet }));
    }

    await browser.close().catch(() => {});

    const dataToAnalyze = directText.length >= 500 
      ? `Direct Page Text:\n${directText}` 
      : `Search Snippets:\n${JSON.stringify(searchResults, null, 2)}`;

    if (!dataToAnalyze.trim() || (directText.length < 500 && searchResults.length === 0)) {
       return { success: false, contacts: [], error: 'No data found from provider.' };
    }

    const systemPrompt = `You are a precise data extraction tool. You extract ONLY information that is explicitly present in the provided text. You never infer, guess, or use outside knowledge about a company to fill in names or titles that are not in the text.`;

// ─── PRE-PROCESS: Strip boilerplate BEFORE the model sees the data ─────────
// Noise like "Unlock 12 more contacts" actively misleads 8B models.
// Cleaning it out first saves ~30% context and removes the biggest confusion source.
const BOILERPLATE_PATTERNS = [
  /unlock\s+\d+\s+more\s+(contacts?|emails?|profiles?)/gi,
  /view\s+full\s+profile/gi,
  /unlock\s+(contacts?|emails?|phone\s*numbers?)/gi,
  /get\s+(email|phone|contact)\s*(address|number)?/gi,
  /see\s+all\s+(employees?|contacts?)/gi,
  /show\s+more\s*(contacts?)?/gi,
  /\d{2,4}\s*[-–]\s*\d{2,4}\s+employees?/gi,
  /employee\s+count\s*:\s*[\d,+]+/gi,
  /revenue\s*:\s*\$[\d.,]+[MBK]?/gi,
  /founded\s*:\s*\d{4}/gi,
  /industry\s*:\s*[^\n]+/gi,
];

const cleanedData = BOILERPLATE_PATTERNS
  .reduce((text, pattern) => text.replace(pattern, ''), dataToAnalyze)
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, 4000); // Hard cap — 8B needs context budget for schema + rules


// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a contact extraction engine for Aquarelle, a shirts manufacturing division of CIEL Textile.
Your task: identify named executives and B2B decision-makers from noisy scraped business data.

ABSOLUTE RULES:
1. Extract ONLY names explicitly written in the scraped text. Never use your training knowledge of who works at any company.
2. If no one qualifies, return {"contacts": []} — never fabricate entries to seem helpful.
3. Output raw JSON only — no markdown fences, no preamble, no explanation.`;


// ─── USER PROMPT ──────────────────────────────────────────────────────────────
// Structure: Examples FIRST → then rules → then data.
// 8B models anchor on early examples better than on rules read after long text.
const prompt = `## TARGET
Brand  : ${brandName}
Website: ${website}

## EXAMPLES — study before extracting

Example A:
Input : "Acme Corp. Jane Doe - Chief Executive Officer. Mark Lee, Head of Wholesale. Unlock 5 more contacts."
Output: {"contacts": [
  {"name": "Jane Doe", "role": "Chief Executive Officer", "sourceLine": "Jane Doe - Chief Executive Officer"},
  {"name": "Mark Lee", "role": "Head of Wholesale",       "sourceLine": "Mark Lee, Head of Wholesale"}
]}

Example B:
Input : "500+ employees. Headquartered in Chicago. Unlock contacts to view executives. Revenue: $50M."
Output: {"contacts": []}

Example C:
Input : "Sarah Kim (Founder). Thomas Wright. Alice Chen - Sales Representative. Bob Patel - CEO."
Output: {"contacts": [
  {"name": "Sarah Kim", "role": "Founder", "sourceLine": "Sarah Kim (Founder)"},
  {"name": "Bob Patel", "role": "CEO",     "sourceLine": "Bob Patel - CEO"}
]}
→ Thomas Wright: no title → excluded.
→ Alice Chen: Sales Rep = not a decision-maker → excluded.

## SCRAPED DATA
"""
${cleanedData}
"""

## ACCEPT — include only if ALL are true:
- Name is explicitly written in the scraped data above
- Role signals decision-making authority:
  C-suite (CEO, COO, CFO, CTO, CMO) | President | Founder | Owner | Managing Director
  VP / Vice President | Director | Head of [Dept] | General Manager
- OR: person is explicitly identified as a Founder/Owner with no title at all

## REJECT — exclude if ANY are true:
- Name appears only inside a CTA phrase ("Unlock X contacts", "View full profile")
- Title is: Intern, Analyst, Representative, Coordinator, Associate, Team Member, Employee, or any junior IC role
- Person is not named in the scraped data but you recognise them from training knowledge
- Name appears with no title and there is no founder/owner signal

## DEDUPLICATION
Same person named twice → keep the most complete, most senior title only.

## NULL CONTRACT
If no candidates pass ACCEPT → return {"contacts": []}
An empty array is the correct answer. Do not pick borderline contacts to avoid returning empty.

## OUTPUT — exactly this JSON shape, one entry per qualified person:
{
  "contacts": [
    {
      "name"      : "<exact name as written in scraped data>",
      "role"      : "<exact title as written near that name | 'Unknown' if confirmed founder with no title>",
      "sourceLine": "<the exact short phrase from data where name + role appear together>"
    }
  ]
}`;


// ─── PARSER ───────────────────────────────────────────────────────────────────
const { result } = await generateStructuredResponse<{
  contacts: { name: string; role: string; sourceLine?: string }[];
}>(
  SYSTEM_PROMPT,
  prompt,
  (text) => {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  }
);


// ─── DUAL ANTI-HALLUCINATION GUARD ────────────────────────────────────────────
// Layer 1 (existing): name must appear in cleaned source text.
// Layer 2 (new):      sourceLine must also be traceable — catches fabricated roles.
const normalizedSource = cleanedData.toLowerCase();

const validatedContacts = (result.contacts ?? []).filter(c => {
  if (!c.name || typeof c.name !== 'string') return false;

  // Layer 1: name check
  const nameLower = c.name.toLowerCase().trim();
  if (!nameLower || !normalizedSource.includes(nameLower)) return false;

  // Layer 2: sourceLine check (first 40 chars is enough for a match signal)
  if (c.sourceLine) {
    const anchor = c.sourceLine.toLowerCase().slice(0, 40);
    if (anchor && !normalizedSource.includes(anchor)) {
      console.warn(`[Aquarelle] sourceLine not traceable — discarding: ${c.name}`);
      return false;
    }
  }

  return true;
});


// ─── NUANCED CONFIDENCE SCORING ───────────────────────────────────────────────
// Old: binary 75 / 50. New: scored on three independent signals.
const C_SUITE   = ['ceo','coo','cfo','cto','cmo','president','founder','owner','managing director'];
const MID_LEVEL = ['vp','vice president','director','head of','general manager'];

const scoreContact = (c: { role: string; sourceLine?: string }): number => {
  let score = 50;                                                    // base: name found in text
  if (c.role && c.role !== 'Unknown')      score += 15;             // role confirmed
  if (c.sourceLine)                        score += 15;             // model cited its source
  const r = (c.role ?? '').toLowerCase();
  if (C_SUITE.some(t => r.includes(t)))    score += 20;             // senior title
  else if (MID_LEVEL.some(t => r.includes(t))) score += 10;         // mid-level title
  return Math.min(score, 100);
};


// ─── PROVIDER DETECTION ───────────────────────────────────────────────────────
// URL signal first, content scan as fallback, covers more providers.
const detectProvider = (sourceUrl: string, rawData: string): string => {
  const haystack = `${sourceUrl} ${rawData}`.toLowerCase();
  if (haystack.includes('rocketreach')) return 'rocketreach';
  if (haystack.includes('zoominfo'))    return 'zoominfo';
  if (haystack.includes('apollo.io'))   return 'apollo';
  if (haystack.includes('lusha'))       return 'lusha';
  if (haystack.includes('hunter.io'))   return 'hunter';
  return 'unknown_provider';
};

const providerSource = detectProvider(website, dataToAnalyze);

const extractedContacts: ScrapedContact[] = validatedContacts.map(c => ({
  name      : c.name,
  role      : c.role || 'Unknown',
  confidence: scoreContact(c),
  source_url: providerSource,
  type      : 'direct',
}));

return { success: true, contacts: extractedContacts };

  } catch (error: any) {
    console.error('Failed to scrape data provider:', error);
    return { success: false, contacts: [], error: error.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}