import { requestAccess } from '@/actions/auth-actions';
import Link from 'next/link';
import '../auth.css';

export default async function RequestAccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="auth-container">
      <div className="auth-overlay"></div>

      <div className="auth-panel" style={{ maxWidth: '500px' }}>
        <h1 className="auth-title">Register</h1>
        <p className="auth-subtitle">Request Platform Access</p>

        <form action={requestAccess} className="auth-form">
          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Full Name Field */}
            <div className="auth-input-group">
              <svg className="auth-icon-left" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              <input
                type="text"
                name="fullName"
                required
                placeholder="Full Name"
                className="auth-input"
              />
            </div>

            {/* Job Title Field */}
            <div className="auth-input-group">
              <svg className="auth-icon-left" viewBox="0 0 24 24">
                <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>
              </svg>
              <input
                type="text"
                name="jobTitle"
                required
                placeholder="Job Title"
                className="auth-input"
              />
            </div>
          </div>

          {/* Email Field */}
          <div className="auth-input-group">
            <svg className="auth-icon-left" viewBox="0 0 24 24">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
            <input
              type="email"
              name="email"
              required
              placeholder="Corporate Email"
              className="auth-input"
            />
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

          {/* Justification Field */}
          <div className="auth-input-group">
            <svg className="auth-icon-left" style={{ top: '16px', transform: 'none' }} viewBox="0 0 24 24">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            <textarea
              name="businessJustification"
              required
              rows={3}
              placeholder="Business Justification"
              className="auth-input"
              style={{ height: 'auto', paddingTop: '12px', paddingBottom: '12px', resize: 'vertical' }}
            />
          </div>

          {/* Submit Button */}
          <button type="submit" className="auth-button" style={{ marginTop: '10px' }}>
            Submit Request
          </button>
        </form>

        <div className="auth-links-center" style={{ marginTop: '30px' }}>
          <Link href="/login" style={{ color: '#5bc0de', textDecoration: 'underline' }}>
            Already Registered? Login Here!
          </Link>
        </div>
      </div>
    </div>
  );
}
