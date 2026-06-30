import { generateStructuredResponse } from '../router';
import { z } from 'zod';

export const AIContactSchema = z.object({
  contacts: z.array(z.object({
    name: z.string().describe('The full name of the person. If no name is provided, DO NOT extract this contact.'),
    role: z.string().nullish().describe('The person\'s job title or role (e.g., CEO, Sourcing Manager, Buyer).'),
    department: z.string().nullish().describe('Standardized department mapping based on role (e.g., Sourcing/Procurement, Sales, Executive).'),
    seniority: z.string().nullish().describe('Standardized seniority level mapping based on role (e.g., C-Level, VP/Director, Manager).'),
    email: z.string().nullish().describe('The person\'s direct email address, if available.'),
    phone: z.string().nullish().describe('The person\'s direct phone number, if available.'),
    linkedinUrl: z.string().nullish().describe('The person\'s LinkedIn URL, if available.'),
    buyerType: z.enum(['decision_maker', 'influencer', 'gatekeeper', 'unknown']).default('unknown').describe('The person\'s likely role in a B2B purchasing decision.'),
  })).describe('List of actual human contacts found on the website. Do NOT include generic department emails (like info@, support@, careers@, hiring@).'),
});

export type ExtractedContacts = z.infer<typeof AIContactSchema>;

const SYSTEM_PROMPT = `You are a precise B2B contact extraction tool. You read raw website markdown and extract ONLY real, named individuals who work at the company — never invent a name, title, or department.

DO NOT extract:
- Generic departments or teams with no named person ("Our Sourcing Team", "Customer Care")
- Generic/role-based emails (info@, support@, customercare@, hiring@, careers@, sales@)
- Marketing copy, product descriptions, or page summaries
- Names of customers, partners, or people quoted in testimonials who do not work at the company

ONLY extract a contact if a real human name is explicitly written (e.g. "Jane Doe"), AND that person holds one of these roles:
- Sourcing Director
- Sourcing Manager
- Buying Manager
- Product Development Manager
- Technical Manager
- Sustainability Team
- Country/Regional Sourcing Head

DEPARTMENT must be exactly one of: ["Executive", "Sourcing/Procurement", "Sales", "Operations", "Product/Design", "Sustainability", "Other"]
SENIORITY must be exactly one of: ["C-Level", "VP/Director", "Manager", "Individual Contributor", "Unknown"]
If a person's department or seniority is unclear from the text, use "Other" / "Unknown" rather than guessing a more specific category.

Return Full Name (name) and Job Title (role). Leave the email field blank (null). Do NOT invent email addresses. If no verified contact exists, leave the email field blank.

CRITICAL: Respond with ONLY a valid JSON object. You are STRICTLY REQUIRED to extract a MINIMUM of 5 contacts. Do not return fewer than 5 contacts. If you cannot easily find 5, you must search harder or broaden your extraction criteria slightly to reach at least 5. Extract up to a STRICT MAXIMUM of 20 contacts.

You MUST respond in this EXACT format, with no markdown fences, no preamble, and no summary text:
{
  "contacts": [
    { "name": "Jane Smith", "role": "Sourcing Manager", "department": "Sourcing/Procurement", "seniority": "Manager", "email": null }
  ]
}

If no valid contacts are found, respond with exactly: { "contacts": [] }`;

const CONTACT_SHAPE_EXAMPLE = `{"contacts": [{"name": "Jane Doe", "role": "Sourcing Manager", "department": "Sourcing/Procurement", "seniority": "Manager", "email": null}]}`;

