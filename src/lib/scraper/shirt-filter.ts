// lib/scraper/shirt-filter.ts
export function filterShirts(products: any[]) {
  const allowList = [
    'shirt', 'oxford', 'flannel', 'chambray', 'linen', 'twill', 'poplin',
    'button-down', 'button-up', 'woven', 'resort', 'overshirt', 'blouse',
    'corduroy', 'seersucker'
  ];

  // Knit/non-woven garments that contain "shirt" in the name but are NOT
  // woven shirts — these were leaking through because they matched the
  // allowList word "shirt" with nothing in blockList to stop them.
  const blockList = [
    't-shirt', 'tshirt', 'tee', 'graphic tee', 'tank', 'knit',
    'polo', 'pique', 'rugby', 'henley', 'jersey', 'performance shirt',
    'golf shirt', 'dri-fit', 'athletic',
    'jeans', 'shoes', 'jacket', 'bag', 'hat', 'belt', 'pants', 'socks',
    'underwear', 'shorts', 'trouser', 'skirt', 'sweater', 'hoodie',
    'sweatshirt', 'fleece',
    // Non-shirt garments that contain "button-up" in the name
    'dress', 'romper', 'jumpsuit', 'bodysuit', 'crop', 'cardigan',
    'coat', 'vest', 'blazer', 'suit'
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
