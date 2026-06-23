import { generateStructuredResponse } from '../ollama-client';
import { z } from 'zod';

export const AIContactSchema = z.object({
  contacts: z.array(z.object({
    name: z.string().describe('The full name of the person. If no name is provided, DO NOT extract this contact.'),
    role: z.string().nullish().describe('The person\'s job title or role (e.g., CEO, Sourcing Manager, Buyer).'),
    email: z.string().nullish().describe('The person\'s direct email address, if available.'),
    phone: z.string().nullish().describe('The person\'s direct phone number, if available.'),
    linkedinUrl: z.string().nullish().describe('The person\'s LinkedIn URL, if available.'),
    buyerType: z.enum(['decision_maker', 'influencer', 'gatekeeper', 'unknown']).default('unknown').describe('The person\'s likely role in a B2B purchasing decision.'),
  })).describe('List of actual human contacts found on the website. Do NOT include generic department emails (like info@, support@, careers@, hiring@).'),
});

export type ExtractedContacts = z.infer<typeof AIContactSchema>;

const SYSTEM_PROMPT = `You are a B2B market intelligence analyst.
Your job is to read raw website content (markdown) and extract the identities of ACTUAL PEOPLE who work at the company.
DO NOT extract generic departments or generic emails (e.g., info@, support@, customercare@, hiring@, careers@).
We are looking for Decision Makers, Influencers, or Gatekeepers (CEOs, Founders, Buyers, Sourcing Managers, Directors, etc.).
Only extract a contact if a REAL NAME is associated with it (e.g., "Jane Doe").
Return a structured JSON list of these people.`;

export async function extractContacts(
  markdownContent: string,
  brandName: string
) {
  const userPrompt = `
Extract contacts for: ${brandName}
Website Content:
${markdownContent.slice(0, 30000)} // Ensure we don't exceed token limits wildly, though Gemini can handle large contexts
`;

  return generateStructuredResponse<ExtractedContacts>(
    SYSTEM_PROMPT,
    userPrompt,
    (text) => {
      let parsed = JSON.parse(text);

      // Gemini sometimes returns a raw array instead of { contacts: [...] }
      if (Array.isArray(parsed)) {
        parsed = { contacts: parsed };
      }

      return AIContactSchema.parse(parsed);
    }
  );
}
