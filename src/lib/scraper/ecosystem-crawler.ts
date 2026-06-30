import prisma from '@/lib/db';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { generateStructuredResponse } from '../ai/router';

puppeteer.use(StealthPlugin());

interface CrawlerSettings {
  maxDepth: number;
  maxNodesPerScan: number;
  modelPref: 'ollama' | 'gemini';
}

interface ExtractedEntity {
  name: string;
  type: string; // brand, supplier, technology, logistics, investor, person, parent_company, competitor
  url: string | null;
  description: string;
  relationType: string;
  evidence: string;
}

// ─── START CRAWL ─────────────────────────────────────────────────────────────
export async function startEcosystemCrawl(seedBrandId: string, settings: CrawlerSettings) {
  // Get the seed brand
  const seedBrand = await prisma.brand.findUnique({ where: { id: seedBrandId } });
  if (!seedBrand) throw new Error('Seed brand not found');

  // Create the root node if it doesn't exist
  let rootNode = await prisma.ecosystemNode.findFirst({
    where: { seedBrandId, name: seedBrand.name },
  });

  if (!rootNode) {
    rootNode = await prisma.ecosystemNode.create({
      data: {
        seedBrandId,
        name: seedBrand.name,
        type: 'brand',
        url: seedBrand.website,
        description: seedBrand.description || 'Seed brand',
        crawlStatus: 'pending',
        depth: 0,
      },
    });
  } else {
    // Reset status to allow re-crawling
    await prisma.ecosystemNode.update({
      where: { id: rootNode.id },
      data: { crawlStatus: 'pending', depth: 0 },
    });
  }

  // Fire and forget background worker
  processCrawlQueue(seedBrandId, settings).catch(console.error);

  return rootNode;
}

// ─── RECURSIVE QUEUE WORKER ──────────────────────────────────────────────────
async function processCrawlQueue(seedBrandId: string, settings: CrawlerSettings) {
  console.log(`[EcosystemCrawler] Starting crawl for seed ${seedBrandId} (MaxDepth: ${settings.maxDepth}, MaxNodes: ${settings.maxNodesPerScan})`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: './.puppeteer_data',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    // Main loop
    while (true) {
      // Check node limit
      const nodeCount = await prisma.ecosystemNode.count({ where: { seedBrandId } });
      if (nodeCount >= settings.maxNodesPerScan) {
        console.log(`[EcosystemCrawler] Max nodes reached (${settings.maxNodesPerScan}). Stopping.`);
        break;
      }

      // Get next pending node
      const nextNode = await prisma.ecosystemNode.findFirst({
        where: { seedBrandId, crawlStatus: 'pending', depth: { lt: settings.maxDepth } },
        orderBy: { depth: 'asc' }, // Breadth-first search
      });

      if (!nextNode) {
        console.log(`[EcosystemCrawler] Queue empty or max depth reached. Stopping.`);
        break;
      }

      if (!nextNode.url || !nextNode.url.startsWith('http')) {
        await prisma.ecosystemNode.update({ where: { id: nextNode.id }, data: { crawlStatus: 'failed' } });
        continue;
      }

      // Mark as crawling
      await prisma.ecosystemNode.update({ where: { id: nextNode.id }, data: { crawlStatus: 'crawling' } });

      try {
        console.log(`[EcosystemCrawler] Crawling node: ${nextNode.name} (Depth ${nextNode.depth}) -> ${nextNode.url}`);
        
        // Scrape
        const pageText = await scrapeText(browser, nextNode.url);
        
        // Extract Entities
        const extracted = await extractEntitiesWithAI(pageText, nextNode.name, settings.modelPref);
        
        // Persist to DB
        await persistEntities(nextNode, extracted, seedBrandId, settings);

        // Mark as complete
        await prisma.ecosystemNode.update({ where: { id: nextNode.id }, data: { crawlStatus: 'completed' } });
        
      } catch (error) {
        console.error(`[EcosystemCrawler] Failed to process node ${nextNode.name}:`, error);
        await prisma.ecosystemNode.update({ where: { id: nextNode.id }, data: { crawlStatus: 'failed' } });
      }

      // Respectful delay
      await new Promise(r => setTimeout(r, 2000));
    }

  } finally {
    if (browser) await browser.close().catch(() => {});
    
    // Mark remaining pending as failed or skipped if we hit limits
    await prisma.ecosystemNode.updateMany({
      where: { seedBrandId, crawlStatus: 'crawling' },
      data: { crawlStatus: 'failed' },
    });
  }
}

