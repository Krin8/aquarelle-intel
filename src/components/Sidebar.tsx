'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    section: 'Intelligence',
    items: [
      { href: '/', label: 'Dashboard', icon: '◈' },
      { href: '/brands', label: 'Brand Directory', icon: '❖' },
      { href: '/intelligence', label: 'AI Insights', icon: '✦' },
      { href: '/regions', label: 'Regions', icon: '◉' },
    ],
  },
  {
    section: 'Actions',
    items: [
      { href: '/brands/new', label: 'Add Brand', icon: '✚' },
      { href: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">◆</div>
        <span className="sidebar-logo-text">Laguna</span>
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
        <div className="sidebar-status">
          <span className="sidebar-status-dot" id="ollama-status"></span>
          <span>Ollama AI</span>
        </div>
      </div>
    </aside>
  );
}
