'use server';

import prisma from '@/lib/db';
import { scrapeUrl } from '@/lib/scraper';
import { scoreConfidence, getContactConfidence } from '@/lib/normalizer/confidence-scorer';
import { extractContacts } from '@/lib/ai/analyzers/contact-extractor';
import { revalidatePath } from 'next/cache';

export async function scrapeBrand(brandId: string, options?: { useDataProvider?: boolean; useLinkedin?: boolean }) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return { error: 'Brand not found' };

  const previousStatus = brand.status;
  
  let modelPref: 'ollama' | 'gemini' = 'gemini';
  try {
    const { getModelPreference } = await import('@/actions/settings-actions');
    modelPref = await getModelPreference();
  } catch (e) {
    console.warn('Could not get model preference in scrapeBrand, defaulting to gemini');
  }

  try {
    // Update status to researching
    await prisma.brand.update({
      where: { id: brandId },
      data: { status: 'researching' },
    });

    // 2) Find Corporate URL if it doesn't exist yet
    let corporateUrl = brand.corporateUrl;
    if (!corporateUrl) {
      console.log(`[Scrape] Discovering corporate URL for ${brand.name}...`);
      const { findCorporateUrl } = await import('@/lib/scraper/corporate-finder');
      const foundUrl = await findCorporateUrl(brand.name, brand.website, modelPref);
      if (foundUrl) {
        corporateUrl = foundUrl;
        console.log(`[Scrape] Discovered corporate URL: ${corporateUrl}`);
        // Save it to DB so we don't have to search again next time
        await prisma.brand.update({
          where: { id: brandId },
          data: { corporateUrl },
        });
      } else {
        console.log(`[Scrape] No distinct corporate URL found.`);
      }
    }

    // 2b) Find LinkedIn URL if it doesn't exist yet
    let linkedinUrl = brand.linkedinUrl;
    if (!linkedinUrl) {
      console.log(`[Scrape] Discovering LinkedIn URL for ${brand.name}...`);
      const { findLinkedinUrl } = await import('@/lib/scraper/linkedin-finder');
      const foundUrl = await findLinkedinUrl(brand.name, brand.website, modelPref);
      if (foundUrl) {
        linkedinUrl = foundUrl;
        console.log(`[Scrape] Discovered LinkedIn URL: ${linkedinUrl}`);
        await prisma.brand.update({
          where: { id: brandId },
          data: { linkedinUrl },
        });
      } else {
        console.log(`[Scrape] No LinkedIn URL found.`);
      }
    }

    // 3) Start the scraping process on the main retail URL + corporate URL
    const result = await scrapeUrl(brand.website, corporateUrl ?? undefined);

    // Create scrape log with full scraped data
    await prisma.scrapeLog.create({
      data: {
        brandId,
        url: brand.website,
        method: result.method,
        status: result.success ? 'success' : 'failed',
        contentHash: result.contentHash,
        errorMessage: result.error,
        pageTitle: result.content?.pageTitle,
        metaDescription: result.content?.metaDescription,
        contentLength: result.content?.contentLength,
        scrapedData: result.content ? JSON.stringify({
          emails: result.content.emails,
          phones: result.content.phones,
          headings: result.content.headings.slice(0, 20),
          linkCount: result.content.links.length,
          imageCount: result.content.images.length,
        }) : null,
      },
    });

    if (!result.success || !result.content) {
      // Restore previous status on failure instead of leaving it stuck on "researching"
      await prisma.brand.update({
        where: { id: brandId },
        data: { status: previousStatus },
      });
      revalidatePath(`/brands/${brandId}`);
      return { error: result.error || 'Scraping failed' };
    }

    const content = result.content;

    // Score confidence using NOW as the scrape time (since we just scraped)
    const now = new Date();
    const scores = scoreConfidence(content, now);

    // Delete old website-sourced contacts and documents before re-extracting
    // This ensures stale data doesn't persist across rescrapes
    await prisma.contact.deleteMany({
      where: { brandId, source: 'website' },
    });
    
    await prisma.document.deleteMany({
      where: { brandId },
    });

    // AI Contact Extraction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let aiContacts: any[] = [];
    try {
      console.log(`[Scrape] Running AI contact extraction for ${brand.name}...`);
      const { result } = await extractContacts(content.markdown, brand.name);
      aiContacts = result.contacts || [];
      console.log(`[Scrape] AI extracted ${aiContacts.length} contacts`);
    } catch (e) {
      console.warn('[Scrape] AI contact extraction failed:', e instanceof Error ? e.message : e);
    }

    // Save AI Contacts (fresh insert since we cleared old ones)
    let savedContactCount = 0;
    for (const c of aiContacts) {
      if (!c.email && !c.phone && !c.linkedinUrl) continue;

      const emailToUse = c.email || undefined;

      // Skip duplicate emails within the same batch
      if (emailToUse) {
        const alreadyInserted = await prisma.contact.findFirst({
          where: { brandId, email: emailToUse },
        });
        if (alreadyInserted) continue;
      }

      await prisma.contact.create({
        data: {
          brandId,
          name: c.name,
          role: c.role || null,
          department: c.department || null,
          seniority: c.seniority || null,
          email: emailToUse,
          phone: c.phone || null,
          buyerType: c.buyerType,
          source: 'website',
          confidenceScore: getContactConfidence({
            name: c.name,
            role: c.role,
            email: emailToUse,
            phone: c.phone,
            linkedinUrl: c.linkedinUrl
          }),
        },
      });
      savedContactCount++;
    }
    console.log(`[Scrape] Saved ${savedContactCount} AI contacts`);

    // Extract contacts from Scrapy (which are context-aware and scored!)
    let scrapedContactCount = 0;
    if (content.extractedContacts) {
      for (const contact of content.extractedContacts) {
        // Check for duplicates by email or phone
        const existing = await prisma.contact.findFirst({
          where: { 
            brandId, 
            OR: [
              ...(contact.email ? [{ email: contact.email }] : []),
              ...(contact.phone ? [{ phone: contact.phone }] : [])
            ]
          },
        });
        if (existing) continue;

        await prisma.contact.create({
          data: {
            brandId,
            name: contact.name || 'Unknown',
            email: contact.email,
            phone: contact.phone,
            source: 'website',
            confidenceScore: (contact.confidence || 50) / 100,
            type: contact.type || 'direct',
          },
        });
        scrapedContactCount++;
      }
    }
    console.log(`[Scrape] Saved ${scrapedContactCount} context-aware contacts`);

    // Run Opt-in Scrapers
    let optInContactCount = 0;
    
    // Data Provider (ZoomInfo)
    if (options?.useDataProvider) {
      console.log(`[Scrape] Running Data Provider Scraper...`);
      const { scrapeDataProvider } = await import('@/lib/scraper/data-provider-scraper');
      const dpResult = await scrapeDataProvider(brand.name, brand.website);
      if (dpResult.success && dpResult.contacts) {
        for (const contact of dpResult.contacts) {
          await prisma.contact.create({
            data: {
              brandId,
              name: contact.name || 'Unknown',
              role: contact.role,
              source: contact.source_url || 'zoominfo',
              confidenceScore: (contact.confidence || 75) / 100,
              type: 'direct',
            },
          });
          optInContactCount++;
        }
      }
    }

    // LinkedIn Employees
    if (options?.useLinkedin) {
      console.log(`[Scrape] Running LinkedIn Employee Scraper...`);
      const { scrapeLinkedinEmployees } = await import('@/lib/scraper/linkedin-scraper');
      const liResult = await scrapeLinkedinEmployees(brand.name, brand.website);
      if (liResult.success && liResult.contacts) {
        for (const contact of liResult.contacts) {
          const cAny = contact as any;
          await prisma.contact.create({
            data: {
              brandId,
              name: contact.name || 'Unknown',
              role: contact.role,
              email: contact.email || null,
              linkedinUrl: contact.source_url,
              officeLocation: cAny.officeLocation || null,
              reportingStructure: cAny.reportingStructure || null,
              source: 'linkedin',
              confidenceScore: (contact.confidence || 80) / 100,
              type: 'direct',
            },
          });
          optInContactCount++;
        }
      }
    }

    if (optInContactCount > 0) {
      console.log(`[Scrape] Saved ${optInContactCount} opt-in contacts`);
    }

    // Save Scraped Documents
    let savedDocumentCount = 0;
    if (content.extractedDocuments) {
      for (const doc of content.extractedDocuments) {
        await prisma.document.create({
          data: {
            brandId,
            title: doc.title || 'Unknown Document',
            url: doc.url,
            type: doc.type || 'other',
          },
        });
        savedDocumentCount++;
      }
    }
    console.log(`[Scrape] Saved ${savedDocumentCount} documents`);

    // Update brand with fresh scraped data and set status to "analyzed"
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        lastScrapedAt: now,
        dataFreshness: scores.overall,
        status: 'analyzed',
        description: content.metaDescription || content.headings[0] || brand.description,
      },
    });


    revalidatePath(`/brands/${brandId}`);
    revalidatePath('/brands');
    revalidatePath('/');

    return {
      success: true,
      content: {
        title: content.pageTitle,
        description: content.metaDescription,
        emailsFound: content.emails.length,
        phonesFound: content.phones.length,
        contentLength: content.contentLength,
        markdown: content.markdown,
      },
      scores,
    };
  } catch (error) {
    // Restore previous status on error
    await prisma.brand.update({
      where: { id: brandId },
      data: { status: previousStatus },
    }).catch(() => {}); // Don't let status restore failure mask the real error

    // Log the failed scrape
    await prisma.scrapeLog.create({
      data: {
        brandId,
        url: brand.website,
        method: 'cheerio',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    revalidatePath(`/brands/${brandId}`);
    return { error: error instanceof Error ? error.message : 'Scraping failed' };
  }
}

/**
 * Global state for tracking bulk scrape progress in local dev environments
 */
declare global {
  // eslint-disable-next-line no-var
  var bulkScrapeProgress: {
    total: number;
    current: number;
    currentBrand: string;
    isScraping: boolean;
  } | undefined;
}

export async function getBulkScrapeProgress() {
  return globalThis.bulkScrapeProgress || { isScraping: false, total: 0, current: 0, currentBrand: '' };
}

/**
 * Bulk scrape all discovered or analyzed brands sequentially in the background.
 * Returns immediately so the UI doesn't block.
 */
export async function bulkScrapeBrands() {
  const brands = await prisma.brand.findMany({
    select: { id: true, name: true }
  });

  globalThis.bulkScrapeProgress = {
    total: brands.length,
    current: 0,
    currentBrand: '',
    isScraping: true
  };

  // Fire and forget background process
  (async () => {
    console.log(`[BulkScrape] Starting bulk scrape for ${brands.length} brands...`);
    for (const brand of brands) {
      if (globalThis.bulkScrapeProgress) {
        globalThis.bulkScrapeProgress.currentBrand = brand.name;
      }
      try {
        console.log(`[BulkScrape] Scraping ${brand.name}...`);
        await scrapeBrand(brand.id);
        
        if (globalThis.bulkScrapeProgress) {
          globalThis.bulkScrapeProgress.current += 1;
        }
        
        // Add a small delay between brands to avoid overwhelming resources
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[BulkScrape] Failed to scrape ${brand.name}:`, e);
        if (globalThis.bulkScrapeProgress) {
          globalThis.bulkScrapeProgress.current += 1;
        }
      }
    }
    console.log(`[BulkScrape] Completed bulk scrape.`);
    if (globalThis.bulkScrapeProgress) {
      globalThis.bulkScrapeProgress.isScraping = false;
      globalThis.bulkScrapeProgress.currentBrand = 'Done';
    }
  })();

  return { success: true };
}
