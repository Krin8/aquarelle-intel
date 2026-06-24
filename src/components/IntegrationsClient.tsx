'use client';

import { useState } from 'react';
import { connectIntegration, disconnectIntegration } from '@/actions/integration-actions';
import { useRouter } from 'next/navigation';

type IntegrationData = {
  provider: string;
  status: string;
  lastSyncAt: Date | null;
};

const AVAILABLE_INTEGRATIONS = [
  {
    provider: 'salesforce',
    name: 'Salesforce',
    type: 'CRM',
    description: 'Sync extracted decision makers and brand intelligence directly to your Salesforce CRM.',
    icon: '☁️'
  },
  {
    provider: 'wfx',
    name: 'WFX',
    type: 'ERP',
    description: 'Read-only connection to World Fashion Exchange ERP to compare your existing product capabilities against brand gaps.',
    icon: '📦'
  }
];

export function IntegrationsClient({ initialData }: { initialData: IntegrationData[] }) {
  const router = useRouter();
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  async function handleToggle(provider: string, isConnected: boolean) {
    setLoadingMap(prev => ({ ...prev, [provider]: true }));
    try {
      if (isConnected) {
        await disconnectIntegration(provider);
      } else {
        // Mock connection delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        await connectIntegration(provider);
      }
      router.refresh();
    } finally {
      setLoadingMap(prev => ({ ...prev, [provider]: false }));
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Integrations</h1>
          <p className="page-subtitle">Connect CIEL Textiles Intel with your existing tools</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 'var(--space-md)', marginTop: 'var(--space-xl)' }}>
        {AVAILABLE_INTEGRATIONS.map(integration => {
          const dbData = initialData.find(d => d.provider === integration.provider);
          const isConnected = dbData?.status === 'connected';
          const isLoading = loadingMap[integration.provider];

          return (
            <div key={integration.provider} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: '32px' }}>{integration.icon}</span>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{integration.name}</h3>
                    <span className="status-badge discovered" style={{ fontSize: '10px' }}>{integration.type}</span>
                  </div>
                </div>
                {isConnected ? (
                  <span className="status-badge qualified">Connected</span>
                ) : (
                  <span className="status-badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>Disconnected</span>
                )}
              </div>
              
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1, marginBottom: 'var(--space-lg)' }}>
                {integration.description}
              </p>

              {isConnected && dbData?.lastSyncAt && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                  Last synced: {new Date(dbData.lastSyncAt).toLocaleString()}
                </div>
              )}

              <button 
                className={`btn ${isConnected ? 'btn-danger' : 'btn-primary'}`} 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => handleToggle(integration.provider, isConnected)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <><span className="spinner"></span> {isConnected ? 'Disconnecting...' : 'Connecting...'}</>
                ) : (
                  isConnected ? 'Disconnect' : 'Connect'
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
