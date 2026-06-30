'use client';

import React, { useState } from 'react';
import { saveApiKey } from '@/actions/settings-actions';

interface ApiKeyModalProps {
  isOpen: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function ApiKeyModal({ isOpen, onSave, onCancel }: ApiKeyModalProps) {
  const [provider, setProvider] = useState('HUNTER');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('API Key is required.');
      return;
    }

    setIsSaving(true);
    setError('');

    const res = await saveApiKey(provider, apiKey.trim());
    setIsSaving(false);

    if (res.success) {
      setApiKey('');
      onSave();
    } else {
      setError(res.error || 'Failed to save API key');
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', padding: 'var(--space-lg)', position: 'relative', backgroundColor: 'var(--bg-card)' }}>
        <h2 style={{ marginTop: 0, marginBottom: 'var(--space-xs)' }}>API Key Required</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: 'var(--space-md)' }}>
          All your email discovery API keys failed or ran out of credits. Please provide a fresh API key to continue scraping.
        </p>

        {error && (
          <div style={{ padding: '10px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginBottom: 'var(--space-md)', fontSize: '14px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 'var(--space-sm)' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Provider</label>
            <select 
              value={provider} 
              onChange={e => setProvider(e.target.value)}
              className="input"
              style={{ width: '100%' }}
            >
              <option value="HUNTER">Hunter.io</option>
              <option value="FINDYMAIL">Findymail</option>
              <option value="DROPCONTACT">Dropcontact</option>
              <option value="PDL">People Data Labs (PDL)</option>
              <option value="PROSPEO">Prospeo</option>
              <option value="APOLLO">Apollo (Paid tier only)</option>
            </select>
          </div>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>API Key</label>
            <input 
              type="text" 
              className="input"
              style={{ width: '100%' }}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Paste key here..."
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save & Retry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
