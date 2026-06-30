import { generateStructuredResponse } from '../router';
import { WebsiteAnalysisSchema, type WebsiteAnalysis } from '../../normalizer/schemas';

// ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────
// Short + authoritative — Llama 3.1:8b follows tight system prompts better
// than verbose ones. One job, three absolute rules.
const SYSTEM_PROMPT = `You are a market intelligence extraction engine for Aquarelle, a shirts manufacturing division of CIEL Textile.

RULES:
1. Extract information primarily from the provided website content.
2. You MAY use your training knowledge to fill in gaps about the brand (e.g. segment, target customer, key differentiators, sustainability, HQ) if the website content is sparse, but ensure it is highly accurate for the real-world brand.
3. Output a single raw JSON object. No markdown fences, no preamble, no commentary.`;


// ─── USER PROMPT BUILDER ─────────────────────────────────────────────────────
export async function analyzeWebsite(
  markdown: string,
  brandName: string,
  websiteUrl: string,
  modelPref?: 'ollama' | 'gemini'
): Promise<{ analysis: WebsiteAnalysis; rawResponse: string; model: string }> {

  const userPrompt = `Extract structured brand intelligence from the website content below.

## INPUT
Brand   : ${brandName}
URL     : ${websiteUrl}

## WEBSITE CONTENT
${markdown.slice(0, 5500)}
[END OF CONTENT]

## OUTPUT SCHEMA
Return exactly this JSON object — no extra keys, no omitted keys:

{
  "brandName"            : "<exact brand name as displayed on site — fallback to '${brandName}'>",
  "tagline"              : "<verbatim tagline or slogan from site | null>",
  "description"          : "<1–2 sentences: what the brand sells and to whom — synthesize from context>",
  "segment"              : "<MUST be one of: luxury | premium | mid-range | value | fast-fashion — see SEGMENT RUBRIC>",
  "targetCustomer"       : "<demographic, either extracted or inferred from brand knowledge | null>",
  "productCategories"    : ["<categories listed on site or known for the brand>"],
  "priceRange"           : "<actual price range seen in content or known e.g. '$80–$250' | null>",
  "keyDifferentiators"   : ["<USPs, extracted or known from brand positioning>"],
  "sustainability"       : "<sustainability/ethical claims from site or known | null>",
  "distributionChannels" : ["<channels: DTC | wholesale | retail | marketplace>"],
  "headquartersLocation" : "<city and/or country | null>",
  "dataConfidence"       : "<high | medium | low — see CONFIDENCE RUBRIC>"
}

## SEGMENT RUBRIC
Classify using ONLY evidence in the content above — not brand reputation:
- luxury     → explicit luxury/heritage/exclusivity language OR prices $500+
- premium    → quality/craftsmanship messaging, prices $150–$500
- mid-range  → accessible quality, prices $30–$150, no luxury claims
- value      → price-first messaging, budget positioning, prices under $30
- fast-fashion → trend-led, new drops language, rapid collections

## CONFIDENCE RUBRIC
- high  → 8+ fields populated directly from content
- medium → 4–7 fields populated, rest are null
- low   → fewer than 4 fields found in content

## KNOWLEDGE AUGMENTATION
If the website content is sparse, use your training knowledge to enrich the brand intelligence (segment, target customer, key differentiators, headquarters, distribution channels). Ensure all claims accurately reflect the real-world brand.`;


  // ─── ROBUST JSON PARSER ───────────────────────────────────────────────────
  // Llama 3.1:8b sometimes wraps output in ```json fences despite instructions.
  // This strips fences and extracts the first valid JSON object defensively.
  const robustParser = (text: string): WebsiteAnalysis => {
    const stripped = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON object found in model response:\n${text}`);

    const parsed = JSON.parse(match[0]);
    return WebsiteAnalysisSchema.parse(parsed);
  };


  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    robustParser,
    modelPref
  );

  return { analysis: result, rawResponse, model };
}