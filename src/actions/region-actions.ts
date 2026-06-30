'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';
import type { DiscoveredBrand } from '@/lib/scraper/region-discovery';

// ─── GLOBAL PROGRESS STATE ─────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var regionScanProgress: {
    region: string;
    phase: 'researching_fairs' | 'discovering' | 'processing' | 'done' | 'error';
    totalBrands: number;
    currentIndex: number;
    currentBrand: string;
    currentStep: string; // 'scraping' | 'analyzing' | 'gap_detection' | 'pipeline_scoring' | 'contact_discovery'
    isScanning: boolean;
    errors: string[];
    completedBrands: string[];
    startedAt: number;
  } | undefined;
}

export async function getRegionScanProgress() {
  return globalThis.regionScanProgress || {
    region: '',
    phase: 'done' as const,
    totalBrands: 0,
    currentIndex: 0,
    currentBrand: '',
    currentStep: '',
    isScanning: false,
    errors: [],
    completedBrands: [],
    startedAt: 0,
  };
}

/**
 * Start a region scan: discover brands → scrape → analyze → gap detect → score.
 * Returns immediately; work happens in the background.
 */
export async function startRegionScan(region: string, maxBrands: number = 20) {
  // Prevent concurrent scans
  if (globalThis.regionScanProgress?.isScanning) {
    return { error: 'A region scan is already in progress. Please wait for it to finish.' };
  }

  // Initialize progress
  globalThis.regionScanProgress = {
    region,
    phase: 'researching_fairs',
    totalBrands: 0,
    currentIndex: 0,
    currentBrand: 'Researching Industry Sources...',
    currentStep: 'discovery',
    isScanning: true,
    errors: [],
    completedBrands: [],
    startedAt: Date.now(),
  };

  // Fire and forget — runs in the background
  (async () => {
    try {
      // ─── PHASE 1: Discover brands ──────────────────────────────────────────
      console.log(`[RegionScan] Phase 1: Discovering brands in "${region}"...`);
      const { discoverBrandsInRegion } = await import('@/lib/scraper/region-discovery');
      const discovered = await discoverBrandsInRegion(region, maxBrands, 'ollama');

      if (discovered.length === 0) {
        if (globalThis.regionScanProgress) {
          globalThis.regionScanProgress.phase = 'error';
          globalThis.regionScanProgress.isScanning = false;
          globalThis.regionScanProgress.errors.push('No brands found in this region.');
        }
        return;
      }

      console.log(`[RegionScan] Discovered ${discovered.length} brands. Starting pipeline...`);

      if (globalThis.regionScanProgress) {
        globalThis.regionScanProgress.phase = 'processing';
        globalThis.regionScanProgress.totalBrands = discovered.length;
      }

      // ─── PHASE 2: Process each brand through the full pipeline ─────────────
      for (let i = 0; i < discovered.length; i++) {
        // Stop if user cancelled the scan
        if (globalThis.regionScanProgress && !globalThis.regionScanProgress.isScanning) {
          console.log('[RegionScan] Scan cancelled, stopping pipeline loop.');
          break;
        }

        const brand = discovered[i];

        if (globalThis.regionScanProgress) {
          globalThis.regionScanProgress.currentIndex = i + 1;
          globalThis.regionScanProgress.currentBrand = brand.name;
        }

        try {
          await processSingleBrand(brand, region);
          if (globalThis.regionScanProgress) {
            globalThis.regionScanProgress.completedBrands.push(brand.name);
          }
        } catch (e) {
          const errMsg = `${brand.name}: ${e instanceof Error ? e.message : 'Unknown error'}`;
          console.error(`[RegionScan] Failed to process ${brand.name}:`, e);
          if (globalThis.regionScanProgress) {
            globalThis.regionScanProgress.errors.push(errMsg);
          }
        }

        // Delay between brands to avoid overwhelming resources
        if (i < discovered.length - 1) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      console.log(`[RegionScan] Completed region scan for "${region}".`);
      if (globalThis.regionScanProgress) {
        globalThis.regionScanProgress.phase = 'done';
        globalThis.regionScanProgress.isScanning = false;
        globalThis.regionScanProgress.currentBrand = 'Done';
      }

      revalidatePath('/regions');
      revalidatePath('/brands');
      revalidatePath('/');

    } catch (error) {
      console.error(`[RegionScan] Fatal error:`, error);
      if (globalThis.regionScanProgress) {
        globalThis.regionScanProgress.phase = 'error';
        globalThis.regionScanProgress.isScanning = false;
        globalThis.regionScanProgress.errors.push(
          error instanceof Error ? error.message : 'Unknown fatal error'
        );
      }
    }
  })();

  return { success: true, message: `Region scan started for "${region}"` };
}

/**
 * Process a single discovered brand through the full pipeline:
 * Create in DB → Scrape → Website Analysis → Gap Detection → Pipeline Scoring
 */
async function processSingleBrand(brand: DiscoveredBrand, region: string) {
  const updateStep = (step: string) => {
    if (globalThis.regionScanProgress) {
      globalThis.regionScanProgress.currentStep = step;
    }
  };

  // ─── 1. Check if brand already exists (by website domain) ──────────────────
  let existingBrand = null;
  try {
    const normalizedDomain = new URL(brand.website).hostname.replace(/^www\./, '');
    existingBrand = await prisma.brand.findFirst({
      where: {
        OR: [
          { website: { contains: normalizedDomain } },
          { name: brand.name },
        ],
      },
    });
  } catch {}

  let brandId: string;

  if (existingBrand) {
    console.log(`[RegionScan] Brand "${brand.name}" already exists (id: ${existingBrand.id}), skipping creation`);
    brandId = existingBrand.id;

    // If already analyzed and scored, skip the whole pipeline
    if (existingBrand.status === 'analyzed' || existingBrand.status === 'qualified') {
      const hasScore = existingBrand.pipelineScore !== null;
      if (hasScore) {
        console.log(`[RegionScan] Brand "${brand.name}" already processed, skipping pipeline`);
        return;
      }
    }
  } else {
    // ─── 2. Create brand in DB ─────────────────────────────────────────────────
    updateStep('creating');
    console.log(`[RegionScan] Creating brand: ${brand.name} (${brand.website})`);
    const created = await prisma.brand.create({
      data: {
        name: brand.name,
        website: brand.website,
        region: region,
        description: brand.description || null,
        status: 'discovered',
        customerType: 'new',
      },
    });
    brandId = created.id;
  }

  // ─── 3. Scrape ───────────────────────────────────────────────────────────────
  updateStep('scraping');
  console.log(`[RegionScan] Scraping ${brand.name}...`);
  const { scrapeBrand } = await import('@/actions/scrape-actions');
  const scrapeResult = await scrapeBrand(brandId);
  if (scrapeResult.error) {
    console.warn(`[RegionScan] Scrape failed for ${brand.name}: ${scrapeResult.error}`);
    // Continue anyway — some analysis steps may still work with what we have
  }

  // ─── 4. Website Analysis ─────────────────────────────────────────────────────
  updateStep('analyzing');
  console.log(`[RegionScan] Analyzing ${brand.name}...`);
  const { runWebsiteAnalysis } = await import('@/actions/ai-actions');
  const analysisResult = await runWebsiteAnalysis(brandId, 'ollama');
  if (analysisResult.error) {
    console.warn(`[RegionScan] Analysis failed for ${brand.name}: ${analysisResult.error}`);
  }

  // ─── 5. Gap Detection ────────────────────────────────────────────────────────
  updateStep('gap_detection');
  console.log(`[RegionScan] Gap detection for ${brand.name}...`);
  const { runGapDetection } = await import('@/actions/ai-actions');
  const gapResult = await runGapDetection(brandId, 'ollama');
  if (gapResult.error) {
    console.warn(`[RegionScan] Gap detection failed for ${brand.name}: ${gapResult.error}`);
  }

  // ─── 6. Pipeline Scoring ─────────────────────────────────────────────────────
  updateStep('pipeline_scoring');
  console.log(`[RegionScan] Pipeline scoring for ${brand.name}...`);
  const { runPipelineScoring } = await import('@/actions/ai-actions');
  const scoreResult = await runPipelineScoring(brandId);
  if (scoreResult.error) {
    console.warn(`[RegionScan] Pipeline scoring failed for ${brand.name}: ${scoreResult.error}`);
  }

  // ─── 7. Contact Discovery & Verification ───────────────────────────────────────
  updateStep('contact_discovery');
  console.log(`[RegionScan] Contact discovery for ${brand.name}...`);
  const { runContactDiscoveryForBrand } = await import('@/lib/scraper/contact-discovery');
  const contactResult = await runContactDiscoveryForBrand(brandId);
  if (!contactResult.success) {
    console.warn(`[RegionScan] Contact discovery failed for ${brand.name}: ${contactResult.error}`);
  } else {
    console.log(`[RegionScan] Found ${contactResult.verifiedCount} verified contacts for ${brand.name}`);
  }

  // Update status
  await prisma.brand.update({
    where: { id: brandId },
    data: { status: 'analyzed' },
  }).catch(() => {});

  revalidatePath(`/brands/${brandId}`);
  console.log(`[RegionScan] ✓ Completed pipeline for ${brand.name}`);
}

/**
 * Cancel a running region scan.
 */
export async function cancelRegionScan() {
  if (globalThis.regionScanProgress) {
    globalThis.regionScanProgress.isScanning = false;
    globalThis.regionScanProgress.phase = 'done';
    globalThis.regionScanProgress.currentBrand = 'Cancelled';
  }
  return { success: true };
}

/**
 * Get brands for a specific region with optional pipeline score filtering.
 */
export async function getRegionBrands(region: string, filters?: {
  minPipelineScore?: number;
  minMatchScore?: number;
  status?: string;
  sortBy?: 'pipelineScore' | 'matchScore' | 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}) {
  const where: any = { region };

  if (filters?.minPipelineScore) {
    where.pipelineScore = { gte: filters.minPipelineScore };
  }
  if (filters?.minMatchScore) {
    where.matchScore = { gte: filters.minMatchScore };
  }
  if (filters?.status && filters.status !== 'all') {
    where.status = filters.status;
  }

  const orderBy: any = {};
  const sortField = filters?.sortBy || 'pipelineScore';
  const sortOrder = filters?.sortOrder || 'desc';
  orderBy[sortField] = sortOrder;

  return prisma.brand.findMany({
    where,
    orderBy,
    include: {
      _count: {
        select: {
          contacts: true,
          aiAnalyses: true,
        },
      },
    },
  });
}
