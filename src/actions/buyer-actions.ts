'use server';

import { discoverBuyersAndRelationships } from '@/lib/scraper/buyer-discovery';
import { findWarmIntroductionPath } from '@/lib/ai/analyzers/relationship-analyzer';
import { revalidatePath } from 'next/cache';

export async function runBuyerDiscoveryAction(brandId: string) {
  try {
    const result = await discoverBuyersAndRelationships(brandId, 'ollama');
    revalidatePath(`/brands/${brandId}`);
    return result;
  } catch (error) {
    console.error('Buyer Discovery Error:', error);
    return { success: false, error: String(error) };
  }
}

export async function getWarmPathAction(contactId: string) {
  try {
    const path = await findWarmIntroductionPath(contactId);
    return { success: true, path };
  } catch (error) {
    console.error('Warm Path Error:', error);
    return { success: false, error: String(error) };
  }
}
