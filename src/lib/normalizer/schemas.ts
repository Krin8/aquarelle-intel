import { z } from 'zod';

// ---- Brand Analysis Schemas ----

export const WebsiteAnalysisSchema = z.object({
  brandName: z.string().catch('Unknown Brand').describe('The brand name'),
  tagline: z.string().nullish().catch(null).describe('Brand tagline or slogan if found'),
  description: z.string().catch('No description available').describe('1-2 sentence description of what the brand does'),
  segment: z.string().nullish().catch(null).describe('Market segment: luxury, premium, mid-range, value, fast-fashion'),
  targetCustomer: z.string().nullish().catch(null).describe('Target customer demographic'),
  productCategories: z.array(z.string()).catch([]).describe('Main product categories offered'),
  priceRange: z.string().catch('Unknown').describe('Approximate price range e.g. "$50-$200"'),
  keyDifferentiators: z.array(z.string()).catch([]).describe('What makes this brand unique'),
  sustainability: z.string().nullish().catch(null).describe('Any sustainability or ethical claims'),
  distributionChannels: z.array(z.string()).nullish().catch(null).describe('How they sell: DTC, wholesale, retail partners'),
  headquartersLocation: z.string().nullish().catch(null).describe('Where the brand is based'),
});

export type WebsiteAnalysis = z.infer<typeof WebsiteAnalysisSchema>;

export const GapDetectionSchema = z.object({
  matchScore: z.coerce.number().min(0).max(100).catch(0).describe('Overall match score 0-100'),
  matchSummary: z.string().catch('No summary generated').describe('1-2 sentence summary of the match'),
  productGaps: z.array(z.object({
    gap: z.string().catch('Unknown gap'),
    opportunity: z.string().catch('Unknown opportunity'),
    severity: z.string().transform(val => val.toLowerCase()).catch('medium').describe('high/medium/low'),
  })).catch([]).describe('Product gaps CIEL Textiles can fill'),
  priceAlignment: z.string().catch('Unknown').describe('How well prices align with CIEL Textiles capabilities'),
  regionFit: z.string().catch('Unknown').describe('How well the brand fits target regions'),
  complianceNotes: z.string().nullish().catch(null).describe('Any compliance considerations'),
  risks: z.array(z.string()).nullish().catch([]).describe('Potential risks or challenges'),
});

export type GapDetection = z.infer<typeof GapDetectionSchema>;

export const PitchSuggestionSchema = z.object({
  pitchAngles: z.array(z.object({
    title: z.string(),
    rationale: z.string(),
    openingLine: z.string(),
    keyPoints: z.array(z.string()),
    strength: z.enum(['strong', 'moderate', 'speculative']),
  })).describe('3-5 pitch angles'),
  recommendedApproach: z.string().describe('Best overall approach recommendation'),
  buyerPersona: z.string().describe('Who to pitch to and why'),
  timingConsiderations: z.string().nullish().describe('Best timing for outreach'),
});

export type PitchSuggestion = z.infer<typeof PitchSuggestionSchema>;

export const QAAnswerSchema = z.object({
  answer: z.string().describe('Direct, comprehensive answer to the question'),
  confidence: z.enum(['high', 'medium', 'low']).describe('How confident the answer is based on available data'),
  sources: z.array(z.string()).describe('Which parts of the website or data the answer was derived from'),
  followUpQuestions: z.array(z.string()).describe('2-3 suggested follow-up questions the user might want to ask'),
});

export type QAAnswer = z.infer<typeof QAAnswerSchema>;

export const PipelineScoringSchema = z.object({
  productComplexity: z.coerce.number().min(1).max(10).describe('1-10 rating on technical capability match'),
  sourcingStrategy: z.coerce.number().min(1).max(10).describe('1-10 rating on ease of breaking into supplier base'),
  sizeAtMaturity: z.coerce.number().min(1).max(10).describe('1-10 rating on potential volume scaling'),
  planningVisibility: z.coerce.number().min(1).max(10).describe('1-10 rating on collection predictability'),
  leadTime: z.coerce.number().min(1).max(10).describe('1-10 rating on speed-to-market alignment'),
  orderSize: z.coerce.number().min(1).max(10).describe('1-10 rating on MOQ alignment'),
  grossTotalPoints: z.coerce.number().min(0).max(100).describe('Calculated total score 0-100'),
  rationale: z.string().describe('Short explanation of the assigned scores'),
});

export type PipelineScoring = z.infer<typeof PipelineScoringSchema>;

// ---- Normalized Data Schemas ----

export const NormalizedProductSchema = z.object({
  name: z.string(),
  category: z.string().nullish(),
  priceMin: z.number().nullish(),
  priceMax: z.number().nullish(),
  fit: z.string().nullish(),
  material: z.string().nullish(),
  season: z.string().nullish(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const NormalizedContactSchema = z.object({
  name: z.string(),
  role: z.string().nullish(),
  department: z.enum(['Sales', 'Wholesale/B2B', 'Merchandising/Buying', 'Executive/C-Suite', 'Marketing', 'Other']).nullish(),
  seniority: z.enum(['C-Level', 'VP', 'Director', 'Manager', 'Individual Contributor']).nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  buyerType: z.enum(['decision_maker', 'influencer', 'gatekeeper', 'unknown']).default('unknown'),
  confidenceScore: z.number().min(0).max(1).default(0.3),
  source: z.enum(['website', 'linkedin', 'zoominfo', 'manual']).default('website'),
});
