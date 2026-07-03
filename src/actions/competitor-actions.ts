'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { startCompetitorDiscovery } from '@/lib/scraper/competitor-crawler';
import { scrapeCompetitorBrandAction } from './scrape-competitor-action';

export { scrapeCompetitorBrandAction };

export async function discoverCompetitorsAction(targetBrandId: string, maxCompetitors: number) {
  try {
    await startCompetitorDiscovery(targetBrandId, {
      maxDepth: 1,
      maxCompetitorsPerScan: maxCompetitors,
      });
    revalidatePath(`/brands/${targetBrandId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to discover competitors:', error);
    return { success: false, error: String(error) };
  }
}

export async function getCompetitorsForBrand(targetBrandId: string) {
  const competitors = await prisma.competitorProfile.findMany({
    where: { targetBrandId },
    include: {
      scores: true,
      snapshots: {
        orderBy: { timestamp: 'desc' },
        take: 1
      },
      gaps: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return competitors;
}

export async function deleteCompetitor(competitorId: string, brandId: string) {
  await prisma.competitorProfile.delete({ where: { id: competitorId } });
  revalidatePath(`/brands/${brandId}`);
  return { success: true };
}

import { getAquarelleContextString } from '@/lib/knowledge/aquarelle-kb';
import { generateStructuredResponse } from '@/lib/ai/router';

export async function runCompetitorGapAnalysis(competitorId: string, targetBrandId: string) {
  const competitor = await prisma.competitorProfile.findUnique({
    where: { id: competitorId },
    include: { snapshots: { orderBy: { timestamp: 'desc' }, take: 1 } }
  });
  
  const prospect = await prisma.brand.findUnique({
    where: { id: targetBrandId },
    include: { products: true, aiAnalyses: { where: { analysisType: 'website_analysis' }, take: 1 } }
  });

  if (!competitor || !prospect) return { success: false, error: 'Data not found' };

  const prospectContext = `Prospect Brand: ${prospect.name}\nProducts: ${JSON.stringify(prospect.products)}\nAnalysis: ${prospect.aiAnalyses[0]?.response || ''}`;
  const compContext = `Competitor: ${competitor.name}\nIndustry: ${competitor.industry}\nPositioning: ${competitor.marketPosition}\nTarget Customers: ${competitor.targetCustomers}\nSWOT Strengths: ${competitor.swotStrengths}\nPricing: ${competitor.snapshots[0]?.pricingData || 'Unknown'}\nTech: ${competitor.snapshots[0]?.techStack || 'Unknown'}`;
  const aquarelleCtx = getAquarelleContextString();

  const prompt = `You are a strategic intelligence AI Consultant for Aquarelle India.
Analyze the Prospect and their Competitor. Identify gaps in the PROSPECT's current capabilities, product lines, or supply chain compared to the competitor, OR identify gaps in BOTH that Aquarelle can uniquely solve.

For each gap, determine:
1. The Gap Description.
2. Can Aquarelle solve this?
3. Which specific Aquarelle service or product category (from the KB) solves it?
4. Implementation Complexity (Low, Medium, High).
5. Expected ROI and Business Impact.

${aquarelleCtx}

Return ONLY JSON:
{
  "gaps": [
    { 
      "gapType": "product", 
      "description": "Prospect lacks a heavyweight flannel line, which their competitor is dominating.", 
      "severity": "high", 
      "opportunity": "Pitch Aquarelle's Heavyweight Flannel manufacturing capability (e.g. 100% Cotton 20X2/12) to launch a competitive winter capsule.",
      "implementationComplexity": "Medium",
      "expectedROI": "High revenue potential for AW25 season"
    }
  ]
}
Valid gapTypes: product, manufacturing, supply_chain, quality, innovation, sustainability, technology, pricing. Valid severities: low, medium, high.`;

  try {
    const { result } = await generateStructuredResponse<{ gaps: any[] }>(
      prompt,
      `-- PROSPECT --\n${prospectContext}\n\n-- COMPETITOR --\n${compContext}`,
      (text: string) => {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        return JSON.parse(cleaned);
      }
    );

    if (result.gaps && result.gaps.length > 0) {
      await prisma.competitorGap.deleteMany({ where: { competitorId } });
      
      await prisma.competitorGap.createMany({
        data: result.gaps.map((g: any) => ({
          competitorId,
          gapType: g.gapType,
          description: g.description,
          severity: g.severity,
          opportunity: g.opportunity
        }))
      });
      
      revalidatePath(`/brands/${targetBrandId}`);
      return { success: true };
    }
    return { success: false, error: 'No gaps identified' };
  } catch (error) {
    console.error('Gap analysis failed:', error);
    return { success: false, error: String(error) };
  }
}
