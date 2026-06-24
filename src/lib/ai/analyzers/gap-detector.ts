import { generateStructuredResponse } from '../router';
import { GapDetectionSchema, type GapDetection } from '../../normalizer/schemas';

const SYSTEM_PROMPT = `You are a strategic business analyst at CIEL Textiles, an apparel sourcing and distribution company.
CIEL Textiles specializes in:
- Sourcing and manufacturing apparel across multiple regions (South Asia, Southeast Asia, Europe)
- Product categories: casualwear, activewear, denim, outerwear, accessories
- Price points: mid-range to premium ($30-$300 retail)
- Services: private label manufacturing, brand partnerships, wholesale distribution
- Compliance: ethical sourcing, sustainability certifications, quality control
- Regions: Middle East, Europe, North America, Southeast Asia

Your job is to analyze brands and identify gaps where CIEL Textiles can provide value.
Always respond with valid JSON.`;

export async function detectGaps(
  brandAnalysis: string,
  brandName: string,
  customerType: string = 'new',
  pipelineData?: string,
  modelPref?: 'ollama' | 'gemini'
): Promise<{
  detection: GapDetection;
  rawResponse: string;
  model: string;
}> {
  let strategyPrompt = '';
  if (customerType === 'existing') {
    strategyPrompt = `This is an EXISTING CUSTOMER. Your goal is to review what business we are currently doing, identify gaps in our engagement, and find additional opportunities to increase our share of business. Focus on expanding product categories, improving cost competitiveness, pushing innovation/sustainability, and evaluating speed to market.`;
  } else if (customerType === 'pipeline') {
    strategyPrompt = `This is a PIPELINE PROSPECT. Your goal is to study their current sourcing strategy and assess what Aquarelle can offer versus what they are currently buying. Identify gaps in product capability, cost competitiveness, innovation, value-added offerings, and compliance/sustainability. Build a bridge plan to create customer interest.`;
  } else {
    strategyPrompt = `This is a NEW UNLISTED CUSTOMER. Your goal is to evaluate their baseline sourcing potential and align them to Aquarelle's strengths and capabilities. Identify if they are a good strategic fit.`;
  }

  let financialContext = '';
  if (pipelineData) {
    try {
      const fin = JSON.parse(pipelineData);
      financialContext = `\n\nINTERNAL FINANCIAL INTELLIGENCE (CONFIDENTIAL - use to ground your analysis):
- FOB Price Target: $${fin.fobPrice || 'N/A'}
- Standard CPU: ${fin.stdCPU || 'N/A'} INR
- Standard Margin: ${fin.stdMargin || 'N/A'} INR
- Profit %: ${fin.profitPct ? (fin.profitPct * 100).toFixed(1) + '%' : 'N/A'}
- SMV: ${fin.smv || 'N/A'} min
- CPU Grade: ${fin.cpuGrade || 'N/A'}
- Prospect for Aquarelle Mauritius: ${fin.prospectForAqrlMur || 'N/A'}`;
    } catch {}
  }

  const userPrompt = `Analyze this brand and identify gaps where CIEL Textiles (specifically Aquarelle) can provide value as a sourcing/manufacturing partner.

STRATEGIC DIRECTIVE:
${strategyPrompt}
${financialContext}

Brand: ${brandName}

Brand Analysis:
${brandAnalysis}

Respond with a JSON object:
{
  "matchScore": number 0-100 (how well this brand matches CIEL Textiles's capabilities),
  "matchSummary": "1-2 sentence summary",
  "productGaps": [
    {
      "gap": "what the brand needs",
      "opportunity": "how CIEL Textiles can fill it",
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
    },
    modelPref
  );

  return { detection: result, rawResponse, model };
}
