import { generateStructuredResponse } from '../router';
import { GapDetectionSchema, type GapDetection } from '../../normalizer/schemas';

import { getAquarelleContextString } from '../../knowledge/aquarelle-kb';

const aquarelleCtx = getAquarelleContextString();

const SYSTEM_PROMPT = `You are a strategic business analyst at Aquarelle, a shirts manufacturing division within CIEL Textile.

${aquarelleCtx}

GROUNDING RULE: Every gap, risk, or assessment you write must be traceable to something specific stated in the Brand Analysis text.
CRITICAL OPPORTUNITY RULE: For every gap you identify, the corresponding "opportunity" you suggest MUST strictly and explicitly quote an exact capability from the AQUARELLE KNOWLEDGE BASE above (e.g., naming a specific factory location, a specific wash, or a specific sustainability certification we actually hold). DO NOT invent, assume, or hallucinate capabilities that Aquarelle does not have. If the brand has a gap but Aquarelle cannot solve it based on the KB, DO NOT LIST IT AS A GAP.

SCORING RUBRIC for matchScore (STRICTLY apply mechanically — this is a rigid filter):
Evaluate these 4 criteria against the Brand Analysis:
1. Category overlap — does the brand sell SHIRTS (casual, denim, formal, or printed shirting)? Shirts must be a core product line.
2. Price overlap — does the brand's retail positioning read as mid-to-upmarket (not deep-discount, not ultra-luxury)?
3. Market overlap — does the brand sell into the US, Europe, broader Asia, Australia, or the Gulf/Middle East?
4. Outsourcing signal — is there evidence the brand uses third-party manufacturing/sourcing?

STRICT SCORING BANDS (DO NOT OVERRIDE):
- 90-100: Yes on all 4 criteria, multiple concrete synergy points, no major mismatch.
- 70-89: Yes on Category, Price, and Market overlap. Outsourcing can be unknown.
- 50-69: Yes on Category overlap, but Partial/No on Price or Market overlap.
- 30-49: Partial Category overlap (e.g. they sell a few shirts but are primarily an accessories/footwear brand).
- 0-29: NO CATEGORY OVERLAP. If the brand does NOT sell shirts, the score MUST be under 30. No exceptions for "strong branding" or "great market presence". If they don't sell shirts, we can't manufacture for them.

SEVERITY criteria for each productGap:
- "high": the gap is a real blocker to doing business, or addresses a clearly stated, significant pain point in the brand analysis
- "medium": a real but non-urgent improvement opportunity — brand likely has a workable status quo
- "low": a minor or speculative opportunity with limited stated evidence
Limit productGaps to the 2-4 most significant items, ranked by severity (high first).

FIELD RULES:
- complianceNotes: use JSON null (not the string "null") if there is nothing specific to note
- risks: only include risks with a specific stated basis in the brand analysis (e.g. "brand has long-term contract with incumbent supplier mentioned in analysis") — do not include generic boilerplate risks like "market competition" unless the text specifically raises them
- Do not state Aquarelle has activewear, outerwear, accessories, or any non-shirts manufacturing capability, even if the brand analysis suggests the prospect needs those categories — if shirts are not part of the brand's product mix at all, that should lower the category overlap score, not trigger an invented Aquarelle capability

Respond with ONLY valid JSON matching the exact shape given in the user prompt. No markdown fences, no preamble, no commentary outside the JSON.`;

