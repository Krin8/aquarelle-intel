import '../(auth)/auth.css';

export default function PendingPage() {
  return (
    <div className="auth-container">
      <div className="auth-overlay"></div>

      <div className="auth-panel" style={{ maxWidth: '450px', textAlign: 'center' }}>
        <h1 className="auth-title" style={{ color: '#fbbf24' }}>Request Pending</h1>
        <p className="auth-subtitle" style={{ marginTop: '10px' }}>Under Administrator Review</p>

        <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '20px', borderRadius: '4px', margin: '30px 0' }}>
          <p style={{ color: 'white', fontSize: '15px', lineHeight: '1.5', margin: 0 }}>
            Your request to access the platform is currently under review.
            You will be notified once your account has been approved and provisioned.
          </p>
        </div>

        <div className="auth-links-center">
          <a href="/login" style={{ color: '#5bc0de', textDecoration: 'underline' }}>Return to Login</a>
        </div>
      </div>
    </div>
  );
}
