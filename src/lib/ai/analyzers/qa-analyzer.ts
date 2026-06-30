import { generateStructuredResponse } from '../router';
import { QAAnswerSchema, type QAAnswer } from '../../normalizer/schemas';

const AQUARELLE_FACTS = `
AQUARELLE — VERIFIED FACTS (use ONLY when the brand being analyzed is Aquarelle itself, to cross-check the website/social content against ground truth):

Identity: Aquarelle is the shirts manufacturing division within CIEL Textile (a Mauritius-listed textile group). Aquarelle India Pvt Ltd is the Bangalore-based subsidiary.

Manufacturing footprint: 7 production units across Mauritius, Madagascar, and India. India: 4 facilities in/around Bangalore, ~6 million pieces/year. Group-wide: ~12 million shirts/year, ~7,500 employees.

Product focus: SHIRTS specifically — casual, denim, indigo shirting, prints. Not activewear, outerwear, or accessories.

Markets served: US, Europe, broader Asia, Australia, Gulf/Middle East.

Vertical integration: 50-50 joint venture with COTONA (Madagascar's SOCOTA Group).
`;

const SYSTEM_PROMPT = `You are a market intelligence analyst specializing in apparel and fashion brands.
You answer questions about brands based ONLY on the website content and prior analysis data given to you in the prompt.

GROUNDING RULE: Never use outside knowledge about the brand to fill gaps, even if you recognize the brand name and know things about it from general knowledge. If the provided content doesn't address the question, say so explicitly in the answer (e.g. "The provided content doesn't specify X") rather than answering from memory.

CONFIDENCE rubric — apply this, don't eyeball it:
- "high": the content directly and explicitly answers the question with specific stated facts
- "medium": the content partially addresses the question, or the answer requires reasonable inference from related (but not exact) statements in the content
- "low": the content barely touches on the question, or the answer is mostly inferred/speculative due to thin source material
Do not default to "high" just because you're confident in your reasoning — confidence reflects how well the SOURCE CONTENT supports the answer, not how plausible your answer sounds.

SOURCES rule: only list a source label if you can point to actual content that supports the answer (e.g. "About page mentions production capacity"). Never invent a section name that doesn't correspond to something actually in the provided content.

If the question cannot be answered at all from the given content, set "answer" to state that directly, "confidence" to "low", and "sources" to an empty array — do not pad with speculation.

Always respond with valid JSON matching the requested schema exactly. No markdown fences, no preamble, no commentary outside the JSON.`;

export async function answerBrandQuestion(
  question: string,
  markdownContent: string,
  brandName: string,
  existingAnalysis?: string | null
): Promise<{
  answer: QAAnswer;
  rawResponse: string;
  model: string;
}> {
  const MAX_CONTENT_CHARS = 12000;
  if (markdownContent.length > MAX_CONTENT_CHARS) {
    console.warn(`[BrandQA] Content for ${brandName} truncated from ${markdownContent.length} to ${MAX_CONTENT_CHARS} chars — answer may miss details beyond the cutoff`);
  }

  // Self-audit branch: if the question concerns Aquarelle itself, give the
  // model verified facts to cross-check the content against
  const isAquarelleSelfQuery = /\baquarelle\b/i.test(brandName);
  const selfAuditBlock = isAquarelleSelfQuery
    ? `\n\nSELF-AUDIT MODE: This question concerns Aquarelle's own brand presence. In addition to answering the question from the content, cross-check the content against these verified facts and note any discrepancies, outdated claims, or gaps in the answer:\n${AQUARELLE_FACTS}`
    : '';

  const userPrompt = `Answer the following question about the brand "${brandName}" using ONLY the website content and analysis data provided below.

QUESTION: ${question}

Website Content:
${markdownContent.slice(0, MAX_CONTENT_CHARS)}

${existingAnalysis ? `Prior Analysis:\n${existingAnalysis}\n` : ''}${selfAuditBlock}

Respond with a JSON object:
{
  "answer": "Direct, comprehensive answer to the question, using specific details, numbers, and examples ONLY from the content above. If the content doesn't cover it, say so explicitly.",
  "confidence": "high",
  "sources": ["section of the provided content the answer actually came from, e.g. 'About page', 'Product listings' — only if real"],
  "followUpQuestions": ["2-3 natural follow-up questions related to topics actually present in the content"]
}

Respond with the JSON only.`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      // Normalize invalid confidence values
      if (!['high', 'medium', 'low'].includes(parsed.confidence)) {
        console.warn(`[BrandQA] Invalid confidence value "${parsed.confidence}" for ${brandName}, defaulting to "medium"`);
        parsed.confidence = 'medium';
      }

      // Defensive defaults
      if (!Array.isArray(parsed.sources)) parsed.sources = [];
      if (!Array.isArray(parsed.followUpQuestions)) parsed.followUpQuestions = [];
      parsed.followUpQuestions = parsed.followUpQuestions.slice(0, 3);

      // Anti-hallucination guard: if confidence is "high" but no sources are
      // listed, that's an internal contradiction worth flagging
      if (parsed.confidence === 'high' && parsed.sources.length === 0) {
        console.warn(`[BrandQA] "${question}" for ${brandName} got high confidence with zero cited sources — possible ungrounded answer, review`);
      }

      return QAAnswerSchema.parse(parsed);
    }
  );

  return { answer: result, rawResponse, model };
}