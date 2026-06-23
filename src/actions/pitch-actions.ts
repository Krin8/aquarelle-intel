'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function getPitchTemplates() {
  return await prisma.pitchTemplate.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

export async function createPitchTemplate(name: string, prompt: string, isDefault = false) {
  try {
    if (isDefault) {
      await prisma.pitchTemplate.updateMany({ data: { isDefault: false } });
    }
    const template = await prisma.pitchTemplate.create({
      data: { name, prompt, isDefault }
    });
    revalidatePath('/settings');
    return { success: true, template };
  } catch (error) {
    return { error: 'Failed to create template' };
  }
}

export async function updatePitchTemplate(id: string, name: string, prompt: string, isDefault = false) {
  try {
    if (isDefault) {
      await prisma.pitchTemplate.updateMany({ data: { isDefault: false } });
    }
    const template = await prisma.pitchTemplate.update({
      where: { id },
      data: { name, prompt, isDefault }
    });
    revalidatePath('/settings');
    return { success: true, template };
  } catch (error) {
    return { error: 'Failed to update template' };
  }
}

export async function deletePitchTemplate(id: string) {
  try {
    await prisma.pitchTemplate.delete({ where: { id } });
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    return { error: 'Failed to delete template' };
  }
}
