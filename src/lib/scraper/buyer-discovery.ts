import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/router';
import { getAquarelleContextString } from '../knowledge/aquarelle-kb';
import prisma from '../db';
import { URL } from 'url';

puppeteer.use(StealthPlugin());

export async function discoverBuyersAndRelationships(brandId: string) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new Error("Brand not found");

  console.log(`[BuyerDiscovery] Starting multi-source discovery for ${brand.name}...`);
  
  let retailHostname = '';
  try {
    if (brand.website) {
      const parsedUrl = new URL(brand.website);
      const parts = parsedUrl.hostname.split('.');
      retailHostname = parts.length >= 2 ? parts.slice(-2).join('.') : parsedUrl.hostname;
    }
  } catch {}

  let browser;
  let searchResults: any[] = [];
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    
    // 1. LinkedIn Search via DDG API
    const { runDuckDuckGoSearch } = await import('./ddg-search');
    
    const roles = '("Sourcing" OR "Procurement" OR "Buying" OR "Merchandising" OR "Product Development" OR "Quality" OR "Sustainability")';
    const linkedinQuery = `site:linkedin.com/in "${brand.name}" ${roles}`;
    const linkedinRaw = await runDuckDuckGoSearch(linkedinQuery);
    
    const linkedinResults = linkedinRaw.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: 'linkedin'
    }));

    // 2. Document Search via DDG (PDFs, ESG Reports)
    const docQuery = `"${brand.name}" (supplier code of conduct OR vendor manual OR factory list OR sustainability report) filetype:pdf`;
    const docRaw = await runDuckDuckGoSearch(docQuery);

    const docResults = docRaw.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: 'document'
    }));

    searchResults = [...linkedinResults, ...docResults];

  } catch (err) {
    console.error(`[BuyerDiscovery] Browser error:`, err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  if (searchResults.length === 0) {
    return { success: false, error: 'No data found across public sources.' };
  }

  // AI Extraction for Deep Buyer Profiles
  const aquarelleCtx = getAquarelleContextString();
  const systemPrompt = `You are a B2B Sales Intelligence agent for Aquarelle India.
Analyze the provided public search snippets about people connected to ${brand.name}.
Identify ONLY key decision-makers relevant to apparel sourcing, manufacturing, product development, or sustainability. Extract as many valid contacts as possible up to a maximum cap of 15-20. If you can only find 7, that is perfectly fine, just ensure you extract at least 5 if they exist.

Return ONLY a JSON object exactly matching this structure:
{
  "buyers": [
    {
      "name": "Jane Doe",
      "role": "Head of Sourcing",
      "department": "Sourcing",
      "linkedinUrl": "https://...",
      "source": "website/linkedin/document",
      "areasOfResponsibility": ["Woven Tops", "Denim"],
      "yearsInRole": 3,
      "sustainabilityInitiatives": "Mentioned in ESG report for BCI cotton switch",
      "procurementPriorities": "Speed to market, lowering MOQs",
      "relevanceScore": 95,
      "whyMatters": "Controls the exact category Aquarelle manufactures.",
      "likelyPriorities": "Cost reduction and sustainability.",
      "potentialChallenges": "Current vendor lock-in.",
      "relevantCapabilities": ["BCI Cotton", "Premium Wovens"],
      "valueProposition": "Aquarelle offers vertically integrated BCI cotton wovens to hit her sustainability goals.",
      "objections": "Too far from current nearshore vendors.",
      "recommendedMessage": "Hi Jane, noticed your push for BCI cotton in the latest ESG report..."
    }
  ]
}

${aquarelleCtx}`;

  const userPrompt = `Brand: ${brand.name}\n\nSearch Results:\n${JSON.stringify(searchResults, null, 2)}`;

  const { result } = await generateStructuredResponse<{ buyers: any[] }>(
    systemPrompt,
    userPrompt,
    (text) => JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim())
  );

  // Save to DB
  for (const buyer of result.buyers || []) {
    if (!buyer.name || buyer.name.trim().length === 0) continue;

    const contact = await prisma.contact.create({
      data: {
        brandId,
        name: buyer.name,
        role: buyer.role,
        department: buyer.department,
        linkedinUrl: buyer.linkedinUrl,
        source: buyer.source || 'website',
        buyerType: 'decision_maker',
        confidenceScore: 0.8,
        
        // Extended Intelligence
        areasOfResponsibility: JSON.stringify(buyer.areasOfResponsibility || []),
        yearsInRole: buyer.yearsInRole || null,
        sustainabilityInitiatives: buyer.sustainabilityInitiatives,
        procurementPriorities: buyer.procurementPriorities,
        relevanceScore: buyer.relevanceScore || 50,
        isVerified: false,

        // Outreach Strategy
        outreachStrategy: {
          create: {
            whyMatters: buyer.whyMatters,
            likelyPriorities: buyer.likelyPriorities,
            potentialChallenges: buyer.potentialChallenges,
            relevantCapabilities: JSON.stringify(buyer.relevantCapabilities || []),
            valueProposition: buyer.valueProposition,
            objections: JSON.stringify([{ objection: buyer.objections, response: 'Leverage vertical integration' }]),
            recommendedMessage: buyer.recommendedMessage,
          }
        }
      }
    });

  }

  return { success: true, count: result.buyers?.length || 0 };
}
