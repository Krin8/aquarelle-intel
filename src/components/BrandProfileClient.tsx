'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBrandStatus, deleteBrand } from '@/actions/brand-actions';
import { scrapeBrand } from '@/actions/scrape-actions';
import { runWebsiteAnalysis, runGapDetection, runPitchGeneration, submitFeedback } from '@/actions/ai-actions';
import { addNote, deleteNote, togglePinNote } from '@/actions/note-actions';

type BrandWithRelations = {
  id: string;
  name: string;
  website: string;
  corporateUrl: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  status: string;
  region: string;
  segment: string | null;
  priceRange: string | null;
  description: string | null;
  matchScore: number | null;
  dataFreshness: number;
  lastScrapedAt: Date | null;
  createdAt: Date;
  complianceNotes: string | null;
  products: { id: string; name: string; category: string | null; priceMin: number | null; priceMax: number | null; confidence: number }[];
  contacts: { id: string; name: string; role: string | null; email: string | null; phone: string | null; buyerType: string; confidenceScore: number; source: string }[];
  aiAnalyses: { id: string; analysisType: string; response: string; structuredData: string | null; modelUsed: string; feedbackRating: string | null; createdAt: Date }[];
  notes: { id: string; content: string; category: string; pinned: boolean; createdAt: Date }[];
  scrapeLogs: { id: string; url: string; method: string; status: string; scrapedAt: Date; errorMessage: string | null; contentLength: number | null; pageTitle: string | null; metaDescription: string | null; scrapedData: string | null }[];
};

const TABS = ['Overview', 'Contacts', 'AI Analysis', 'Notes', 'Scrape History'];
const STATUSES = ['discovered', 'researching', 'analyzed', 'qualified', 'rejected'];

