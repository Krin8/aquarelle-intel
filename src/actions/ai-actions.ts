'use server';

import prisma from '@/lib/db';
import { analyzeWebsite } from '@/lib/ai/analyzers/website-analyzer';
import { detectGaps } from '@/lib/ai/analyzers/gap-detector';
import { generatePitchAngles } from '@/lib/ai/analyzers/pitch-generator';
import { answerBrandQuestion } from '@/lib/ai/analyzers/qa-analyzer';
import { checkOllamaHealth } from '@/lib/ai/ollama-client';
import { revalidatePath } from 'next/cache';

export async function getGeminiStatus() {
  return checkOllamaHealth();
}

export async function runWebsiteAnalysis(brandId: string, preFetchedModelPref?: 'ollama' | 'gemini') {
  let modelPref = preFetchedModelPref;
  if (!modelPref) {
    try {
      const { getModelPreference } = await import('@/actions/settings-actions');
      modelPref = await getModelPreference();
    } catch (e) {
      modelPref = 'gemini';
    }
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { scrapeLogs: { where: { status: 'success' }, orderBy: { scrapedAt: 'desc' }, take: 1 } },
  });

  if (!brand) return { error: 'Brand not found' };

  // Get the latest successful scrape's markdown
  const latestScrape = brand.scrapeLogs[0];
  if (!latestScrape) {
    return { error: 'No successful scrape found. Please scrape the brand first.' };
  }

  // We need to re-scrape to get the markdown content (we don't store raw content in DB)
  const { scrapeUrl } = await import('@/lib/scraper');
  const scrapeResult = await scrapeUrl(brand.website);

  if (!scrapeResult.success || !scrapeResult.content) {
    return { error: 'Failed to fetch content for analysis' };
  }

  try {
    const { analysis, rawResponse, model } = await analyzeWebsite(
      scrapeResult.content.markdown,
      brand.name,
      brand.website,
      modelPref
    );

    // Store analysis
    const stored = await prisma.aIAnalysis.create({
      data: {
        brandId,
        analysisType: 'website_understanding',
        prompt: `Analyze website: ${brand.name} (${brand.website})`,
        response: rawResponse,
        structuredData: JSON.stringify(analysis),
        modelUsed: model,
      },
    });

    // Update brand with analysis data
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        segment: analysis.segment,
        priceRange: analysis.priceRange,
        description: analysis.description,
        status: brand.status === 'researching' ? 'analyzed' : brand.status,
      },
    });

    revalidatePath(`/brands/${brandId}`);
    revalidatePath('/intelligence');
    revalidatePath('/');

    return { success: true, analysis, analysisId: stored.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'AI analysis failed' };
  }
}

