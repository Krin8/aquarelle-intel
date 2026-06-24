import Link from 'next/link';
import prisma from '@/lib/db';
import { FeedbackButtons } from '@/components/FeedbackButtons';

export default async function IntelligencePage() {
  const analyses = await prisma.aIAnalysis.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      brand: { select: { id: true, name: true, website: true, region: true } },
    },
  });

  const stats = {
    total: analyses.length,
    website: analyses.filter(a => a.analysisType === 'website_understanding').length,
    gap: analyses.filter(a => a.analysisType === 'gap_detection').length,
    pitch: analyses.filter(a => a.analysisType === 'pitch_suggestion').length,
    thumbsUp: analyses.filter(a => a.feedbackRating === 'thumbs_up').length,
    thumbsDown: analyses.filter(a => a.feedbackRating === 'thumbs_down').length,
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">AI Intelligence Feed</h1>
          <p className="page-subtitle">
            {stats.total} analyses across all brands · {stats.thumbsUp} helpful · {stats.thumbsDown} not useful
          </p>
        </div>
      </div>

      <div className="stat-grid animate-fade-in">
        <div className="stat-card">
          <span className="stat-card-label">Website Analyses</span>
          <span className="stat-card-value" style={{ color: 'var(--accent-indigo)' }}>{stats.website}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Gap Detections</span>
          <span className="stat-card-value" style={{ color: 'var(--accent-amber)' }}>{stats.gap}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Pitch Suggestions</span>
          <span className="stat-card-value" style={{ color: 'var(--accent-emerald)' }}>{stats.pitch}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-label">Feedback Given</span>
          <span className="stat-card-value">{stats.thumbsUp + stats.thumbsDown}</span>
        </div>
      </div>

      {analyses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✦</div>
          <div className="empty-state-title">No AI insights yet</div>
          <p className="empty-state-description">
            Add brands and run AI analysis to see intelligence here.
          </p>
          <Link href="/brands/new" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-sm)' }}>
            Add Brand
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {analyses.map((analysis, i) => {
            let structured: Record<string, unknown> | null = null;
            try {
              structured = analysis.structuredData ? JSON.parse(analysis.structuredData) : null;
            } catch { /* ignore */ }

            return (
              <div key={analysis.id} className={`insight-card animate-fade-in animate-fade-in-delay-${Math.min(i + 1, 4)}`}>
                <div className="insight-card-header">
                  <span className={`insight-card-type ${analysis.analysisType}`}>
                    {analysis.analysisType.replace(/_/g, ' ')}
                  </span>
                  <Link
                    href={`/brands/${analysis.brand.id}`}
                    style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-indigo)' }}
                  >
                    {analysis.brand.name}
                  </Link>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {analysis.brand.region}
                  </span>
                  <span className="insight-card-time">
                    {new Date(analysis.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="insight-card-content">
                  {structured ? (
                    <>
                      {analysis.analysisType === 'website_understanding' && (
                        <p>{(structured as Record<string, string>).description || analysis.response.slice(0, 300)}</p>
                      )}
                      {analysis.analysisType === 'gap_detection' && (
                        <p>
                          <strong>Match: {(structured as Record<string, number>).matchScore}%</strong> — {(structured as Record<string, string>).matchSummary || analysis.response.slice(0, 300)}
                        </p>
                      )}
                      {analysis.analysisType === 'pitch_suggestion' && (
                        <p>{(structured as Record<string, string>).recommendedApproach || analysis.response.slice(0, 300)}</p>
                      )}
                      {analysis.analysisType === 'qa_answer' && (
                        <p>
                          <strong style={{ color: 'var(--accent-cyan)' }}>Q: {analysis.prompt}</strong>
                          <br />
                          {(structured as Record<string, string>).answer || analysis.response.slice(0, 300)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p>{analysis.response.slice(0, 300)}...</p>
                  )}
                </div>
                <div className="insight-card-actions">
                  <FeedbackButtons analysisId={analysis.id} currentRating={analysis.feedbackRating} />
                  <Link
                    href={`/brands/${analysis.brand.id}`}
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto' }}
                  >
                    View Brand →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
