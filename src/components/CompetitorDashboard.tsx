'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, Tooltip, Legend 
} from 'recharts';
import { getCompetitorsForBrand, discoverCompetitorsAction, deleteCompetitor, runCompetitorGapAnalysis, scrapeCompetitorBrandAction } from '@/actions/competitor-actions';
import { safeJsonParse } from '@/lib/utils/formatters';
import { CompanyOverviewTable } from './CompanyOverviewTable';

export function CompetitorDashboard({ brandId }: { brandId: string }) {
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [selectedComp, setSelectedComp] = useState<any | null>(null);
  const [isAnalyzingGaps, setIsAnalyzingGaps] = useState(false);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const fetchCompetitors = useCallback(async () => {
    const data = await getCompetitorsForBrand(brandId);
    setCompetitors(data);
    setSelectedComp((prevSelected: any) => {
      if (data.length > 0) {
        if (prevSelected) {
          const updated = data.find((c: any) => c.id === prevSelected.id);
          return updated || data[0];
        }
        return data[0];
      }
      return null;
    });
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    fetchCompetitors();
    // Simple polling just in case discovery is running in background
    const interval = setInterval(fetchCompetitors, 10000);
    return () => clearInterval(interval);
  }, [fetchCompetitors]);

  const handleRunGapAnalysis = async (competitorId: string) => {
    setIsAnalyzingGaps(true);
    try {
      await runCompetitorGapAnalysis(competitorId, brandId);
      await fetchCompetitors();
    } finally {
      setIsAnalyzingGaps(false);
    }
  };

  const handleScrapeCompetitor = async (competitorId: string) => {
    setScrapingId(competitorId);
    try {
      await scrapeCompetitorBrandAction(competitorId);
      await fetchCompetitors();
    } finally {
      setScrapingId(null);
    }
  };

  const safeJsonParse = (str: any, fallback: any = []) => {
    try {
      return str ? JSON.parse(str) : fallback;
    } catch {
      return fallback;
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    await discoverCompetitorsAction(brandId, 5); // Default to discovering 5
    alert('Competitor discovery started in the background. This will take a few minutes. Check back soon!');
    setDiscovering(false);
  };

  const handleDelete = async (compId: string) => {
    if (confirm('Delete this competitor profile?')) {
      await deleteCompetitor(compId, brandId);
      if (selectedComp?.id === compId) setSelectedComp(null);
      fetchCompetitors();
    }
  };

  // Prepare radar chart data
  const chartData = (selectedComp?.scores || []).map((s: any) => ({
    subject: s.metricName,
    A: s.score,
    fullMark: 100,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {/* Header Actions */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600 }}>Competitor Intelligence</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{competitors.length} competitors tracked</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleDiscover}
          disabled={discovering}
        >
          {discovering ? 'Initiating Discovery...' : '✦ Discover Competitors'}
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>Loading...</div>
      ) : competitors.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
          <div className="empty-state-icon">🛡️</div>
          <div className="empty-state-title">No competitors mapped</div>
          <p className="empty-state-description">Run the AI discovery engine to find and analyze competitors in this space.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--space-md)', alignItems: 'start' }}>
          
          {/* Competitor List sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {competitors.map(comp => (
              <div 
                key={comp.id} 
                className={`card ${selectedComp?.id === comp.id ? 'active' : ''}`}
                style={{ 
                  cursor: 'pointer', 
                  border: selectedComp?.id === comp.id ? '1px solid var(--accent-cyan)' : '1px solid transparent',
                  padding: 'var(--space-sm)',
                  position: 'relative'
                }}
                onClick={() => {
                  setSelectedComp(comp);
                  setShowAnalysis(false);
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{comp.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{comp.industry || 'Unknown Industry'}</div>
              </div>
            ))}
          </div>

          {/* Detailed View */}
          {selectedComp && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: 600, margin: 0 }}>
                      {selectedComp.name}
                    </h2>
                    <a href={selectedComp.website} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: 'var(--accent-cyan)', textDecoration: 'none' }}>
                      {selectedComp.website}
                    </a>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn btn-outline btn-sm" 
                      onClick={() => handleScrapeCompetitor(selectedComp.id)}
                      disabled={scrapingId === selectedComp.id}
                    >
                      {scrapingId === selectedComp.id ? 'Scraping...' : '✦ Scrape & Analyze'}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-rose)' }} onClick={() => handleDelete(selectedComp.id)}>
                      Remove
                    </button>
                  </div>
                </div>

                {selectedComp.reasoning && (
                  <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <strong>Why they are a competitor:</strong> {selectedComp.reasoning}
                  </div>
                )}

                <div style={{ marginTop: 'var(--space-md)' }}>
                  <CompanyOverviewTable brand={selectedComp} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-md)' }}>
                <button 
                  className="btn btn-outline btn-sm" 
                  onClick={() => setShowAnalysis(!showAnalysis)}
                  style={{ fontSize: '12px', padding: '4px 16px', borderRadius: '16px' }}
                >
                  {showAnalysis ? 'Hide Analysis ▾' : 'View Full Analysis ▸'}
                </button>
              </div>

              {showAnalysis && (
                <div style={{ padding: 'var(--space-lg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)', borderTop: '1px solid var(--border-subtle)', marginTop: 'var(--space-md)' }}>
                {/* Radar Chart */}
                <div>
                  <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>AI Competitor Scoring</h4>
                  {chartData.length > 0 ? (
                    <div style={{ width: '100%', height: 300 }}>
                      <ResponsiveContainer>
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                          <PolarGrid stroke="var(--border-subtle)" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                          <Radar name="Score" dataKey="A" stroke="var(--accent-cyan)" fill="var(--accent-cyan)" fillOpacity={0.4} />
                          <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No scoring data available.</p>
                  )}
                  
                  {/* Score Evidence List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                    {(selectedComp.scores || []).map((s: any) => (
                      <div key={s.id} style={{ fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.metricName}</span>
                          <span style={{ color: 'var(--accent-cyan)' }}>{s.score}/100</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>{s.evidence}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SWOT Analysis */}
                <div>
                  <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>SWOT Analysis</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                    <div style={{ padding: 'var(--space-sm)', background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                      <div style={{ color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase' }}>Strengths</div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {safeJsonParse(selectedComp.swotStrengths).map((item: string, i: number) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                    <div style={{ padding: 'var(--space-sm)', background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                      <div style={{ color: 'var(--accent-rose)', fontWeight: 600, fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase' }}>Weaknesses</div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {safeJsonParse(selectedComp.swotWeaknesses).map((item: string, i: number) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                    <div style={{ padding: 'var(--space-sm)', background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                      <div style={{ color: 'var(--accent-cyan)', fontWeight: 600, fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase' }}>Opportunities</div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {safeJsonParse(selectedComp.swotOpps).map((item: string, i: number) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                    <div style={{ padding: 'var(--space-sm)', background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                      <div style={{ color: 'var(--accent-amber)', fontWeight: 600, fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase' }}>Threats</div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {safeJsonParse(selectedComp.swotThreats).map((item: string, i: number) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  </div>

                  <div style={{ marginTop: 'var(--space-xl)' }}>
                    <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>Digital Footprint</h4>
                    
                    {/* Tech Stack */}
                    <div style={{ marginBottom: 'var(--space-md)' }}>
                      <strong style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Detected Tech Stack:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {selectedComp.snapshots?.[0]?.techStack && safeJsonParse(selectedComp.snapshots[0].techStack).length > 0 ? (
                          safeJsonParse(selectedComp.snapshots[0].techStack).map((tech: string, i: number) => (
                            <span key={i} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: 'var(--text-primary)' }}>
                              {tech}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No tech stack data detected.</span>
                        )}
                      </div>
                    </div>

                    {/* Socials */}
                    <div>
                      <strong style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Social Profiles:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {selectedComp.socialLinks && safeJsonParse(selectedComp.socialLinks).length > 0 ? (
                          safeJsonParse(selectedComp.socialLinks).map((link: string, i: number) => {
                            try {
                              const domain = new URL(link).hostname.replace('www.', '');
                              return (
                                <a key={i} href={link} target="_blank" rel="noreferrer" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: 'var(--accent-cyan)', textDecoration: 'none' }}>
                                  {domain}
                                </a>
                              );
                            } catch { return null; }
                          })
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No social profiles found.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 'var(--space-xl)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                      <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>Strategic Gap Analysis</h4>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        onClick={() => handleRunGapAnalysis(selectedComp.id)}
                        disabled={isAnalyzingGaps}
                      >
                        {isAnalyzingGaps ? 'Analyzing Gaps...' : 'Run Gap Analysis'}
                      </button>
                    </div>

                    {selectedComp.gaps && selectedComp.gaps.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        {selectedComp.gaps.map((gap: any) => (
                          <div key={gap.id} style={{ padding: 'var(--space-sm)', background: 'var(--bg-tertiary)', borderLeft: `3px solid ${gap.severity === 'high' ? 'var(--accent-rose)' : gap.severity === 'medium' ? 'var(--accent-amber)' : 'var(--accent-cyan)'}`, borderRadius: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase' }}>{gap.gapType} Gap</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Severity: {gap.severity}</span>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{gap.description}</div>
                            <div style={{ fontSize: '12px', color: 'var(--accent-emerald)' }}><strong>Opportunity:</strong> {gap.opportunity}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No gaps identified yet. Run a gap analysis to compare this competitor against your brand.</p>
                    )}
                  </div>
                </div>
              </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
