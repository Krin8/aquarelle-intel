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
    productType: string | null;
    website: string | null;
  }
};

export function CompanyOverviewTable({ brand }: CompanyOverviewProps) {
  // We mimic the spreadsheet layout
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <h3 style={{ marginTop: 0, marginBottom: 'var(--space-md)' }}>Company Overview</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
        <thead style={{ backgroundColor: '#e2e8f0', color: '#1e293b', borderBottom: '2px solid #cbd5e1' }}>
          <tr>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>Company Name</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>Parent Company</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>Country of Origin</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>City</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>State</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>Turnover (USD)</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>No. of Stores</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>Retail Price (Men's Shirt)</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>Product Type</th>
            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Website</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', color: '#0f172a', fontWeight: 500 }}>{brand.name}</td>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', color: brand.parentCompany ? '#0f172a' : '#94a3b8' }}>
              {brand.parentCompany || '-'}
            </td>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', color: brand.countryOfOrigin ? '#0f172a' : '#94a3b8' }}>
              {brand.countryOfOrigin || '-'}
            </td>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', color: brand.city ? '#0f172a' : '#94a3b8' }}>
              {brand.city || '-'}
            </td>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', color: brand.state ? '#0f172a' : '#94a3b8' }}>
              {brand.state || '-'}
            </td>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', fontWeight: 500, color: brand.turnover ? '#0f172a' : '#94a3b8' }}>
              {brand.turnover || '-'}
            </td>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', color: brand.storesCount ? '#0f172a' : '#94a3b8' }}>
              {brand.storesCount?.toString() || '-'}
            </td>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', color: brand.retailPriceMensShirt ? '#0f172a' : '#94a3b8' }}>
              {brand.retailPriceMensShirt || '-'}
            </td>
            <td style={{ padding: '12px 16px', borderRight: '1px solid #e2e8f0', color: brand.productType ? '#0f172a' : '#94a3b8' }}>
              {brand.productType || '-'}
            </td>
            <td style={{ padding: '12px 16px', color: brand.website ? '#2563eb' : '#94a3b8' }}>
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
