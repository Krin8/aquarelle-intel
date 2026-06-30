'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { startEcosystemCrawl } from '@/lib/scraper/ecosystem-crawler';

export async function startCrawlAction(seedBrandId: string, maxDepth: number, maxNodesPerScan: number) {
  try {
    await startEcosystemCrawl(seedBrandId, {
      maxDepth,
      maxNodesPerScan,
      modelPref: 'ollama',
    });
    revalidatePath(`/brands/${seedBrandId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to start ecosystem crawl:', error);
    return { success: false, error: String(error) };
  }
}

export async function getEcosystemGraph(seedBrandId: string) {
  const nodes = await prisma.ecosystemNode.findMany({
    where: { seedBrandId },
  });

  const nodeIds = nodes.map(n => n.id);

  const edges = await prisma.ecosystemRelationship.findMany({
    where: {
      sourceNodeId: { in: nodeIds },
      targetNodeId: { in: nodeIds },
    },
  });

  return { nodes, edges };
}

export async function getEcosystemProgress(seedBrandId: string) {
  const total = await prisma.ecosystemNode.count({ where: { seedBrandId } });
  const pending = await prisma.ecosystemNode.count({ where: { seedBrandId, crawlStatus: 'pending' } });
  const crawling = await prisma.ecosystemNode.count({ where: { seedBrandId, crawlStatus: 'crawling' } });
  const completed = await prisma.ecosystemNode.count({ where: { seedBrandId, crawlStatus: 'completed' } });
  const failed = await prisma.ecosystemNode.count({ where: { seedBrandId, crawlStatus: 'failed' } });

  return {
    total,
    pending,
    crawling,
    completed,
    failed,
    isScanning: crawling > 0 || pending > 0,
  };
}

export async function clearEcosystem(seedBrandId: string) {
  await prisma.ecosystemNode.deleteMany({ where: { seedBrandId } });
  revalidatePath(`/brands/${seedBrandId}`);
  return { success: true };
}
