import type { ScrapedContent } from '../scraper';

export interface ConfidenceScores {
  overall: number; // 0-100
  contact: number;
  product: number;
  freshness: number;
}

export function scoreConfidence(
  content: ScrapedContent,
  lastScrapedAt?: Date | null
): ConfidenceScores {
  let contactScore = 0;
  let productScore = 0;

  // Contact confidence
  if (content.emails.length > 0) contactScore += 40;
  if (content.phones.length > 0) contactScore += 20;
  if (content.emails.length > 2) contactScore += 15;
  if (content.links.some(l => l.href.includes('linkedin.com'))) contactScore += 15;
  if (content.links.some(l => l.text.toLowerCase().includes('contact'))) contactScore += 10;
  contactScore = Math.min(100, contactScore);

  // Product confidence
  if (content.headings.some(h => /product|collection|shop|catalog/i.test(h))) productScore += 25;
  if (content.bodyText.match(/\$\d+|\€\d+|£\d+|price|USD|EUR/i)) productScore += 30;
  if (content.images.length > 5) productScore += 15;
  if (content.markdown.length > 2000) productScore += 15;
  if (content.metaDescription.length > 20) productScore += 15;
  productScore = Math.min(100, productScore);

  // Freshness
  let freshnessScore = 100;
  if (lastScrapedAt) {
    const daysSince = (Date.now() - lastScrapedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 90) freshnessScore = 20;
    else if (daysSince > 60) freshnessScore = 40;
    else if (daysSince > 30) freshnessScore = 60;
    else if (daysSince > 14) freshnessScore = 80;
    else freshnessScore = 100;
  }

  const overall = Math.round(
    (contactScore * 0.3 + productScore * 0.4 + freshnessScore * 0.3)
  );

  return {
    overall,
    contact: contactScore,
    product: productScore,
    freshness: freshnessScore,
  };
}

export function getContactConfidence(contact: {
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  name: string;
  role?: string | null;
}): number {
  let score = 0.1; // Base score for existing

  if (contact.email) score += 0.3;
  if (contact.phone) score += 0.2;
  if (contact.linkedinUrl) score += 0.2;
  if (contact.role) score += 0.1;
  if (contact.name && contact.name.split(' ').length >= 2) score += 0.1;

  return Math.min(1, score);
}

export function getFreshnessLabel(score: number): 'fresh' | 'aging' | 'stale' {
  if (score >= 70) return 'fresh';
  if (score >= 40) return 'aging';
  return 'stale';
}
