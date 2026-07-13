'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';

const API_KEY_PROVIDERS = [
  'GEMINI',
  'HUNTER',
  'MEV',
  'APOLLO',
  'FINDYMAIL',
  'DROPCONTACT',
  'PDL',
  'PROSPEO',
  'SERPER'
];

export async function getApiKeysStatus() {
  const statuses: Record<string, boolean> = {};
  
  // First, get all keys from DB
  const dbSettings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: API_KEY_PROVIDERS.map(p => `${p}_API_KEY`)
      }
    }
  });

  const dbKeysMap = new Set(dbSettings.map(s => s.key));

  for (const provider of API_KEY_PROVIDERS) {
    const envKey = `${provider}_API_KEY`;
    // It's configured if it exists in DB OR in process.env (fallback)
    statuses[provider] = dbKeysMap.has(envKey) || !!process.env[envKey];
  }

  return statuses;
}

export async function saveApiKey(provider: string, key: string) {
  if (!API_KEY_PROVIDERS.includes(provider)) {
    return { error: 'Invalid provider' };
  }

  try {
    const envKey = `${provider}_API_KEY`;
    
    if (!key.trim()) {
      await prisma.systemSetting.deleteMany({
        where: { key: envKey }
      });
    } else {
      await prisma.systemSetting.upsert({
        where: { key: envKey },
        update: { value: key.trim(), isSecret: true },
        create: { key: envKey, value: key.trim(), isSecret: true }
      });
    }

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Failed to save API key', error);
    return { error: 'Failed to save API key' };
  }
}
