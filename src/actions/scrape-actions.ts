'use server';

import prisma from '@/lib/db';
import { scrapeUrl } from '@/lib/scraper';
import { scoreConfidence, getContactConfidence } from '@/lib/normalizer/confidence-scorer';
import { extractContacts, findContactsFromKnowledge } from '@/lib/ai/analyzers/contact-extractor';
import { extractCompanyOverview } from '@/lib/ai/analyzers/company-overview-extractor';
import { filterShirts, dedupeProductVariants } from '@/lib/scraper/shirt-filter';
import { categorizeProducts } from '@/lib/ai/analyzers/product-categorizer';
import { convertToUSD } from '@/lib/scraper/fx-converter';
import { findDomainAndPatternWithHunter, findDomainPatternWithHunter, findRobustDomainPattern, generateEmail, deriveEmailPattern } from '@/lib/normalizer/email-pattern';
import { revalidatePath } from 'next/cache';


export async function scrapeBrand(brandId: string, options?: { useDataProvider?: boolean; useLinkedin?: boolean; target?: 'all' | 'contacts' | 'overview' | 'images' }) {
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

    setTimeout(async () => {
      console.log(`[Scrape] Background task started for ${brand.name} via setTimeout`);
      try {
        // 2) Find Corporate URL if it doesn't exist yet (skip for images-only)
    const target = options?.target || 'all';
    let corporateUrl = brand.corporateUrl;
    if (target !== 'images') {
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
    } // end skip for images-only

    // 3) Start the scraping process on the main retail URL + corporate URL
    // For images-only scraping, skip corporate URL — we want images from the actual retail site
    const corpUrlForScrape = target === 'images' ? undefined : (corporateUrl ?? undefined);
    const result = await scrapeUrl(brand.website, corpUrlForScrape, target);

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
          images: result.content.images.slice(0, 50),
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

    // Delete old website-sourced and AI-sourced contacts before re-extracting
    // This ensures stale data doesn't persist across rescrapes
    await prisma.contact.deleteMany({
      where: { 
        brandId, 
        source: { in: ['website', 'google_ai_sge'] } 
      },
    });
    
    await prisma.document.deleteMany({
      where: { brandId },
    });

    if (target === 'all' || target === 'contacts') {
    // AI Contact Extraction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let aiContacts: any[] = [];
    try {
      if (content.markdown && content.markdown.trim().length > 100) {
        console.log(`[Scrape] Analyzing website content with Regex for ${brand.name}...`);
        const regexResult = await extractContacts(content.markdown, brand.name);
        if (regexResult && regexResult.contacts) {
          aiContacts = regexResult.contacts.map(c => ({ ...c, _source: 'website' }));
          console.log(`[Scrape] Regex extracted ${aiContacts.length} contacts from website`);
        }
      }

      if (aiContacts.length === 0) {
        console.log(`[Scrape] No contacts found via Regex on website, falling back to Gemini's internal knowledge base...`);
        const kbResult = await findContactsFromKnowledge(brand.name);
        if (kbResult && kbResult.contacts) {
          aiContacts = kbResult.contacts.map(c => ({ ...c, _source: 'google_ai_sge' }));
          console.log(`[Scrape] AI knowledge base extracted ${aiContacts.length} contacts`);
        }
      }
    } catch (e) {
      console.warn('[Scrape] AI contact extraction failed:', e instanceof Error ? e.message : e);
    }

      // Verify missing emails using Hunter.io email-finder endpoint
      if (aiContacts.length > 0) {
        const candidateDomains = [];
        if (brand.website) {
          const cleanDomain = brand.website.replace(/^https?:\/\/(www\.)?/, '').replace(/^www\./, '').split('/')[0].toLowerCase();
          candidateDomains.push(cleanDomain);
          
          const parts = cleanDomain.split('.');
          if (parts.length > 2) {
            // e.g. global.llbean.com -> llbean.com
            const rootDomain = parts.slice(-2).join('.');
            if (!candidateDomains.includes(rootDomain)) candidateDomains.push(rootDomain);
          }
        }
        
        let hunterDomain = brand.emailDomain || '';
        let hunterPattern = brand.emailPattern || 'unknown';

        if (hunterPattern !== 'unknown' && hunterDomain) {
          console.log(`[Scrape] Bypassing Hunter API. Using cached email pattern '${hunterPattern}' for domain ${hunterDomain}`);
        } else {
          // Try to derive the pattern for each candidate domain. 
          for (const domain of candidateDomains) {
            console.log(`[Scrape] Testing domain candidate: ${domain}`);
            let hRes = await findDomainAndPatternWithHunter(domain);
            let hPattern = hRes ? hRes.pattern : null;
            
            // Grab up to 3 valid persons as samples
            const samplePersons = [];
            for (const c of aiContacts) {
              if (c.name && samplePersons.length < 3) {
                const parts = c.name.trim().split(' ');
                if (parts.length >= 2) samplePersons.push({ name: c.name, firstName: parts[0], lastName: parts.slice(1).join(' ') });
              }
            }

            const { pattern: derivedPattern, domain: verifiedDomain } = await findRobustDomainPattern(domain, samplePersons);
            
            // If we got a robust pattern (not unknown, and not the bad {first} fallback)
            if (derivedPattern !== 'unknown' && derivedPattern !== '{first}') {
              hunterDomain = verifiedDomain || domain;
              hunterPattern = derivedPattern;
              console.log(`[Scrape] Successfully locked domain ${domain} with robust pattern ${derivedPattern}`);
              break; // Stop testing other domains, we found a winner!
            } else if (hPattern && hPattern !== 'unknown' && hPattern !== '{first}' && hunterPattern === 'unknown') {
              // Keep this as a fallback if the robust check completely failed across all domains
              hunterDomain = domain;
              hunterPattern = hPattern;
            }
          }
          
          if (hunterPattern !== 'unknown' && hunterDomain) {
            // Save the newly found domain and pattern to the brand for next time
            await prisma.brand.update({
              where: { id: brandId },
              data: {
                emailDomain: hunterDomain,
                emailPattern: hunterPattern
              }
            });
            console.log(`[Scrape] Cached new email pattern '${hunterPattern}' for domain ${hunterDomain} on brand ${brand.name}`);
          }
        }

        if (hunterPattern !== 'unknown' && hunterDomain) {
          console.log(`[Scrape] Found pattern '${hunterPattern}' for domain ${hunterDomain}`);
          for (const c of aiContacts) {
            if (!c.email && c.name) {
               const nameParts = c.name.trim().split(/\s+/);
               if (nameParts.length >= 2) {
                 const genEmail = generateEmail(nameParts[0], nameParts[nameParts.length - 1], hunterDomain, hunterPattern);
                 if (genEmail) {
                    c.email = genEmail;
                    console.log(`[Scrape] Generated email for ${c.name}: ${c.email}`);
                 }
               }
            }
          }
        }
      }

    // Save AI Contacts (fresh insert since we cleared old ones)
    let savedContactCount = 0;
    for (const c of aiContacts) {
      if (!c.name) continue;

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
          source: c._source || 'website',
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
    }

    if (target === 'all' || target === 'overview') {
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
    }

    // Save Scraped Products (works for both 'all' and 'images' targets)
    let savedProductCount = 0;
    if (content.extractedProducts && content.extractedProducts.length > 0) {
      // Clear old products to avoid duplicates on re-scrape
      await prisma.product.deleteMany({
        where: { brandId }
      });
      // 1. Keyword Pre-Filter (fast, cheap)
      console.log(`[Scrape Debug] Raw product sample (first 5):`, content.extractedProducts.slice(0, 5).map((p: any) => `${p.name} | img:${!!p.imageUrl} | src:${!!p.sourceUrl}`));
      const dedupedProducts = dedupeProductVariants(content.extractedProducts);
      const validShirts = filterShirts(dedupedProducts);
      
      // 2. Strict Taxonomy Categorization (Regex-based)
      const categorizedShirts = await categorizeProducts(validShirts, brand.name);
      
      // Log the funnel and discards for tuning
      const discardedShirts = validShirts.filter(v => !categorizedShirts.some(c => c.name === v.name));
      console.log(`[Scrape Funnel] Raw: ${content.extractedProducts.length} -> Deduped: ${dedupedProducts.length} -> Woven (Pre-Filter): ${validShirts.length} -> Categorized: ${categorizedShirts.length}`);
      if (discardedShirts.length > 0) {
        console.log(`[Scrape Discards] ${discardedShirts.length} items passed pre-filter but failed categorization (Regex gap or misclassification). Sample discards:`);
        discardedShirts.slice(0, 5).forEach(d => console.log(`   - ${d.name}`));
      }
      
      // Debug: log full product objects to find why they fail to save
      console.log(`[Scrape Debug] Pre-filter sample (first 3):`, JSON.stringify(validShirts.slice(0, 3).map(p => ({ name: p.name, imageUrl: p.imageUrl?.substring(0, 60), sourceUrl: p.sourceUrl?.substring(0, 60) })), null, 2));
      console.log(`[Scrape Debug] Categorized products (all):`, JSON.stringify(categorizedShirts.map(p => ({ name: p.name, category: p.category, imageUrl: !!p.imageUrl, sourceUrl: !!p.sourceUrl })), null, 2));
      
      for (const prod of categorizedShirts) {
        if (!prod.imageUrl || !prod.sourceUrl) {
          console.log(`[Scrape Warning] Skipping categorized product due to missing URL: ${prod.name}. Image: ${!!prod.imageUrl}, Source: ${!!prod.sourceUrl}`);
          continue; // skip broken products
        }
        
        // 3. FX Conversion to USD
        const priceUSD = await convertToUSD(prod.localPrice, prod.currency || 'USD');
        
        try {
          await prisma.product.create({
            data: {
              brandId,
              name: prod.name || 'Unknown Product',
              localPrice: prod.localPrice || null,
              currency: prod.currency || 'USD',
              priceMin: priceUSD || null,
              priceMax: priceUSD || null,
              imageUrl: prod.imageUrl,
              sourceUrl: prod.sourceUrl,
              category: prod.category || 'other',
              fabricTag: prod.fabricTag || null,
              confidence: 0.8,
            },
          });
          savedProductCount++;
          console.log(`[Scrape Saved] #${savedProductCount}: "${prod.name}" -> ${prod.category}`);
        } catch (saveError: any) {
          console.error(`[Scrape ERROR] Failed to save "${prod.name}":`, saveError.message);
        }
      }
    }
    console.log(`[Scrape] Saved ${savedProductCount} products`);

    // Extract Company Overview
    let overviewData: any = {};
    if (target === 'overview' || target === 'all') {
      console.log(`[Scrape] Running AI Company Overview extraction for ${brand.name}...`);
      const overviewResult = await extractCompanyOverview(brand.name, '', content.markdown, brand.region);
      if (overviewResult) {
        overviewData = overviewResult;
        console.log(`[Scrape] AI extracted company overview successfully.`);
      } else {
        console.warn('[Scrape] AI company overview extraction failed.');
      }
    }

    // Update brand with fresh scraped data and set status to "analyzed"
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        lastScrapedAt: now,
        dataFreshness: scores.overall,
        status: 'analyzed',
        description: content.metaDescription || content.headings[0] || brand.description,
        ...overviewData,
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

    try {
      revalidatePath(`/brands/${brandId}`);
    } catch (e) {
      // Ignore if revalidatePath fails in background context
    }
    }
    }, 100);

    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to start scrape' };
  }
}

