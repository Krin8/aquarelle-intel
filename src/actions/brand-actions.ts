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

export async function updateBrandFinancials(brandId: string, pipelineData: string) {
  try {
    await prisma.brand.update({
      where: { id: brandId },
      data: { pipelineData },
    });
    revalidatePath(`/brands/${brandId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update financials' };
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

export async function updateCustomerType(brandId: string, customerType: string) {
  try {
    await prisma.brand.update({
      where: { id: brandId },
      data: { customerType },
    });
    revalidatePath(`/brands/${brandId}`);
    revalidatePath('/brands');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update customer type' };
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

export async function updateContactConnections(contactId: string, mutualConnections: string | null) {
  try {
    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: { mutualConnections },
      select: { brandId: true }
    });
    revalidatePath(`/brands/${contact.brandId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to update mutual connections' };
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

export async function deleteBrands(brandIds: string[]) {
  try {
    await prisma.brand.deleteMany({
      where: { id: { in: brandIds } },
    });
    revalidatePath('/');
    revalidatePath('/brands');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to delete brands' };
  }
}

export async function getBrands(filters?: {
  status?: string;
  region?: string;
  search?: string;
  minScore?: string;
  hasContacts?: string;
}) {
  console.log('[DEBUG] getBrands called with filters:', filters);
  const where: any = {};

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
  if (filters?.minScore) {
    where.matchScore = { gte: parseInt(filters.minScore, 10) };
  }
  if (filters?.hasContacts === 'true') {
    where.contacts = { some: {} };
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
      contacts: { 
        orderBy: { confidenceScore: 'desc' },
        include: { outreachStrategy: true }
      },
      aiAnalyses: { orderBy: { createdAt: 'desc' } },
      notes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] },
      scrapeLogs: { orderBy: { scrapedAt: 'desc' }, take: 10 },
      documents: { orderBy: { scrapedAt: 'desc' } },
    },
  });
}

import { parse } from 'csv-parse/sync';

export async function importApolloCsv(brandId: string, csvText: string) {
  try {
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true
    });

    let importedCount = 0;

    for (const record of records) {
      // Apollo CSVs usually have: 'First Name', 'Last Name', 'Title', 'Email', 'Phone', 'LinkedIn Url'
      const firstName = record['First Name'] || '';
      const lastName = record['Last Name'] || '';
      const name = `${firstName} ${lastName}`.trim();
      if (!name) continue;

      const role = record['Title'] || null;
      const email = record['Email'] || null;
      const phone = record['Corporate Phone'] || record['Mobile Phone'] || record['Phone'] || null;
      const linkedinUrl = record['Person Linkedin Url'] || record['LinkedIn Url'] || null;
      const city = record['City'] || '';
      const state = record['State'] || '';
      const officeLocation = [city, state].filter(Boolean).join(', ') || null;

      let buyerType = 'influencer';
      if (role && /director|vp|vice president|head|chief|founder/i.test(role)) {
        buyerType = 'decision_maker';
      }

      const existing = await prisma.contact.findFirst({
        where: { brandId, name }
      });

      if (existing) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: {
            role: role || existing.role,
            email: email || existing.email,
            phone: phone || existing.phone,
            linkedinUrl: linkedinUrl || existing.linkedinUrl,
            officeLocation: officeLocation || existing.officeLocation,
            confidenceScore: 0.99,
            source: 'apollo'
          }
        });
      } else {
        await prisma.contact.create({
          data: {
            brandId,
            name,
            role,
            email,
            phone,
            linkedinUrl,
            officeLocation,
            buyerType,
            confidenceScore: 0.99,
            type: 'direct',
            source: 'apollo'
          }
        });
      }
      importedCount++;
    }

    revalidatePath(`/brand/${brandId}`);
    return { success: true, count: importedCount };
  } catch (error: any) {
    console.error('Failed to parse Apollo CSV:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteContact(contactId: string) {
  try {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return { error: 'Contact not found' };

    await prisma.contact.delete({
      where: { id: contactId }
    });

    revalidatePath(`/brands/${contact.brandId}`);
    return { success: true };
  } catch (error) {
    return { error: 'Failed to delete contact' };
  }
}

export async function clearBrandProductsAction(brandId: string) {
  try {
    await prisma.product.deleteMany({
      where: { brandId }
    });
    revalidatePath(`/brands/${brandId}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to clear products:', error);
    return { error: 'Failed to clear products' };
  }
}
