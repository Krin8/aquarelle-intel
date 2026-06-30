'use server';

import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { createSession, destroySession } from '@/lib/auth/session';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const callbackUrl = formData.get('callbackUrl') as string || '/';

  if (!email || !password) {
    redirect('/login?error=Email and password are required');
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (!user) {
    await prisma.securityEvent.create({
      data: { eventType: 'FAILED_LOGIN', emailAttempted: email, severity: 'medium', description: 'User not found' }
    });
    redirect('/login?error=Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: { increment: 1 } }
    });
    await prisma.securityEvent.create({
      data: { eventType: 'FAILED_LOGIN', emailAttempted: email, severity: 'medium', description: 'Incorrect password' }
    });
    redirect('/login?error=Invalid credentials');
  }

  if (user.status === 'rejected') redirect('/login?error=Account access has been rejected.');
  if (user.status === 'suspended') redirect('/login?error=Account is suspended.');
  if (user.status === 'inactive') redirect('/login?error=Account is inactive.');

  // Reset failed logins
  await prisma.user.update({
    where: { id: user.id },
    data: { 
      failedLogins: 0, 
      lastLoginAt: new Date(), 
      lastActivityAt: new Date(),
      loginCount: { increment: 1 } 
    }
  });

  // Log Audit
  await prisma.auditLog.create({
    data: { userId: user.id, action: 'LOGIN', resourceType: 'System' }
  });

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';
  const userAgent = reqHeaders.get('user-agent') || 'unknown';

  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status
  }, { ip, userAgent, mfaVerified: false });

  redirect(user.status === 'pending' ? '/pending' : '/mfa-verify');
}

export async function requestAccess(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;
  const department = formData.get('department') as string;
  const jobTitle = formData.get('jobTitle') as string;
  const businessJustification = formData.get('businessJustification') as string;

  if (!email || !password || !fullName) {
    redirect('/request-access?error=Missing required fields');
  }

  // Enforce Corporate Domain (e.g., aquarelle.com or cieltextiles.com)
  const allowedDomains = ['aquarelle.com', 'cieltextile.com', 'cieltextiles.com', 'gmail.com']; // allowed gmail for testing
  const domain = email.split('@')[1];
  if (!allowedDomains.includes(domain)) {
    redirect('/request-access?error=Registration requires an authorized corporate email address.');
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (existingUser) {
    redirect('/request-access?error=An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      fullName,
      department,
      jobTitle,
      businessJustification,
      status: 'pending',
      role: 'Guest'
    }
  });

  await prisma.auditLog.create({
    data: { action: 'REQUEST_ACCESS', resource: user.id, resourceType: 'User' }
  });

  const reqHeaders = await headers();
  const ip = reqHeaders.get('x-forwarded-for') || 'unknown';
  const userAgent = reqHeaders.get('user-agent') || 'unknown';

  // Log them in so they see the Pending page
  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status
  }, { ip, userAgent, mfaVerified: false });

  redirect('/pending');
}

export async function logout() {
  const reqHeaders = await headers();
  // could get user id from session cookie for audit
  await destroySession();
  redirect('/login');
}
