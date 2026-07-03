import { generateStructuredResponse } from '../router';
import { FinancialIntelligenceSchema, type FinancialIntelligence } from '../../normalizer/schemas';

const SYSTEM_PROMPT = `You are a Senior Financial Intelligence Analyst for Aquarelle (a shirts manufacturing division of CIEL Textile).
Your job is to estimate internal manufacturing financial metrics (SOP Pipeline Data) for a given apparel brand.
You must synthesize the brand's scraped data and web search results to estimate realistic benchmarks.

## REQUIRED ESTIMATES
1. FOB Price (Free On Board): Estimate the average manufacturing cost per shirt based on their retail price. (e.g. Retail $50 usually implies FOB $8-$12).
2. Std CPU (Cost Per Unit in INR): Estimate the standard cutting/making cost. Typically ₹150-250 for standard shirts, higher for complex/premium.
3. Std Margin (in INR): Expected margin per garment for the manufacturer. Typically ₹200-400 depending on complexity.
4. Profit %: Manufacturer profit margin (0.05 to 0.15 is typical).
5. SMV (Standard Minute Value): Estimated minutes to assemble their typical shirt. (e.g., 18-22 min for basic, 25-35 min for complex/premium).
6. CPU Grade: Assign a grade (A, B, C, D) based on expected volume and margin attractiveness.
7. Aquarelle Mauritius Viability: "Yes" or "No" based on whether their product matches Aquarelle's capabilities (shirts, casual/smart-casual) and target markets (US/EU/UK/SA).

ABSOLUTE RULES:
1. Always return a raw JSON object matching the schema.
2. Ensure realistic correlations (e.g. luxury brands = higher FOB, higher SMV).
3. If data is sparse, make highly educated estimations based on their market segment and competitors. Do not leave fields null if they can be reasonably benchmarked.`;

export async function generateFinancialIntelligence(
  brandName: string,
  priceRange: string | null,
  segment: string | null,
  marketContext: string): Promise<FinancialIntelligence> {
  const userPrompt = `Generate internal financial SOP metrics for the following brand:

## BRAND PROFILE
Brand Name: ${brandName}
Segment: ${segment || 'Unknown'}
Retail Price Range: ${priceRange || 'Unknown'}

## MARKET & MANUFACTURING CONTEXT
${marketContext.slice(0, 10000)}

## OUTPUT SCHEMA
Return exactly this JSON object — no extra keys, no omitted keys:

{
  "fobPrice": <number in USD>,
  "stdCPU": <number in INR>,
  "stdMargin": <number in INR>,
  "profitPct": <decimal number between 0.05 and 0.20>,
  "smv": <number in minutes>,
  "cpuGrade": "<A, B, C, or D>",
  "prospectForAqrlMur": "<Yes or No>"
}

Using the context provided, infer the likely manufacturing costs and metrics.`;

  const response = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      // Find the JSON block if it's wrapped in markdown
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : text;
      return FinancialIntelligenceSchema.parse(JSON.parse(jsonString));
    }
  );

  return response.result;
}
