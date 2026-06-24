import { findCorporateUrl } from './src/lib/scraper/corporate-finder';
import { findLinkedinUrl } from './src/lib/scraper/linkedin-finder';

async function main() {
  console.log("Testing Corporate URL...");
  const corp = await findCorporateUrl('Levis', 'https://levi.in/');
  console.log("Corporate URL:", corp);
  
  console.log("Testing LinkedIn URL...");
  const lnkd = await findLinkedinUrl('Levis', 'https://levi.in/');
  console.log("LinkedIn URL:", lnkd);
}

main().catch(console.error);
