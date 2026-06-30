import { generateStructuredResponse } from '../router';
import { z } from 'zod';

export const EmailDraftSchema = z.object({
  subjectLine: z.string().describe('The subject line for the cold email.'),
  body: z.string().describe('The full body of the cold email, formatted with line breaks.'),
});

export type EmailDraft = z.infer<typeof EmailDraftSchema>;

const AQUARELLE_FACTS = `
AQUARELLE — VERIFIED FACTS (use ONLY these as your source of specific claims; for anything not listed, speak in general terms rather than inventing):

Identity: Aquarelle is the shirts manufacturing division within CIEL Textile (a Mauritius-listed textile group). Aquarelle India Pvt Ltd is the Bangalore-based subsidiary.

Manufacturing footprint: 7 production units across Mauritius, Madagascar, and India. India: 4 facilities in/around Bangalore, ~6 million pieces/year. Group-wide: ~12 million shirts/year, ~7,500 employees.

Product focus: SHIRTS specifically — casual shirts, denim shirts, indigo shirting, prints, young fashion, classic-modern, casual-luxury, and sportswear shirting styles. Do not claim activewear, outerwear, or accessories capability.

Markets served: US, Europe, broader Asia, Australia, Gulf/Middle East.

Vertical integration: 50-50 joint venture with COTONA (part of Madagascar's SOCOTA Group) for fabric, enabling duty-free shipping to the US and Europe.

Sustainability/compliance: raw-material traceability program, support for the Sustainable Apparel Coalition, recycled/organic/BCI cotton lines, won "Exemplar Social Impact and Engagement" at the BSL Excellence Awards.
`;

const SYSTEM_PROMPT = `You are an expert enterprise sales development representative (SDR) writing cold outreach emails for Aquarelle Intel, representing Aquarelle — the shirts manufacturing division of CIEL Textile, a Mauritius-based textile group with production in Mauritius, Madagascar, and India.

${AQUARELLE_FACTS}

HARD RULES:
1. Only state specific facts about Aquarelle (capacities, regions, certifications, manufacturing setup) that come from the VERIFIED FACTS block above. If a detail isn't there, speak generally ("our manufacturing network," "our sustainability programs") rather than inventing specifics. Never claim activewear, outerwear, or accessories capability — Aquarelle is shirts-only.
2. Only reference facts about the prospect brand that come from the Gap Analysis data given to you. Never invent a pain point, product line, or detail about the prospect that isn't in that data.
3. Never use these overused cold-email phrases or close equivalents: "I hope this email finds you well", "I wanted to reach out", "I came across", "synergies", "circle back", "touch base", "in today's fast-paced world", "game-changer", "leverage our expertise", "take it to the next level", "I'll keep this brief" (then don't).
4. If the contact's role or department is "Unknown", do NOT mention their title or department in the email at all — personalize using only the brand name and gap analysis instead.
5. Body length: 90-130 words. Subject line: under 8 words, no exclamation marks, no all-caps.
6. One clear call-to-action at the end.
7. Sign off as: [Your Name], Aquarelle Intel — do not invent a sender name.

RELATIONSHIP CONTEXT:
{{RELATIONSHIP_CONTEXT}}

Respond with ONLY this exact JSON shape, no markdown fences, no preamble:
{"subjectLine": "...", "body": "..."}`;

