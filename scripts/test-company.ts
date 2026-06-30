import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function testCompanySearch() {
  const hKey = process.env.HUNTER_API_KEY;
  
  const names = ['Levi Strauss', 'Levi Strauss & Co', 'Levi Strauss & Co.', 'American Eagle Outfitters'];
  for (const n of names) {
    console.log(`Searching for: ${n}`);
    const res = await fetch(`https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(n)}&api_key=${hKey}`);
    const data = await res.json();
    console.log(`Domain for ${n}:`, data.data?.domain, 'Pattern:', data.data?.pattern);
  }
}

testCompanySearch();
