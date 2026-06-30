'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSuppliersForBrand, discoverSuppliersAction, deleteSupplier } from '@/actions/supplier-actions';

export function SupplierIntelligenceDashboard({ brandId }: { brandId: string }) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);

  const fetchSuppliers = useCallback(async () => {
    const data = await getSuppliersForBrand(brandId);
    setSuppliers(data);
    setSelectedSupplier((prev: any) => {
      if (data.length > 0) {
        if (prev) {
          const updated = data.find((s: any) => s.id === prev.id);
          return updated || data[0];
        }
        return data[0];
      }
      return null;
    });
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    fetchSuppliers();
    const interval = setInterval(fetchSuppliers, 15000);
    return () => clearInterval(interval);
  }, [fetchSuppliers]);

  const handleDiscover = async () => {
    setDiscovering(true);
    await discoverSuppliersAction(brandId, 5);
    alert('Supplier discovery initiated in the background. Check back soon!');
    setDiscovering(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this supplier profile?')) {
      await deleteSupplier(id, brandId);
      fetchSuppliers();
    }
  };

  const safeJsonParse = (str: any, fallback: any = []) => {
    try {
      return str ? JSON.parse(str) : fallback;
    } catch {
      return fallback;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {/* Header Actions */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600 }}>Supplier Intelligence</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{suppliers.length} incumbent suppliers tracking</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleDiscover}
          disabled={discovering}
        >
          {discovering ? 'Initiating...' : '✦ Discover Suppliers'}
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>Loading...</div>
      ) : suppliers.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
          <div className="empty-state-icon">🏭</div>
          <div className="empty-state-title">No incumbent suppliers mapped</div>
          <p className="empty-state-description">Run the AI discovery engine to identify manufacturing partners and sourcing footprint.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-md)', alignItems: 'start' }}>
          
          {/* Supplier List Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {suppliers.map(s => (
              <div 
                key={s.id} 
                className={`card ${selectedSupplier?.id === s.id ? 'active' : ''}`}
                style={{ 
                  cursor: 'pointer', 
                  border: selectedSupplier?.id === s.id ? '1px solid var(--accent-amber)' : '1px solid transparent',
                  padding: 'var(--space-sm)'
                }}
                onClick={() => setSelectedSupplier(s)}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{s.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.type}</div>
              </div>
            ))}
          </div>

          {/* Detailed View */}
          {selectedSupplier && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', background: 'linear-gradient(to right, rgba(245, 158, 11, 0.05), transparent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', color: 'var(--accent-amber)' }}>Incumbent</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{selectedSupplier.location}</span>
                    </div>
                    <h2 style={{ fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: 600, margin: 0 }}>
                      {selectedSupplier.name}
                    </h2>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-rose)' }} onClick={() => handleDelete(selectedSupplier.id)}>
                    Remove
                  </button>
                </div>

                <div style={{ marginTop: 'var(--space-md)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {selectedSupplier.companyOverview}
                </div>
              </div>

              {selectedSupplier.winStrategy ? (
                <div style={{ padding: 'var(--space-lg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)' }}>
                  
                  {/* Vulnerability & Strategy */}
                  <div>
                    <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--accent-rose)', marginBottom: 'var(--space-md)' }}>Vulnerability Analysis</h4>
                    
                    <div style={{ marginBottom: 'var(--space-md)' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'block' }}>Why they use them:</strong>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{selectedSupplier.winStrategy.whyCustomerUsesThem}</div>
                    </div>

                    <div style={{ marginBottom: 'var(--space-md)' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'block' }}>Likely Pain Points:</strong>
                      <div style={{ fontSize: '13px', color: 'var(--accent-amber)' }}>{selectedSupplier.winStrategy.likelyPainPoints}</div>
                    </div>

                    <div style={{ marginBottom: 'var(--space-xl)', padding: 'var(--space-sm)', background: 'rgba(244, 63, 94, 0.05)', borderLeft: '3px solid var(--accent-rose)' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'block' }}>Vulnerabilities:</strong>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{selectedSupplier.winStrategy.vulnerabilities}</div>
                    </div>

                    <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--accent-emerald)', marginBottom: 'var(--space-md)' }}>Aquarelle Win Strategy</h4>
                    <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm)', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid var(--accent-emerald)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        {selectedSupplier.winStrategy.whatAquarelleDoesBetter}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-emerald)', marginTop: 'var(--space-sm)' }}>
                        Est. Probability of Win: {selectedSupplier.winStrategy.estimatedWinProbability}%
                      </div>
                    </div>
                  </div>

                  {/* Capabilities Comparison */}
                  <div>
                    <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>Capabilities & Emphases</h4>
                    
                    <div style={{ marginBottom: 'var(--space-md)' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Aquarelle Capabilities to Emphasize:</strong>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: 'var(--accent-cyan)' }}>
                        {safeJsonParse(selectedSupplier.winStrategy.capabilitiesToEmphasize).map((item: string, i: number) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>

                    <div style={{ marginBottom: 'var(--space-md)' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Topics/Capabilities to Avoid:</strong>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {safeJsonParse(selectedSupplier.winStrategy.capabilitiesToAvoid).map((item: string, i: number) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>

                    <div style={{ marginBottom: 'var(--space-md)' }}>
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Products to Pitch:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {safeJsonParse(selectedSupplier.winStrategy.matchingAquarelleProducts).map((item: string, i: number) => (
                          <span key={i} style={{ background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{item}</span>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginTop: 'var(--space-xl)' }}>
                      <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>Expected Objections</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                        {safeJsonParse(selectedSupplier.winStrategy.expectedObjections).map((obj: string, i: number) => {
                          const responses = safeJsonParse(selectedSupplier.winStrategy.recommendedResponses);
                          return (
                            <div key={i} style={{ padding: 'var(--space-sm)', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-rose)', marginBottom: '4px' }}>&quot;{obj}&quot;</div>
                              <div style={{ fontSize: '12px', color: 'var(--accent-emerald)' }}>→ {responses[i] || 'Address capability gap.'}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                  AI Win Strategy is currently being generated...
                </div>
              )}

              {/* Gaps List */}
              {selectedSupplier.supplierGaps && selectedSupplier.supplierGaps.length > 0 && (
                <div style={{ padding: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
                  <h4 style={{ fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>Specific Gaps Aquarelle Solves</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
                    {selectedSupplier.supplierGaps.map((gap: any) => (
                      <div key={gap.id} style={{ padding: 'var(--space-sm)', background: 'var(--bg-card)', borderLeft: `3px solid var(--accent-cyan)`, borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{gap.gapCategory} Gap</span>
                          {gap.canAquarelleSolveIt && <span style={{ fontSize: '11px', color: 'var(--accent-emerald)', background: 'rgba(16,185,129,0.1)', padding: '2px 4px', borderRadius: '4px' }}>Aquarelle Advantage</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{gap.description}</div>
                        <div style={{ fontSize: '11px', color: 'var(--accent-cyan)' }}><strong>Action:</strong> {gap.aquarelleCapability}</div>
                      </div>
                    ))}
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
