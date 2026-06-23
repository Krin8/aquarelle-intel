import Link from 'next/link';
import { getBrands } from '@/actions/brand-actions';
import { BrandFilters } from '@/components/BrandFilters';
import { getFreshnessLabel } from '@/lib/normalizer/confidence-scorer';
import { RefreshBrandsButton } from '@/components/RefreshBrandsButton';

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; region?: string; search?: string }>;
}) {
  const params = await searchParams;
  const brands = await getBrands({
    status: params.status,
    region: params.region,
    search: params.search,
  });

  const regions = [...new Set(brands.map(b => b.region))];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Brand Directory</h1>
          <p className="page-subtitle">
            {brands.length} brand{brands.length !== 1 ? 's' : ''} tracked across {regions.length} region{regions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RefreshBrandsButton />
          <Link href="/brands/new" className="btn btn-primary">
            <span>✚</span> Add Brand
          </Link>
        </div>
      </div>

      <BrandFilters
        currentStatus={params.status}
        currentRegion={params.region}
        currentSearch={params.search}
        regions={regions}
      />

      {brands.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">❖</div>
          <div className="empty-state-title">No brands found</div>
          <p className="empty-state-description">
            {params.status || params.region || params.search
              ? 'Try adjusting your filters.'
              : 'Add your first brand to start building market intelligence.'}
          </p>
          <Link href="/brands/new" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-sm)' }}>
            Add Brand
          </Link>
        </div>
      ) : (
        <div className="brand-grid">
          {brands.map((brand, i) => {
            const freshness = getFreshnessLabel(brand.dataFreshness);
            return (
              <Link
                href={`/brands/${brand.id}`}
                key={brand.id}
                className={`brand-card animate-fade-in animate-fade-in-delay-${Math.min(i + 1, 4)}`}
              >
                <div className="brand-card-header">
                  <div className="brand-card-info">
                    <span className="brand-card-name">{brand.name}</span>
                    <span className="brand-card-website">
                      {brand.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </span>
                  </div>
                  <span className={`status-badge ${brand.status}`}>{brand.status}</span>
                </div>

                <div className="brand-card-meta">
                  <span className="brand-card-meta-item">
                    <span className="brand-card-meta-icon">◉</span>
                    {brand.region}
                  </span>
                  {brand.segment && (
                    <span className="brand-card-meta-item">
                      <span className="brand-card-meta-icon">◈</span>
                      {brand.segment}
                    </span>
                  )}
                  <span className="brand-card-meta-item">
                    <span className="brand-card-meta-icon">👤</span>
                    {brand._count.contacts} contacts
                  </span>
                  <span className="brand-card-meta-item">
                    <span className="brand-card-meta-icon">✦</span>
                    {brand._count.aiAnalyses} analyses
                  </span>
                </div>

                <div className="brand-card-footer">
                  {brand.matchScore !== null ? (
                    <span className="brand-card-score" style={{
                      color: brand.matchScore >= 70
                        ? 'var(--accent-emerald)'
                        : brand.matchScore >= 40
                        ? 'var(--accent-amber)'
                        : 'var(--accent-rose)',
                    }}>
                      Match: {brand.matchScore}%
                    </span>
                  ) : (
                    <span className="brand-card-score" style={{ color: 'var(--text-muted)' }}>
                      Not scored
                    </span>
                  )}
                  <span className="brand-card-freshness">
                    <span className={`freshness-dot ${freshness}`}></span>
                    {' '}{freshness}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
