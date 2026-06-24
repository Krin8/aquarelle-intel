import { runWebsiteAnalysis, runGapDetection } from './src/actions/ai-actions';

async function main() {
  const brandId = 'cmqrllxc2001ebw05yhcvja0a'; // Snitch brand ID from the URL/logs
  
  console.log("Testing Website Analysis...");
  const analysis = await runWebsiteAnalysis(brandId, 'ollama');
  console.log("Analysis Result:", analysis);

  if (analysis.success) {
      console.log("Testing Gap Detection...");
      const gaps = await runGapDetection(brandId, 'ollama');
      console.log("Gaps Result:", gaps);
  }
}

main().catch(console.error);
