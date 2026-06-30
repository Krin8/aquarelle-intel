'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { startSupplierDiscovery } from '@/lib/scraper/supplier-discovery';

export async function getSuppliersForBrand(targetBrandId: string) {
  const suppliers = await prisma.supplierProfile.findMany({
    where: { targetBrandId },
    include: {
      winStrategy: true,
      supplierGaps: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return suppliers;
}

export async function discoverSuppliersAction(targetBrandId: string, maxSuppliers: number) {
  try {
    await startSupplierDiscovery(targetBrandId, {
      maxSuppliersPerScan: maxSuppliers,
      modelPref: 'ollama',
    });
    revalidatePath(`/brands/${targetBrandId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to discover suppliers:', error);
    return { success: false, error: String(error) };
  }
}

export async function deleteSupplier(supplierId: string, brandId: string) {
  await prisma.supplierProfile.delete({ where: { id: supplierId } });
  revalidatePath(`/brands/${brandId}`);
  return { success: true };
}