export function BrandProfileClient({ brand, pitchTemplates }: { brand: BrandWithRelations, pitchTemplates?: any[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Overview');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  
  // Pitch Template Selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Corporate URL edit state
  const [isEditingCorpUrl, setIsEditingCorpUrl] = useState(false);
  const [corpUrlInput, setCorpUrlInput] = useState(brand.corporateUrl || '');
  const [savingCorpUrl, setSavingCorpUrl] = useState(false);

  // LinkedIn URL edit state
  const [isEditingLinkedin, setIsEditingLinkedin] = useState(false);
  const [linkedinInput, setLinkedinInput] = useState(brand.linkedinUrl || '');
  const [savingLinkedin, setSavingLinkedin] = useState(false);

  async function handleAction(action: string) {
    setError('');
    setLoading(action);
    try {
      let result;
      switch (action) {
        case 'scrape':
          result = await scrapeBrand(brand.id);
          break;
        case 'analyze':
          result = await runWebsiteAnalysis(brand.id);
          break;
        case 'gaps':
          result = await runGapDetection(brand.id);
          break;
        case 'pitch':
          result = await runPitchGeneration(brand.id, selectedTemplateId || undefined);
          break;
        default:
          return;
      }
      if (result?.error) setError(result.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setLoading('');
    }
  }

  async function handleStatusChange(status: string) {
    await updateBrandStatus(brand.id, status);
    router.refresh();
  }

  async function handleDelete() {
    if (confirm('Delete this brand and all associated data?')) {
      await deleteBrand(brand.id);
      router.push('/brands');
    }
  }

  async function saveCorporateUrl() {
    setSavingCorpUrl(true);
    try {
      const { updateCorporateUrl } = await import('@/actions/brand-actions');
      const res = await updateCorporateUrl(brand.id, corpUrlInput.trim() || null);
      if (res.error) setError(res.error);
      else setIsEditingCorpUrl(false);
    } catch (err) {
      setError('Failed to update corporate URL');
    }
    setSavingCorpUrl(false);
  }

  async function saveLinkedinUrl() {
    setSavingLinkedin(true);
    try {
      const { updateLinkedinUrl } = await import('@/actions/brand-actions');
      const res = await updateLinkedinUrl(brand.id, linkedinInput.trim() || null);
      if (res.error) setError(res.error);
      else setIsEditingLinkedin(false);
    } catch (err) {
      setError('Failed to update LinkedIn URL');
    }
    setSavingLinkedin(false);
  }

  async function handleFeedback(analysisId: string, rating: 'thumbs_up' | 'thumbs_down') {
    await submitFeedback(analysisId, rating);
    router.refresh();
  }

  async function handleAddNote(formData: FormData) {
    formData.append('brandId', brand.id);
    await addNote(formData);
    router.refresh();
  }

  // Parse structured data safely
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function parseStructured(data: string | null): any {
    if (!data) return null;
    try { return JSON.parse(data); } catch { return null; }
  }

  const latestWebsiteAnalysis = brand.aiAnalyses.find(a => a.analysisType === 'website_understanding');
  const latestGapDetection = brand.aiAnalyses.find(a => a.analysisType === 'gap_detection');
  const websiteData = parseStructured(latestWebsiteAnalysis?.structuredData || null);
  const gapData = parseStructured(latestGapDetection?.structuredData || null);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <h1 className="page-title">{brand.name}</h1>
            <span className={`status-badge ${brand.status}`}>{brand.status}</span>
          </div>
          <div className="page-subtitle">
            <a href={brand.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-indigo)' }}>
              {brand.website.replace(/^https?:\/\//, '')}
            </a>
            {' | '}
            {isEditingCorpUrl ? (
              <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={corpUrlInput} 
                  onChange={e => setCorpUrlInput(e.target.value)}
                  placeholder="e.g. newsroom.brand.com"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}
                />
                <button onClick={saveCorporateUrl} disabled={savingCorpUrl} style={{ background: 'var(--accent-indigo)', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                <button onClick={() => { setIsEditingCorpUrl(false); setCorpUrlInput(brand.corporateUrl || ''); }} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              </span>
            ) : (
              <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                <a href={brand.corporateUrl || '#'} target={brand.corporateUrl ? "_blank" : undefined} rel="noopener noreferrer" style={{ color: 'var(--accent-fuchsia)' }} title="Corporate B2B URL">
                  {brand.corporateUrl ? brand.corporateUrl.replace(/^https?:\/\//, '') : 'No corporate URL'}
                </a>
                <button onClick={() => setIsEditingCorpUrl(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 4px', color: 'var(--text-secondary)' }} title="Edit Corporate URL">
                  ✏️
                </button>
              </span>
            )}
            {' | '}
            {isEditingLinkedin ? (
              <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={linkedinInput} 
                  onChange={e => setLinkedinInput(e.target.value)}
                  placeholder="e.g. linkedin.com/company/brand"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}
                />
                <button onClick={saveLinkedinUrl} disabled={savingLinkedin} style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', cursor: 'pointer' }}>Save</button>
                <button onClick={() => { setIsEditingLinkedin(false); setLinkedinInput(brand.linkedinUrl || ''); }} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              </span>
            ) : (
              <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                <a href={brand.linkedinUrl || '#'} target={brand.linkedinUrl ? "_blank" : undefined} rel="noopener noreferrer" style={{ color: '#0a66c2' }} title="LinkedIn Page">
                  {brand.linkedinUrl ? brand.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\//, 'in/') : 'No LinkedIn URL'}
                </a>
                <button onClick={() => setIsEditingLinkedin(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 4px', color: 'var(--text-secondary)' }} title="Edit LinkedIn URL">
                  ✏️
                </button>
              </span>
            )}
            {' · '}{brand.region}
            {brand.segment && <> · {brand.segment}</>}
            {brand.priceRange && <> · {brand.priceRange}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleAction('scrape')}
            disabled={loading === 'scrape'}
          >
            {loading === 'scrape' ? <><span className="spinner"></span> Scraping...</> : '🔍 Re-scrape'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleAction('analyze')}
            disabled={loading === 'analyze'}
          >
            {loading === 'analyze' ? <><span className="spinner"></span> Analyzing...</> : '✦ Analyze'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleAction('gaps')}
            disabled={loading === 'gaps'}
          >
            {loading === 'gaps' ? <><span className="spinner"></span> Detecting...</> : '◈ Gaps'}
          </button>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleAction('pitch')}
              disabled={loading === 'pitch'}
            >
              {loading === 'pitch' ? <><span className="spinner"></span> Generating...</> : '📝 Pitch'}
            </button>
            {pitchTemplates && pitchTemplates.length > 0 && (
              <select 
                value={selectedTemplateId} 
                onChange={e => setSelectedTemplateId(e.target.value)}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '4px', borderRadius: '4px', fontSize: '12px' }}
              >
                <option value="">Default Template</option>
                {pitchTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="card animate-fade-in" style={{
          marginBottom: 'var(--space-lg)',
          borderColor: 'var(--accent-rose)',
          background: 'var(--accent-rose-glow)',
        }}>
          <p style={{ color: 'var(--accent-rose)', fontSize: '14px' }}>⚠ {error}</p>
        </div>
      )}

      {/* Stats Row */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-md)' }}>
        <div className="stat-card">
          <span className="stat-card-label">Match Score</span>
          <span className="stat-card-value" style={{
            color: brand.matchScore !== null
              ? brand.matchScore >= 70 ? 'var(--accent-emerald)' : brand.matchScore >= 40 ? 'var(--accent-amber)' : 'var(--accent-rose)'
              : 'var(--text-muted)',
          }}>
            {brand.matchScore !== null ? `${brand.matchScore}%` : '—'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Contacts</span>
          <span className="stat-card-value">{brand.contacts.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">AI Analyses</span>
          <span className="stat-card-value">{brand.aiAnalyses.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Data Freshness</span>
          <span className="stat-card-value" style={{
            color: brand.dataFreshness >= 70 ? 'var(--accent-emerald)' : brand.dataFreshness >= 40 ? 'var(--accent-amber)' : 'var(--accent-rose)',
          }}>
            {brand.dataFreshness}%
          </span>
        </div>
      </div>

      {/* Status Selector & Delete */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Status:</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`filter-chip ${brand.status === s ? 'active' : ''}`}
            onClick={() => handleStatusChange(s)}
            style={{ fontSize: '12px' }}
          >
            {s}
          </button>
        ))}
        <button className="btn btn-danger btn-sm" onClick={handleDelete} style={{ marginLeft: 'auto' }}>
          Delete Brand
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Overview' && (
        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
          {/* Brand Intelligence */}
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
              Brand Intelligence
            </h3>
            {websiteData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {websiteData.description && (
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</span>
                    <p style={{ fontSize: '14px', marginTop: '4px' }}>{websiteData.description as string}</p>
                  </div>
                )}
                {websiteData.targetCustomer && (
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Target Customer</span>
                    <p style={{ fontSize: '14px', marginTop: '4px' }}>{websiteData.targetCustomer as string}</p>
                  </div>
                )}
                {(websiteData.productCategories as string[])?.length > 0 && (
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Categories</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {(websiteData.productCategories as string[]).map((cat: string) => (
                        <span key={cat} className="filter-chip" style={{ cursor: 'default' }}>{cat}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(websiteData.keyDifferentiators as string[])?.length > 0 && (
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Key Differentiators</span>
                    <ul style={{ fontSize: '14px', marginTop: '4px', paddingLeft: 'var(--space-md)', color: 'var(--text-secondary)' }}>
                      {(websiteData.keyDifferentiators as string[]).map((d: string, i: number) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
                <p className="empty-state-description">Run AI analysis to see brand intelligence</p>
                <button className="btn btn-primary btn-sm" onClick={() => handleAction('analyze')} style={{ marginTop: '8px' }}>
                  ✦ Analyze Brand
                </button>
              </div>
            )}
          </div>

          {/* Gap Analysis */}
          <div className="card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, marginBottom: 'var(--space-md)' }}>
              Gap Analysis
            </h3>
            {gapData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Match Summary</span>
                  <p style={{ fontSize: '14px', marginTop: '4px' }}>{gapData.matchSummary as string}</p>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Price Alignment</span>
                  <p style={{ fontSize: '14px', marginTop: '4px' }}>{gapData.priceAlignment as string}</p>
                </div>
                {(gapData.productGaps as Array<{gap: string; opportunity: string; severity: string}>)?.length > 0 && (
                  <div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Product Gaps</span>
                    {(gapData.productGaps as Array<{gap: string; opportunity: string; severity: string}>).map((g, i: number) => (
                      <div key={i} style={{ marginTop: '8px', padding: '10px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                          <span className={`status-badge ${g.severity === 'high' ? 'rejected' : g.severity === 'medium' ? 'researching' : 'discovered'}`} style={{ marginRight: '8px' }}>
                            {g.severity}
                          </span>
                          {g.gap}
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{g.opportunity}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
                <p className="empty-state-description">Run gap detection after website analysis</p>
                <button className="btn btn-primary btn-sm" onClick={() => handleAction('gaps')} style={{ marginTop: '8px' }}>
                  ◈ Detect Gaps
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Contacts' && (
        <div className="animate-fade-in">
          {brand.contacts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <div className="empty-state-title">No contacts found</div>
              <p className="empty-state-description">Contacts are auto-extracted during scraping. Try re-scraping the brand website.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Type</th>
                    <th>Confidence</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {brand.contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td style={{ fontWeight: 500 }}>{contact.name}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{contact.role || '—'}</td>
                      <td style={{ color: 'var(--accent-indigo)' }}>{contact.email || '—'}</td>
                      <td>{contact.phone || '—'}</td>
                      <td>
                        <span className={`status-badge ${contact.buyerType === 'decision_maker' ? 'qualified' : contact.buyerType === 'influencer' ? 'analyzed' : 'discovered'}`}>
                          {contact.buyerType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          color: contact.confidenceScore >= 0.7 ? 'var(--accent-emerald)' : contact.confidenceScore >= 0.4 ? 'var(--accent-amber)' : 'var(--accent-rose)',
                          fontWeight: 600,
                        }}>
                          {Math.round(contact.confidenceScore * 100)}%
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{contact.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'AI Analysis' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {brand.aiAnalyses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✦</div>
              <div className="empty-state-title">No AI analyses yet</div>
              <p className="empty-state-description">Run an analysis to get AI-powered brand intelligence.</p>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                <button className="btn btn-primary btn-sm" onClick={() => handleAction('analyze')}>✦ Analyze</button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleAction('gaps')}>◈ Gaps</button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleAction('pitch')}>📝 Pitch</button>
              </div>
            </div>
          ) : (
            brand.aiAnalyses.map((analysis) => {
              const structured = parseStructured(analysis.structuredData);
              return (
                <div key={analysis.id} className="insight-card">
                  <div className="insight-card-header">
                    <span className={`insight-card-type ${analysis.analysisType}`}>
                      {analysis.analysisType.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {analysis.modelUsed}
                    </span>
                    <span className="insight-card-time">
                      {new Date(analysis.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="insight-card-content">
                    {structured ? (
                      <pre style={{
                        fontSize: '12px',
                        background: 'var(--bg-surface)',
                        padding: 'var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'auto',
                        maxHeight: '400px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {JSON.stringify(structured, null, 2)}
                      </pre>
                    ) : (
                      <p style={{ whiteSpace: 'pre-wrap' }}>{analysis.response.slice(0, 2000)}</p>
                    )}
                  </div>
                  <div className="insight-card-actions">
                    <button
                      className={`feedback-btn ${analysis.feedbackRating === 'thumbs_up' ? 'active-up' : ''}`}
                      onClick={() => handleFeedback(analysis.id, 'thumbs_up')}
                    >
                      👍 Helpful
                    </button>
                    <button
                      className={`feedback-btn ${analysis.feedbackRating === 'thumbs_down' ? 'active-down' : ''}`}
                      onClick={() => handleFeedback(analysis.id, 'thumbs_down')}
                    >
                      👎 Not useful
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'Notes' && (
        <div className="animate-fade-in">
          {/* Add Note Form */}
          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <form action={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <textarea
                className="input"
                name="content"
                placeholder="Add a note about this brand..."
                required
                style={{ minHeight: '80px' }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                <select className="select" name="category" style={{ width: 'auto' }}>
                  <option value="general">General</option>
                  <option value="meeting">Meeting</option>
                  <option value="call">Call</option>
                  <option value="research">Research</option>
                </select>
                <button type="submit" className="btn btn-primary btn-sm">Add Note</button>
              </div>
            </form>
          </div>

          {brand.notes.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
              <div className="empty-state-icon">📝</div>
              <div className="empty-state-title">No notes yet</div>
              <p className="empty-state-description">Add notes to track conversations and research about this brand.</p>
            </div>
          ) : (
            <div className="note-timeline">
              {brand.notes.map((note) => (
                <div key={note.id} className={`note-item ${note.pinned ? 'pinned' : ''}`}>
                  <div className="note-item-header">
                    <span className="note-item-category">{note.category}</span>
                    {note.pinned && <span style={{ fontSize: '12px', color: 'var(--accent-amber)' }}>📌 Pinned</span>}
                    <span className="note-item-time">{new Date(note.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="note-item-content">{note.content}</div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => togglePinNote(note.id).then(() => router.refresh())}>
                      {note.pinned ? 'Unpin' : '📌 Pin'}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-rose)' }} onClick={() => {
                      if (confirm('Delete this note?')) deleteNote(note.id).then(() => router.refresh());
                    }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'Scrape History' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {brand.scrapeLogs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">No scrape history</div>
              <p className="empty-state-description">Scrape the brand to start collecting data.</p>
            </div>
          ) : (
            brand.scrapeLogs.map((log) => {
              const data = log.scrapedData ? (() => { try { return JSON.parse(log.scrapedData); } catch { return null; } })() : null;
              return (
                <div key={log.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Scrape header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
                    padding: 'var(--space-md) var(--space-lg)',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                  }}>
                    <span className={`status-badge ${log.status === 'success' ? 'qualified' : log.status === 'failed' ? 'rejected' : 'researching'}`}>
                      {log.status}
                    </span>
                    <span className="filter-chip" style={{ cursor: 'default' }}>{log.method}</span>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {new Date(log.scrapedAt).toLocaleString()}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {log.contentLength ? `${(log.contentLength / 1024).toFixed(1)} KB` : ''}
                    </span>
                  </div>

                  {log.errorMessage && (
                    <div style={{ padding: 'var(--space-sm) var(--space-lg)', background: 'var(--accent-rose-glow)' }}>
                      <span style={{ fontSize: '13px', color: 'var(--accent-rose)' }}>⚠ {log.errorMessage}</span>
                    </div>
                  )}

                  {/* Page info */}
                  {(log.pageTitle || log.metaDescription) && (
                    <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
                      {log.pageTitle && (
                        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>{log.pageTitle}</div>
                      )}
                      {log.metaDescription && (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{log.metaDescription}</p>
                      )}
                    </div>
                  )}

                  {/* Scraped data details */}
                  {data && (
                    <div style={{ padding: 'var(--space-md) var(--space-lg)' }}>
                      {/* Summary stats row */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-sm)',
                        marginBottom: 'var(--space-md)',
                      }}>
                        <div style={{ textAlign: 'center', padding: 'var(--space-sm)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-indigo)' }}>{data.emails?.length || 0}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Emails</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: 'var(--space-sm)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-emerald)' }}>{data.phones?.length || 0}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Phones</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: 'var(--space-sm)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-amber)' }}>{data.linkCount || 0}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Links</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: 'var(--space-sm)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{data.imageCount || 0}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Images</div>
                        </div>
                      </div>

                      {/* Emails found */}
                      {data.emails?.length > 0 && (
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>📧 Emails Found</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                            {(data.emails as string[]).map((email: string, i: number) => (
                              <span key={i} style={{
                                padding: '4px 10px', borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                                fontSize: '13px', color: 'var(--accent-indigo)', fontFamily: 'monospace',
                              }}>{email}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Phones found */}
                      {data.phones?.length > 0 && (
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>📞 Phones Found</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                            {(data.phones as string[]).map((phone: string, i: number) => (
                              <span key={i} style={{
                                padding: '4px 10px', borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                                fontSize: '13px', color: 'var(--accent-emerald)', fontFamily: 'monospace',
                              }}>{phone}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Headings found */}
                      {data.headings?.length > 0 && (
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>📄 Page Headings</span>
                          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {(data.headings as string[]).slice(0, 15).map((h: string, i: number) => (
                              <span key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '8px', borderLeft: '2px solid var(--border-subtle)' }}>
                                {h}
                              </span>
                            ))}
                            {data.headings.length > 15 && (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)', paddingLeft: '8px' }}>…and {data.headings.length - 15} more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* No scraped data message for older logs */}
                  {!data && log.status === 'success' && (
                    <div style={{ padding: 'var(--space-md) var(--space-lg)', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Scraped data not stored for this run. Re-scrape to capture detailed data.
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
