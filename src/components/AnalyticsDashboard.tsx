'use client';

type Stats = {
  totalBrands: number;
  statusCounts: Record<string, number>;
  totalContacts: number;
  totalInsights: number;
  segmentCounts: Record<string, number>;
};

export function AnalyticsDashboard({ initialStats }: { initialStats: Stats }) {
  // Simple calculated metrics
  const qualifiedCount = initialStats.statusCounts['qualified'] || 0;
  const discoveredCount = initialStats.statusCounts['discovered'] || 0;
  
  const funnelSteps = [
    { label: 'Discovered', value: discoveredCount, color: 'var(--text-muted)' },
    { label: 'Researching', value: initialStats.statusCounts['researching'] || 0, color: 'var(--accent-amber)' },
    { label: 'Analyzed', value: initialStats.statusCounts['analyzed'] || 0, color: 'var(--accent-indigo)' },
    { label: 'Qualified', value: qualifiedCount, color: 'var(--accent-emerald)' },
  ];

  const maxFunnelValue = Math.max(...funnelSteps.map(s => s.value), 1);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Analytics & Dashboards</h1>
          <p className="page-subtitle">Platform overview and scraping metrics</p>
        </div>
      </div>

      {/* Top Level KPIs */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="stat-card">
          <span className="stat-card-label">Total Brands</span>
          <span className="stat-card-value">{initialStats.totalBrands}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Qualified Leads</span>
          <span className="stat-card-value" style={{ color: 'var(--accent-emerald)' }}>{qualifiedCount}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Contacts Extracted</span>
          <span className="stat-card-value" style={{ color: 'var(--accent-indigo)' }}>{initialStats.totalContacts}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">AI Insights Generated</span>
          <span className="stat-card-value" style={{ color: 'var(--accent-violet)' }}>{initialStats.totalInsights}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)' }}>
        {/* Funnel Chart */}
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>Lead Funnel</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {funnelSteps.map((step) => {
              const percentage = (step.value / maxFunnelValue) * 100;
              return (
                <div key={step.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500 }}>{step.label}</span>
                    <span>{step.value}</span>
                  </div>
                  <div style={{ width: '100%', height: '24px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        width: `${percentage}%`, 
                        background: step.color,
                        transition: 'width 1s ease-in-out'
                      }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Segments Breakdown */}
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>Brands by Segment</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {Object.entries(initialStats.segmentCounts).map(([segment, count]) => {
              const totalSegmented = Object.values(initialStats.segmentCounts).reduce((a, b) => a + b, 0) || 1;
              const percentage = Math.round((count / totalSegmented) * 100);
              return (
                <div key={segment} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent-violet)' }} />
                    <span style={{ fontSize: '14px', textTransform: 'capitalize' }}>{segment}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{count}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '30px', textAlign: 'right' }}>{percentage}%</span>
                  </div>
                </div>
              );
            })}
            {Object.keys(initialStats.segmentCounts).length === 0 && (
              <div className="empty-state" style={{ padding: 'var(--space-md)' }}>
                <p className="empty-state-description">No segments mapped yet. Analyze brands to populate this data.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