export async function detectGaps(
  brandAnalysis: string,
  brandName: string,
  customerType: string = 'new',
  pipelineData?: string): Promise<{
  detection: GapDetection;
  rawResponse: string;
  model: string;
}> {
  let strategyPrompt = '';
  if (customerType === 'existing') {
    strategyPrompt = `This is an EXISTING CUSTOMER. Focus on: what business we currently do with them, gaps in current engagement, and concrete opportunities to expand share of business (additional shirt categories, cost competitiveness, innovation/sustainability, speed to market). Ground this in the brand analysis — do not assume details of the existing relationship that aren't stated.`;
  } else if (customerType === 'pipeline') {
    strategyPrompt = `This is a PIPELINE PROSPECT. Focus on: their current sourcing strategy as described in the analysis, and where Aquarelle's shirts manufacturing capabilities offer a clear alternative or improvement versus what they appear to be doing today. Identify gaps in product capability, cost, innovation, value-added services, and compliance/sustainability.`;
  } else {
    strategyPrompt = `This is a NEW/UNLISTED PROSPECT. Focus on: baseline strategic fit only. Be conservative — if the analysis is thin, reflect that with a lower confidence and note where information is missing rather than speculating.`;
  }

  let financialContext = '';
  let hasFinancialData = false;
  if (pipelineData) {
    try {
      const fin = JSON.parse(pipelineData);
      hasFinancialData = true;
      financialContext = `\n\nINTERNAL FINANCIAL INTELLIGENCE (use to ground priceAlignment and matchScore specifically — reference these numbers directly rather than speaking generically about "pricing"):
- FOB Price Target: $${fin.fobPrice ?? 'N/A'}
- Standard CPU: ${fin.stdCPU ?? 'N/A'} INR
- Standard Margin: ${fin.stdMargin ?? 'N/A'} INR
- Profit %: ${fin.profitPct ? (fin.profitPct * 100).toFixed(1) + '%' : 'N/A'}
- SMV: ${fin.smv ?? 'N/A'} min
- CPU Grade: ${fin.cpuGrade ?? 'N/A'}
- Prospect for Aquarelle Mauritius: ${fin.prospectForAqrlMur ?? 'N/A'}`;
    } catch {
      console.warn('[GapDetection] Failed to parse pipelineData, proceeding without financial context');
    }
  }

  const userPrompt = `${strategyPrompt}
${financialContext}

Brand: ${brandName}
Relationship Type: ${customerType.toUpperCase()} (${customerType === 'existing' ? 'Already an Aquarelle customer' : customerType === 'pipeline' ? 'Active prospect in our sales pipeline' : 'No prior relationship with Aquarelle'})

Brand Analysis:
${brandAnalysis}

Now work through the 4-criterion checklist from the rubric mentally, then respond with exactly this JSON shape:
{
  "matchScore": 72,
  "matchSummary": "1-2 sentence summary citing the specific criteria that drove this score",
  "productGaps": [
    {
      "gap": "specific need stated or implied in the brand analysis",
      "opportunity": "EXACT capability quoted from the AQUARELLE KNOWLEDGE BASE that solves this gap (e.g. 'Aquarelle India LEED Platinum certification' or 'Aquarelle Non-Iron capacity')",
      "severity": "high"
    }
  ],
  "priceAlignment": "specific qualitative assessment (mid-to-upmarket fit or not), referencing the brand's actual stated positioning if known",
  "regionFit": "specific assessment naming the overlapping or non-overlapping markets the brand sells into",
  "complianceNotes": null,
  "risks": ["only risks with a stated basis in the analysis text"]
}

Respond with the JSON only.`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      // Normalize the string "null" -> actual null (common 8B JSON quirk)
      if (parsed.complianceNotes === 'null' || parsed.complianceNotes === '') {
        parsed.complianceNotes = null;
      }

      // Clamp matchScore into valid range in case the model drifts outside 0-100
      if (typeof parsed.matchScore === 'number') {
        parsed.matchScore = Math.max(0, Math.min(100, Math.round(parsed.matchScore)));
      }

      // Defensive: cap productGaps length and normalize invalid severity values
      if (Array.isArray(parsed.productGaps)) {
        parsed.productGaps = parsed.productGaps.slice(0, 4).map((g: any) => ({
          ...g,
          severity: ['high', 'medium', 'low'].includes(g.severity) ? g.severity : 'medium',
        }));
      }

      // Anti-hallucination guard: flag (don't silently strip) any productGap
      // that references a category Aquarelle doesn't actually do
      const offCategoryTerms = ['activewear', 'outerwear', 'accessories', 'footwear'];
      if (Array.isArray(parsed.productGaps)) {
        for (const g of parsed.productGaps) {
          const text = `${g.gap} ${g.opportunity}`.toLowerCase();
          if (offCategoryTerms.some(term => text.includes(term))) {
            console.warn(`[GapDetection] Model referenced an off-category capability for ${brandName}: "${g.opportunity}" — Aquarelle is shirts-only, review this output`);
          }
        }
      }

      return GapDetectionSchema.parse(parsed);
    }
  );

  if (hasFinancialData) {
    console.warn('[GapDetection] Confidential financial intelligence was sent to an external model provider (Gemini). Confirm this is intended.');
  }

  return { detection: result, rawResponse, model };
}