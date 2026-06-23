'use server';

import prisma from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function addNote(formData: FormData) {
  const brandId = formData.get('brandId') as string;
  const content = formData.get('content') as string;
  const category = formData.get('category') as string || 'general';

  if (!brandId || !content) {
    return { error: 'Brand ID and content are required' };
  }

  try {
    await prisma.note.create({
      data: {
        brandId,
        content: content.trim(),
        category,
      },
    });

    revalidatePath(`/brands/${brandId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to add note' };
  }
}

export async function deleteNote(noteId: string) {
  try {
    const note = await prisma.note.delete({ where: { id: noteId } });
    revalidatePath(`/brands/${note.brandId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to delete note' };
  }
}

export async function togglePinNote(noteId: string) {
  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return { error: 'Note not found' };

    await prisma.note.update({
      where: { id: noteId },
      data: { pinned: !note.pinned },
    });

    revalidatePath(`/brands/${note.brandId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to toggle pin' };
  }
}
