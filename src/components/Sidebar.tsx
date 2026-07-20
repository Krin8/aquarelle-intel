'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    section: 'Intelligence',
    items: [
      { href: '/', label: 'Dashboard', icon: '◈' },
      { href: '/regions', label: 'Countries', icon: '◉' },
      { href: '/regions/scan', label: 'Country Scan', icon: '🔍' },
      { href: '/intelligence', label: 'AI Insights', icon: '✦' },
      { href: '/analytics', label: 'Analytics', icon: '📊' },
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

export function Sidebar() {
  const pathname = usePathname();

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

</aside>
  );
}
