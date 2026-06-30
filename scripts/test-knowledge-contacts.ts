import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { findContactsFromKnowledge } from '../src/lib/ai/analyzers/contact-extractor';

async function test() {
  console.log('Testing findContactsFromKnowledge for "Abercrombie & Fitch"...');
  const result = await findContactsFromKnowledge('Abercrombie & Fitch');
  console.log('\n--- FINAL RESULT ---');
  console.log(JSON.stringify(result, null, 2));
  console.log(`Extracted ${result.contacts.length} contacts.`);
}

test();
