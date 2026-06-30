import { login } from '@/actions/auth-actions';
import Link from 'next/link';
import '../auth.css';

import { redirect } from 'next/navigation';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string, error?: string }> }) {
  redirect('/');
  const { callbackUrl, error } = await searchParams;

  return (
    <div className="auth-container">
      <div className="auth-overlay"></div>

      <div className="auth-panel">
        <h1 className="auth-title">Welcome</h1>
        <p className="auth-subtitle">To Aquarelle Platform</p>

        <h2 className="auth-heading">Sign In</h2>

        <form action={login} className="auth-form">
          <input type="hidden" name="callbackUrl" value={callbackUrl || '/'} />
          
          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          {/* Email / Mobile Field */}
          <div className="auth-input-group">
            <svg className="auth-icon-left" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
            <input
              type="email"
              name="email"
              required
              placeholder="Corporate Email"
              className="auth-input"
            />
            <div className="auth-icon-right">
              <svg viewBox="0 0 24 24">
                <path d="M12.65 10A5.99 5.99 0 007 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 005.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
              </svg>
            </div>
          </div>

          {/* Password Field */}
          <div className="auth-input-group">
            <svg className="auth-icon-left" viewBox="0 0 24 24">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
            </svg>
            <input
              type="password"
              name="password"
              required
              placeholder="Password"
              className="auth-input"
            />
          </div>

          {/* Captcha Display Field (Mock for aesthetic matching) */}
          <div className="auth-captcha-row">
            <div className="auth-captcha-display">
              <svg className="auth-icon-left" style={{ left: '12px' }} viewBox="0 0 24 24">
                <path d="M3 5v14h18V5H3zm16 12H5V7h14v10z"/>
              </svg>
              706658
            </div>
            <button type="button" className="auth-captcha-refresh">
              <svg viewBox="0 0 24 24">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </button>
          </div>

          {/* Captcha Input Field */}
          <div className="auth-input-group">
            <svg className="auth-icon-left" viewBox="0 0 24 24">
              <path d="M3 5v14h18V5H3zm16 12H5V7h14v10z"/>
            </svg>
            <input
              type="text"
              name="captcha"
              placeholder="Enter Captcha"
              className="auth-input"
            />
          </div>

          {/* Instructions Checkbox */}
          <div className="auth-checkbox-group">
            <input
              id="instructions"
              name="instructions"
              type="checkbox"
            />
            <label htmlFor="instructions" className="auth-checkbox-label">
              I Have Read the Instructions
            </label>
          </div>

          {/* Login Button */}
          <button type="submit" className="auth-button">
            Login
          </button>
        </form>

        <div className="auth-links-center">
          <a href="#">User Manual</a>
        </div>

        <div className="auth-links-row">
          <div>
            <span>New User? </span>
            <Link href="/request-access">Register Here!</Link>
          </div>
          <div>
            <a href="#">Forgot Password?</a>
          </div>
        </div>
      </div>
    </div>
  );
}
