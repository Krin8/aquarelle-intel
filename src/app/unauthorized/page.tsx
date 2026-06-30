import '../(auth)/auth.css';

export default function UnauthorizedPage() {
  return (
    <div className="auth-container">
      <div className="auth-overlay" style={{ backgroundColor: 'rgba(50, 0, 0, 0.6)' }}></div>

      <div className="auth-panel" style={{ maxWidth: '450px', textAlign: 'center', background: 'linear-gradient(to right, #5f1111, #d63333)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <svg style={{ width: '64px', height: '64px', fill: 'white' }} viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        </div>

        <h1 className="auth-title" style={{ fontSize: '32px' }}>Unauthorized Access</h1>
        
        <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '4px', margin: '30px 0' }}>
          <p style={{ color: 'white', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
            You do not have the required permissions to view this area.
            This section requires higher-level administrator privileges.
          </p>
        </div>

        <div className="auth-links-center">
          <a href="/" style={{ color: 'white', textDecoration: 'underline' }}>Return to Dashboard</a>
        </div>
      </div>
    </div>
  );
}
