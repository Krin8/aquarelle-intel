export async function categorizeProducts(products: any[], brandName: string) {
  if (!products || products.length === 0) return [];

  return products.map(p => {
    const text = (p.name || '').toLowerCase();
    
    // Default category
    let category = 'casual';
    
    // Print/Pattern keywords
    if (text.includes('print') || 
        text.includes('stripe') || 
        text.includes('check') || 
        text.includes('floral') ||
        text.includes('pattern') ||
        text.includes('plaid') ||
        text.includes('geo')) {
      category = 'prints';
    }
    
    // Denim/Indigo keywords (overrides prints if both are present)
    if (text.includes('denim') || 
        text.includes('indigo') ||
        text.includes('chambray') ||
        text.includes('jean')) {
      category = 'denim/indigo';
    }
    
    // If it's something totally unrelated that slipped through the filter
    if (text.includes('shoe') || text.includes('bag') || text.includes('pant')) {
      category = 'other';
    }

    return { ...p, category };
  });
}
