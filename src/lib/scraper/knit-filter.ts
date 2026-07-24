// lib/scraper/knit-filter.ts
export function filterKnits(products: any[]) {
  const allowList = [
    't-shirt', 'tshirt', 'tee', 'graphic tee', 'tank', 'knit',
    'polo', 'pique', 'rugby', 'henley', 'jersey', 'performance shirt',
    'golf shirt', 'dri-fit', 'athletic', 'hoodie', 'sweatshirt', 'fleece',
    'jogger', 'activewear'
  ];

  // Block formal woven shirts, outerwear, suits, and accessories
  const blockList = [
    'oxford', 'chambray', 'linen', 'poplin', 'seersucker', 'woven',
    'button-down', 'button-up', 'dress shirt', 'blazer', 'suit',
    'coat', 'jacket', 'vest', 'outerwear',
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

/**
 * Dedupes products that are color/size variants of the same item.
 * AE (and most ecommerce sites) generate a distinct sourceUrl per color
 * swatch for the same product, which causes the "4x identical polo" issue.
 * Strips common variant query params and normalizes the product name
 * (drops trailing color words) to collapse these into one entry.
 */
export function dedupeProductVariants(products: any[]) {
  const seen = new Map<string, any>();

  for (const p of products) {
    if (!p.name || !p.sourceUrl) continue;

    let baseUrl = p.sourceUrl.split('?')[0];
    // Strip common color/variant path segments like /color/navy or -navy-blue
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
