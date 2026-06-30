'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { setModelPreference } from '@/actions/settings-actions';

const navItems = [
  {
    section: 'Intelligence',
    items: [
      { href: '/', label: 'Dashboard', icon: '◈' },
      { href: '/brands', label: 'Prospect Intelligence', icon: '❖' },
      { href: '/intelligence', label: 'AI Insights', icon: '✦' },
      { href: '/analytics', label: 'Analytics', icon: '📊' },
      { href: '/regions', label: 'Regions', icon: '◉' },
      { href: '/regions/scan', label: 'Region Scan', icon: '🔍' },
    ],
  },
  {
    section: 'Actions',
    items: [
      { href: '/brands/new', label: 'Add Brand', icon: '✚' },
      { href: '/settings/integrations', label: 'Integrations', icon: '🔗' },
      { href: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

export function Sidebar({ initialModel = 'ollama' }: { initialModel?: 'ollama' | 'gemini' }) {
  const pathname = usePathname();
  const [model, setModel] = useState<'ollama' | 'gemini'>(initialModel);
  const router = useRouter();

  const handleModelToggle = async () => {
    try {
      const nextModel = model === 'ollama' ? 'gemini' : 'ollama';
      setModel(nextModel);
      
      // Server action to set cookie
      await setModelPreference(nextModel);
      router.refresh();
    } catch (e) {
      console.error('Failed to toggle model:', e);
      // Revert state if failed
      setModel(model);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon" style={{ position: 'relative', width: '36px', height: '36px', background: 'white', borderRadius: '4px', overflow: 'hidden' }}>
          <img src="/logo.jpeg" alt="Aquarelle Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <span className="sidebar-logo-text">Aquarelle</span>
        <span className="sidebar-logo-badge">INTEL</span>
      </div>

      {navItems.map((section) => (
        <div key={section.section} className="sidebar-section">
          <div className="sidebar-section-title">{section.section}</div>
          <nav className="sidebar-nav">
            {section.items.map((item) => {
              const isActive = item.href === '/' 
                ? pathname === '/' 
                : pathname.startsWith(item.href);
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}

      <div className="sidebar-footer">
        <div 
          className="sidebar-status" 
          onClick={handleModelToggle}
          style={{ 
            cursor: 'pointer', 
            padding: '8px', 
            borderRadius: '6px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            userSelect: 'none'
          }}
          title="Click to toggle AI Model"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="sidebar-status-dot" style={{ backgroundColor: model === 'gemini' ? 'var(--accent-indigo)' : 'var(--accent-emerald)' }}></span>
            <span style={{ fontWeight: 500 }}>{model === 'gemini' ? 'Gemini Pro' : 'Ollama AI'}</span>
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>⟲</span>
        </div>
      </div>
    </aside>
  );
}
