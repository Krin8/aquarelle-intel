import Link from 'next/link';
import prisma from '@/lib/db';

export default async function DashboardPage() {
  const totalBrands = await prisma.brand.count();
  const brandsByStatus = await prisma.brand.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  const totalContacts = await prisma.contact.count();
  const totalAnalyses = await prisma.aIAnalysis.count();
  const recentBrands = await prisma.brand.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { aiAnalyses: true, contacts: true } } },
  });
  const recentAnalyses = await prisma.aIAnalysis.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { brand: { select: { name: true } } },
  });
  const regionCounts = await prisma.brand.groupBy({
    by: ['region'],
    _count: { id: true },
  });

  const statusMap: Record<string, number> = {};
  brandsByStatus.forEach((s) => {
    statusMap[s.status] = s._count.id;
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Intelligence Dashboard</h1>
          <p className="page-subtitle">
            Market intelligence overview for Aquarelle&apos;s brand discovery pipeline
          </p>
        </div>
        <Link href="/brands/new" className="btn btn-primary">
          <span>✚</span> Add Brand
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid animate-fade-in">
        <div className="stat-card">
          <span className="stat-card-label">Total Brands</span>
          <span className="stat-card-value">{totalBrands}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Qualified</span>
          <span className="stat-card-value" style={{ color: 'var(--accent-emerald)' }}>
            {statusMap['qualified'] || 0}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Contacts Found</span>
          <span className="stat-card-value">{totalContacts}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">AI Analyses</span>
          <span className="stat-card-value" style={{ color: 'var(--accent-indigo)' }}>
            {totalAnalyses}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Regions Active</span>
          <span className="stat-card-value">{regionCounts.length}</span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
        {/* Recent Brands */}
        <div className="card animate-fade-in animate-fade-in-delay-1">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600 }}>
              Recent Brands
            </h2>
            <Link href="/brands" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          {recentBrands.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
              <div className="empty-state-icon">❖</div>
              <div className="empty-state-title">No brands yet</div>
              <p className="empty-state-description">
                Add your first brand to start building intelligence.
              </p>
              <Link href="/brands/new" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-sm)' }}>
                Add Brand
              </Link>
            </div>
          ) : (
            <div className="activity-feed">
              {recentBrands.map((brand) => (
                <Link href={`/brands/${brand.id}`} key={brand.id} className="activity-item">
                  <div className="activity-icon status">❖</div>
                  <div className="activity-content">
                    <div className="activity-text">
                      <strong>{brand.name}</strong>
                      <span className={`status-badge ${brand.status}`} style={{ marginLeft: '8px' }}>
                        {brand.status}
                      </span>
                    </div>
                    <div className="activity-time">
                      {brand.region} · {brand._count.contacts} contacts · {brand._count.aiAnalyses} analyses
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent AI Analyses */}
        <div className="card animate-fade-in animate-fade-in-delay-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600 }}>
              Recent AI Insights
            </h2>
            <Link href="/intelligence" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          {recentAnalyses.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
              <div className="empty-state-icon">✦</div>
              <div className="empty-state-title">No insights yet</div>
              <p className="empty-state-description">
                AI analyses will appear here once you add and analyze brands.
              </p>
            </div>
          ) : (
            <div className="activity-feed">
              {recentAnalyses.map((analysis) => (
                <div key={analysis.id} className="activity-item">
                  <div className="activity-icon analysis">✦</div>
                  <div className="activity-content">
                    <div className="activity-text">
                      <strong>{analysis.brand.name}</strong>
                      <span className={`insight-card-type ${analysis.analysisType}`} style={{ marginLeft: '8px' }}>
                        {analysis.analysisType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="activity-time">
                      {analysis.modelUsed} · {new Date(analysis.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status Pipeline */}
      {totalBrands > 0 && (
        <div className="card animate-fade-in animate-fade-in-delay-3" style={{ marginTop: 'var(--space-lg)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
            Brand Pipeline
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            {['discovered', 'researching', 'analyzed', 'qualified', 'rejected'].map((status) => (
              <div key={status} style={{
                flex: '1 1 150px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                padding: 'var(--space-md)',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
              }}>
                <span className={`status-badge ${status}`}>{status}</span>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '28px',
                  fontWeight: 700,
                }}>
                  {statusMap[status] || 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
