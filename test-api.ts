import { analyzeWebsite } from './src/lib/ai/analyzers/website-analyzer';
async function main() {
  try {
    const res = await analyzeWebsite("Some markdown about Artknit", "Artknit Studios", "artknit-studios.com");
    console.log(res);
  } catch (e) {
    console.error("Error:", e);
  }
}
main();