export async function generateColdEmail(
  brandName: string,
  contactName: string,
  contactRole: string | null,
  contactDepartment: string | null,
  gapAnalysisData: any,
  stage: 1 | 2 = 1,
  customerType: string | null = 'new'
) {
  let relationshipContext = 'This is a completely cold outreach to a NEW PROSPECT. Your goal is to break the ice, establish credibility, and generate initial interest without being pushy.';
  if (customerType === 'existing') {
    relationshipContext = 'This is an EXISTING CUSTOMER. Your goal is account expansion (cross-selling new categories or expanding production volume). Acknowledge the existing relationship warmly — do not speak to them as if they are a stranger.';
  } else if (customerType === 'pipeline') {
    relationshipContext = 'This is a PIPELINE PROSPECT (we are already in active discussions or they have shown previous interest). Your goal is to reignite or advance the conversation by pitching a specific idea based on the gap analysis.';
  }

  const stageInstruction = stage === 1
    ? `STAGE 1 — INTRODUCTION:
Goal: introduce Aquarelle and build trust, optionally grounding the intro in one concrete fact from the VERIFIED FACTS block (e.g. the Mauritius/Madagascar/India production network, or shirts specialization) rather than vague claims. Do NOT pitch specific solutions yet.
CTA: offer to send a corporate deck or factory video — nothing more.
Tone: warm, low-pressure, brief.

EXAMPLE (for tone/structure reference only — do not reuse this exact wording):
Subject: A quick intro from Aquarelle
Body: Hi [Name], noticed [Brand] has been expanding into [category from gap data] — that's an area where our shirts manufacturing network across Mauritius, Madagascar, and India works closely with brands at a similar stage. We're not pitching anything today, just wanted to put Aquarelle on your radar. Happy to send over a short factory overview if useful — no pressure either way. Best, [Your Name], Aquarelle Intel`
    : `STAGE 2 — CREATE INTEREST:
Goal: reference 1-2 SPECIFIC items from the Gap Analysis data below and connect them to a concrete Aquarelle capability from the VERIFIED FACTS block (e.g. vertical integration via the COTONA joint venture for speed-to-market, sustainability traceability, shirts-specific expertise).
CTA: ask for a specific short call/meeting (e.g. "15 minutes next week").
Tone: more direct than Stage 1, still not pushy.

EXAMPLE (for tone/structure reference only — do not reuse this exact wording):
Subject: Re: [Brand]'s [specific gap area]
Body: Hi [Name], following up on Aquarelle — looking at [Brand]'s current [specific gap from data], our vertically integrated setup across Mauritius and Madagascar has helped similar brands close that gap through [capability category]. Would a 15-minute call next week make sense to see if there's a fit? Happy to work around your schedule. Best, [Your Name], Aquarelle Intel`;

  const gapAnalysisText = gapAnalysisData
    ? JSON.stringify(gapAnalysisData, null, 2)
    : 'No gap analysis data available — keep the email general and do not reference any specific gap or pain point.';

  const contactLine = (contactRole && contactRole !== 'Unknown') || (contactDepartment && contactDepartment !== 'Unknown')
    ? `Role: ${contactRole || 'Unknown'}\nDepartment: ${contactDepartment || 'Unknown'}\n(You MAY reference their role/department if it helps personalize the hook.)`
    : `Role: Unknown\nDepartment: Unknown\n(Do NOT reference a title or department anywhere in the email — personalize using the brand and gap analysis only.)`;

  const parsedSystemPrompt = SYSTEM_PROMPT.replace('{{RELATIONSHIP_CONTEXT}}', relationshipContext);

  const userPrompt = `${stageInstruction}

Prospect brand: ${brandName}
Contact name: ${contactName}
${contactLine}

Gap Analysis data (only use facts that appear here):
${gapAnalysisText}

Write the email now. Respond with the JSON only.`;

  const { result, rawResponse, model } = await generateStructuredResponse<EmailDraft>(
    parsedSystemPrompt,
    userPrompt,
    (text) => {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      return EmailDraftSchema.parse(parsed);
    }
  );

  // Backstop: catch any banned clichés that slipped through despite the instruction
  const bannedPhrases = [
    'hope this email finds you well', 'wanted to reach out', 'i came across',
    'synergies', 'circle back', 'touch base', "today's fast-paced world",
    'game-changer', 'leverage our expertise', 'take it to the next level',
  ];
  const bodyLower = result.body.toLowerCase();
  const flaggedPhrases = bannedPhrases.filter(p => bodyLower.includes(p));
  if (flaggedPhrases.length > 0) {
    console.warn(`[ColdEmail] Generated email contains banned phrases: ${flaggedPhrases.join(', ')} — consider regenerating`);
  }

  // Backstop: flag off-category capability claims now that the model has
  // more specific facts to potentially over-extend from
  const offCategoryTerms = ['activewear', 'outerwear', 'accessories', 'footwear'];
  const flaggedCategories = offCategoryTerms.filter(term => bodyLower.includes(term));
  if (flaggedCategories.length > 0) {
    console.warn(`[ColdEmail] Email claims off-category capability for ${brandName}: ${flaggedCategories.join(', ')} — Aquarelle is shirts-only, review before sending`);
  }

  // Backstop: word count check
  const wordCount = result.body.trim().split(/\s+/).length;
  if (wordCount < 60 || wordCount > 180) {
    console.warn(`[ColdEmail] Body length out of expected range: ${wordCount} words`);
  }

  return { result, rawResponse, model, flags: { bannedPhrases: flaggedPhrases, offCategoryTerms: flaggedCategories, wordCount } };
}