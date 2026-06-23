import { generateStructuredResponse } from '../ollama-client';
import { WebsiteAnalysisSchema, type WebsiteAnalysis } from '../../normalizer/schemas';

const SYSTEM_PROMPT = `You are a market intelligence analyst specializing in apparel and fashion brands. 
You analyze brand websites to extract structured business intelligence.
Always respond with valid JSON matching the requested schema exactly.
Be precise about pricing, segments, and target demographics.
If information is not clearly available, make reasonable inferences from the content and mark them as such.`;

export async function analyzeWebsite(markdown: string, brandName: string, websiteUrl: string): Promise<{
  analysis: WebsiteAnalysis;
  rawResponse: string;
  model: string;
}> {
  const userPrompt = `Analyze this brand website content and extract structured intelligence.

Brand: ${brandName}
URL: ${websiteUrl}

Website Content:
${markdown.slice(0, 8000)}

Respond with a JSON object containing these fields:
{
  "brandName": "string - the brand name",
  "tagline": "string or null - brand tagline or slogan",
  "description": "string - 1-2 sentence description of what the brand does",
  "segment": "one of: luxury, premium, mid-range, value, fast-fashion",
  "targetCustomer": "string - target customer demographic",
  "productCategories": ["array of main product categories"],
  "priceRange": "string - approximate price range e.g. $50-$200",
  "keyDifferentiators": ["what makes this brand unique"],
  "sustainability": "string or null - any sustainability/ethical claims",
  "distributionChannels": ["how they sell: DTC, wholesale, retail"],
  "headquartersLocation": "string or null - where based"
}`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      const parsed = JSON.parse(text);
      return WebsiteAnalysisSchema.parse(parsed);
    }
  );

  return { analysis: result, rawResponse, model };
}
