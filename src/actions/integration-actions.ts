'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function getIntegrations() {
  return prisma.integration.findMany();
}

export async function connectIntegration(provider: string) {
  try {
    // Upsert the integration to mock connecting
    await prisma.integration.upsert({
      where: { provider },
      update: {
        status: 'connected',
        lastSyncAt: new Date(),
        accessToken: `mock-token-${Date.now()}`,
      },
      create: {
        provider,
        status: 'connected',
        lastSyncAt: new Date(),
        accessToken: `mock-token-${Date.now()}`,
      },
    });

    revalidatePath('/settings/integrations');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to connect integration' };
  }
}

export async function disconnectIntegration(provider: string) {
  try {
    await prisma.integration.update({
      where: { provider },
      data: {
        status: 'disconnected',
        accessToken: null,
      },
    });

    revalidatePath('/settings/integrations');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to disconnect integration' };
  }
}
