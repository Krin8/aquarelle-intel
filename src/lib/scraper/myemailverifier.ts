export type VerificationStatus = 'valid' | 'catch-all' | 'invalid' | 'unverified';

export interface VerificationResult {
  status: VerificationStatus;
  rawResult: any;
}

const CACHE = new Map<string, VerificationResult>();

export async function verifyEmail(email: string): Promise<VerificationResult> {
  const normalizedEmail = email.trim().toLowerCase();
  
  if (CACHE.has(normalizedEmail)) {
    return CACHE.get(normalizedEmail)!;
  }

  // Quick reject for obviously malformed emails like "@domain.com"
  if (!normalizedEmail.includes('@') || normalizedEmail.startsWith('@')) {
    return { status: 'invalid', rawResult: { error: 'Malformed email format' } };
  }

  const apiKey = process.env.MEV_API_KEY;
  if (!apiKey) {
    console.warn('[MyEmailVerifier] MEV_API_KEY is not set. Marking email as unverified.');
    return { status: 'unverified', rawResult: { error: 'Missing API key' } };
  }

  try {
    const url = `https://api.myemailverifier.com/api/validate_single.php?apikey=${apiKey}&email=${encodeURIComponent(normalizedEmail)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    
    if (!response.ok) {
      console.error(`[MyEmailVerifier] API error: ${response.status} ${response.statusText}`);
      return { status: 'unverified', rawResult: { error: 'API Error' } };
    }

    const data = await response.json();
    
    let status: VerificationStatus = 'unverified';
    if (data?.Status) {
      const mevStatus = data.Status.toLowerCase();
      if (mevStatus === 'valid') {
        status = 'valid';
      } else if (mevStatus === 'catch-all' || mevStatus === 'catch_all') {
        status = 'catch-all';
      } else {
        status = 'invalid';
      }
    } else if (data?.status === 'error' && data?.message?.includes('credits')) {
      console.warn(`[MyEmailVerifier] Out of credits! Marking as unverified.`);
    } else {
      console.warn(`[MyEmailVerifier] Unexpected API response format:`, data);
    }

    const result: VerificationResult = { status, rawResult: data };
    CACHE.set(normalizedEmail, result);
    return result;
  } catch (error) {
    console.error('[MyEmailVerifier] Verification failed:', error);
    return { status: 'unverified', rawResult: { error: String(error) } };
  }
}
