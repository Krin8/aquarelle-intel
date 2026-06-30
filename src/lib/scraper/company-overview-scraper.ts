import { runDuckDuckGoSearch } from './ddg-search';
import { extractCompanyOverview } from '../ai/analyzers/company-overview-extractor';

export async function scrapeCompanyOverview(brandName: string, websiteContent: string = '', region: string = 'Global') {
  console.log(`[Scrape] Fetching corporate overview for ${brandName} in region ${region}...`);
  
  let searchSnippets = '';

  try {
    // We run a combined query to try and hit ZoomInfo, Volza, Wikipedia, or generic news for revenue and HQ
    const regionSuffix = region !== 'Global' ? ` ${region}` : '';
    const currentYear = new Date().getFullYear();
    const query = `"${brandName}"${regionSuffix} zoominfo OR volza revenue turnover headquarters locations stores ${currentYear}`;
    const ddgResults = await runDuckDuckGoSearch(query);
    
    // Combine top 5 snippets
    searchSnippets = ddgResults.slice(0, 5).map(r => `Title: ${r.title}\nSnippet: ${r.snippet}`).join('\n\n');
  } catch (error) {
    console.warn(`[Scrape] DDG search failed for company overview of ${brandName}. Will rely entirely on AI knowledge base.`, error);
  }

  const overview = await extractCompanyOverview(brandName, searchSnippets, websiteContent, region);
  return overview;
}
