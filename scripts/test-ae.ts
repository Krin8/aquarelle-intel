import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function testAE() {
  const hunterKey = process.env.HUNTER_API_KEY;
  const domain = 'ae.com';
  const firstName = 'Michelle';
  const lastName = 'Tarry';
  
  console.log(`Finding email for ${firstName} ${lastName} at ${domain}...`);
  const efRes = await fetch(`https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${hunterKey}`);
  const efData = await efRes.json();
  console.log('Email finder response:', JSON.stringify(efData));
  
  console.log(`Domain search for American Eagle Outfitters...`);
  const dsRes = await fetch(`https://api.hunter.io/v2/domain-search?company=American+Eagle&api_key=${hunterKey}`);
  const dsData = await dsRes.json();
  console.log('Domain search pattern:', dsData.data?.pattern, dsData.data?.domain);
}

testAE();
