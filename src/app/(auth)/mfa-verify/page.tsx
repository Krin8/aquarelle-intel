import { getSession } from '@/lib/auth/jwt';
import { generateMfaSecret, verifyAndEnableMfa, verifyMfaLogin } from '@/actions/mfa-actions';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import '../auth.css';

export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { error } = await searchParams;

  const isSetup = !session.mfaVerified && session.status === 'approved' && !error?.includes('Invalid authenticator code');
  
  let setupData = null;
  if (isSetup) {
    try {
      setupData = await generateMfaSecret();
    } catch (e: any) {
      if (e.message !== 'MFA is already enabled') {
        throw e;
      }
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-overlay"></div>

      <div className="auth-panel" style={{ maxWidth: '450px' }}>
        <h1 className="auth-title">Security</h1>
        <p className="auth-subtitle">Two-Factor Authentication</p>

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        {setupData && !setupData.error && (
          <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
              <Image src={setupData.qrCodeUrl} alt="QR Code" width={180} height={180} style={{ borderRadius: '4px' }} />
            </div>
            <p style={{ color: 'white', fontSize: '14px', textAlign: 'center', marginTop: '16px' }}>
              Scan this QR code with your Authenticator app.
            </p>
          </div>
        )}

        <form action={async (formData) => {
          'use server';
          const token = formData.get('token') as string;
          if (setupData) {
            await verifyAndEnableMfa(token);
          } else {
            await verifyMfaLogin(token);
          }
        }} className="auth-form">
          
          <div className="auth-input-group">
            <svg className="auth-icon-left" viewBox="0 0 24 24">
              <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM8.9 6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H8.9V6z"/>
            </svg>
            <input
              type="text"
              name="token"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              required
              placeholder="000 000"
              className="auth-input"
              style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: '20px', fontFamily: 'monospace' }}
            />
          </div>

          <button type="submit" className="auth-button" style={{ marginTop: '10px' }}>
            Verify Code
          </button>
        </form>
      </div>
    </div>
  );
}
