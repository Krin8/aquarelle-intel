import { search } from 'duck-duck-scrape';
async function run() {
  const results = await search('Tommy Hilfiger corporate contact');
  console.log(results.results.map(r => r.url));
}
run().catch(console.error);
