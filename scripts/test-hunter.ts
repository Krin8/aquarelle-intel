import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function testHunter() {
  const hunterKey = process.env.HUNTER_API_KEY;
  if (!hunterKey) {
    console.error('No HUNTER_API_KEY found');
    return;
  }
  
  // Test domain search
  const company = 'Stripe';
  console.log(`Searching domain for ${company}...`);
  const dsRes = await fetch(`https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(company)}&api_key=${hunterKey}`);
  const dsData = await dsRes.json();
  console.log('Domain search response:', JSON.stringify(dsData.data?.domain));

  // Test email finder
  const domain = dsData.data?.domain || 'stripe.com';
  const firstName = 'John';
  const lastName = 'Collison';
  console.log(`Finding email for ${firstName} ${lastName} at ${domain}...`);
  const efRes = await fetch(`https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${hunterKey}`);
  const efData = await efRes.json();
  console.log('Email finder response:', JSON.stringify(efData.data?.email));
}

testHunter();
