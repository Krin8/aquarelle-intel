import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import prisma from '../src/lib/db';

async function testLevis() {
  const brands = await prisma.brand.findMany({
    where: {
      name: { contains: 'Levi' }
    }
  });
  console.log('Brands found:', brands.map(b => ({ name: b.name, website: b.website })));

  const brand = brands[0];
  if (!brand) return;

  let hunterDomain = brand.website;
  console.log('Original website:', hunterDomain);
  
  if (hunterDomain) {
    // Strip protocols and www
    hunterDomain = hunterDomain.replace(/^https?:\/\/(www\.)?/, '').replace(/^www\./, '').split('/')[0];
    
    // Strip common subdomains
    const parts = hunterDomain.split('.');
    if (parts.length > 2 && !['co', 'com'].includes(parts[parts.length - 2])) {
      hunterDomain = parts.slice(-2).join('.');
    } else if (parts.length > 2) {
      hunterDomain = parts.slice(-3).join('.');
    }
    console.log('Parsed hunterDomain:', hunterDomain);
  } else {
    // If no website, we'd fallback to Hunter company search. Let's see what Hunter returns.
    console.log('No website found. Falling back to Hunter company search...');
    const hRes = await fetch(`https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(brand.name)}&api_key=${process.env.HUNTER_API_KEY}`);
    const hData = await hRes.json();
    console.log('Hunter company search returned domain:', hData.data?.domain);
    hunterDomain = hData.data?.domain;
  }

  // Now let's try to find an email for a known Levis person.
  // I'll make up a name if I don't know one, e.g. "Chip Bergh" (former CEO)
  const firstName = 'Chip';
  const lastName = 'Bergh';
  
  console.log(`\nFinding email for ${firstName} ${lastName} at ${hunterDomain}...`);
  const efRes = await fetch(`https://api.hunter.io/v2/email-finder?domain=${hunterDomain}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${process.env.HUNTER_API_KEY}`);
  const efData = await efRes.json();
  console.log('Email finder response:', JSON.stringify(efData));
}

testLevis();
