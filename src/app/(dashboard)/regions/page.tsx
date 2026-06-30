import Link from 'next/link';
import prisma from '@/lib/db';

export default async function RegionsPage() {
  const brands = await prisma.brand.findMany({
    select: {
      id: true,
      region: true,
      status: true,
      matchScore: true,
      dataFreshness: true,
    },
  });

  // Group brands by region
  const regionMap = new Map<string, typeof brands>();
  brands.forEach((brand) => {
    const existing = regionMap.get(brand.region) || [];
    existing.push(brand);
    regionMap.set(brand.region, existing);
  });

  const regions = Array.from(regionMap.entries())
    .map(([name, regionBrands]) => ({
      name,
      totalBrands: regionBrands.length,
      qualified: regionBrands.filter(b => b.status === 'qualified').length,
      analyzed: regionBrands.filter(b => b.status === 'analyzed').length,
      avgMatchScore: regionBrands.filter(b => b.matchScore !== null).length > 0
        ? Math.round(
            regionBrands
              .filter(b => b.matchScore !== null)
              .reduce((sum, b) => sum + (b.matchScore || 0), 0) /
            regionBrands.filter(b => b.matchScore !== null).length
          )
        : null,
      avgFreshness: Math.round(
        regionBrands.reduce((sum, b) => sum + b.dataFreshness, 0) / regionBrands.length
      ),
    }))
    .sort((a, b) => b.totalBrands - a.totalBrands);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Regions</h1>
          <p className="page-subtitle">
            Geographic targeting across {regions.length} region{regions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/regions/scan" className="btn btn-primary">
          <span>🔍</span> Scan Region
        </Link>
      </div>

      {regions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">◉</div>
          <div className="empty-state-title">No regions yet</div>
          <p className="empty-state-description">
            Regions appear automatically when you add brands with regional targeting.
          </p>
          <Link href="/brands/new" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-sm)' }}>
            Add Brand
          </Link>
        </div>
      ) : (
        <div className="region-grid">
          {regions.map((region, i) => (
            <Link
              key={region.name}
              href={`/brands?region=${encodeURIComponent(region.name)}`}
              className={`region-card animate-fade-in animate-fade-in-delay-${Math.min(i + 1, 4)}`}
            >
              <div className="region-card-name">
                <span style={{ marginRight: '8px' }}>◉</span>
                {region.name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {region.qualified > 0 && (
                  <span style={{ color: 'var(--accent-emerald)' }}>{region.qualified} qualified · </span>
                )}
                {region.analyzed > 0 && (
                  <span style={{ color: 'var(--accent-cyan)' }}>{region.analyzed} analyzed · </span>
                )}
                {region.totalBrands - region.qualified - region.analyzed > 0 && (
                  <span>{region.totalBrands - region.qualified - region.analyzed} in pipeline</span>
                )}
              </div>
              <div className="region-card-stats">
                <div className="region-card-stat">
                  <span className="region-card-stat-value">{region.totalBrands}</span>
                  <span className="region-card-stat-label">Brands</span>
                </div>
                <div className="region-card-stat">
                  <span className="region-card-stat-value" style={{
                    color: region.avgMatchScore !== null
                      ? region.avgMatchScore >= 70 ? 'var(--accent-emerald)' : region.avgMatchScore >= 40 ? 'var(--accent-amber)' : 'var(--accent-rose)'
                      : 'var(--text-muted)',
                  }}>
                    {region.avgMatchScore !== null ? `${region.avgMatchScore}%` : '—'}
                  </span>
                  <span className="region-card-stat-label">Avg Match</span>
                </div>
                <div className="region-card-stat">
                  <span className="region-card-stat-value" style={{
                    color: region.avgFreshness >= 70 ? 'var(--accent-emerald)' : region.avgFreshness >= 40 ? 'var(--accent-amber)' : 'var(--accent-rose)',
                  }}>
                    {region.avgFreshness}%
                  </span>
                  <span className="region-card-stat-label">Freshness</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
