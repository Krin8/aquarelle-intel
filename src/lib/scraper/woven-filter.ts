// lib/scraper/woven-filter.ts
export function filterWovens(products: any[]) {
  const allowList = [
    'shirt', 'woven', 'oxford', 'chambray', 'linen', 'poplin', 'seersucker',
    'button-down', 'button-up', 'dress shirt', 'flannel', 'twill',
    'camp collar', 'overshirt', 'shacket'
  ];

  // Block knits, outerwear, suits, and accessories
  const blockList = [
    't-shirt', 'tshirt', 'tee', 'tank', 'knit', 'polo', 'pique', 'rugby',
    'henley', 'jersey', 'hoodie', 'sweatshirt', 'fleece', 'jogger', 'activewear',
    'blazer', 'suit', 'coat', 'jacket', 'vest', 'outerwear',
    'jeans', 'shoes', 'bag', 'hat', 'belt', 'socks', 'underwear',
    'dress', 'romper', 'jumpsuit', 'bodysuit', 'crop'
  ];

  return products.filter(product => {
    const textToSearch = `${product.name} ${product.sourceUrl}`.toLowerCase();

    if (blockList.some(word => textToSearch.includes(word))) {
      return false;
    }

    if (allowList.some(word => textToSearch.includes(word))) {
      return true;
    }

    return false;
  });
}

export function dedupeProductVariants(products: any[]) {
  const seen = new Map<string, any>();

  for (const p of products) {
    if (!p.name || !p.sourceUrl) continue;

    let baseUrl = p.sourceUrl.split('?')[0];
    baseUrl = baseUrl.replace(/[-_](navy|black|white|red|blue|green|grey|gray|tan|olive|khaki|pink|yellow|purple|brown|beige|cream|burgundy|stripe[d]?)\b.*$/i, '');

    const baseName = p.name
      .toLowerCase()
      .replace(/\b(navy|black|white|red|blue|green|grey|gray|tan|olive|khaki|pink|yellow|purple|brown|beige|cream|burgundy)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const key = `${baseName}::${baseUrl}`;
    if (!seen.has(key)) {
      seen.set(key, p);
    }
  }

  return Array.from(seen.values());
}
