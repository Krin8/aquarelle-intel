import { generateStructuredResponse } from '../ollama-client';
import { PitchSuggestionSchema, type PitchSuggestion } from '../../normalizer/schemas';

const SYSTEM_PROMPT = `You are a sales strategist at Laguna, an apparel sourcing and distribution company.
You create tailored pitch angles for potential brand partners based on brand analysis and gap detection.
Your pitches should be specific, actionable, and reference the brand's actual needs.
Always respond with valid JSON.`;

export async function generatePitchAngles(
  brandName: string,
  brandAnalysis: string,
  gapDetection: string,
  customPrompt?: string
): Promise<{
  pitchSuggestions: PitchSuggestion;
  rawResponse: string;
  model: string;
}> {
  const userPrompt = `Generate pitch angles for approaching ${brandName} as a potential Laguna partner.
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
    }
  );

  return { pitchSuggestions: result, rawResponse, model };
}
