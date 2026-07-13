'use client';

import { useState, useEffect } from 'react';
import { getApiKeysStatus, saveApiKey } from '@/actions/settings-actions';

const PROVIDERS = [
  { id: 'GEMINI', name: 'Google Gemini' },
  { id: 'SERPER', name: 'Serper (Google Search)' },
  { id: 'HUNTER', name: 'Hunter.io' },
  { id: 'MEV', name: 'MyEmailVerifier' },
  { id: 'APOLLO', name: 'Apollo.io' },
  { id: 'FINDYMAIL', name: 'Findymail' },
  { id: 'DROPCONTACT', name: 'Dropcontact' },
  { id: 'PDL', name: 'People Data Labs' },
  { id: 'PROSPEO', name: 'Prospeo' },
];

export function ApiKeysSettingsClient() {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatuses();
  }, []);

  async function fetchStatuses() {
    setLoading(true);
    const data = await getApiKeysStatus();
    setStatuses(data);
    setLoading(false);
  }

  async function handleSave() {
    if (!editingProvider) return;
    const res = await saveApiKey(editingProvider, inputValue);
    if (res.error) {
      alert(res.error);
    } else {
      await fetchStatuses();
      setEditingProvider(null);
      setInputValue('');
    }
  }

  if (loading) {
    return <div>Loading API key configurations...</div>;
  }

  return (
    <div style={{ padding: 'var(--space-md)', background: 'var(--bg-secondary)', borderRadius: '8px', marginTop: 'var(--space-xl)' }}>
      <h2 style={{ marginBottom: 'var(--space-md)' }}>API Keys Configuration</h2>
      <p style={{ marginBottom: 'var(--space-md)', opacity: 0.8 }}>
        Manage your API keys securely. Keys are stored in the database and are never exposed to the client.
      </p>

      <div style={{ display: 'grid', gap: 'var(--space-sm)' }}>
        {PROVIDERS.map(provider => (
          <div key={provider.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-sm)', background: 'var(--bg-primary)', borderRadius: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span style={{ fontWeight: 600 }}>{provider.name}</span>
              <span style={{ 
                fontSize: '0.8rem', 
                padding: '2px 6px', 
                borderRadius: '12px', 
                background: statuses[provider.id] ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                color: '#fff'
              }}>
                {statuses[provider.id] ? 'Configured' : 'Not Configured'}
              </span>
            </div>
            
            {editingProvider === provider.id ? (
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <input 
                  type="password" 
                  value={inputValue} 
                  onChange={e => setInputValue(e.target.value)} 
                  placeholder="Enter new API key"
                  className="input"
                  style={{ width: '250px' }}
                />
                <button onClick={handleSave} className="btn btn-primary">Save</button>
                <button onClick={() => setEditingProvider(null)} className="btn btn-ghost">Cancel</button>
              </div>
            ) : (
              <button onClick={() => { setEditingProvider(provider.id); setInputValue(''); }} className="btn btn-secondary">
                {statuses[provider.id] ? 'Update Key' : 'Set Key'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
