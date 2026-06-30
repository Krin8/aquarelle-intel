import { cookies } from 'next/headers';
import prisma from '@/lib/db';
import { encrypt, decrypt, getSession, SessionPayload } from './jwt';

export { encrypt, decrypt, getSession };
export type { SessionPayload };

export async function createSession(user: { id: string; email: string; role: string; status: string }, requestData: { ip?: string; userAgent?: string; mfaVerified: boolean }) {
  // Create a record in the database
  const sessionRecord = await prisma.session.create({
    data: {
      userId: user.id,
      token: crypto.randomUUID(),
      ipAddress: requestData.ip,
      userAgent: requestData.userAgent,
      expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000), // 10 hours
    }
  });

  // Create the JWT
  const sessionPayload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    sessionId: sessionRecord.id,
    mfaVerified: requestData.mfaVerified
  };
  const token = await encrypt(sessionPayload);

  // Set the cookie
  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 10, // 10 hours
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session');
  
  if (sessionCookie?.value) {
    try {
      const payload = await decrypt(sessionCookie.value) as SessionPayload;
      await prisma.session.update({
        where: { id: payload.sessionId },
        data: { status: 'expired' }
      }).catch(() => {});
    } catch (e) {
      // Ignore decrypt errors on logout
    }
  }

  cookieStore.delete('session');
}
