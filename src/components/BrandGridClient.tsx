'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getFreshnessLabel } from '@/lib/normalizer/confidence-scorer';
import { scrapeBrand } from '@/actions/scrape-actions';
import { useRouter } from 'next/navigation';

type BrandType = {
  id: string;
  name: string;
  website: string;
  status: string;
  region: string;
  segment: string | null;
  dataFreshness: number;
  matchScore: number | null;
  _count: { contacts: number; aiAnalyses: number };
};

export function BrandGridClient({ brands }: { brands: BrandType[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function selectAll() {
    if (selectedIds.size === brands.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(brands.map(b => b.id)));
    }
  }

  async function handleBatchScrape() {
    if (selectedIds.size === 0) return;
    setIsScraping(true);
    setScrapeProgress({ current: 0, total: selectedIds.size });

    const idsArray = Array.from(selectedIds);
    for (let i = 0; i < idsArray.length; i++) {
      setScrapeProgress({ current: i + 1, total: idsArray.length });
      // Scrape sequentially to avoid overwhelming rate limits/browser memory
      await scrapeBrand(idsArray[i], { useDataProvider: false, useLinkedin: false });
    }

    setIsScraping(false);
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-md)', gap: 'var(--space-sm)' }}>
        <button
          onClick={selectAll}
          className="btn btn-secondary btn-sm"
        >
          {selectedIds.size === brands.length ? 'Deselect All' : 'Select All'}
        </button>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {selectedIds.size} selected
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {brands.map((brand, i) => {
          const freshness = getFreshnessLabel(brand.dataFreshness);
          const isSelected = selectedIds.has(brand.id);

          return (
            <div
              key={brand.id}
              className={`animate-fade-in animate-fade-in-delay-${Math.min(i + 1, 4)}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-card)',
                border: `1px solid ${isSelected ? 'var(--accent-indigo)' : 'var(--border-color)'}`,
                borderRadius: '8px',
                gap: '16px',
                transition: 'all 0.2s ease'
              }}
            >
              <div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(brand.id)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </div>

              <Link href={`/brands/${brand.id}`} style={{ display: 'flex', flex: 1, alignItems: 'center', textDecoration: 'none', color: 'inherit', gap: '24px' }}>
                <div style={{ flex: '2', minWidth: '200px' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>{brand.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {brand.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </div>
                </div>

                <div style={{ flex: '1', minWidth: '100px' }}>
                  <span className={`status-badge ${brand.status}`}>{brand.status}</span>
                </div>

                <div style={{ flex: '2', display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>◉ {brand.region}</span>
                  {brand.segment && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>◈ {brand.segment}</span>}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>👤 {brand._count.contacts}</span>
                </div>

                <div style={{ flex: '1', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  {brand.matchScore !== null ? (
                    <span style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: brand.matchScore >= 70
                        ? 'var(--accent-emerald)'
                        : brand.matchScore >= 40
                          ? 'var(--accent-amber)'
                          : 'var(--accent-rose)',
                    }}>
                      {brand.matchScore}% Match
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Unscored</span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span className={`freshness-dot ${freshness}`} style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', marginRight: '4px' }}></span>
                    {freshness}
                  </span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(30, 30, 35, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--accent-indigo)',
          borderRadius: '12px',
          padding: '16px 24px',
          boxShadow: '0 12px 48px rgba(99, 102, 241, 0.25), 0 0 0 1px rgba(255,255,255,0.05) inset',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-xl)',
          zIndex: 9999,
          animation: 'slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '15px', color: '#ffffff' }}>{selectedIds.size} brands selected</span>
            {isScraping && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Scraping {scrapeProgress.current} of {scrapeProgress.total}...
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button
              className="btn btn-primary"
              onClick={handleBatchScrape}
              disabled={isScraping}
            >
              {isScraping ? <><span className="spinner"></span> Processing...</> : 'Batch Scrape 🔍'}
            </button>
            <a
              href={`/api/export?type=contacts&${Array.from(selectedIds).map(id => `brandId=${id}`).join('&')}`}
              target="_blank"
              className="btn btn-secondary"
              style={{ textDecoration: 'none' }}
            >
              Export CSV 📥
            </a>
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedIds(new Set())}
              disabled={isScraping}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
