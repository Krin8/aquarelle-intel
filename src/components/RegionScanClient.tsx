'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { startRegionScan, cancelRegionScan } from '@/actions/region-actions';
import { CountryAutocomplete } from '@/components/CountryAutocomplete';

interface ScanProgress {
  region: string;
  phase: 'researching_fairs' | 'discovering' | 'processing' | 'done' | 'error';
  totalBrands: number;
  currentIndex: number;
  currentBrand: string;
  currentStep: string;
  isScanning: boolean;
  errors: string[];
  completedBrands: string[];
  startedAt: number;
}

interface RegionBrand {
  id: string;
  name: string;
  website: string;
  region: string;
  status: string;
  matchScore: number | null;
  pipelineScore: number | null;
  description: string | null;
  segment: string | null;
  _count: {
    contacts: number;
    aiAnalyses: number;
  };
}

const PRESET_REGIONS = [
  'Southeast Asia',
  'South Asia',
  'Europe',
  'North America',
  'Middle East',
  'Australia',
  'East Asia',
  'Africa',
  'Latin America',
];

const STEP_LABELS: Record<string, string> = {
  discovery: 'Discovering brands',
  creating: 'Creating brand',
  scraping: 'Scraping website',
  analyzing: 'AI analysis',
  gap_detection: 'Gap detection',
  pipeline_scoring: 'Pipeline scoring',
};

