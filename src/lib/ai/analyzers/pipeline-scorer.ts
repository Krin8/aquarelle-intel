import { generateStructuredResponse } from '../router';
import { PipelineScoringSchema, type PipelineScoring } from '../../normalizer/schemas';

const SYSTEM_PROMPT = `You are a strategic business analyst at CIEL Textiles (Aquarelle).
Your job is to evaluate prospective brands against our internal Prioritization Pipeline criteria.
Assign a rating from 1 to 10 for each parameter based on the provided brand data.
10 = Perfect fit / High potential
1 = Poor fit / Low potential

Always respond with valid JSON.`;

export async function scorePipeline(
  brandName: string,
  brandAnalysis: string,
  gapDetection: string,
  modelPref?: 'ollama' | 'gemini'
): Promise<{
  scoring: PipelineScoring;
  rawResponse: string;
  model: string;
}> {
  const userPrompt = `Evaluate ${brandName} against the Aquarelle Prioritization Pipeline grid.

Brand Analysis:
${brandAnalysis}

Gap Detection:
${gapDetection}

Criteria to evaluate (rate 1-10):
1. Product Complexity: Does Aquarelle have the technical capability and is the product mix aligned with our strengths?
2. Sourcing Strategy & Barriers: Is it easy to break into their supplier base?
3. Size at Maturity: Potential volume scaling if we win the business.
4. Planning Visibility: Predictability of their collections and orders.
5. Lead Time: Speed-to-market requirements vs our capabilities.
6. Order Size / MOQ: Order size alignment with our production minimums.

Sum these up for a 'grossTotalPoints' (out of 100, scale the 60 points up or just use a weighted sum out of 100).

CRITICAL INSTRUCTION: You MUST respond in valid JSON using EXACTLY these keys:
{
  "productComplexity": 8,
  "sourcingStrategy": 6,
  "sizeAtMaturity": 9,
  "planningVisibility": 7,
  "leadTime": 5,
  "orderSize": 4,
  "grossTotalPoints": 65,
  "rationale": "Brief 1-2 sentence explanation of these scores."
}`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      let parsed = JSON.parse(text);
      // Clean up common AI hallucinations on keys
      if (parsed.sourcingStrategyBarriers) parsed.sourcingStrategy = parsed.sourcingStrategyBarriers;
      if (parsed.orderSizeMOQ) parsed.orderSize = parsed.orderSizeMOQ;
      if (!parsed.rationale) parsed.rationale = "No rationale provided.";
      
      return PipelineScoringSchema.parse(parsed);
    },
    modelPref
  );

  // Enforce mathematically correct gross total
  const total = result.productComplexity + result.sourcingStrategy + result.sizeAtMaturity + result.planningVisibility + result.leadTime + result.orderSize;
  result.grossTotalPoints = Math.round((total / 60) * 100);

  return { scoring: result, rawResponse, model };
}