export async function runGapDetection(brandId: string, preFetchedModelPref?: 'ollama' | 'gemini') {
  let modelPref = preFetchedModelPref;
  if (!modelPref) {
    try {
      const { getModelPreference } = await import('@/actions/settings-actions');
      modelPref = await getModelPreference();
    } catch (e) {
      modelPref = 'gemini';
    }
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      aiAnalyses: {
        where: { analysisType: 'website_understanding' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!brand) return { error: 'Brand not found' };

  let websiteAnalysis = brand.aiAnalyses[0];
  if (!websiteAnalysis) {
    console.log(`[AI] Gap Detection triggered, but Website Analysis missing. Auto-running...`);
    const analysisResult = await runWebsiteAnalysis(brandId, modelPref);
    if (analysisResult.error) {
      return { error: 'Prerequisite Website Analysis failed: ' + analysisResult.error };
    }
    
    const updatedBrand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        aiAnalyses: { where: { analysisType: 'website_understanding' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    websiteAnalysis = updatedBrand?.aiAnalyses[0];
    
    if (!websiteAnalysis) {
      return { error: 'Run website analysis first before gap detection.' };
    }
  }

  try {
    const { detection, rawResponse, model } = await detectGaps(
      websiteAnalysis.structuredData || websiteAnalysis.response,
      brand.name,
      brand.customerType,
      brand.pipelineData || undefined,
      modelPref
    );

    const stored = await prisma.aIAnalysis.create({
      data: {
        brandId,
        analysisType: 'gap_detection',
        prompt: `Detect gaps for: ${brand.name}`,
        response: rawResponse,
        structuredData: JSON.stringify(detection),
        modelUsed: model,
      },
    });

    // Update match score
    await prisma.brand.update({
      where: { id: brandId },
      data: { matchScore: detection.matchScore },
    });

    revalidatePath(`/brands/${brandId}`);
    revalidatePath('/intelligence');
    revalidatePath('/');

    return { success: true, detection, analysisId: stored.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Gap detection failed' };
  }
}

export async function runPitchGeneration(brandId: string, templateId?: string, preFetchedModelPref?: 'ollama' | 'gemini') {
  let modelPref = preFetchedModelPref;
  if (!modelPref) {
    try {
      const { getModelPreference } = await import('@/actions/settings-actions');
      modelPref = await getModelPreference();
    } catch (e) {
      modelPref = 'gemini';
    }
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      aiAnalyses: {
        where: { analysisType: { in: ['website_understanding', 'gap_detection'] } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!brand) return { error: 'Brand not found' };

  const websiteAnalysis = brand.aiAnalyses.find(a => a.analysisType === 'website_understanding');
  const gapDetection = brand.aiAnalyses.find(a => a.analysisType === 'gap_detection');

  if (!websiteAnalysis) {
    return { error: 'Run website analysis first.' };
  }

  let customPrompt;
  let templateName = 'Default Template';
  if (templateId) {
    const template = await prisma.pitchTemplate.findUnique({ where: { id: templateId } });
    if (template) {
      customPrompt = template.prompt;
      templateName = template.name;
    }
  } else {
    const defaultTemplate = await prisma.pitchTemplate.findFirst({ where: { isDefault: true } });
    if (defaultTemplate) {
      customPrompt = defaultTemplate.prompt;
      templateName = defaultTemplate.name;
    }
  }

  try {
    const { pitchSuggestions, rawResponse, model } = await generatePitchAngles(
      brand.name,
      websiteAnalysis.structuredData || websiteAnalysis.response,
      gapDetection?.structuredData || gapDetection?.response || 'No gap detection available',
      brand.customerType,
      brand.pipelineData || undefined,
      customPrompt,
      modelPref
    );

    const stored = await prisma.aIAnalysis.create({
      data: {
        brandId,
        analysisType: 'pitch_suggestion',
        prompt: `Generate pitch angles for: ${brand.name} [Template: ${templateName}]`,
        response: rawResponse,
        structuredData: JSON.stringify(pitchSuggestions),
        modelUsed: model,
      },
    });

    revalidatePath(`/brands/${brandId}`);
    revalidatePath('/intelligence');

    return { success: true, pitchSuggestions, analysisId: stored.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Pitch generation failed' };
  }
}

import { scorePipeline } from '@/lib/ai/analyzers/pipeline-scorer';

export async function runPipelineScoring(brandId: string) {
  let modelPref: 'ollama' | 'gemini' = 'gemini';
  try {
    const { getModelPreference } = await import('@/actions/settings-actions');
    modelPref = await getModelPreference();
  } catch (e) {}

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      aiAnalyses: {
        where: { analysisType: { in: ['website_understanding', 'gap_detection'] } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!brand) return { error: 'Brand not found' };

  const websiteAnalysis = brand.aiAnalyses.find(a => a.analysisType === 'website_understanding');
  const gapDetection = brand.aiAnalyses.find(a => a.analysisType === 'gap_detection');

  if (!websiteAnalysis) return { error: 'Website analysis must be run first.' };
  if (!gapDetection) return { error: 'Gap detection must be run first.' };

  try {
    const { scoring, rawResponse, model } = await scorePipeline(
      brand.name,
      websiteAnalysis.structuredData || websiteAnalysis.response,
      gapDetection.structuredData || gapDetection.response,
      modelPref
    );

    const stored = await prisma.aIAnalysis.create({
      data: {
        brandId,
        analysisType: 'pipeline_scoring',
        prompt: `Score Pipeline Potential for: ${brand.name}`,
        response: rawResponse,
        structuredData: JSON.stringify(scoring),
        modelUsed: model,
      },
    });

    // Save directly to the brand record
    await prisma.brand.update({
      where: { id: brandId },
      data: { pipelineScore: scoring.grossTotalPoints },
    });

    revalidatePath(`/brands/${brandId}`);
    return { success: true, scoring, analysisId: stored.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Pipeline scoring failed' };
  }
}

export async function submitFeedback(analysisId: string, rating: 'thumbs_up' | 'thumbs_down') {
  try {
    const analysis = await prisma.aIAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis) return { error: 'Analysis not found' };

    // Toggle: if same rating, remove it; if different, set new
    const newRating = analysis.feedbackRating === rating ? null : rating;

    await prisma.aIAnalysis.update({
      where: { id: analysisId },
      data: { feedbackRating: newRating },
    });

    revalidatePath(`/brands/${analysis.brandId}`);
    revalidatePath('/intelligence');

    return { success: true, newRating };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to submit feedback' };
  }
}

export async function askBrandQuestion(brandId: string, question: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      scrapeLogs: { where: { status: 'success' }, orderBy: { scrapedAt: 'desc' }, take: 1 },
      aiAnalyses: {
        where: { analysisType: 'website_understanding' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!brand) return { error: 'Brand not found' };

  // Get scraped markdown content
  const { scrapeUrl } = await import('@/lib/scraper');
  const scrapeResult = await scrapeUrl(brand.website);

  if (!scrapeResult.success || !scrapeResult.content) {
    return { error: 'No website content available. Please scrape the brand first.' };
  }

  const existingAnalysis = brand.aiAnalyses[0]?.structuredData || null;

  try {
    const { answer, rawResponse, model } = await answerBrandQuestion(
      question,
      scrapeResult.content.markdown,
      brand.name,
      existingAnalysis
    );

    // Store Q&A as an AIAnalysis record
    const stored = await prisma.aIAnalysis.create({
      data: {
        brandId,
        analysisType: 'qa_answer',
        prompt: question,
        response: rawResponse,
        structuredData: JSON.stringify(answer),
        modelUsed: model,
      },
    });

    revalidatePath(`/brands/${brandId}`);

    return { success: true, answer, analysisId: stored.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to answer question' };
  }
}

export async function generateDraft(brandId: string, contactId: string, stage: 1 | 2 = 1) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      contacts: { where: { id: contactId } },
      aiAnalyses: {
        where: { analysisType: 'gap_detection' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!brand || brand.contacts.length === 0) return { error: 'Brand or Contact not found' };
  
  const contact = brand.contacts[0];
  const latestGapDetection = brand.aiAnalyses[0];
  
  if (!latestGapDetection || !latestGapDetection.structuredData) {
    return { error: 'No Gap Detection analysis found. Please run Gap Detection first.' };
  }

  try {
    const { generateColdEmail } = await import('@/lib/ai/analyzers/email-generator');
    const { result, rawResponse, model } = await generateColdEmail(
      brand.name,
      contact.name,
      contact.role,
      contact.department,
      JSON.parse(latestGapDetection.structuredData),
      stage
    );

    return { success: true, draft: result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to generate email draft' };
  }
}
