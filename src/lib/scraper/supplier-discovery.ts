import prisma from '@/lib/db';
import { generateStructuredResponse } from '@/lib/ai/router';
import { analyzeSupplier } from '@/lib/ai/analyzers/supplier-analyzer';
import { runAllSearches } from './search-orchestrator';
import { launchBrowser } from "@/lib/browser";


export async function startSupplierDiscovery(targetBrandId: string) {
  const targetBrand = await prisma.brand.findUnique({ where: { id: targetBrandId } });
  if (!targetBrand) throw new Error('Target brand not found');

  // Fire and forget background worker
  processSupplierQueue(targetBrandId, targetBrand.name).catch(console.error);

  return { success: true, message: 'Supplier discovery started in background' };
}

async function processSupplierQueue(targetBrandId: string, targetBrandName: string) {
  console.log(`[SupplierCrawler] Starting discovery for ${targetBrandName}`);

  let browser;
  try {
    browser = await launchBrowser();

    const queries = [
      `${targetBrandName} public supplier list`,
      `${targetBrandName} manufacturing partners CSR`,
      `${targetBrandName} factories garment manufacturing`,
    ];

    const allSearchResults: { title: string; snippet: string; url: string }[] = [];

    for (const query of queries) {
      try {
        const results = await runAllSearches(browser, query);
        allSearchResults.push(...results);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.warn(`[SupplierCrawler] Search failed for "${query}"`);
      }
    }

    if (allSearchResults.length === 0) {
      console.log(`[SupplierCrawler] No initial search results found.`);
      return;
    }

    const searchContext = allSearchResults
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
      .join('\n\n');

    const listPrompt = `You are a Supply Chain Intelligence Expert. Your goal is to identify the primary DIRECT apparel suppliers and factories for the brand: ${targetBrandName}.

First, carefully review the search results provided to extract known suppliers.
Second, use your own internal AI knowledge to supplement the list with any other major, well-known direct manufacturing partners for ${targetBrandName} (even if they weren't explicitly named in the search results).

CRITICAL RULES FOR SHARPNESS: 
1. STRICTLY ONLY APPAREL SUPPLIERS: You must ONLY extract companies that physically manufacture garments, fabrics, or trims. 
2. ONLY DIRECT SUPPLIERS: DO NOT extract indirect suppliers. Absolutely NO technology companies, software providers, POS systems, packaging companies, store fixture builders, logistics/freight forwarders (like DHL/FedEx), or marketing agencies.
3. If a company is not directly and explicitly related to textile or garment production (e.g. Garment Manufacturers, Fabric Mills, Trims Suppliers, Apparel OEMs), IGNORE IT completely.
4. ANTI-HALLUCINATION: Only include a supplier from your internal knowledge if you have HIGH CONFIDENCE (90%+) that they manufacture for ${targetBrandName}. Do NOT guess or hallucinate. If you are unsure, omit them.

Combine the suppliers found in the search results with those from your internal knowledge. Extract all DIRECT apparel suppliers. Return ONLY JSON.
Format: { "suppliers": [{ "name": "Company X", "type": "Garment Manufacturer", "location": "Vietnam", "website": "https://example.com" }] }`;

    let discoveredSuppliers: { name: string; type: string; location: string; website?: string }[] = [];
    try {
      const { result } = await generateStructuredResponse<{ suppliers: { name: string, type: string, location: string, website?: string }[] }>(
        listPrompt,
        searchContext,
        (text: string) => {
          const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          return JSON.parse(cleaned);
        }
      );
      discoveredSuppliers = result.suppliers || [];
      console.log(`[SupplierCrawler] AI extracted ${discoveredSuppliers.length} suppliers:`, discoveredSuppliers.map(s => s.name));
    } catch (e) {
      console.error(`[SupplierCrawler] Failed to extract suppliers from search results:`, e);
      return;
    }

    for (const s of discoveredSuppliers) {
      const existing = await prisma.supplierProfile.findUnique({
        where: { targetBrandId_name: { targetBrandId, name: s.name } }
      });

      if (!existing) {
        const newSupplier = await prisma.supplierProfile.create({
          data: {
            targetBrandId,
            name: s.name,
            type: s.type,
            location: s.location,
            website: s.website || null,
            companyOverview: 'Pending detailed analysis'
          }
        });
        console.log(`[SupplierCrawler] Added new supplier: ${s.name}`);
        
        // Trigger detailed analysis
        await analyzeSupplier(newSupplier.id, targetBrandId);
      }
    }

    console.log(`[SupplierCrawler] Discovery complete for ${targetBrandName}`);
  } catch (error) {
    console.error(`[SupplierCrawler] Global error:`, error);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
  }
}

