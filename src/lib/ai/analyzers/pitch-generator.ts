import { generateStructuredResponse } from '../router';
import { PitchSuggestionSchema, type PitchSuggestion } from '../../normalizer/schemas';
import { getAquarelleContextString } from '../../knowledge/aquarelle-kb';

export async function generatePitchAngles(
  brandName: string,
  brandAnalysis: string,
  gapDetection: string,
  customerType: string = 'new',
  pipelineData?: string,
  supplierIntelligence?: string,
  customPrompt?: string,
  modelPref?: 'ollama' | 'gemini'
): Promise<{
  pitchSuggestions: PitchSuggestion;
  rawResponse: string;
  model: string;
}> {
  let strategyPrompt = '';
  if (customerType === 'existing') {
    strategyPrompt = `This is an EXISTING CUSTOMER. Pitch angles should focus on EXPANSION: new shirt categories or styles, increased volume, sustainability/innovation angles, or speed-to-market improvements to grow our share of their business.`;
  } else if (customerType === 'pipeline') {
    strategyPrompt = `This is a PIPELINE PROSPECT. Focus on overcoming current inertia, highlighting speed/cost advantages, and pitching a low-risk trial capsule or pilot program.`;
  } else {
    strategyPrompt = `This is a NEW PROSPECT. Pitch angles should be highly consultative, leading with how Aquarelle solves their specific gaps before pitching our broader capabilities.`;
  }

  let pipelineContext = '';
  const hasFinancialData = !!pipelineData && pipelineData.length > 10;
  if (hasFinancialData) {
    pipelineContext = `
-- FINANCIAL/PIPELINE INTELLIGENCE --
The following data was extracted from internal documents/SOPs:
${pipelineData}

Use this financial data ONLY to inform the 'expectedROI' and the commercial viability of the pitch. Do not quote specific internal margins back to the customer, but DO angle the pitch towards areas where they are losing margin or where Aquarelle can improve their landed cost.
`;
  }

  const SYSTEM_PROMPT = `You are a Senior Enterprise Sales Director at Aquarelle India.
You create McKinsey-style executive pitches for potential enterprise brand partners.

${getAquarelleContextString()}

Your objective: "Determine how Aquarelle can win the prospect as a customer."
Every recommendation, insight, gap analysis, and pitch must optimize for increasing Aquarelle's probability of winning the customer.

GROUNDING RULE: Every pitch angle and product recommendation must connect a SPECIFIC fact from the Aquarelle Knowledge Base to a SPECIFIC need or gap stated in the Prospect Analysis or Gap Detection data. You MUST ONLY align with the specific capabilities listed in the AQUARELLE KNOWLEDGE BASE above. Do NOT invent, assume, or hallucinate capabilities that Aquarelle does not have (e.g. do not pitch activewear or accessories if they are not in the KB).

Return ONLY a JSON object exactly matching this structure:
{
  "executiveSummary": "McKinsey-style executive summary of why Aquarelle is the perfect partner for this prospect.",
  "pitchAngles": [
    {
      "title": "Angle Title",
      "rationale": "Why this works for them",
      "openingLine": "suggested opening line for outreach",
      "keyPoints": ["key talking point 1", "key talking point 2"],
      "strength": "strong"
    }
  ],
  "productRecommendations": [
    "Specific Fabric/Product from KB (e.g., Heavyweight Flannels, Organic Cotton Poplin) that fits their gap."
  ],
  "objectionHandling": [
    {
      "objection": "Likely objection based on their current setup",
      "response": "How to counter using Aquarelle's KB"
    }
  ],
  "expectedROI": "Business impact and estimated ROI.",
  "recommendedApproach": "best overall approach, grounded in data",
  "buyerPersona": "who to pitch to (e.g., VP of Sourcing, Head of Design) and why",
  "timingConsiderations": "best timing for outreach or null"
}

STRENGTH rating rubric for pitchAngles:
- "strong": ties a specific Aquarelle fact directly to a specific, clearly-stated brand need or gap
- "moderate": a plausible connection exists, but is somewhat inferred
- "speculative": the angle is a reasonable idea but lacks a clear stated basis

Always respond with valid JSON, no markdown fences, no preamble.`;

  const userPrompt = `Prospect Brand: ${brandName}
${strategyPrompt}
${pipelineContext}

-- PROSPECT ANALYSIS --
${brandAnalysis}

-- STRATEGIC GAP DETECTION (Target vs Competitors vs Aquarelle) --
${gapDetection}
${pipelineContext}
${supplierIntelligence ? `\n-- INCUMBENT SUPPLIER INTELLIGENCE --\n${supplierIntelligence}\n` : ''}
${customPrompt ? `\n-- ADDITIONAL INSTRUCTIONS --\n${customPrompt}\n` : ''}

Generate the Enterprise Pitch Proposal for ${brandName}.
Respond with the JSON only.`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.timingConsiderations === 'null' || parsed.timingConsiderations === '') {
        parsed.timingConsiderations = null;
      }

      if (Array.isArray(parsed.pitchAngles)) {
        parsed.pitchAngles = parsed.pitchAngles.slice(0, 5).map((p: any) => ({
          ...p,
          strength: ['strong', 'moderate', 'speculative'].includes(p.strength) ? p.strength : 'moderate',
        }));
      }

      return PitchSuggestionSchema.parse(parsed);
    },
    modelPref
  );

  if (hasFinancialData && modelPref === 'gemini') {
    console.warn('[PitchAngles] Confidential financial intelligence was sent to an external model provider (Gemini). Confirm this is intended.');
  }

  return { pitchSuggestions: result, rawResponse, model };
}