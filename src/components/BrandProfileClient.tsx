'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBrandStatus, deleteBrand, importApolloCsv } from '@/actions/brand-actions';
import { scrapeBrand } from '@/actions/scrape-actions';
import { runWebsiteAnalysis, runGapDetection, runPitchGeneration, runPipelineScoring, submitFeedback, askBrandQuestion, generateDraft } from '@/actions/ai-actions';
import { addNote, deleteNote, togglePinNote } from '@/actions/note-actions';

type BrandWithRelations = {
  id: string;
  name: string;
  website: string;
  corporateUrl: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  status: string;
  customerType: string;
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
  contacts: { id: string; name: string; role: string | null; department: string | null; seniority: string | null; email: string | null; phone: string | null; buyerType: string; confidenceScore: number; source: string }[];
  documents: { id: string; title: string; type: string; url: string; scrapedAt: Date }[];
  aiAnalyses: { id: string; analysisType: string; response: string; structuredData: string | null; modelUsed: string; feedbackRating: string | null; createdAt: Date; prompt: string }[];
  notes: { id: string; content: string; category: string; pinned: boolean; createdAt: Date }[];
  scrapeLogs: { id: string; url: string; method: string; status: string; scrapedAt: Date; errorMessage: string | null; contentLength: number | null; pageTitle: string | null; metaDescription: string | null; scrapedData: string | null }[];
};

const TABS = ['Overview', 'Documents', 'Contacts', 'AI Insights', 'Notes', 'Scrape History'];
const STATUSES = ['discovered', 'researching', 'analyzed', 'qualified', 'rejected'];
const CUSTOMER_TYPES = ['new', 'pipeline', 'existing'];

