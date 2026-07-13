import prisma from './db';

// Cache to prevent hitting DB on every single AI/scraper call
const settingsCache = new Map<string, { value: string, expires: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute

export async function getSystemSetting(key: string): Promise<string | undefined> {
  const now = Date.now();
  const cached = settingsCache.get(key);
  
  if (cached && cached.expires > now) {
    return cached.value;
  }

  // Check DB first
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key }
    });

    if (setting?.value) {
      settingsCache.set(key, { value: setting.value, expires: now + CACHE_TTL });
      return setting.value;
    }
  } catch (e) {
    console.error(`Failed to get setting ${key} from DB`, e);
  }

  // Fallback to process.env
  const envVal = process.env[key];
  if (envVal) {
    settingsCache.set(key, { value: envVal, expires: now + CACHE_TTL });
    return envVal;
  }

  return undefined;
}

export async function getApiKey(providerName: string): Promise<string | undefined> {
  // E.g. getApiKey('GEMINI') looks for GEMINI_API_KEY
  return getSystemSetting(`${providerName.toUpperCase()}_API_KEY`);
}
