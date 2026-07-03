'use client';

import React from 'react';

type CompanyOverviewProps = {
  brand: {
    name: string;
    parentCompany: string | null;
    countryOfOrigin: string | null;
    city: string | null;
    state: string | null;
    turnover: string | null;
    storesCount: number | null;
    retailPriceMensShirt: string | null;
    priceRange: string | null;
    productType: string | null;
    website: string | null;
  }
};



function getStoreGrade(stores: number | null) {
  if (!stores) return null;
  if (stores > 500) return { label: 'High', color: '#065f46', bg: '#d1fae5', border: '#34d399' };
  if (stores > 150) return { label: 'Medium', color: '#92400e', bg: '#fef3c7', border: '#fbbf24' };
  return { label: 'Small', color: '#1e3a8a', bg: '#dbeafe', border: '#60a5fa' };
}

function getPriceGrade(priceStr: string | null) {
  if (!priceStr) return null;
  const matches = priceStr.match(/\d+(\.\d+)?/g);
  if (!matches) return null;
  const numbers = matches.map(Number);
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;

  if (avg > 120) return { grade: 'A+', color: '#065f46', bg: '#d1fae5', border: '#34d399' };
  if (avg >= 59) return { grade: 'A', color: '#065f46', bg: '#d1fae5', border: '#34d399' };
  if (avg >= 29) return { grade: 'B', color: '#92400e', bg: '#fef3c7', border: '#fbbf24' };
  if (avg >= 19) return { grade: 'C', color: '#9d174d', bg: '#fce7f3', border: '#f472b6' };
  return { grade: 'D', color: '#991b1b', bg: '#fee2e2', border: '#f87171' };
}

export function CompanyOverviewTable({ brand }: CompanyOverviewProps) {
  // We mimic the spreadsheet layout
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <h3 style={{ marginTop: 0, marginBottom: 'var(--space-md)' }}>Company Overview</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
        <thead style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', borderBottom: '2px solid var(--border-strong)' }}>
          <tr>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>Company Name</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>Parent Company</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>Country of Origin</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>City</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>State</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>Turnover (USD)</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>No. of Stores</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>Retail Price (Men's Shirt)</th>
            <th style={{ padding: '8px 10px', fontWeight: 600, borderRight: '1px solid var(--border-default)' }}>Product Type</th>
            <th style={{ padding: '8px 10px', fontWeight: 600 }}>Website</th>
          </tr>
        </thead>
        <tbody>
          <tr className="table-row">
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', color: 'var(--text-primary)', fontWeight: 500 }}>{brand.name}</td>
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', color: brand.parentCompany ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {brand.parentCompany || '-'}
            </td>
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', color: brand.countryOfOrigin ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {brand.countryOfOrigin || '-'}
            </td>
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', color: brand.city ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {brand.city || '-'}
            </td>
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', color: brand.state ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {brand.state || '-'}
            </td>
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', fontWeight: 500, color: brand.turnover ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {brand.turnover || '-'}
            </td>
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', color: brand.storesCount ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{brand.storesCount?.toString() || '-'}</span>
                {(() => {
                  const grade = getStoreGrade(brand.storesCount);
                  if (!grade) return null;
                  return (
                    <span style={{ 
                      backgroundColor: grade.bg, 
                      color: grade.color, 
                      border: `1px solid ${grade.border}`,
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      {grade.label}
                    </span>
                  );
                })()}
              </div>
            </td>
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', color: brand.retailPriceMensShirt ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{brand.retailPriceMensShirt || '-'}</span>
                {(() => {
                  const grade = getPriceGrade(brand.retailPriceMensShirt);
                  if (!grade) return null;
                  return (
                    <span style={{ 
                      backgroundColor: grade.bg, 
                      color: grade.color, 
                      border: `1px solid ${grade.border}`,
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700
                    }}>
                      {grade.grade}
                    </span>
                  );
                })()}
              </div>
            </td>
            <td style={{ padding: '8px 10px', borderRight: '1px solid var(--border-default)', color: brand.productType ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {brand.productType || '-'}
            </td>
            <td style={{ padding: '8px 10px', color: brand.website ? 'var(--accent-indigo)' : 'var(--text-muted)' }}>
              {brand.website ? (
                <a href={brand.website.startsWith('http') ? brand.website : `https://${brand.website}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  {brand.website.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              ) : '-'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
