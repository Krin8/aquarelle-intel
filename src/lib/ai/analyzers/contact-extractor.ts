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

const CONTACT_SHAPE_EXAMPLE = `{"contacts": [{"name": "Jane Doe", "role": "Sourcing Manager", "seniority": "Manager", "email": null}]}`;

export async function extractContacts(
  markdownContent: string,
  brandName: string
) {
  const allContacts: any[] = [];
  const foundEmails = new Set<string>();

  // Extract emails
  const emailRegex = /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
  let match;
  while ((match = emailRegex.exec(markdownContent)) !== null) {
    const email = match[0].toLowerCase();
    const prefix = match[1];

    // Skip generic emails
    const genericPrefixes = ['info', 'support', 'sales', 'contact', 'hello', 'careers', 'hiring', 'admin', 'press', 'marketing', 'customercare', 'enquiries'];
    if (genericPrefixes.includes(prefix.toLowerCase())) {
      continue;
    }

    if (!foundEmails.has(email)) {
      foundEmails.add(email);

      // Guess name from email prefix (e.g. john.doe -> John Doe)
      let name = prefix
        .replace(/[._+-]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

      // If it's a single word and very short, it might just be a first name or initial
      if (name.length < 2) {
        name = "Unknown Contact";
      }

      allContacts.push({
        name: name,
        role: 'Unknown',
        department: 'Unknown',
        seniority: 'Unknown',
        email: email,
        phone: null,
        linkedinUrl: null,
        buyerType: 'unknown'
      });
    }
  }

  // Extract LinkedIn URLs
  const linkedinRegex = /https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/g;
  const foundLinkedin = new Set<string>();
  while ((match = linkedinRegex.exec(markdownContent)) !== null) {
    const url = match[0];
    if (!foundLinkedin.has(url)) {
      foundLinkedin.add(url);
      
      // Extract name from URL slug
      const slugMatch = url.match(/in\/([a-zA-Z0-9_-]+)/);
      if (slugMatch && slugMatch[1]) {
        const name = slugMatch[1]
          .replace(/[-_]/g, ' ')
          .replace(/[0-9]/g, '') // remove numbers
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .trim();
          
        if (name && name.length > 2) {
          allContacts.push({
            name: name,
            role: 'Unknown',
            department: 'Unknown',
            seniority: 'Unknown',
            email: null,
            phone: null,
            linkedinUrl: url,
            buyerType: 'unknown'
          });
        }
      }
    }
  }

  return { contacts: allContacts };
}

const KNOWLEDGE_PROMPT = `You are a B2B sourcing intelligence assistant helping Aquarelle, an apparel manufacturer, identify contacts at brands for sourcing and selling outreach.

TASK: For the given brand, list every individual you have knowledge of who currently performing one of these roles:
- Sourcing Director
- Sourcing Manager
- Buying Manager
- Product Development Manager
- Technical Manager
- Sustainability Team (any title containing "Sustainability")
- Country/Regional Sourcing Head
- Designer
- Product Manager
- Head of Sourcing
- Quality Manager
- Merchandiser
- Compliance Manager
- Vendor Development Manager
- Vendor Compliance Manager
- Technical Director
- Any More Related Contacts

STRICT EXCLUSIONS:
- DO NOT extract C-Level executives (CEO, CFO, COO, CMO, etc.)
- DO NOT extract Presidents, EVPs, SVPs
- DO NOT extract Board members
- DO NOT extract anyone outside Sourcing, Buying, Product Development, Technical, or Sustainability functions

SENIORITY must be exactly one of: ["C-Level", "Senior Vice President", "Vice President", "Senior Director", "Director", "VP", "Head" ,"Senior Manager", "Manager", "Individual Contributor", "Unknown"]

Return Full Name (name) and Job Title (role). Leave the email field blank (null) if not known. Do NOT invent email addresses.

CRITICAL: Conduct an exhaustive search for contacts across the company's official website, LinkedIn, press releases, sustainability reports, conference speaker lists, procurement documents, and other reputable public sources.

Your objective is to identify at least 8 genuine contacts whenever they publicly exist.

Do not stop searching after finding a few contacts. Continue exploring additional public sources until either:
1. At least 8 high-confidence contacts have been found, or
2. You have exhausted all reasonable public sources.

Return ONLY real individuals who are CURRENTLY employed by this exact company. Do not include former employees, retired employees, contractors, advisors, board members (unless they are current executives), interns whose employment has ended, or individuals whose current employment cannot be confidently confirmed.

Never fabricate, infer, estimate, or hallucinate names, titles, emails, or profiles.

If exhaustive searching still yields fewer than 8 verified contacts, return only the verified contacts you found. If none can be verified, return 0 contacts.

Accuracy is mandatory. The minimum target of 8 contacts must never override factual correctness.

CRITICAL: Respond with ONLY a valid JSON object in this exact format:
{
  "contacts": [
    { "name": "Jane Smith", "role": "Sourcing Manager", "seniority": "Manager" },
    { "name": "Carlos Mendes", "role": "Buying Manager", "seniority": "Manager" },
    { "name": "Aiko Tanaka", "role": "Sustainability Manager", "seniority": "Manager" },
    { "name": "Robert Klein", "role": "Technical Director", "seniority": "VP/Director" }
  ]
}
No markdown fences, no preamble, no summary text. If you have no knowledge of any valid contacts, respond with exactly: { "contacts": [] }. NEVER output conversational text, apologies, or caveats inside or outside the JSON.`;

export async function findContactsFromKnowledge(brandName: string, excludeNames: string[] = []) {
  try {
    const excludeStr = excludeNames.length > 0 ? `Do not include any of these already-known contacts: ${excludeNames.join(', ')}.\n` : '';
    const userPrompt = `Brand: "${brandName}"
${excludeStr}List every person you have knowledge of at this company holding one of the target roles (Sourcing Director, Sourcing Manager, Buying Manager, Product Development Manager, Technical Manager, Sustainability Team, Country/Regional Sourcing Head).

Respond with the JSON only.`;
    const { result, model } = await generateStructuredResponse<ExtractedContacts>(
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
      'gemini',
      true
    );
    console.log(`[AI:KnowledgeContacts] Executed using model: ${model}`);
    return {
      contacts: result?.contacts || []
    };
  } catch (error) {
    console.error(`[AI:KnowledgeContacts] Failed to find contacts for ${brandName}:`, error);
    return { contacts: [] };
  }
}