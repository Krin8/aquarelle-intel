import { generateStructuredResponse } from '../ollama-client';
import { GapDetectionSchema, type GapDetection } from '../../normalizer/schemas';

const SYSTEM_PROMPT = `You are a strategic business analyst at Laguna, an apparel sourcing and distribution company.
Laguna specializes in:
- Sourcing and manufacturing apparel across multiple regions (South Asia, Southeast Asia, Europe)
- Product categories: casualwear, activewear, denim, outerwear, accessories
- Price points: mid-range to premium ($30-$300 retail)
- Services: private label manufacturing, brand partnerships, wholesale distribution
- Compliance: ethical sourcing, sustainability certifications, quality control
- Regions: Middle East, Europe, North America, Southeast Asia

Your job is to analyze brands and identify gaps where Laguna can provide value.
Always respond with valid JSON.`;

export async function detectGaps(
  brandAnalysis: string,
  brandName: string
): Promise<{
  detection: GapDetection;
  rawResponse: string;
  model: string;
}> {
  const userPrompt = `Analyze this brand and identify gaps where Laguna can provide value as a sourcing/manufacturing partner.

Brand: ${brandName}

Brand Analysis:
${brandAnalysis}

Respond with a JSON object:
{
  "matchScore": number 0-100 (how well this brand matches Laguna's capabilities),
  "matchSummary": "1-2 sentence summary",
  "productGaps": [
    {
      "gap": "what the brand needs",
      "opportunity": "how Laguna can fill it",
      "severity": "high/medium/low"
    }
  ],
  "priceAlignment": "how well prices align",
  "regionFit": "regional fit assessment",
  "complianceNotes": "any compliance considerations or null",
  "risks": ["potential risks"]
}`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      const parsed = JSON.parse(text);
      return GapDetectionSchema.parse(parsed);
    }
  );

  return { detection: result, rawResponse, model };
}