/**
 * Lightweight status check for polling from the client during background scrapes.
 */
export async function getBrandStatus(brandId: string): Promise<{ status: string }> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { status: true },
  });
  return { status: brand?.status || 'unknown' };
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

export async function generateMoreContacts(brandId: string) {
  const brand = await prisma.brand.findUnique({ 
    where: { id: brandId },
    include: { contacts: true }
  });
  if (!brand) return { error: 'Brand not found' };

  try {
    const existingNames = brand.contacts.map((c: any) => c.name).filter(Boolean);
    const { findContactsFromKnowledge } = await import('@/lib/ai/analyzers/contact-extractor');
    const { contacts: newAiContacts } = await findContactsFromKnowledge(brand.name, existingNames);
    
    if (!newAiContacts || newAiContacts.length === 0) {
      return { success: true, count: 0 };
    }

    const candidateDomains: string[] = [];
    if (brand.website) {
      const cleanDomain = brand.website.replace(/^https?:\/\/(www\.)?/, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      candidateDomains.push(cleanDomain);
      const parts = cleanDomain.split('.');
      if (parts.length > 2) {
        const rootDomain = parts.slice(-2).join('.');
        if (!candidateDomains.includes(rootDomain)) candidateDomains.push(rootDomain);
      }
    }
    
    let hunterDomain = brand.emailDomain || '';
    let hunterPattern = brand.emailPattern || '';
    
    // Only attempt to derive the pattern if we don't already have it cached on the brand
    if (!hunterDomain || !hunterPattern) {
      const samplePersons = [];
      for (const c of newAiContacts) {
        if (c.name && samplePersons.length < 3) {
          const parts = c.name.trim().split(/\s+/);
          if (parts.length >= 2) samplePersons.push({ name: c.name, firstName: parts[0], lastName: parts.slice(1).join(' ') });
        }
      }
      for (const domain of candidateDomains) {
        const { pattern, domain: verifiedDomain } = await findRobustDomainPattern(domain, samplePersons);
        if (pattern !== 'unknown' && pattern !== '{first}') {
          hunterDomain = verifiedDomain || domain;
          hunterPattern = pattern;
          // Save it back to the brand so it is not repeatedly derived
          await prisma.brand.update({
            where: { id: brandId },
            data: { emailDomain: hunterDomain, emailPattern: hunterPattern }
          });
          break;
        }
      }
    }
    
    if (hunterPattern !== 'unknown' && hunterDomain) {
      for (const c of newAiContacts) {
        if (!c.email && c.name) {
           const nameParts = c.name.trim().split(/\s+/);
           if (nameParts.length >= 2) {
             const genEmail = generateEmail(nameParts[0], nameParts[nameParts.length - 1], hunterDomain, hunterPattern);
             if (genEmail) {
                c.email = genEmail;
             }
           }
        }
      }
    }
    
    let savedCount = 0;
    for (const c of newAiContacts) {
      if (!c.name) continue;
      
      await prisma.contact.create({
        data: {
          brandId,
          name: c.name,
          role: c.role || null,
          department: c.department || null,
          seniority: c.seniority || null,
          email: c.email || undefined,
          phone: c.phone || undefined,
          linkedinUrl: c.linkedinUrl || undefined,
          buyerType: c.buyerType as any || 'unknown',
          source: 'google_ai_sge',
          confidenceScore: getContactConfidence(c)
        }
      });
      savedCount++;
    }
    
    revalidatePath(`/brands/${brandId}`);
    return { success: true, count: savedCount };
  } catch (error: any) {
    if (error?.message === 'API_KEYS_EXHAUSTED') {
      return { error: 'API_KEYS_EXHAUSTED' };
    }
    console.error('Failed to generate more contacts:', error);
    return { error: 'Failed to generate contacts. Please try again.' };
  }
}
