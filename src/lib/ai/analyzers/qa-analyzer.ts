import { generateStructuredResponse } from '../router';
import { QAAnswerSchema, type QAAnswer } from '../../normalizer/schemas';

const SYSTEM_PROMPT = `You are a market intelligence analyst specializing in apparel and fashion brands.
You answer questions about brands based on their website content and any prior analysis data.
Your answers should be:
- Direct and specific, citing actual details from the content
- Honest about uncertainty — if the content doesn't cover something, say so
- Focused on business intelligence relevant to B2B partnerships
Always respond with valid JSON matching the requested schema exactly.`;

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
  const userPrompt = `Answer the following question about the brand "${brandName}" using the website content and analysis data provided.

QUESTION: ${question}

Website Content:
${markdownContent.slice(0, 12000)}

${existingAnalysis ? `Prior Analysis:\n${existingAnalysis}` : ''}

Respond with a JSON object:
{
  "answer": "Direct, comprehensive answer to the question. Use specific details, numbers, and examples from the content.",
  "confidence": "high | medium | low — based on how well the content supports the answer",
  "sources": ["List which parts of the website/data the answer was derived from, e.g. 'Homepage hero section', 'About page', 'Product listings'"],
  "followUpQuestions": ["2-3 natural follow-up questions the user might want to ask next"]
}`;

  const { result, rawResponse, model } = await generateStructuredResponse(
    SYSTEM_PROMPT,
    userPrompt,
    (text: string) => {
      const parsed = JSON.parse(text);
      return QAAnswerSchema.parse(parsed);
    }
  );

  return { answer: result, rawResponse, model };
}