export function RegionScanClient({ initialBrands }: { initialBrands: RegionBrand[] }) {
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('all');
  const [maxBrands, setMaxBrands] = useState(20);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [brands, setBrands] = useState<RegionBrand[]>(initialBrands);
  const [isStarting, setIsStarting] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Filters
  const [minPipelineScore, setMinPipelineScore] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'pipelineScore' | 'matchScore' | 'name'>('pipelineScore');

  // Poll progress while scanning
  useEffect(() => {
    if (!progress?.isScanning) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/region-scan/progress');
        const data: ScanProgress = await res.json();
        setProgress(data);

        if (!data.isScanning) {
          clearInterval(interval);
          // Refresh brands list
          window.location.reload();
        }
      } catch {
        // polling failed, will retry
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [progress?.isScanning]);

  const handleStartScan = async () => {
    if (!region.trim()) {
      setScanError('Please enter or select a region.');
      return;
    }

    setIsStarting(true);
    setScanError(null);

    try {
      const result = await startRegionScan(region.trim(), maxBrands, country.trim() || undefined, category);
      if (result.error) {
        setScanError(result.error);
        setIsStarting(false);
        return;
      }

      // Start polling
      setProgress({
        region: region.trim(),
        phase: 'discovering',
        totalBrands: 0,
        currentIndex: 0,
        currentBrand: 'Searching...',
        currentStep: 'discovery',
        isScanning: true,
        errors: [],
        completedBrands: [],
        startedAt: Date.now(),
      });
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Failed to start scan');
    }

    setIsStarting(false);
  };

  const handleCancel = async () => {
    await cancelRegionScan();
    setProgress(null);
  };

  // Filter and sort brands
  const filteredBrands = brands
    .filter(b => {
      if (minPipelineScore > 0 && (b.pipelineScore === null || b.pipelineScore < minPipelineScore)) {
        return false;
      }
      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'pipelineScore') return (b.pipelineScore || 0) - (a.pipelineScore || 0);
      if (sortBy === 'matchScore') return (b.matchScore || 0) - (a.matchScore || 0);
      return 0;
    });

  const progressPercent = progress?.totalBrands
    ? Math.round((progress.currentIndex / progress.totalBrands) * 100)
    : 0;

  const elapsed = progress?.startedAt
    ? Math.round((Date.now() - progress.startedAt) / 1000)
    : 0;
  const elapsedStr = elapsed > 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

  return (
    <div>
      {/* ─── SCAN CONTROLS ──────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
          🔍 Region Discovery Scanner
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
          Discover apparel brands in a region and automatically run the full analysis pipeline.
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          {PRESET_REGIONS.map(r => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`btn btn-sm ${region === r ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '12px' }}
            >
              {r}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Region
            </label>
            <input
              type="text"
              value={region}
              onChange={e => setRegion(e.target.value)}
              placeholder="e.g., Southeast Asia, Europe..."
              className="input"
              style={{ width: '100%' }}
              disabled={progress?.isScanning}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Country (Optional Target)
            </label>
            <CountryAutocomplete 
              value={country}
              onChange={setCountry}
              disabled={progress?.isScanning}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Category (Optional)
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="input"
              style={{ width: '100%' }}
              disabled={progress?.isScanning}
            >
              <option value="all">Any Category</option>
              <option value="menswear">Menswear</option>
              <option value="womenswear">Womenswear</option>
              <option value="kidswear">Kidswear</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              Max Brands
            </label>
            <input
              type="number"
              value={maxBrands}
              onChange={e => setMaxBrands(Math.max(1, parseInt(e.target.value) || 1))}
              className="input"
              style={{ width: '80px' }}
              min={1}
              disabled={progress?.isScanning}
            />
          </div>
          <button
            onClick={handleStartScan}
            className="btn btn-primary"
            disabled={isStarting || progress?.isScanning}
          >
            {isStarting ? 'Starting...' : progress?.isScanning ? 'Scanning...' : '🚀 Start Scan'}
          </button>
          {progress?.isScanning && (
            <button onClick={handleCancel} className="btn btn-ghost" style={{ color: 'var(--accent-rose)' }}>
              Cancel
            </button>
          )}
        </div>

        {scanError && (
          <div style={{ marginTop: 'var(--space-sm)', color: 'var(--accent-rose)', fontSize: '13px' }}>
            ⚠ {scanError}
          </div>
        )}
      </div>

      {/* ─── PROGRESS TRACKER ─────────────────────────────────────────────── */}
      {progress?.isScanning && (
        <div className="card animate-fade-in" style={{ marginBottom: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600 }}>
              Scanning: {progress.region}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {elapsedStr} elapsed
            </span>
          </div>

          {progress.phase === 'researching_fairs' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <div className="scan-pulse" style={{ background: 'var(--accent-purple)' }} />
              <span style={{ fontSize: '13px', color: 'var(--accent-purple)' }}>
                Researching industry databases & trade fairs in {progress.region}...
              </span>
            </div>
          ) : progress.phase === 'discovering' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <div className="scan-pulse" />
              <span style={{ fontSize: '13px', color: 'var(--accent-cyan)' }}>
                Discovering brands in {progress.region}...
              </span>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div style={{
                width: '100%',
                height: '8px',
                background: 'var(--bg-surface)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: 'var(--space-sm)',
              }}>
                <div style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: 'var(--text-primary)',
                  borderRadius: '4px',
                  transition: 'width 0.5s ease',
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>
                  {progress.currentIndex} / {progress.totalBrands} brands
                  {progress.currentBrand !== 'Done' && (
                    <> · <strong>{progress.currentBrand}</strong> — {STEP_LABELS[progress.currentStep] || progress.currentStep}</>
                  )}
                </span>
                <span>{progressPercent}%</span>
              </div>
            </>
          )}

          {/* Completed brands */}
          {progress.completedBrands.length > 0 && (
            <div style={{ marginTop: 'var(--space-sm)', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {progress.completedBrands.map(name => (
                <span key={name} style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  background: 'var(--bg-hover)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  ✓ {name}
                </span>
              ))}
            </div>
          )}

          {/* Errors */}
          {progress.errors.length > 0 && (
            <div style={{ marginTop: 'var(--space-sm)' }}>
              {progress.errors.slice(-3).map((err, i) => (
                <div key={i} style={{ fontSize: '11px', color: 'var(--accent-rose)', marginTop: '2px' }}>
                  ⚠ {err}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── RESULTS + FILTERS ────────────────────────────────────────────── */}
      {brands.length > 0 && (
        <>
          {/* Filter bar */}
          <div className="card" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  Min Pipeline Score:
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={minPipelineScore}
                  onChange={e => setMinPipelineScore(parseInt(e.target.value))}
                  style={{ width: '120px' }}
                />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '30px' }}>
                  {minPipelineScore}%
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="input"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  <option value="all">All</option>
                  <option value="discovered">Discovered</option>
                  <option value="analyzed">Analyzed</option>
                  <option value="qualified">Qualified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sort:</label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="input"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  <option value="pipelineScore">Pipeline Score</option>
                  <option value="matchScore">Match Score</option>
                  <option value="name">Name</option>
                </select>
              </div>

              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {filteredBrands.length} of {brands.length} brands
              </span>
            </div>
          </div>

          {/* Results table */}
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={thStyle}>Brand</th>
                    <th style={thStyle}>Segment</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Match Score</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Pipeline Score</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Contacts</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Analyses</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBrands.map(brand => (
                    <tr key={brand.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={tdStyle}>
                        <div>
                          <strong>{brand.name}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {brand.website}
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {brand.segment && (
                          <span className={`status-badge`} style={{ fontSize: '11px' }}>
                            {brand.segment}
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span className={`status-badge ${brand.status}`}>
                          {brand.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <ScoreBadge score={brand.matchScore} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <ScoreBadge score={brand.pipelineScore} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {brand._count.contacts}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {brand._count.aiAnalyses}
                      </td>
                      <td style={tdStyle}>
                        <Link href={`/brands/${brand.id}`} className="btn btn-ghost btn-sm">
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredBrands.length === 0 && (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)', fontSize: '13px' }}>
                No brands match current filters. Try lowering the minimum pipeline score.
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state when no brands and no scan running */}
      {brands.length === 0 && !progress?.isScanning && (
        <div className="empty-state">
          <div className="empty-state-icon">🌍</div>
          <div className="empty-state-title">No region scan results yet</div>
          <p className="empty-state-description">
            Select a region above and start a scan to discover apparel brands.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>;
  }

  const color = score >= 70
    ? 'var(--accent-emerald)'
    : score >= 40
      ? 'var(--accent-amber)'
      : 'var(--accent-rose)';

  return (
    <span style={{
      fontWeight: 600,
      color,
      fontSize: '13px',
    }}>
      {score}%
    </span>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
};