// ─── SCRAPE TEXT ─────────────────────────────────────────────────────────────
async function scrapeText(browser: any, url: string): Promise<string> {
  const page = await browser.newPage();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);

    const text = await page.evaluate(() => {
      // Remove noise
      document.querySelectorAll('script, style, nav, footer, header, .cookie-banner').forEach(el => el.remove());
      return document.body.innerText.replace(/\s+/g, ' ').trim();
    });

    return text.slice(0, 20000); // Limit context window
  } finally {
    await page.close().catch(() => {});
  }
}

// ─── AI EXTRACTION ───────────────────────────────────────────────────────────
async function extractEntitiesWithAI(pageText: string, sourceNodeName: string, modelPref: 'ollama' | 'gemini'): Promise<ExtractedEntity[]> {
  const systemPrompt = `You are a corporate intelligence crawler for the apparel industry. Your job is to extract an ecosystem graph from the provided webpage text.
Identify every distinct company, partner, supplier, competitor, parent company, or investor mentioned in relation to the main entity (${sourceNodeName}).

CRITICAL RULE: DO NOT extract technology companies, software providers, semiconductor foundries (like TSMC), IT services, or generic hi-tech manufacturing companies (like L&T). ONLY extract companies directly related to the apparel, fashion, retail, textile, or garment manufacturing industries.

Allowed types: "brand", "supplier", "fabric_mill", "logistics", "investor", "person", "parent_company", "competitor", "unknown".

Output ONLY JSON.`;

  const userPrompt = `Extract the ecosystem network for ${sourceNodeName} from the following text:

${pageText}

Provide a JSON object with a "nodes" array:
{
  "nodes": [
    {
      "name": "Entity Name",
      "type": "supplier", 
      "url": "https://...", // if mentioned or easily guessed (optional)
      "description": "What they do",
      "relationType": "manufactures_for", // e.g. uses_technology, invests_in, partners_with, parent_of, competitor_of
      "evidence": "Quote or reason they are connected based on the text"
    }
  ]
}`;

  try {
    const { result } = await generateStructuredResponse<{ nodes: ExtractedEntity[] }>(
      systemPrompt,
      userPrompt,
      (text: string) => {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed.nodes)) return { nodes: [] };
        
        return {
          nodes: parsed.nodes.map((n: any) => ({
            name: String(n.name || '').trim(),
            type: String(n.type || 'unknown').trim(),
            url: n.url ? String(n.url).trim() : null,
            description: String(n.description || '').trim(),
            relationType: String(n.relationType || 'connected_to').trim(),
            evidence: String(n.evidence || '').trim()
          })).filter((n: any) => n.name && n.name !== sourceNodeName) // prevent self-loops
        };
      },
      modelPref
    );
    return result.nodes;
  } catch (error) {
    console.warn('[EcosystemCrawler] AI extraction failed:', error);
    return [];
  }
}

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
async function persistEntities(
  sourceNode: { id: string, depth: number },
  extracted: ExtractedEntity[],
  seedBrandId: string,
  settings: CrawlerSettings
) {
  for (const entity of extracted) {
    if (!entity.name) continue;

    // Check node limit again just in case
    const currentCount = await prisma.ecosystemNode.count({ where: { seedBrandId } });
    if (currentCount >= settings.maxNodesPerScan) break;

    // Normalize URL
    let cleanUrl = entity.url;
    if (cleanUrl && !cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;

    // Upsert the Node
    const node = await prisma.ecosystemNode.upsert({
      where: {
        seedBrandId_name: {
          seedBrandId,
          name: entity.name,
        }
      },
      update: {
        // Only update URL if we didn't have one
        url: cleanUrl || undefined,
      },
      create: {
        seedBrandId,
        name: entity.name,
        type: entity.type,
        url: cleanUrl,
        description: entity.description,
        crawlStatus: cleanUrl ? 'pending' : 'completed', // Can't crawl without URL
        depth: sourceNode.depth + 1,
      }
    });

    // Create the Relationship Edge
    try {
      await prisma.ecosystemRelationship.upsert({
        where: {
          sourceNodeId_targetNodeId_relationType: {
            sourceNodeId: sourceNode.id,
            targetNodeId: node.id,
            relationType: entity.relationType,
          }
        },
        update: { evidence: entity.evidence },
        create: {
          sourceNodeId: sourceNode.id,
          targetNodeId: node.id,
          relationType: entity.relationType,
          evidence: entity.evidence,
        }
      });
    } catch (e) {
      // Ignore unique constraint violations if they happen concurrently
    }
  }
}
