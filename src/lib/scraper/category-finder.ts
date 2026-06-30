// lib/scraper/category-finder.ts

// Keywords that indicate a page lists shirts/tops/woven garments
const SHIRT_KEYWORDS = [
  'shirt', 'button-down', 'button-up', 'oxford',
  'flannel', 'woven', 'linen', 'chambray', 'poplin', 'blouse'
];

// Broader category keywords — these cast a wider net for pages that
// likely contain shirts mixed with other items (e.g., /c/men/tops/)
const BROAD_CATEGORY_KEYWORDS = [
  'tops',  // broad but relevant — shirts live under "tops"
];

// Pages that match keywords but are NOT product listings — skip these
const EXCLUDE_KEYWORDS = [
  'blog', 'story', 'stories', 'about', 'help', 'faq', 'return',
  'gift-card', 'careers', 'press', 'size-chart', 'sustainability',
  'login', 'account', 'cart', 'checkout', 'wishlist', 'review',
  'policy', 'terms', 'privacy', 'sitemap', 'accessibility',
  // Non-shirt clothing categories that waste crawl budget
  'bottoms', 'jeans', 'shorts', 'pants', 'underwear', 'socks',
  'shoes', 'accessories', 'dresses', 'skirt', 'loungewear',
  'activewear', 'swim', 'clearance', 'bestseller', 'new-arrival',
  'multipacks', 'matching-set', 'aerie',
  // Subcategories of tops that are NOT shirts
  't-shirt', 'tank-top', 'tube-top', 'graphic-top',
];

export interface CategoryLink {
  href: string;
  text: string;
  priority: number; // lower = higher priority
}

/**
 * Filters a page's links down to likely shirt/top category listing pages.
 * Run this against the homepage's extracted links.
 * 
 * Strategy: We look for TWO tiers of links:
 *   Tier 1 (priority 1): Links with explicit shirt keywords (best match)
 *   Tier 2 (priority 2): Broad category links like /men/tops/ (has shirts mixed in)
 * 
 * We crawl up to 5 category pages to maximize shirt discovery.
 */
export function findShirtCategoryLinks(
  links: { text: string; href: string }[],
  hostname: string
): CategoryLink[] {
  const seen = new Set<string>();
  const matches: CategoryLink[] = [];

  for (const link of links) {
    if (!link.href.includes(hostname)) continue;

    const lowerHref = link.href.toLowerCase();
    const lowerText = link.text.toLowerCase();

    // Skip excluded pages (non-shirt categories, utility pages)
    if (EXCLUDE_KEYWORDS.some(k => lowerHref.includes(k) || lowerText.includes(k))) continue;

    // Tier 1: Explicit shirt match
    const isShirtMatch = SHIRT_KEYWORDS.some(
      k => lowerHref.includes(k) || lowerText.includes(k)
    );
    
    // Tier 2: Broad category match (has shirts mixed in)
    const isBroadMatch = BROAD_CATEGORY_KEYWORDS.some(
      k => lowerHref.includes(k) || lowerText.includes(k)
    );

    if (!isShirtMatch && !isBroadMatch) continue;

    // Normalize to avoid query-string duplicates of the same category
    const normalized = link.href.split('?')[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    matches.push({
      href: link.href,
      text: link.text,
      priority: isShirtMatch ? 1 : 2
    });
  }

  // Sort: shirt-specific pages first, then broad categories, then by URL length
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.href.length - b.href.length;
  });

  console.log(`[CategoryFinder] Matched links:`, matches.map(m => `P${m.priority}: "${m.text}" -> ${m.href}`));

  return matches.slice(0, 5); // Crawl up to 5 category pages
}
