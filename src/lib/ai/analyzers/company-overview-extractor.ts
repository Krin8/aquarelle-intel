import { generateStructuredResponse } from '../router';
import { z } from 'zod';

export const AICompanyOverviewSchema = z.object({
  parentCompany: z.string().nullish().describe("The parent company or holding group of this brand. Null if independent."),
  countryOfOrigin: z.string().nullish().describe("The country where the brand was founded or is headquartered."),
  city: z.string().nullish().describe("The primary headquarters city."),
  state: z.string().nullish().describe("The primary headquarters state or province. Use abbreviated format if US/CA."),
  turnover: z.string().nullish().describe("The company's estimated annual turnover or revenue, formatted nicely (e.g., $1.2B, $500M, €50M)."),
  storesCount: z.number().nullish().describe("The approximate number of retail stores. Null if online only or unknown."),
  retailPriceMensShirt: z.string().nullish().describe("The average retail price of a men's shirt for this brand (e.g., $45, $120)."),
  productType: z.string().nullish().describe("A short 1-3 word description of their primary product type (e.g., Activewear, Casual Apparel, Footwear)."),
});

export type ExtractedCompanyOverview = z.infer<typeof AICompanyOverviewSchema>;

const SYSTEM_PROMPT = `You are a precision B2B corporate intelligence data extractor.
Your job is to analyze snippets of search results (often from ZoomInfo, Wikipedia, or Volza) along with website content, and extract structural information about a company.
If the provided search snippets or website content do not contain the answer, rely on your internal knowledge base to fill in the gaps as best as possible.

CRITICAL INSTRUCTIONS:
- You MUST prioritize the most recent, up-to-date information available. Look for recent years (e.g., 2024, 2025, 2026) for revenue and store counts. Ignore outdated historical data if newer data is present.
- Format revenue/turnover concisely (e.g., "$1.2B", "$500M"). Do not output raw large numbers.
- If a brand is part of a larger conglomerate (e.g., Gap Inc. for Old Navy), specify the parent company. If independent, leave null.
- State should be standard postal abbreviation if US (e.g., "NY", "CA").
- For product type, use short categories like "Denim", "Outdoor Gear", "Luxury Apparel".

Respond strictly with a JSON object using EXACTLY these keys:
{
  "parentCompany": "string | null",
  "countryOfOrigin": "string | null",
  "city": "string | null",
  "state": "string | null",
  "turnover": "string | null",
  "storesCount": "number | null",
  "retailPriceMensShirt": "string | null",
  "productType": "string | null"
}
No markdown fences, no summary text.`;

export async function extractCompanyOverview(
  brandName: string,
  searchSnippets: string,
  websiteContent: string,
  region: string = "Global"
) {
  const userPrompt = `Brand Name: ${brandName}
Target Region: ${region}

CRITICAL: The user has requested data for the specific region: "${region}". 
If this is not "Global", you MUST attempt to extract the turnover, storesCount, and retailPriceMensShirt specifically for the "${region}" region (e.g. stores in Europe, revenue in North America). If regional data is completely unavailable, fall back to global numbers.

Search Results Snippets (ZoomInfo, Wikipedia, Volza, etc):
${searchSnippets || "None provided. Rely entirely on your knowledge base and website content."}

Website Content Snippet:
${websiteContent.slice(0, 3000) || "None provided."}

Extract the company overview fields.`;

  try {
    const { result } = await generateStructuredResponse<ExtractedCompanyOverview>(
      SYSTEM_PROMPT,
      userPrompt,
      (text) => {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        return AICompanyOverviewSchema.parse(parsed);
      },
      undefined,
      !searchSnippets
    );

    if (!result) return null;

    return result as ExtractedCompanyOverview;
  } catch (error) {
    console.error(`[AI:CompanyOverviewExtractor] Failed to extract for ${brandName}:`, error);
    return null;
  }
}
