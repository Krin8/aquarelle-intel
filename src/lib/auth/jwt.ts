import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secretKey = process.env.JWT_SECRET || 'fallback_secret_key_for_development_only_12345';
const key = new TextEncoder().encode(secretKey);

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  status: string;
  sessionId: string;
  mfaVerified: boolean;
}

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10h')
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  });
  return payload;
}

export async function getSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session');
  if (!sessionCookie || !sessionCookie.value) return null;

  try {
    const payload = await decrypt(sessionCookie.value) as SessionPayload;
    return payload;
  } catch (error) {
    return null;
  }
}