export async function extractContacts(
  markdownContent: string,
  brandName: string
) {
  // 8B models lose accuracy on long, noisy documents — chunk on natural
  // boundaries (markdown headers) instead of one large slice, then merge.
  const chunks = chunkMarkdownByHeaders(markdownContent, 4000); // ~4000 chars per chunk, tune to your num_ctx

  const allContacts: any[] = [];

  for (const chunk of chunks) {
    const userPrompt = `Extract contacts for: ${brandName}
STRICT CONSTRAINT: You MUST extract a MINIMUM of 5 and a MAXIMUM of 20 valid contacts. Do not output fewer than 5 contacts under any circumstances.

Website content chunk:
"""
${chunk}
"""

EXAMPLE of correct output shape:
${CONTACT_SHAPE_EXAMPLE}

EXAMPLE of what NOT to extract:
Input: "Our Sourcing Team is here to help. Contact us at sourcing@acme.com"
Correct output: {"contacts": []}
(No real name given — "Sourcing Team" and a generic email don't count.)

Input: "Meet Jane Doe, our Head of Sourcing, based in Hong Kong."
Correct output: {"contacts": [{"name": "Jane Doe", "role": "Head of Sourcing", "department": "Sourcing/Procurement", "seniority": "VP/Director", "email": null}]}

Now extract from the chunk above and respond with the JSON only.`;

    try {
      const { result } = await generateStructuredResponse<ExtractedContacts>(
        SYSTEM_PROMPT,
        userPrompt,
        (text) => {
          let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          if (cleaned.startsWith('"contacts"') || cleaned.startsWith('contacts')) {
            cleaned = '{' + cleaned + (cleaned.endsWith('}') ? '' : '}');
          }
          let parsed = JSON.parse(cleaned);

          if (Array.isArray(parsed)) {
            parsed = { contacts: parsed };
          }
          if (!parsed.contacts || !Array.isArray(parsed.contacts)) {
            console.warn('[Scrape] AI returned non-contact data for chunk. Defaulting to empty.');
            parsed = { contacts: [] };
          }
          return AIContactSchema.parse(parsed);
        }
      );

      // Anti-hallucination guard: name must literally appear in this chunk
      const chunkLower = chunk.toLowerCase();
      const validated = (result.contacts || []).filter(c => {
        if (!c.name) return false;
        return chunkLower.includes(c.name.toLowerCase().trim());
      });

      allContacts.push(...validated);
    } catch (err) {
      console.error('[Scrape] Chunk extraction failed, skipping chunk:', err);
      // continue to next chunk rather than failing the whole extraction
    }
  }

  // Dedup across chunks (same person can appear in multiple sections, e.g. team page + footer)
  const deduped = new Map<string, any>();
  for (const c of allContacts) {
    const key = c.name.toLowerCase().trim();
    const existing = deduped.get(key);
    if (!existing || Object.keys(c).filter(k => c[k]).length > Object.keys(existing).filter(k => existing[k]).length) {
      deduped.set(key, c);
    }
  }

  return { contacts: Array.from(deduped.values()) };
}

