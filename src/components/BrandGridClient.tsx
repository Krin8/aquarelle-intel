'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getFreshnessLabel } from '@/lib/normalizer/confidence-scorer';
import { scrapeBrand } from '@/actions/scrape-actions';
import { deleteBrands } from '@/actions/brand-actions';
import { useRouter } from 'next/navigation';
import { ApiKeyModal } from './ApiKeyModal';

type BrandType = {
  id: string;
  name: string;
  website: string;
  status: string;
  region: string;
  countryOfOrigin: string | null;
  segment: string | null;
  dataFreshness: number;
  matchScore: number | null;
  marketGrade: string | null;
  storesCount: number | null;
  retailPriceMensShirt: string | null;
  _count: { contacts: number; aiAnalyses: number };
};

function getGradeDetails(gradeStr: string | null) {
  if (!gradeStr) return null;
  const grade = gradeStr.toUpperCase();
  if (grade === 'A+' || grade === 'A') return { label: grade, color: '#065f46', bg: '#d1fae5', border: '#34d399' };
  if (grade === 'B') return { label: grade, color: '#92400e', bg: '#fef3c7', border: '#fbbf24' };
  if (grade === 'C') return { label: grade, color: '#1e3a8a', bg: '#dbeafe', border: '#60a5fa' };
  return { label: grade, color: '#991b1b', bg: '#fee2e2', border: '#f87171' };
}

function getPriceGrade(priceStr: string | null, marketGrade: string | null) {
  if (marketGrade) return getGradeDetails(marketGrade);
  if (!priceStr) return null;
  const cleanPriceStr = priceStr.replace(/,/g, '');
  const matches = cleanPriceStr.match(/\d+(\.\d+)?/g);
  if (!matches) return null;
  const numbers = matches.map(Number);
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;

  if (avg >= 120) return getGradeDetails('A+');
  if (avg >= 80) return getGradeDetails('A');
  if (avg >= 50) return getGradeDetails('B');
  if (avg >= 25) return getGradeDetails('C');
  return getGradeDetails('D');
}

export function BrandGridClient({ brands }: { brands: BrandType[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

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
      try {
        const result = await scrapeBrand(idsArray[i], { useDataProvider: false, useLinkedin: false });
        if (result?.error === 'API_KEYS_EXHAUSTED') {
          setIsScraping(false);
          setShowApiKeyModal(true);
          return;
        }
      } catch (e: any) {
        if (e.message === 'API_KEYS_EXHAUSTED') {
          setIsScraping(false);
          setShowApiKeyModal(true);
          return;
        }
      }
    }

    setIsScraping(false);
    setSelectedIds(new Set());
    router.refresh();
  }

  async function handleBatchDelete() {
    if (selectedIds.size === 0) return;
    
    // First confirmation
    const confirm1 = window.confirm(`Are you sure you want to delete ${selectedIds.size} brands? This action cannot be undone.`);
    if (!confirm1) return;
    
    // Second confirmation
    const confirm2 = window.confirm(`FINAL WARNING: You are about to permanently delete ${selectedIds.size} brands. Type "OK" or click OK to proceed.`);
    if (!confirm2) return;

    setIsScraping(true); // Re-using this loading state for simplicity
    
    try {
      const idsArray = Array.from(selectedIds);
      await deleteBrands(idsArray);
    } catch (e) {
      console.error('Failed to delete brands:', e);
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
                background: isSelected ? 'var(--bg-hover)' : 'var(--bg-surface)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${isSelected ? 'var(--accent-indigo)' : 'var(--border-subtle)'}`,
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
                <div style={{ flex: '1.5', minWidth: '160px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>{brand.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {brand.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </div>
                </div>

                <div style={{ flex: '4', display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>{brand.countryOfOrigin || 'Unknown'}</span>
                  {brand.segment && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>{brand.segment}</span>}
                  
                  {(() => {
                    const gradeInfo = getPriceGrade(brand.retailPriceMensShirt, brand.marketGrade);
                    return gradeInfo ? (
                      <span style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: '13px',
                        width: '26px', height: '26px',
                        borderRadius: '6px',
                        color: gradeInfo.color,
                        backgroundColor: gradeInfo.bg,
                        border: `2px solid ${gradeInfo.border}`,
                        whiteSpace: 'nowrap',
                        marginRight: '8px'
                      }}>
                        {gradeInfo.label}
                      </span>
                    ) : null;
                  })()}

                  {brand.storesCount ? (
                    <span style={{ 
                      display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                      padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
                      backgroundColor: brand.storesCount > 500 ? '#dcfce7' : brand.storesCount > 150 ? '#fef3c7' : '#dbeafe',
                      color: brand.storesCount > 500 ? '#166534' : brand.storesCount > 150 ? '#92400e' : '#1e3a8a',
                      border: `1px solid ${brand.storesCount > 500 ? '#bbf7d0' : brand.storesCount > 150 ? '#fde68a' : '#bfdbfe'}`
                    }}>
                      Size: {brand.storesCount > 500 ? 'Large' : brand.storesCount > 150 ? 'Medium' : 'Small'} ({brand.storesCount})
                    </span>
                  ) : null}
                  {brand.retailPriceMensShirt && (
                    <span style={{ 
                      display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap',
                      padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 500,
                      backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0'
                    }}>
                      {brand.retailPriceMensShirt}
                    </span>
                  )}
                </div>

                <div style={{ flex: '1', minWidth: '100px', display: 'flex', justifyContent: 'center' }}>
                  <span className={`status-badge ${brand.status}`}>{brand.status}</span>
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

      <ApiKeyModal 
        isOpen={showApiKeyModal} 
        onSave={() => {
          setShowApiKeyModal(false);
          handleBatchScrape(); // Auto resume
        }} 
        onCancel={() => setShowApiKeyModal(false)} 
      />

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          padding: '16px 24px',
          boxShadow: 'var(--shadow-glow-indigo), var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-xl)',
          zIndex: 9999,
          animation: 'slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{selectedIds.size} brands selected</span>
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
            <button
              className="btn btn-danger"
              style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#dc2626' }}
              onClick={handleBatchDelete}
              disabled={isScraping}
            >
              Delete Selected 🗑️
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