const QUICK_QUESTIONS = [
  'What do they sell & at what price?',
  'Who are their target customers?',
  'What are their distribution channels?',
  'What sustainability claims do they make?',
  'Where are they headquartered?',
];

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

  // Q&A state
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState('');

  // Copy-to-clipboard state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [useDataProvider, setUseDataProvider] = useState(false);
  const [useLinkedin, setUseLinkedin] = useState(false);

  // Email Drafting state
  const [draftingContactId, setDraftingContactId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<{ subjectLine: string, body: string } | null>(null);

  async function handleAction(action: string) {
    setError('');
    setLoading(action);
    try {
      let result;
      switch (action) {
        case 'scrape':
          result = await scrapeBrand(brand.id, { useDataProvider, useLinkedin });
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

  async function handleCustomerTypeChange(customerType: string) {
    const { updateCustomerType } = await import('@/actions/brand-actions');
    await updateCustomerType(brand.id, customerType);
    router.refresh();
  }

  async function handleDeleteNote(id: string) {
    if (confirm('Are you sure you want to delete this note?')) {
      await deleteNote(id);
      router.refresh();
    }
  }

  async function handleGenerateEmail(contactId: string, stage: 1 | 2 = 1) {
    setError('');
    setDraftingContactId(contactId);
    setEmailDraft(null);
    try {
      const result = await generateDraft(brand.id, contactId, stage);
      if (result.error) {
        setError(result.error);
        setDraftingContactId(null);
      } else if (result.draft) {
        setEmailDraft(result.draft);
      }
    } catch (e) {
      setError('Failed to generate draft');
      setDraftingContactId(null);
    }
  }

  async function handleSaveConnections(contactId: string, connections: string) {
    const { updateContactConnections } = await import('@/actions/brand-actions');
    await updateContactConnections(contactId, connections);
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

  async function handleAskQuestion(question: string) {
    if (!question.trim()) return;
    setQaError('');
    setQaLoading(true);
    try {
      const result = await askBrandQuestion(brand.id, question.trim());
      if (result?.error) {
        setQaError(result.error);
      } else {
        setQaQuestion('');
        router.refresh();
      }
    } catch (e) {
      setQaError(e instanceof Error ? e.message : 'Failed to get answer');
    } finally {
      setQaLoading(false);
    }
  }

  async function handleApolloImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading('importing_apollo');
    setError('');

    try {
      const text = await file.text();
      const res = await importApolloCsv(brand.id, text);
      if (!res.success) {
        setError(res.error || 'Failed to import Apollo CSV');
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to read file');
    } finally {
      setLoading('');
      e.target.value = ''; // Reset input
    }
  }

  async function handlePipelineScoring() {
    setLoading('scoring_pipeline');
    setError('');
    try {
      const res = await runPipelineScoring(brand.id);
      if (res.error) setError(res.error);
      else router.refresh();
    } catch (err) {
      setError('Failed to run pipeline scoring');
    }
    setLoading('');
  }

  async function handleAddNote(formData: FormData) {
    formData.append('brandId', brand.id);
    await addNote(formData);
    router.refresh();
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatExternalUrl(url: string | null | undefined): string {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
  }

  // Parse structured data safely
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function parseStructured(data: string | null): any {
    if (!data) return null;
    try { return JSON.parse(data); } catch { return null; }
  }

  const latestWebsiteAnalysis = brand.aiAnalyses.find(a => a.analysisType === 'website_understanding');
  const latestGapDetection = brand.aiAnalyses.find(a => a.analysisType === 'gap_detection');
  const latestPitchSuggestion = brand.aiAnalyses.find(a => a.analysisType === 'pitch_suggestion');
  const qaAnswers = brand.aiAnalyses.filter(a => a.analysisType === 'qa_answer');
  const websiteData = parseStructured(latestWebsiteAnalysis?.structuredData || null);
  const gapData = parseStructured(latestGapDetection?.structuredData || null);
  const pitchData = parseStructured(latestPitchSuggestion?.structuredData || null);

  // Match score color helper
  function getScoreColor(score: number): string {
    if (score >= 70) return 'var(--accent-emerald)';
    if (score >= 40) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  }

  // SVG ring circumference for 72px ring (r=30)
  const RING_CIRCUMFERENCE = 2 * Math.PI * 30;

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
            <a href={formatExternalUrl(brand.website)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-indigo)' }}>
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
                <a href={formatExternalUrl(brand.corporateUrl)} target={brand.corporateUrl ? "_blank" : undefined} rel="noopener noreferrer" style={{ color: 'var(--accent-fuchsia)' }} title="Corporate B2B URL">
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
                <a href={formatExternalUrl(brand.linkedinUrl)} target={brand.linkedinUrl ? "_blank" : undefined} rel="noopener noreferrer" style={{ color: '#0a66c2' }} title="LinkedIn Page">
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
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleAction('scrape')}
                disabled={loading === 'scrape'}
              >
                {loading === 'scrape' ? <><span className="spinner"></span> Scraping...</> : '🔍 Re-scrape'}
              </button>
              <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={useDataProvider} onChange={e => setUseDataProvider(e.target.checked)} />
                +ZoomInfo
              </label>
              <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={useLinkedin} onChange={e => setUseLinkedin(e.target.checked)} />
                +LinkedIn
              </label>
            </div>
          </div>
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
        {(brand as any).pipelineScore ? (
          <div className="stat-card">
            <span className="stat-card-label">Pipeline Score</span>
            <span className="stat-card-value" style={{
              color: (brand as any).pipelineScore >= 85 ? 'var(--accent-emerald)' : (brand as any).pipelineScore >= 75 ? 'var(--accent-amber)' : 'var(--accent-rose)',
            }}>
              {(brand as any).pipelineScore}/100
            </span>
          </div>
        ) : (
          <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <span className="stat-card-label" style={{ marginBottom: '8px' }}>Pipeline Score</span>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handlePipelineScoring}
              disabled={loading === 'scoring_pipeline' || !latestGapDetection}
              style={{ width: '100%' }}
              title={!latestGapDetection ? "Run Gap Detection first" : "Estimate Pipeline Score"}
            >
              {loading === 'scoring_pipeline' ? '⏳ Scoring...' : '🪄 Estimate Score'}
            </button>
          </div>
        )}
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
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 8px' }}></div>
        
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Type:</span>
        {CUSTOMER_TYPES.map((t) => (
          <button
            key={t}
            className={`filter-chip ${brand.customerType === t ? 'active' : ''}`}
            onClick={() => handleCustomerTypeChange(t)}
            style={{ fontSize: '12px' }}
          >
            {t === 'new' ? 'New' : t === 'pipeline' ? 'Pipeline' : 'Existing'}
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

      {activeTab === 'Documents' && (
        <div className="animate-fade-in">
          {brand.documents?.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No documents found</div>
              <p className="empty-state-description">Public catalogs, lookbooks, or investor reports will appear here after scraping.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Link</th>
                    <th>Scraped At</th>
                  </tr>
                </thead>
                <tbody>
                  {brand.documents?.map((doc) => (
                    <tr key={doc.id}>
                      <td style={{ fontWeight: 500, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </td>
                      <td>
                        <span className={`status-badge ${doc.type === 'catalog' ? 'qualified' : doc.type === 'lookbook' ? 'analyzed' : 'discovered'}`}>
                          {doc.type.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-indigo)' }}>
                          View Document ↗
                        </a>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {new Date(doc.scrapedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Financial Intelligence (from SOP Pipeline Data) */}
          {(brand as any).pipelineData && (() => {
            try {
              const fin = JSON.parse((brand as any).pipelineData);
              return (
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📊</span> Internal Financial Intelligence
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>(from SOP Pipeline)</span>
                  </h3>
                  <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                    {fin.fobPrice && (
                      <div className="stat-card">
                        <span className="stat-card-label">FOB Price</span>
                        <span className="stat-card-value" style={{ color: 'var(--accent-emerald)' }}>${fin.fobPrice}</span>
                      </div>
                    )}
                    {fin.stdCPU && (
                      <div className="stat-card">
                        <span className="stat-card-label">Std CPU</span>
                        <span className="stat-card-value">₹{fin.stdCPU}</span>
                      </div>
                    )}
                    {fin.stdMargin && (
                      <div className="stat-card">
                        <span className="stat-card-label">Std Margin</span>
                        <span className="stat-card-value">₹{fin.stdMargin}</span>
                      </div>
                    )}
                    {fin.profitPct !== undefined && (
                      <div className="stat-card">
                        <span className="stat-card-label">Profit %</span>
                        <span className="stat-card-value" style={{ color: fin.profitPct > 0.05 ? 'var(--accent-emerald)' : fin.profitPct > 0 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>
                          {(fin.profitPct * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {fin.smv && (
                      <div className="stat-card">
                        <span className="stat-card-label">SMV</span>
                        <span className="stat-card-value">{fin.smv} min</span>
                      </div>
                    )}
                    {fin.cpuGrade && (
                      <div className="stat-card">
                        <span className="stat-card-label">CPU Grade</span>
                        <span className="stat-card-value">{fin.cpuGrade}</span>
                      </div>
                    )}
                    {fin.prospectForAqrlMur && (
                      <div className="stat-card">
                        <span className="stat-card-label">Aqrl Mauritius</span>
                        <span className="stat-card-value" style={{ color: fin.prospectForAqrlMur === 'Yes' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                          {fin.prospectForAqrlMur}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            } catch { return null; }
          })()}
        </div>
      )}

      {activeTab === 'Contacts' && (
        <div className="animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-md)', gap: '8px' }}>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              {loading === 'importing_apollo' ? '⏳ Importing...' : '➕ Import Apollo CSV'}
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleApolloImport} disabled={loading === 'importing_apollo'} />
            </label>
            <a 
              href={`/api/export?brandId=${brand.id}&type=contacts`} 
              target="_blank" 
              className="btn btn-secondary btn-sm"
            >
              📥 Export CSV
            </a>
          </div>
          {brand.contacts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <div className="empty-state-title">No contacts found</div>
              <p className="empty-state-description">Contacts are auto-extracted during scraping. Try re-scraping the brand website.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {brand.contacts.map((contact, i) => (
                <div 
                  key={contact.id} 
                  className={`animate-fade-in animate-fade-in-delay-${Math.min(i + 1, 4)}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    gap: '16px'
                  }}
                >
                  <div style={{ flex: '1.5', minWidth: '150px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{contact.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{contact.role || '—'}</div>
                  </div>

                  <div style={{ flex: '1' }}>
                    {contact.department ? <span className="filter-chip" style={{ fontSize: '11px', padding: '2px 6px' }}>{contact.department}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </div>

                  <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px' }}>
                    {contact.email ? <span style={{ color: 'var(--accent-indigo)' }}>✉️ {contact.email}</span> : null}
                    {contact.phone ? <span style={{ color: 'var(--text-secondary)' }}>📞 {contact.phone}</span> : null}
                  </div>

                  <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span className={`status-badge ${contact.buyerType === 'decision_maker' ? 'qualified' : contact.buyerType === 'influencer' ? 'analyzed' : 'discovered'}`}>
                      {contact.buyerType.replace(/_/g, ' ')}
                    </span>
                    {(contact as any).officeLocation && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📍 {(contact as any).officeLocation}</span>}
                    {(contact as any).reportingStructure && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🔗 {(contact as any).reportingStructure}</span>}
                  </div>

                  <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{
                      color: contact.confidenceScore >= 0.7 ? 'var(--accent-emerald)' : contact.confidenceScore >= 0.4 ? 'var(--accent-amber)' : 'var(--accent-rose)',
                      fontWeight: 600,
                      fontSize: '13px'
                    }}>
                      {Math.round(contact.confidenceScore * 100)}% Conf.
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{contact.source}</span>
                  </div>

                  <div style={{ flex: '0.8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input 
                      type="text" 
                      className="input" 
                      placeholder="Mutual Connections..." 
                      defaultValue={(contact as any).mutualConnections || ''}
                      onBlur={(e) => handleSaveConnections(contact.id, e.target.value)}
                      style={{ fontSize: '11px', padding: '4px', background: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)' }}
                    />
                  </div>

                  <div style={{ flex: '0.8', textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => handleGenerateEmail(contact.id, 1)}
                      disabled={draftingContactId === contact.id}
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                    >
                      {draftingContactId === contact.id && !emailDraft ? <span className="spinner"></span> : '✉️ Stage 1'}
                    </button>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => handleGenerateEmail(contact.id, 2)}
                      disabled={draftingContactId === contact.id}
                      style={{ fontSize: '10px', padding: '2px 6px' }}
                    >
                      {draftingContactId === contact.id && !emailDraft ? <span className="spinner"></span> : '✉️ Stage 2'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Email Draft Modal */}
          {emailDraft && (
            <div className="card" style={{ marginTop: 'var(--space-xl)', border: '1px solid var(--accent-indigo)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-md)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✉️</span> Generated Email Draft
                </h3>
                <button 
                  onClick={() => { setEmailDraft(null); setDraftingContactId(null); }}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <div style={{ background: 'var(--bg-tertiary)', padding: 'var(--space-md)', borderRadius: '6px', marginBottom: 'var(--space-md)' }}>
                <div style={{ fontWeight: 600, marginBottom: 'var(--space-sm)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Subject:</span> {emailDraft.subjectLine}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {emailDraft.body}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(`Subject: ${emailDraft.subjectLine}\n\n${emailDraft.body}`);
                    alert('Copied to clipboard!');
                  }}
                >
                  Copy to Clipboard
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          AI INSIGHTS TAB — The AI Interpretation Layer
          ============================================================ */}
      {activeTab === 'AI Insights' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

          {/* ---- Website Understanding Section ---- */}
          <div className="ai-insight-section website">
            <div className="ai-section-header">
              <div className="ai-section-icon website">✦</div>
              <div>
                <div className="ai-section-title">Website Understanding</div>
                <div className="ai-section-subtitle">
                  {latestWebsiteAnalysis 
                    ? `Analyzed ${new Date(latestWebsiteAnalysis.createdAt).toLocaleDateString()} · ${latestWebsiteAnalysis.modelUsed}`
                    : 'Not yet analyzed'}
                </div>
              </div>
              {latestWebsiteAnalysis && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                  <button
                    className={`feedback-btn ${latestWebsiteAnalysis.feedbackRating === 'thumbs_up' ? 'active-up' : ''}`}
                    onClick={() => handleFeedback(latestWebsiteAnalysis.id, 'thumbs_up')}
                  >👍</button>
                  <button
                    className={`feedback-btn ${latestWebsiteAnalysis.feedbackRating === 'thumbs_down' ? 'active-down' : ''}`}
                    onClick={() => handleFeedback(latestWebsiteAnalysis.id, 'thumbs_down')}
                  >👎</button>
                </div>
              )}
            </div>
            
            {websiteData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {/* Description & Tagline */}
                {(websiteData.description || websiteData.tagline) && (
                  <div>
                    {websiteData.tagline && (
                      <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--accent-violet)', marginBottom: '6px' }}>
                        &ldquo;{websiteData.tagline as string}&rdquo;
                      </p>
                    )}
                    <p className="ai-info-value" style={{ fontSize: '15px', lineHeight: 1.7 }}>
                      {websiteData.description as string}
                    </p>
                  </div>
                )}

                {/* Info Grid */}
                <div className="ai-info-grid">
                  <div className="ai-info-item">
                    <span className="ai-info-label">Segment</span>
                    <span className="ai-info-value">
                      <span className={`status-badge ${websiteData.segment === 'luxury' ? 'qualified' : websiteData.segment === 'premium' ? 'analyzed' : 'discovered'}`}>
                        {websiteData.segment as string}
                      </span>
                    </span>
                  </div>
                  <div className="ai-info-item">
                    <span className="ai-info-label">Price Range</span>
                    <span className="ai-info-value" style={{ fontWeight: 600 }}>{websiteData.priceRange as string}</span>
                  </div>
                  <div className="ai-info-item">
                    <span className="ai-info-label">Target Customer</span>
                    <span className="ai-info-value">{websiteData.targetCustomer as string}</span>
                  </div>
                  {websiteData.headquartersLocation && (
                    <div className="ai-info-item">
                      <span className="ai-info-label">Headquarters</span>
                      <span className="ai-info-value">{websiteData.headquartersLocation as string}</span>
                    </div>
                  )}
                </div>

                <div className="ai-divider" />

                {/* Product Categories */}
                {(websiteData.productCategories as string[])?.length > 0 && (
                  <div>
                    <span className="ai-info-label" style={{ marginBottom: '8px', display: 'block' }}>Product Categories</span>
                    <div className="ai-chip-grid">
                      {(websiteData.productCategories as string[]).map((cat: string) => (
                        <span key={cat} className="ai-chip">{cat}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Differentiators */}
                {(websiteData.keyDifferentiators as string[])?.length > 0 && (
                  <div>
                    <span className="ai-info-label" style={{ marginBottom: '8px', display: 'block' }}>Key Differentiators</span>
                    <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(websiteData.keyDifferentiators as string[]).map((d: string, i: number) => (
                        <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Distribution & Sustainability */}
                <div className="ai-info-grid">
                  {(websiteData.distributionChannels as string[])?.length > 0 && (
                    <div className="ai-info-item">
                      <span className="ai-info-label">Distribution Channels</span>
                      <div className="ai-chip-grid" style={{ marginTop: '4px' }}>
                        {(websiteData.distributionChannels as string[]).map((ch: string) => (
                          <span key={ch} className="ai-chip">{ch}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {websiteData.sustainability && (
                    <div className="ai-info-item">
                      <span className="ai-info-label">Sustainability</span>
                      <span className="ai-info-value" style={{ color: 'var(--accent-emerald)' }}>
                        {websiteData.sustainability as string}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
                <p className="empty-state-description">Run AI analysis to understand this brand&apos;s website</p>
                <button className="btn btn-primary btn-sm" onClick={() => handleAction('analyze')} style={{ marginTop: '8px' }}>
                  ✦ Analyze Website
                </button>
              </div>
            )}
          </div>

          {/* ---- Q&A Section ---- */}
          <div className="ai-insight-section qa">
            <div className="ai-section-header">
              <div className="ai-section-icon qa">💬</div>
              <div>
                <div className="ai-section-title">Ask About This Brand</div>
                <div className="ai-section-subtitle">Ask any question — AI will answer based on scraped website content</div>
              </div>
            </div>
            
            <div className="ai-qa-container">
              {/* Quick Questions */}
              <div className="ai-quick-questions">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    className="ai-quick-question"
                    onClick={() => handleAskQuestion(q)}
                    disabled={qaLoading}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Custom Question Input */}
              <div className="ai-qa-input-row">
                <input
                  className="ai-qa-input"
                  type="text"
                  placeholder="Ask a question about this brand..."
                  value={qaQuestion}
                  onChange={e => setQaQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !qaLoading) handleAskQuestion(qaQuestion); }}
                  disabled={qaLoading}
                />
                <button
                  className="ai-qa-send-btn"
                  onClick={() => handleAskQuestion(qaQuestion)}
                  disabled={qaLoading || !qaQuestion.trim()}
                >
                  {qaLoading ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Thinking...</> : '✦ Ask'}
                </button>
              </div>

              {qaError && (
                <div style={{ padding: '8px 12px', background: 'var(--accent-rose-glow)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--accent-rose)' }}>
                  ⚠ {qaError}
                </div>
              )}

              {/* Q&A History */}
              {qaAnswers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                  {qaAnswers.map((qa) => {
                    const qaData = parseStructured(qa.structuredData);
                    if (!qaData) return null;
                    return (
                      <div key={qa.id} className="ai-qa-bubble">
                        <div className="ai-qa-bubble-question">
                          <span>Q:</span> {qa.prompt}
                        </div>
                        <div className="ai-qa-bubble-answer">
                          {qaData.answer as string}
                        </div>
                        <div className="ai-qa-bubble-meta">
                          <span className={`confidence-badge ${qaData.confidence}`}>
                            {qaData.confidence as string} confidence
                          </span>
                          {(qaData.sources as string[])?.map((src: string, i: number) => (
                            <span key={i} className="ai-qa-source">{src}</span>
                          ))}
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                            <button
                              className={`feedback-btn ${qa.feedbackRating === 'thumbs_up' ? 'active-up' : ''}`}
                              onClick={() => handleFeedback(qa.id, 'thumbs_up')}
                            >👍</button>
                            <button
                              className={`feedback-btn ${qa.feedbackRating === 'thumbs_down' ? 'active-down' : ''}`}
                              onClick={() => handleFeedback(qa.id, 'thumbs_down')}
                            >👎</button>
                          </div>
                        </div>
                        {/* Follow-up suggestions */}
                        {(qaData.followUpQuestions as string[])?.length > 0 && (
                          <div className="ai-qa-followup">
                            {(qaData.followUpQuestions as string[]).map((fq: string, i: number) => (
                              <button
                                key={i}
                                className="ai-quick-question"
                                onClick={() => handleAskQuestion(fq)}
                                disabled={qaLoading}
                                style={{ fontSize: '11px' }}
                              >
                                {fq}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ---- Gap Detection Section ---- */}
          <div className="ai-insight-section gaps">
            <div className="ai-section-header">
              <div className="ai-section-icon gaps">◈</div>
              <div>
                <div className="ai-section-title">Gap Detection vs CIEL Textiles</div>
                <div className="ai-section-subtitle">
                  {latestGapDetection
                    ? `Detected ${new Date(latestGapDetection.createdAt).toLocaleDateString()} · ${latestGapDetection.modelUsed}`
                    : 'Not yet analyzed'}
                </div>
              </div>
              {latestGapDetection && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                  <button
                    className={`feedback-btn ${latestGapDetection.feedbackRating === 'thumbs_up' ? 'active-up' : ''}`}
                    onClick={() => handleFeedback(latestGapDetection.id, 'thumbs_up')}
                  >👍</button>
                  <button
                    className={`feedback-btn ${latestGapDetection.feedbackRating === 'thumbs_down' ? 'active-down' : ''}`}
                    onClick={() => handleFeedback(latestGapDetection.id, 'thumbs_down')}
                  >👎</button>
                </div>
              )}
            </div>

            {gapData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {/* Match Score Ring */}
                <div className="match-score-display">
                  <div className="match-score-ring">
                    <svg viewBox="0 0 72 72">
                      <circle className="match-score-ring-bg" cx="36" cy="36" r="30" />
                      <circle
                        className="match-score-ring-fill"
                        cx="36"
                        cy="36"
                        r="30"
                        stroke={getScoreColor(gapData.matchScore as number)}
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * (gapData.matchScore as number) / 100)}
                      />
                    </svg>
                    <div className="match-score-ring-value" style={{ color: getScoreColor(gapData.matchScore as number) }}>
                      {gapData.matchScore as number}%
                    </div>
                  </div>
                  <div className="match-score-details">
                    <span className="match-score-label">Match Score</span>
                    <span className="match-score-summary">{gapData.matchSummary as string}</span>
                  </div>
                </div>

                {/* Info Row */}
                <div className="ai-info-grid">
                  <div className="ai-info-item">
                    <span className="ai-info-label">Price Alignment</span>
                    <span className="ai-info-value">{gapData.priceAlignment as string}</span>
                  </div>
                  <div className="ai-info-item">
                    <span className="ai-info-label">Region Fit</span>
                    <span className="ai-info-value">{gapData.regionFit as string}</span>
                  </div>
                  {gapData.complianceNotes && (
                    <div className="ai-info-item">
                      <span className="ai-info-label">Compliance</span>
                      <span className="ai-info-value">{gapData.complianceNotes as string}</span>
                    </div>
                  )}
                </div>

                {/* Product Gap Cards */}
                {(gapData.productGaps as Array<{gap: string; opportunity: string; severity: string}>)?.length > 0 && (
                  <div>
                    <span className="ai-info-label" style={{ marginBottom: '10px', display: 'block' }}>Product Gaps &amp; Opportunities</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                      {(gapData.productGaps as Array<{gap: string; opportunity: string; severity: string}>).map((g, i: number) => (
                        <div key={i} className={`gap-card ${g.severity}`}>
                          <div className="gap-card-header">
                            <span className={`severity-badge ${g.severity}`}>{g.severity}</span>
                            <span className="gap-card-title">{g.gap}</span>
                          </div>
                          <p className="gap-card-opportunity">💡 {g.opportunity}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risks */}
                {(gapData.risks as string[])?.length > 0 && (
                  <div>
                    <span className="ai-info-label" style={{ marginBottom: '8px', display: 'block' }}>Potential Risks</span>
                    <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {(gapData.risks as string[]).map((r: string, i: number) => (
                        <li key={i} style={{ fontSize: '13px', color: 'var(--accent-rose)', lineHeight: 1.5 }}>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
                <p className="empty-state-description">Run gap detection to identify opportunities with this brand</p>
                <button className="btn btn-primary btn-sm" onClick={() => handleAction('gaps')} style={{ marginTop: '8px' }}>
                  ◈ Detect Gaps
                </button>
              </div>
            )}
          </div>

          {/* ---- Pitch Angles Section ---- */}
          <div className="ai-insight-section pitch">
            <div className="ai-section-header">
              <div className="ai-section-icon pitch">📝</div>
              <div>
                <div className="ai-section-title">Suggested Pitch Angles</div>
                <div className="ai-section-subtitle">
                  {latestPitchSuggestion
                    ? `Generated ${new Date(latestPitchSuggestion.createdAt).toLocaleDateString()} · ${latestPitchSuggestion.modelUsed}`
                    : 'Not yet generated'}
                </div>
              </div>
              {latestPitchSuggestion && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                  <button
                    className={`feedback-btn ${latestPitchSuggestion.feedbackRating === 'thumbs_up' ? 'active-up' : ''}`}
                    onClick={() => handleFeedback(latestPitchSuggestion.id, 'thumbs_up')}
                  >👍</button>
                  <button
                    className={`feedback-btn ${latestPitchSuggestion.feedbackRating === 'thumbs_down' ? 'active-down' : ''}`}
                    onClick={() => handleFeedback(latestPitchSuggestion.id, 'thumbs_down')}
                  >👎</button>
                </div>
              )}
            </div>

            {pitchData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {/* Pitch Angle Cards */}
                {(pitchData.pitchAngles as Array<{title: string; rationale: string; openingLine: string; keyPoints: string[]; strength: string}>)?.map((pitch, i: number) => (
                  <div key={i} className="pitch-card">
                    <div className="pitch-card-header">
                      <span className="pitch-card-title">{pitch.title}</span>
                      <span className={`strength-badge ${pitch.strength}`}>{pitch.strength}</span>
                    </div>
                    <p className="pitch-card-rationale">{pitch.rationale}</p>
                    
                    {/* Opening Line */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                      <div className="pitch-card-opening" style={{ flex: 1 }}>
                        {pitch.openingLine}
                      </div>
                      <button
                        className={`copy-btn ${copiedId === `pitch-${i}` ? 'copied' : ''}`}
                        onClick={() => copyToClipboard(pitch.openingLine, `pitch-${i}`)}
                        title="Copy opening line"
                      >
                        {copiedId === `pitch-${i}` ? '✓ Copied' : '📋 Copy'}
                      </button>
                    </div>

                    {/* Key Points */}
                    {pitch.keyPoints?.length > 0 && (
                      <ul className="pitch-card-points">
                        {pitch.keyPoints.map((point: string, j: number) => (
                          <li key={j}>{point}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {/* Footer Summary */}
                <div className="pitch-footer">
                  {pitchData.recommendedApproach && (
                    <div className="pitch-footer-item">
                      <span className="pitch-footer-label">Recommended Approach</span>
                      <span className="pitch-footer-value">{pitchData.recommendedApproach as string}</span>
                    </div>
                  )}
                  {pitchData.buyerPersona && (
                    <div className="pitch-footer-item">
                      <span className="pitch-footer-label">Target Buyer Persona</span>
                      <span className="pitch-footer-value">{pitchData.buyerPersona as string}</span>
                    </div>
                  )}
                  {pitchData.timingConsiderations && (
                    <div className="pitch-footer-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="pitch-footer-label">Timing Considerations</span>
                      <span className="pitch-footer-value">{pitchData.timingConsiderations as string}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
                <p className="empty-state-description">Generate pitch angles based on brand analysis and gap detection</p>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: '8px', alignItems: 'center' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleAction('pitch')}>
                    📝 Generate Pitch
                  </button>
                  {pitchTemplates && pitchTemplates.length > 0 && (
                    <select 
                      value={selectedTemplateId} 
                      onChange={e => setSelectedTemplateId(e.target.value)}
                      className="select"
                      style={{ width: 'auto', fontSize: '12px', padding: '6px 30px 6px 10px' }}
                    >
                      <option value="">Default Template</option>
                      {pitchTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ---- Raw Analysis History (Collapsible) ---- */}
          {brand.aiAnalyses.length > 0 && (
            <details style={{ marginTop: 'var(--space-md)' }}>
              <summary style={{
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text-muted)',
                padding: 'var(--space-sm) 0',
                userSelect: 'none',
              }}>
                View raw analysis history ({brand.aiAnalyses.length} records)
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
                {brand.aiAnalyses.map((analysis) => {
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
                })}
              </div>
            </details>
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
