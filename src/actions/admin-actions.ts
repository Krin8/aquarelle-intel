'use server';

import prisma from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

async function checkAdmin() {
  const session = await getSession();
  if (!session || !['Super Administrator', 'System Administrator'].includes(session.role)) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function approveUser(userId: string) {
  const admin = await checkAdmin();
  
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: 'approved' }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      action: 'APPROVE_USER',
      resourceType: 'User',
      resource: user.id,
      newValue: JSON.stringify({ status: 'approved' }),
    }
  });

  revalidatePath('/admin/users');
}

export async function rejectUser(userId: string) {
  const admin = await checkAdmin();
  
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: 'rejected' }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      action: 'REJECT_USER',
      resourceType: 'User',
      resource: user.id,
      newValue: JSON.stringify({ status: 'rejected' }),
    }
  });

  revalidatePath('/admin/users');
}

export async function suspendUser(userId: string) {
  const admin = await checkAdmin();
  
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: 'suspended' }
  });

  // Automatically revoke all sessions
  await prisma.session.updateMany({
    where: { userId: user.id },
    data: { status: 'revoked' }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      action: 'SUSPEND_USER',
      resourceType: 'User',
      resource: user.id,
      newValue: JSON.stringify({ status: 'suspended' }),
    }
  });

  revalidatePath('/admin/users');
}

export async function assignRole(userId: string, role: string) {
  const admin = await checkAdmin();
  
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      action: 'ASSIGN_ROLE',
      resourceType: 'User',
      resource: user.id,
      newValue: JSON.stringify({ role }),
    }
  });

  revalidatePath('/admin/users');
}
