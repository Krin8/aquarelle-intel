import { generateStructuredResponse } from '../router';
import { PipelineScoringSchema, type PipelineScoring } from '../../normalizer/schemas';

const AQUARELLE_FACTS = `
AQUARELLE — VERIFIED FACTS (use ONLY these for productComplexity assessment; do not assume capabilities not listed here):

Identity: Aquarelle is the shirts manufacturing division within CIEL Textile (a Mauritius-listed textile group). Aquarelle India Pvt Ltd is the Bangalore-based subsidiary.

Product focus: SHIRTS specifically — casual shirts, denim shirts, indigo shirting, prints, young fashion, classic-modern, casual-luxury, and sportswear shirting styles. NOT activewear, outerwear, or accessories.

Manufacturing footprint: 7 production units across Mauritius, Madagascar, and India (~12 million shirts/year group-wide; India alone ~6 million pieces/year across 4 Bangalore-area facilities).

Vertical integration: 50-50 joint venture with COTONA (Madagascar's SOCOTA Group) for fabric.
`;

const SYSTEM_PROMPT = `You are a strategic business analyst at Aquarelle, the shirts manufacturing division of CIEL Textile.

${AQUARELLE_FACTS}

Your job is to evaluate prospective brands against our internal Prioritization Pipeline criteria, using ONLY evidence present in the Brand Analysis and Gap Detection data you're given (plus the Aquarelle facts above for productComplexity specifically).

GROUNDING RULE: Every score must be traceable to something specific in the data. If the data doesn't address a criterion at all, score it 5 (neutral/unknown) — do not guess high or low based on the brand's general reputation or category. Say so in the rationale if a criterion was scored 5 due to missing information.

Always respond with valid JSON using the exact field names given in the user prompt.`;

export async function scorePipeline(
  brandName: string,
  brandAnalysis: string,
  gapDetection: string): Promise<{
  scoring: PipelineScoring;
  rawResponse: string;
  model: string;
}> {
  const userPrompt = `Evaluate ${brandName} against the Aquarelle Prioritization Pipeline grid.

Brand Analysis:
${brandAnalysis}

Gap Detection:
${gapDetection}

Score each criterion 1-10 using the anchors below. Use the EXACT field name shown in brackets for each — these are the only valid key names, do not rename or abbreviate differently.

1. Product Complexity [key: "productComplexity"] — does the brand's product mix match Aquarelle's actual capability (shirts: casual, denim, indigo shirting, prints)?
   8-10: brand's stated product line is shirts-centric or has a substantial shirts category, no unusual technical requirements beyond standard shirting
   4-7: brand sells some shirts among other categories, or shirts presence is unclear from the data
   1-3: brand's product line is not shirts-based at all (e.g. footwear, accessories-only, outerwear-only) based on stated evidence — do NOT score this high just because the brand is generally "apparel"

2. Sourcing Strategy & Barriers [key: "sourcingStrategy"] — how easy is it to break into their supplier base?
   8-10: data shows open/multi-vendor sourcing, RFP processes, or stated openness to new suppliers
   4-7: no clear signal either way
   1-3: data shows long-term exclusive contracts, vertical integration, or explicit supplier loyalty

3. Size at Maturity [key: "sizeAtMaturity"] — volume scaling potential if we win the business
   8-10: large/growing brand with stated revenue, store count, or expansion signals showing real headroom
   4-7: moderate size, limited growth signal
   1-3: small/niche, or no evidence of meaningful volume potential

4. Planning Visibility [key: "planningVisibility"] — predictability of their collections/orders
   8-10: clear seasonal calendar or stated regular collection cadence
   4-7: some signal but cadence unclear
   1-3: irregular/drop-based releases, or no visibility into planning at all

5. Lead Time [key: "leadTime"] — speed-to-market fit vs our capabilities
   8-10: no stated requirement for unusually fast turnaround
   4-7: unclear, or moderate mismatch
   1-3: brand explicitly requires very fast turnaround beyond typical capability

6. Order Size / MOQ [key: "orderSize"] — alignment with our production minimums
   8-10: stated order sizes clearly compatible with standard MOQs
   4-7: unstated/ambiguous
   1-3: brand known for very small-batch/limited drops incompatible with typical MOQs

Respond with ONLY this JSON shape (grossTotalPoints will be recalculated separately, so just give your best estimate):
{
  "productComplexity": 8,
  "sourcingStrategy": 6,
  "sizeAtMaturity": 9,
  "planningVisibility": 7,
  "leadTime": 5,
  "orderSize": 4,
  "grossTotalPoints": 65,
  "rationale": "1-2 sentences citing the specific data points behind your highest and lowest scores"
}

No markdown fences, no preamble. Respond with the JSON only.`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      let parsed = JSON.parse(cleaned);

      // Key aliasing — 8B models sometimes echo the verbose criterion name
      // instead of the requested short key, despite the explicit instruction.
      const keyAliases: Record<string, string> = {
        sourcingStrategyBarriers: 'sourcingStrategy',
        sourcingStrategyAndBarriers: 'sourcingStrategy',
        orderSizeMOQ: 'orderSize',
        orderSizeMoq: 'orderSize',
        sizeAtMaturityScore: 'sizeAtMaturity',
        planningVisibilityScore: 'planningVisibility',
        leadTimeScore: 'leadTime',
        productComplexityScore: 'productComplexity',
      };
      for (const [alias, canonical] of Object.entries(keyAliases)) {
        if (parsed[alias] !== undefined && parsed[canonical] === undefined) {
          parsed[canonical] = parsed[alias];
        }
      }

      // Coerce stringified numbers ("8") to actual numbers — common 8B quirk
      const scoreFields = ['productComplexity', 'sourcingStrategy', 'sizeAtMaturity', 'planningVisibility', 'leadTime', 'orderSize'];
      for (const field of scoreFields) {
        if (typeof parsed[field] === 'string') {
          const num = parseFloat(parsed[field]);
          parsed[field] = isNaN(num) ? 5 : num;
        }
        // Default missing/invalid scores to neutral 5, with a log so it's visible
        if (typeof parsed[field] !== 'number' || isNaN(parsed[field])) {
          console.warn(`[PipelineScoring] Missing or invalid "${field}" for ${brandName}, defaulting to 5`);
          parsed[field] = 5;
        }
        // Clamp to valid 1-10 range
        parsed[field] = Math.max(1, Math.min(10, Math.round(parsed[field])));
      }

      if (!parsed.rationale || typeof parsed.rationale !== 'string') {
        parsed.rationale = 'No rationale provided.';
      }

      // Flag (don't block) if the rationale leans on an off-category claim,
      // signaling productComplexity may have been scored against the wrong capability set
      const offCategoryTerms = ['activewear', 'outerwear', 'accessories', 'footwear'];
      const rationaleLower = (parsed.rationale || '').toLowerCase();
      if (offCategoryTerms.some(term => rationaleLower.includes(term))) {
        console.warn(`[PipelineScoring] Rationale for ${brandName} references an off-category term not in Aquarelle's actual capabilities — review productComplexity score`);
      }

      return PipelineScoringSchema.parse(parsed);
    }
  );

  // Enforce mathematically correct gross total regardless of what the model returned
  const total = result.productComplexity + result.sourcingStrategy + result.sizeAtMaturity
    + result.planningVisibility + result.leadTime + result.orderSize;
  result.grossTotalPoints = Math.round((total / 60) * 100);

  return { scoring: result, rawResponse, model };
}