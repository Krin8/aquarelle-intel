'use server';

import prisma from '@/lib/db';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { scrapeDeepDetails, analyzeCompetitorProfile } from '@/lib/scraper/competitor-crawler';
import { runAllSearches } from '@/lib/scraper/search-orchestrator';

puppeteer.use(StealthPlugin());

export async function scrapeCompetitorBrandAction(competitorId: string) {
  const competitor = await prisma.competitorProfile.findUnique({
    where: { id: competitorId },
    include: { targetBrand: true }
  });

  if (!competitor || !competitor.website) {
    return { success: false, error: 'Competitor or website not found' };
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      userDataDir: './.puppeteer_data',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    console.log(`[CompetitorScrape] Deep crawling: ${competitor.name} -> ${competitor.website}`);
    
    const pageData = await scrapeDeepDetails(browser, competitor.website);
    if (!pageData.text || pageData.text.length < 200) {
      return { success: false, error: 'Not enough text scraped from the website.' };
    }

    const analysis = await analyzeCompetitorProfile(pageData.text, competitor.name, competitor.targetBrand.name, 'ollama');
    
    if (!analysis) {
      return { success: false, error: 'AI analysis failed' };
    }

    // Extract Marketplace Footprint via search
    const amazonRes = await runAllSearches(browser, `"${competitor.name}" apparel site:amazon.com`);

    const alibabaRes = await runAllSearches(browser, `"${competitor.name}" apparel site:alibaba.com`);
    
    let marketplaceFootprint = '';
    if (amazonRes.length > 0) marketplaceFootprint += 'Found on Amazon. ';
    if (alibabaRes.length > 0) marketplaceFootprint += 'Found on Alibaba. ';
    if (!marketplaceFootprint) marketplaceFootprint = 'No major marketplace presence detected.';

    // Delete old scores
    await prisma.competitorScoreMetric.deleteMany({ where: { competitorId } });

    // Update Profile
    const profile = await prisma.competitorProfile.update({
      where: { id: competitorId },
      data: {
        industry: analysis.industry,
        parentCompany: analysis.parentCompany,
        countryOfOrigin: analysis.countryOfOrigin,
        city: analysis.city,
        state: analysis.state,
        turnover: analysis.turnover,
        storesCount: analysis.storesCount,
        retailPriceMensShirt: analysis.retailPriceMensShirt,
        productType: analysis.productType,
        targetCustomers: analysis.targetCustomers,
        businessModel: analysis.businessModel,
        marketPosition: analysis.marketPosition + '\n\nMarketplaces: ' + marketplaceFootprint,
        swotStrengths: JSON.stringify(analysis.swotStrengths),
        swotWeaknesses: JSON.stringify(analysis.swotWeaknesses),
        swotOpps: JSON.stringify(analysis.swotOpps),
        swotThreats: JSON.stringify(analysis.swotThreats),
        socialLinks: JSON.stringify(pageData.socials),
        reasoning: analysis.reasoning,
        scores: {
          create: analysis.scores.map(s => ({
            metricName: s.metricName,
            score: s.score,
            evidence: s.evidence,
            confidence: 0.85
          }))
        }
      }
    });

    // Create a snapshot for historical tracking
    await prisma.competitorSnapshot.create({
      data: {
        competitorId: profile.id,
        techStack: JSON.stringify(pageData.techStack), 
        pricingData: analysis.pricingStrategy || "Unknown",
      }
    });

    return { success: true };
  } catch (err) {
    console.error(`[CompetitorScrape] Failed to process ${competitor.name}:`, err);
    return { success: false, error: String(err) };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
