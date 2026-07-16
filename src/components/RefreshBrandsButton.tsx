'use client';

import { useState, useEffect } from 'react';
import { bulkScrapeBrands, getBulkScrapeProgress } from '@/actions/scrape-actions';

export function RefreshBrandsButton() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number; currentBrand: string; isScraping: boolean } | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    // Check progress every 2 seconds
    const checkProgress = async () => {
      try {
        const data = await getBulkScrapeProgress();
        if (data.isScraping) {
          setProgress(data);
          setLoading(true);
        } else {
          setProgress(null);
          setLoading(false);
        }
      } catch (e) {
        // silently ignore polling errors
      }
    };

    // Initial check
    checkProgress();
    
    // Poll loop
    interval = setInterval(checkProgress, 2000);

    return () => clearInterval(interval);
  }, []);

  async function handleRefresh() {
    setLoading(true);
    try {
      await bulkScrapeBrands();
    } catch (e) {
      console.error('Failed to trigger bulk scrape:', e);
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginRight: 'var(--space-md)' }}>
      {progress && progress.isScraping && (
        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', color: 'var(--text-secondary)', minWidth: '150px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
              {progress.currentBrand || 'Initializing...'}
            </span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: 'var(--bg-secondary)', borderRadius: '2px', overflow: 'hidden' }}>
            <div 
              style={{ 
                height: '100%', 
                background: 'var(--accent-emerald)', 
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                transition: 'width 0.3s ease'
              }} 
            />
          </div>
        </div>
      )}
      <button 
        onClick={handleRefresh} 
        disabled={loading} 
        className="btn btn-secondary"
      >
        {loading ? 'Scraping in Background...' : '♻️ Refresh All'}
      </button>
    </div>
  );
}
