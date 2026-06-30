'use server';

import { generateSecret, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import prisma from '@/lib/db';
import { getSession, encrypt } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function generateMfaSecret() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) throw new Error('User not found');

  if (user.mfaEnabled) {
    return { error: 'MFA is already enabled' };
  }

  const secret = generateSecret();
  const otpauth = generateURI({
    issuer: 'Aquarelle IAM',
    label: user.email,
    secret
  });
  const qrCodeUrl = await QRCode.toDataURL(otpauth);

  // Store secret temporarily or permanently (unverified)
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: secret }
  });

  return { secret, qrCodeUrl };
}

export async function verifyAndEnableMfa(token: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.mfaSecret) throw new Error('Invalid state');

  const result = await verify({ token, secret: user.mfaSecret });
  if (!result.valid) {
    return { error: 'Invalid code. Please try again.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true }
  });

  // Update session cookie to reflect mfaVerified
  const payload = { ...session, mfaVerified: true };
  const newToken = await encrypt(payload);
  const cookieStore = await cookies();
  cookieStore.set('session', newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 10,
  });

  redirect('/');
}

export async function verifyMfaLogin(token: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    // If MFA isn't actually enabled, just let them through
    const payload = { ...session, mfaVerified: true };
    const newToken = await encrypt(payload);
    const cookieStore = await cookies();
    cookieStore.set('session', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 10,
    });
    redirect('/');
  }

  const result = await verify({ token, secret: user.mfaSecret });
  if (!result.valid) {
    return { error: 'Invalid authenticator code' };
  }

  // Update session cookie to reflect mfaVerified
  const payload = { ...session, mfaVerified: true };
  const newToken = await encrypt(payload);
  const cookieStore = await cookies();
  cookieStore.set('session', newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 10,
  });

  redirect('/');
}
