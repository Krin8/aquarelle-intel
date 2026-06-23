import { z } from 'zod';

// ---- Brand Analysis Schemas ----

export const WebsiteAnalysisSchema = z.object({
  brandName: z.string().describe('The brand name'),
  tagline: z.string().nullish().describe('Brand tagline or slogan if found'),
  description: z.string().describe('1-2 sentence description of what the brand does'),
  segment: z.enum(['luxury', 'premium', 'mid-range', 'value', 'fast-fashion']).describe('Market segment'),
  targetCustomer: z.string().describe('Target customer demographic'),
  productCategories: z.array(z.string()).describe('Main product categories offered'),
  priceRange: z.string().describe('Approximate price range e.g. "$50-$200"'),
  keyDifferentiators: z.array(z.string()).describe('What makes this brand unique'),
  sustainability: z.string().nullish().describe('Any sustainability or ethical claims'),
  distributionChannels: z.array(z.string()).nullish().describe('How they sell: DTC, wholesale, retail partners'),
  headquartersLocation: z.string().nullish().describe('Where the brand is based'),
});

export type WebsiteAnalysis = z.infer<typeof WebsiteAnalysisSchema>;

export const GapDetectionSchema = z.object({
  matchScore: z.number().min(0).max(100).describe('Overall match score 0-100'),
  matchSummary: z.string().describe('1-2 sentence summary of the match'),
  productGaps: z.array(z.object({
    gap: z.string(),
    opportunity: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
  })).describe('Product gaps Laguna can fill'),
  priceAlignment: z.string().describe('How well prices align with Laguna capabilities'),
  regionFit: z.string().describe('How well the brand fits target regions'),
  complianceNotes: z.string().nullish().describe('Any compliance considerations'),
  risks: z.array(z.string()).nullish().describe('Potential risks or challenges'),
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
  email: z.string().nullish(),
  phone: z.string().nullish(),
  buyerType: z.enum(['decision_maker', 'influencer', 'gatekeeper', 'unknown']).default('unknown'),
  confidenceScore: z.number().min(0).max(1).default(0.3),
  source: z.enum(['website', 'linkedin', 'zoominfo', 'manual']).default('website'),
});
