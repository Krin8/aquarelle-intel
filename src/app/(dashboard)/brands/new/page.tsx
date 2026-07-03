'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrand } from '@/actions/brand-actions';
import { scrapeBrand } from '@/actions/scrape-actions';
import { CountryAutocomplete } from '@/components/CountryAutocomplete';

const REGIONS = [
  'Global', 'Middle East', 'Europe', 'North America', 'South Asia',
  'Southeast Asia', 'East Asia', 'Africa', 'Latin America', 'Oceania',
];

const SEGMENTS = [
  { value: '', label: 'Auto-detect (AI will determine)' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'premium', label: 'Premium' },
  { value: 'mid-range', label: 'Mid-Range' },
  { value: 'value', label: 'Value' },
  { value: 'fast-fashion', label: 'Fast Fashion' },
];

type PipelineStage = 'idle' | 'creating' | 'scraping' | 'done' | 'error';

export default function NewBrandPage() {
  const router = useRouter();
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [error, setError] = useState('');
  const [scrapeResult, setScrapeResult] = useState<{
    title?: string;
    emailsFound?: number;
    phonesFound?: number;
    contentLength?: number;
  } | null>(null);
  const [country, setCountry] = useState('');

  async function handleSubmit(formData: FormData) {
    setError('');
    setStage('creating');

    const result = await createBrand(formData);
    if (result.error) {
      setError(result.error);
      setStage('error');
      return;
    }

    if (result.brandId) {
      setStage('scraping');
      const scrapeRes = await scrapeBrand(result.brandId);

      if (scrapeRes.error) {
        // Brand was created but scrape failed — still navigate
        setError(`Brand created but scraping failed: ${scrapeRes.error}`);
        setStage('done');
        setTimeout(() => router.push(`/brands/${result.brandId}`), 1500);
        return;
      }

      setScrapeResult((scrapeRes as any).content || null);
      setStage('done');
      setTimeout(() => router.push(`/brands/${result.brandId}`), 2000);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Add New Brand</h1>
          <p className="page-subtitle">
            Enter a brand&apos;s website to begin intelligence gathering
          </p>
        </div>
      </div>

      {stage !== 'idle' && stage !== 'error' && (
        <div className="pipeline-loader animate-fade-in" style={{ marginBottom: 'var(--space-xl)' }}>
          <div className="pipeline-steps">
            <div className={`pipeline-step ${stage === 'creating' ? 'active' : 'completed'}`}>
              <div className="pipeline-step-icon">📝</div>
              <span className="pipeline-step-label">Create</span>
            </div>
            <div className={`pipeline-connector ${stage !== 'creating' ? 'completed' : ''}`}></div>
            <div className={`pipeline-step ${stage === 'scraping' ? 'active' : stage === 'done' ? 'completed' : ''}`}>
              <div className="pipeline-step-icon">🔍</div>
              <span className="pipeline-step-label">Scrape</span>
            </div>
            <div className={`pipeline-connector ${stage === 'done' ? 'completed' : ''}`}></div>
            <div className={`pipeline-step ${stage === 'done' ? 'completed' : ''}`}>
              <div className="pipeline-step-icon">✓</div>
              <span className="pipeline-step-label">Done</span>
            </div>
          </div>
          <div className="pipeline-status-text">
            {stage === 'creating' && 'Creating brand entry...'}
            {stage === 'scraping' && 'Scraping website content...'}
            {stage === 'done' && scrapeResult && (
              <>
                ✓ Found: {scrapeResult.title || 'Untitled'} · {scrapeResult.emailsFound || 0} emails · {scrapeResult.phonesFound || 0} phones
              </>
            )}
            {stage === 'done' && !scrapeResult && '✓ Brand created. Redirecting...'}
          </div>
        </div>
      )}

      {error && (
        <div className="card animate-fade-in" style={{
          marginBottom: 'var(--space-lg)',
          borderColor: 'var(--accent-rose)',
          background: 'var(--accent-rose-glow)',
        }}>
          <p style={{ color: 'var(--accent-rose)', fontSize: '14px' }}>⚠ {error}</p>
        </div>
      )}

      <div className="card" style={{ maxWidth: '600px' }}>
        <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="input-group">
            <label className="input-label" htmlFor="name">Brand Name *</label>
            <input
              className="input"
              id="name"
              name="name"
              type="text"
              placeholder="e.g. Zara, Uniqlo, Reformation"
              required
              disabled={stage !== 'idle' && stage !== 'error'}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="website">Website URL *</label>
            <input
              className="input"
              id="website"
              name="website"
              type="text"
              placeholder="e.g. https://www.brand.com"
              required
              disabled={stage !== 'idle' && stage !== 'error'}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="region">Region</label>
            <select className="select" id="region" name="region" disabled={stage !== 'idle' && stage !== 'error'}>
              {REGIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="country">Country</label>
            <CountryAutocomplete 
              id="country"
              name="country"
              value={country}
              onChange={setCountry}
              disabled={stage !== 'idle' && stage !== 'error'}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="segment">Segment</label>
            <select className="select" id="segment" name="segment" disabled={stage !== 'idle' && stage !== 'error'}>
              {SEGMENTS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={stage !== 'idle' && stage !== 'error'}
            style={{ alignSelf: 'flex-start' }}
          >
            {stage === 'idle' || stage === 'error' ? (
              <>✚ Add Brand & Scrape</>
            ) : (
              <><span className="spinner"></span> Processing...</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
