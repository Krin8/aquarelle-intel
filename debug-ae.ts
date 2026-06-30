import * as cheerio from 'cheerio';

async function run() {
  // Check what links on the AE homepage contain shirt-related keywords
  const res = await fetch('https://www.ae.com/intl/en', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
  });
  const data = await res.text();
  const $ = cheerio.load(data);
  
  const keywords = ['shirt', 'top', 'blouse', 'button', 'oxford', 'flannel', 'woven', 'men', 'women', 'clothing'];
  
  const links: { text: string; href: string }[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().substring(0, 50);
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      try {
        const fullUrl = new URL(href, 'https://www.ae.com').href;
        if (fullUrl.includes('ae.com')) {
          links.push({ text, href: fullUrl });
        }
      } catch {}
    }
  });
  
  console.log(`Total links on AE homepage: ${links.length}`);
  
  // Filter to keyword matches
  const matches = links.filter(l => {
    const lower = `${l.text} ${l.href}`.toLowerCase();
    return keywords.some(k => lower.includes(k));
  });
  
  // Dedupe
  const seen = new Set<string>();
  const unique = matches.filter(l => {
    const key = l.href.split('?')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  console.log(`\nKeyword-matching links (${unique.length}):`);
  unique.forEach(l => console.log(`  "${l.text.substring(0,40)}" -> ${l.href.substring(0, 80)}`));
}
run();
