import { generateStructuredResponse } from '../router';
import { PitchSuggestionSchema, type PitchSuggestion } from '../../normalizer/schemas';

const SYSTEM_PROMPT = `You are a sales strategist at CIEL Textiles, an apparel sourcing and distribution company.
You create tailored pitch angles for potential brand partners based on brand analysis and gap detection.
Your pitches should be specific, actionable, and reference the brand's actual needs.
Always respond with valid JSON.`;

export async function generatePitchAngles(
  brandName: string,
  brandAnalysis: string,
  gapDetection: string,
  customerType: string = 'new',
  pipelineData?: string,
  customPrompt?: string,
  modelPref?: 'ollama' | 'gemini'
): Promise<{
  pitchSuggestions: PitchSuggestion;
  rawResponse: string;
  model: string;
}> {
  let strategyPrompt = '';
  if (customerType === 'existing') {
    strategyPrompt = `This is an EXISTING CUSTOMER. Your pitch angles should focus on UPSOLD EXPANSION. Propose expanding into new product categories, increasing volume, highlighting our innovation and sustainability, or improving speed to market to increase our share of their business.`;
  } else if (customerType === 'pipeline') {
    strategyPrompt = `This is a PIPELINE PROSPECT. Your pitch angles should focus on building a BRIDGE PLAN. Formulate competitive pitches that position Aquarelle's capabilities against their current supplier base, highlighting cost competitiveness, value-added offerings, and compliance advantages. Suggest offering sample developments and strategic presentations.`;
  } else {
    strategyPrompt = `This is a NEW UNLISTED CUSTOMER. Your pitch angles should focus on INITIAL OUTREACH. Formulate high-level value propositions introducing Aquarelle, aligning our manufacturing strengths with their specific brand needs and market positioning.`;
  }

  let financialContext = '';
  if (pipelineData) {
    try {
      const fin = JSON.parse(pipelineData);
      financialContext = `\nINTERNAL FINANCIAL INTELLIGENCE (use to make pitches more precise):
- FOB Price Target: $${fin.fobPrice || 'N/A'}
- Profit Margin: ${fin.profitPct ? (fin.profitPct * 100).toFixed(1) + '%' : 'N/A'}
- CPU Grade: ${fin.cpuGrade || 'N/A'}
- SMV: ${fin.smv || 'N/A'} min
Use this data to make cost-related pitches more grounded and specific.\n`;
    } catch {}
  }

  const userPrompt = `Generate pitch angles for approaching ${brandName} as a potential CIEL Textiles (Aquarelle) partner.

STRATEGIC DIRECTIVE:
${strategyPrompt}
${financialContext}
${customPrompt ? `\nCUSTOM INSTRUCTIONS:\n${customPrompt}\n` : ''}
Brand Analysis:
${brandAnalysis}

Gap Detection:
${gapDetection}

Respond with a JSON object:
{
  "pitchAngles": [
    {
      "title": "pitch angle title",
      "rationale": "why this angle works",
      "openingLine": "suggested opening line for outreach",
      "keyPoints": ["key talking points"],
      "strength": "strong/moderate/speculative"
    }
  ],
  "recommendedApproach": "best overall approach",
  "buyerPersona": "who to pitch to and why",
  "timingConsiderations": "best timing for outreach or null"
}

Generate 3-5 pitch angles, ordered by strength.`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      const parsed = JSON.parse(text);
      return PitchSuggestionSchema.parse(parsed);
    },
    modelPref
  );

  return { pitchSuggestions: result, rawResponse, model };
}
