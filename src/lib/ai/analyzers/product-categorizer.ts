// lib/ai/analyzers/product-categorizer.ts

interface CategoryRule {
  category: string;
  pattern: RegExp;
}

interface FabricRule {
  tag: string;
  pattern: RegExp;
}

// Order = priority. Specific fabrics first, generic catch-alls last.
// First match wins, so don't reorder without checking knock-on effects.
const CATEGORY_RULES: CategoryRule[] = [
  { category: 'Oxford Shirts', pattern: /\boxford\b/i },
  { category: 'Poplin Shirts', pattern: /\bpoplin\b/i },
  { category: 'Twill Shirts', pattern: /\btwill\b/i },
  { category: 'Heavyweight Flannels', pattern: /\b(heavyweight|brushed|sherpa[-\s]?lined)\s*flannel\b/i },
  { category: 'Flannel Shirts', pattern: /\bflannel\b/i },
  { category: 'Corduroy Shirts', pattern: /\bcord(uroy)?\b/i },
  { category: 'Denim Shirts', pattern: /\bdenim\s*shirt\b/i },
  { category: 'Indigo Shirts', pattern: /\bindigo\b/i },
  { category: 'Chambray Shirts', pattern: /\bchambray\b/i },
  { category: 'Linen Blends', pattern: /\b(linen[-\s]?blend|cotton[-\s]?linen|linen[-\s]?cotton)\b/i },
  { category: 'Linen Shirts', pattern: /\blinen\b/i },
  { category: 'Stretch Shirts', pattern: /\bstretch\b/i },
  { category: 'Embroidered Shirts', pattern: /\bembroider(ed|y)?\b/i },
  { category: 'Printed Shirts', pattern: /\b(print(ed)?|floral|geo|paisley|pattern(ed)?|stripe[d]?|plaid|check(ered|ed)?)\b/i },
  { category: 'Resort Shirts', pattern: /\b(resort|camp\s*(collar|shirt)?|cabana|vacation)\b/i },
  { category: 'Overshirts', pattern: /\b(overshirt|shacket)\b/i },
  { category: 'Business Shirts', pattern: /\b(dress\s*shirt|business\s*shirt|formal\s*shirt|non[-\s]?iron)\b/i },
  { category: "Women's Shirts", pattern: /\b(women'?s|womens|blouse)\b/i },
  { category: 'Premium Woven Shirts', pattern: /\b(premium|luxury)\b/i },
  { category: 'Casual Shirts', pattern: /\b(casual|short\s*sleeve|button[-\s]?down|button[-\s]?up|woven)\b/i },
  // FINAL CATCH-ALL: If a product passed filterShirts (which already excluded
  // polos, tees, henley, rugby, etc.), and it still has "shirt" in the name,
  // it IS a woven shirt — just without a specific fabric/construction keyword.
  // Trust the pre-filter and bucket as Casual Shirts rather than discarding.
  { category: 'Casual Shirts', pattern: /\bshirt\b/i },
];

const FABRIC_TAGS: FabricRule[] = [
  { tag: 'Oxford', pattern: /\boxford\b/i },
  { tag: 'Poplin', pattern: /\bpoplin\b/i },
  { tag: 'Twill', pattern: /\btwill\b/i },
  { tag: 'Chambray', pattern: /\bchambray\b/i },
  { tag: 'Flannel', pattern: /\bflannel\b/i },
  { tag: 'Linen', pattern: /\blinen\b/i },
  { tag: 'Stretch Cotton', pattern: /\bstretch(\s*cotton)?\b/i },
  { tag: 'Organic Cotton', pattern: /\borganic\s*cotton\b/i },
  { tag: 'Recycled Cotton', pattern: /\brecycled\s*cotton\b/i },
  { tag: 'BCI Cotton', pattern: /\bbci\s*cotton\b/i },
  { tag: 'Denim', pattern: /\bdenim\b/i },
  { tag: 'Indigo', pattern: /\bindigo\b/i },
  { tag: 'Corduroy', pattern: /\bcorduroy\b/i },
  { tag: 'Seersucker', pattern: /\bseersucker\b/i },
  { tag: 'Slub Cotton', pattern: /\bslub\b/i },
  { tag: 'Herringbone', pattern: /\bherringbone\b/i },
  { tag: 'Dobby Stripe', pattern: /\bdobby\b/i },
  { tag: 'Yarn Dyed', pattern: /\byarn[-\s]?dyed\b/i },
];

function findCategory(text: string): string | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return null;
}

function findFabricTag(text: string): string | null {
  for (const rule of FABRIC_TAGS) {
    if (rule.pattern.test(text)) return rule.tag;
  }
  return null;
}

/**
 * Classifies each product against the brand's exact taxonomy using regex.
 * Products that don't match any category pattern are discarded — they're
 * almost certainly a knit garment or accessory that slipped past filterShirts,
 * or a woven shirt with an unusual/ambiguous name we should review manually
 * rather than mislabel.
 */
export async function categorizeProducts(products: any[], brandName: string) {
  if (!products || products.length === 0) return [];

  const categorized = products.map(p => {
    const text = `${p.name || ''} ${p.sourceUrl || ''}`;
    const category = findCategory(text);
    const fabricTag = findFabricTag(text);
    return { ...p, category, fabricTag };
  });

  return categorized.filter(p => p.category !== null);
}