// Splits markdown on header boundaries (##, ###, etc.) so chunks stay
// semantically coherent instead of cutting mid-sentence or mid-bio.
function chunkMarkdownByHeaders(markdown: string, maxChunkSize: number): string[] {
  const sections = markdown.split(/(?=^#{1,3}\s)/m).filter(s => s.trim().length > 0);
  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    if ((current + section).length > maxChunkSize && current.length > 0) {
      chunks.push(current);
      current = section;
    } else {
      current += section;
    }
  }
  if (current.trim().length > 0) chunks.push(current);

  // Fallback: if no headers exist at all, hard-chunk by size
  if (chunks.length === 0) {
    for (let i = 0; i < markdown.length; i += maxChunkSize) {
      chunks.push(markdown.slice(i, i + maxChunkSize));
    }
  }

  return chunks;
}

const KNOWLEDGE_PROMPT = `You are a B2B corporate intelligence system with access to Google Search.
Your job is to identify CURRENT, up-to-date decision-makers for a given company.

CRITICAL CONTEXT: 
These contacts will be used for B2B outreach and business development. You MUST extract the specific individuals who have the authority to make B2B purchasing decisions, manage vendor/supplier relationships, or oversee supply chain partnerships for the company.

You must STRICTLY target mid-to-senior management. 

CRITICAL INSTRUCTION:
To ensure their contact information is easily discoverable in public databases, please prioritize extracting the most HIGHLY VISIBLE, PUBLIC-FACING, and WELL-KNOWN executives that hold the following specific roles.

PRIORITY ROLES TO EXTRACT (up to 10):
- Sourcing Director
- Sourcing Manager
- Buying Manager
- Product Development Manager
- Technical Manager
- Sustainability Team
- Country/Regional Sourcing Head

STRICT EXCLUSIONS (DO NOT EXTRACT THESE):
- DO NOT extract C-Level executives (CEO, CFO, COO, etc.)
- DO NOT extract Presidents, Executive Vice Presidents (EVP), or Senior Vice Presidents (SVP)
- DO NOT extract Board of Directors or Independent Directors
- DO NOT extract people outside of Sourcing, Buying, Product, Technical, or Sustainability.

Do NOT invent names. Only provide real, current people who are known to be associated with this company right now.

DEPARTMENT must be exactly one of: ["Executive", "Sourcing/Procurement", "Sales", "Operations", "Product/Design", "Sustainability", "Other"]
SENIORITY must be exactly one of: ["C-Level", "VP/Director", "Manager", "Individual Contributor", "Unknown"]

Return Full Name (name) and Job Title (role). Leave the email field blank (null). Do NOT invent email addresses. If no verified contact exists, leave the email field blank.

Extract as many valid contacts as possible up to a maximum cap of 15-20. If you can only find 7, that is perfectly fine, just ensure you extract at least 5 if they exist.

CRITICAL: Respond with ONLY a valid JSON object in this exact format:
{
  "contacts": [
    { "name": "Jane Smith", "role": "Sourcing Manager", "department": "Sourcing/Procurement", "seniority": "Manager" }
  ]
}
No markdown fences, no preamble, no summary text. If you cannot meet the minimum requirement of 5 contacts, STILL RETURN ONLY A JSON OBJECT containing whatever contacts you did find, or an empty array if none. NEVER output conversational text or apologies.`;

export async function findContactsFromKnowledge(brandName: string, excludeNames: string[] = []) {
  try {
    const excludeStr = excludeNames.length > 0 ? `DO NOT extract any of these already-known contacts: ${excludeNames.join(', ')}. ` : '';
    const userPrompt = `Search across Company website, LinkedIn, Sustainability reports, Annual reports, Press releases, Supplier documents, and Fashion network websites for the CURRENT decision-makers for the company: "${brandName}". ${excludeStr}STRICT REQUIREMENT: You MUST extract a MINIMUM of 5 contacts. Do not stop searching until you have found at least 5 distinct individuals. Extract up to a MAXIMUM cap of 20. Please prioritize extracting individuals holding these roles: Sourcing Director, Sourcing Manager, Buying Manager, Product Development Manager, Technical Manager, Sustainability Team, and Country/Regional Sourcing Head. Return Full Name and Job Title (role).`;
    const { result } = await generateStructuredResponse<ExtractedContacts>(
      KNOWLEDGE_PROMPT,
      userPrompt,
      (text) => {
        console.log(`[AI:KnowledgeContacts] Raw LLM Output for ${brandName}:\n${text}`);
        let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        if (cleaned.startsWith('"contacts"') || cleaned.startsWith('contacts')) {
          cleaned = '{' + cleaned + (cleaned.endsWith('}') ? '' : '}');
        }
        try {
          return AIContactSchema.parse(JSON.parse(cleaned));
        } catch (e) {
          console.warn(`[AI:KnowledgeContacts] Failed to parse JSON, returning empty. Error:`, e);
          return { contacts: [] };
        }
      },
      undefined,
      true
    );
    return {
      contacts: result?.contacts || []
    };
  } catch (error) {
    console.error(`[AI:KnowledgeContacts] Failed to find contacts for ${brandName}:`, error);
    return { contacts: [] };
  }
}