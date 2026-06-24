import { generateStructuredResponse } from '../router';
import { z } from 'zod';

export const EmailDraftSchema = z.object({
  subjectLine: z.string().describe('The subject line for the cold email.'),
  body: z.string().describe('The full body of the cold email, formatted with line breaks.'),
});

export type EmailDraft = z.infer<typeof EmailDraftSchema>;

const SYSTEM_PROMPT = `You are an expert enterprise sales development representative (SDR) for CIEL Textiles Intel.
Your goal is to write a highly personalized cold outreach email to a specific B2B contact at a prospect brand.
You will be provided with:
1. The contact's details (Name, Role, Department).
2. The brand's intelligence and gap analysis.

- Keep it concise, professional, and confident. 
- Use the contact's name and role to personalize the hook.
- Do not use overly salesy buzzwords. Focus on value and capabilities.
- Return the output in a structured JSON format with 'subjectLine' and 'body'.`;

export async function generateColdEmail(
  brandName: string,
  contactName: string,
  contactRole: string | null,
  contactDepartment: string | null,
  gapAnalysisData: any,
  stage: 1 | 2 = 1
) {
  const stageInstruction = stage === 1 
    ? `STAGE 1 (INTRODUCTION): Introduce Aquarelle Group (CIEL Textiles). Highlight our manufacturing capabilities, sustainability strengths, product expertise, and global portfolio. Do NOT aggressively sell. Offer to share a corporate presentation or factory video. Focus on building trust and making an introduction.`
    : `STAGE 2 (CREATE INTEREST): Reference specific gaps or pain points from the Gap Analysis below. Present concrete solutions: new product concepts, cost optimization ideas, sustainable fabrics, or speed-to-market programs. Drive for a specific meeting to discuss solutions.`;

  const userPrompt = `
${stageInstruction}
Prospect: ${brandName}
Contact: ${contactName}
Role: ${contactRole || 'Unknown'}
Department: ${contactDepartment || 'Unknown'}

Gap Analysis:
${JSON.stringify(gapAnalysisData, null, 2)}

Write a personalized cold email to this contact.
  `;

  return generateStructuredResponse<EmailDraft>(
    SYSTEM_PROMPT,
    userPrompt,
    (text) => EmailDraftSchema.parse(JSON.parse(text))
  );
}
