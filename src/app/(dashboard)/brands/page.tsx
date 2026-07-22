import Link from 'next/link';
import { Suspense } from 'react';
import { getBrands } from '@/actions/brand-actions';
import { BrandFilters } from '@/components/BrandFilters';
import { getFreshnessLabel } from '@/lib/normalizer/confidence-scorer';
import { RefreshBrandsButton } from '@/components/RefreshBrandsButton';
import { BrandGridClient } from '@/components/BrandGridClient';

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; region?: string; country?: string; search?: string; minScore?: string; hasContacts?: string; marketGrade?: string; storeSize?: string }>;
}) {
  const params = await searchParams;
  console.log('[DEBUG] BrandsPage rendering with params:', params);
  const brands = await getBrands({
    status: params.status,
    region: params.region,
    country: params.country,
    search: params.search,
    minScore: params.minScore,
    hasContacts: params.hasContacts,
    marketGrade: params.marketGrade,
    storeSize: params.storeSize,
  });

  const countries = [...new Set(brands.map(b => b.countryOfOrigin).filter(Boolean))] as string[];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Prospect Intelligence</h1>
          <p className="page-subtitle">
            {brands.length} brand{brands.length !== 1 ? 's' : ''} tracked across {countries.length} countr{countries.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RefreshBrandsButton />
          <Link href="/brands/new" className="btn btn-primary">
            <span>✚</span> Add Brand
          </Link>
        </div>
      </div>

      <Suspense fallback={<div style={{ padding: '20px', opacity: 0.5 }}>Loading filters...</div>}>
        <BrandFilters
          currentStatus={params.status}
          currentRegion={params.region}
          currentCountry={params.country}
          currentSearch={params.search}
          countries={countries}
        />
      </Suspense>

      {brands.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">❖</div>
          <div className="empty-state-title">No brands found</div>
          <p className="empty-state-description">
            {params.status || params.region || params.country || params.search
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
