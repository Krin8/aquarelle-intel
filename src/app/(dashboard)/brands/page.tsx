import Link from 'next/link';
import { getBrands } from '@/actions/brand-actions';
import { BrandFilters } from '@/components/BrandFilters';
import { getFreshnessLabel } from '@/lib/normalizer/confidence-scorer';
import { RefreshBrandsButton } from '@/components/RefreshBrandsButton';
import { BrandGridClient } from '@/components/BrandGridClient';

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; region?: string; search?: string; minScore?: string; hasContacts?: string }>;
}) {
  const params = await searchParams;
  const brands = await getBrands({
    status: params.status,
    region: params.region,
    search: params.search,
    minScore: params.minScore,
    hasContacts: params.hasContacts,
  });

  const regions = [...new Set(brands.map(b => b.region))];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Prospect Intelligence</h1>
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
        <BrandGridClient brands={brands} />
      )}
    </div>
  );
}
