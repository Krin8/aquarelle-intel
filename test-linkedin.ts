import { scrapeLinkedinEmployees } from './src/lib/scraper/linkedin-scraper';

async function main() {
  console.log("Testing LinkedIn Scraper with new DDG logic...");
  const result = await scrapeLinkedinEmployees("Snitch", "https://www.snitch.com/");
  console.log("LinkedIn Result:", JSON.stringify(result, null, 2));
}

main().catch(console.error);
