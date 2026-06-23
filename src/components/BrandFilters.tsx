'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const STATUSES = ['all', 'discovered', 'researching', 'analyzed', 'qualified', 'rejected'];

export function BrandFilters({
  currentStatus,
  currentRegion,
  currentSearch,
  regions,
}: {
  currentStatus?: string;
  currentRegion?: string;
  currentSearch?: string;
  regions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'all') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/brands?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div>
      <div className="search-bar">
        <span className="search-bar-icon">🔍</span>
        <input
          type="text"
          placeholder="Search brands..."
          defaultValue={currentSearch}
          onChange={(e) => {
            const timeout = setTimeout(() => updateFilter('search', e.target.value), 300);
            return () => clearTimeout(timeout);
          }}
        />
      </div>

      <div className="filter-chips">
        {STATUSES.map((status) => (
          <button
            key={status}
            className={`filter-chip ${(currentStatus || 'all') === status ? 'active' : ''}`}
            onClick={() => updateFilter('status', status)}
          >
            {status === 'all' ? 'All' : status}
          </button>
        ))}
        {regions.length > 1 && (
          <>
            <span style={{ width: '1px', background: 'var(--border-subtle)', margin: '0 4px' }}></span>
            <button
              className={`filter-chip ${!currentRegion || currentRegion === 'all' ? 'active' : ''}`}
              onClick={() => updateFilter('region', 'all')}
            >
              All Regions
            </button>
            {regions.map((region) => (
              <button
                key={region}
                className={`filter-chip ${currentRegion === region ? 'active' : ''}`}
                onClick={() => updateFilter('region', region)}
              >
                {region}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
