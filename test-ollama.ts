import { generateStructuredResponse } from './src/lib/ai/ollama-client';
async function run() {
  const res = await generateStructuredResponse(
    'You are a web researcher. Given a brand name, return its corporate/parent-company website URL where executives and corporate contacts are listed. Return JSON { "url": "url_here" }.',
    'Brand: Tommy Hilfiger',
    (t) => JSON.parse(t)
  );
  console.log(res);
}
run().catch(console.error);
