'use client';

import { useState } from 'react';
import { createPitchTemplate, updatePitchTemplate, deletePitchTemplate } from '@/actions/pitch-actions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SettingsClient({ initialTemplates }: { initialTemplates: any[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  function startEdit(t: any) {
    setEditingId(t.id);
    setName(t.name);
    setPrompt(t.prompt);
    setIsDefault(t.isDefault);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setPrompt('');
    setIsDefault(false);
  }

  async function handleSave() {
    if (!name || !prompt) return alert('Name and Prompt are required');
    
    if (editingId) {
      const res = await updatePitchTemplate(editingId, name, prompt, isDefault);
      if (res.success) {
        setTemplates(templates.map(t => t.id === editingId ? res.template : (isDefault ? { ...t, isDefault: false } : t)));
      } else alert(res.error);
    } else {
      const res = await createPitchTemplate(name, prompt, isDefault);
      if (res.success) {
        setTemplates([res.template, ...templates.map(t => isDefault ? { ...t, isDefault: false } : t)]);
      } else alert(res.error);
    }
    resetForm();
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure?')) return;
    const res = await deletePitchTemplate(id);
    if (res.success) {
      setTemplates(templates.filter(t => t.id !== id));
    } else alert(res.error);
  }

  return (
    <div style={{ padding: 'var(--space-md)' }}>
      <h2 style={{ marginBottom: 'var(--space-md)' }}>Pitch Templates</h2>
      
      <div style={{ display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: '300px 1fr' }}>
        <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-md)', borderRadius: '8px' }}>
          <h3>{editingId ? 'Edit Template' : 'New Template'}</h3>
          <input 
            placeholder="Template Name" 
            value={name} onChange={e => setName(e.target.value)} 
            style={{ width: '100%', padding: '8px', margin: '12px 0', background: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
          />
          <textarea 
            placeholder="System Prompt (Use {brandName}, {description}, etc as context if needed)" 
            value={prompt} onChange={e => setPrompt(e.target.value)} 
            style={{ width: '100%', height: '150px', padding: '8px', margin: '0 0 12px 0', background: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px', resize: 'vertical' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
            Set as Default
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
            {editingId && <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>}
          </div>
        </div>

        <div>
          {templates.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No templates created yet.</p> : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {templates.map(t => (
              <div key={t.id} style={{ background: 'var(--bg-secondary)', padding: 'var(--space-md)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0' }}>
                    {t.name} {t.isDefault && <span style={{ fontSize: '10px', background: 'var(--accent-fuchsia)', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>DEFAULT</span>}
                  </h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>
                    {t.prompt}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => startEdit(t)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>✏️</button>
                  <button onClick={() => handleDelete(t.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
