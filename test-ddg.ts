import * as cheerio from 'cheerio';

async function test() {
  const query = "Tommy Hilfiger corporate contact";
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  const results: string[] = [];
  $('.result__url').each((i, el) => {
    results.push($(el).text().trim());
  });
  console.log(results);
}
test().catch(console.error);
