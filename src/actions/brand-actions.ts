'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function createBrand(formData: FormData) {
  const name = formData.get('name') as string;
  const website = formData.get('website') as string;
  const region = formData.get('region') as string || 'Global';
  const segment = formData.get('segment') as string || null;

  if (!name || !website) {
    return { error: 'Name and website are required' };
  }

  // Normalize website URL
  let normalizedUrl = website.trim();
  if (!normalizedUrl.startsWith('http')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  
  try {
    const urlObj = new URL(normalizedUrl);
    normalizedUrl = urlObj.origin + urlObj.pathname;
  } catch {
    // If URL parsing fails, keep the original normalizedUrl
  }

  try {
    const brand = await prisma.brand.create({
      data: {
        name: name.trim(),
        website: normalizedUrl,
        region,
        segment,
        status: 'discovered',
      },
    });

    revalidatePath('/');
    revalidatePath('/brands');
    return { success: true, brandId: brand.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create brand' };
  }
}

export async function updateBrandStatus(brandId: string, status: string) {
  try {
    await prisma.brand.update({
      where: { id: brandId },
      data: { status },
    });
    revalidatePath(`/brands/${brandId}`);
    revalidatePath('/brands');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update status' };
  }
}

export async function updateCorporateUrl(brandId: string, corporateUrl: string | null) {
  try {
    await prisma.brand.update({
      where: { id: brandId },
      data: { corporateUrl },
    });
    revalidatePath(`/brands/${brandId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update corporate URL' };
  }
}

export async function updateLinkedinUrl(brandId: string, linkedinUrl: string | null) {
  try {
    await prisma.brand.update({
      where: { id: brandId },
      data: { linkedinUrl },
    });
    revalidatePath(`/brands/${brandId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update LinkedIn URL' };
  }
}

export async function deleteBrand(brandId: string) {
  try {
    await prisma.brand.delete({
      where: { id: brandId },
    });
    revalidatePath('/');
    revalidatePath('/brands');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to delete brand' };
  }
}

export async function getBrands(filters?: {
  status?: string;
  region?: string;
  search?: string;
}) {
  const where: Record<string, unknown> = {};

  if (filters?.status && filters.status !== 'all') {
    where.status = filters.status;
  }
  if (filters?.region && filters.region !== 'all') {
    where.region = filters.region;
  }
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { website: { contains: filters.search } },
    ];
  }

  return prisma.brand.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          products: true,
          contacts: true,
          aiAnalyses: true,
          notes: true,
        },
      },
    },
  });
}

export async function getBrand(id: string) {
  return prisma.brand.findUnique({
    where: { id },
    include: {
      products: { orderBy: { confidence: 'desc' } },
      contacts: { orderBy: { confidenceScore: 'desc' } },
      aiAnalyses: { orderBy: { createdAt: 'desc' } },
      notes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] },
      scrapeLogs: { orderBy: { scrapedAt: 'desc' }, take: 10 },
    },
  });
}
