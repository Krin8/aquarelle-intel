'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef } from 'react';

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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'all') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const newUrl = `/brands?${params.toString()}`;
      console.log('Navigating to URL:', newUrl);
      router.replace(newUrl, { scroll: false });
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
            const val = e.target.value;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => updateFilter('search', val), 300);
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
        
        <span style={{ width: '1px', background: 'var(--border-subtle)', margin: '0 4px' }}></span>
        
        <select 
          className="filter-chip"
          style={{ background: 'transparent', cursor: 'pointer' }}
          value={searchParams.get('minScore') || ''}
          onChange={(e) => updateFilter('minScore', e.target.value)}
        >
          <option value="">Any Match Score</option>
          <option value="50">Score &gt; 50%</option>
          <option value="80">Score &gt; 80%</option>
        </select>

        <button
          className={`filter-chip ${searchParams.get('hasContacts') === 'true' ? 'active' : ''}`}
          onClick={() => updateFilter('hasContacts', searchParams.get('hasContacts') === 'true' ? '' : 'true')}
        >
          Has Contacts 👤
        </button>
      </div>
    </div>
  );
}
