import prisma from './src/lib/db';

async function main() {
  const brand = await prisma.brand.findUnique({
    where: { id: 'cmqrllxc2001ebw05yhcvja0a' },
    include: { aiAnalyses: { where: { analysisType: 'gap_detection' } } }
  });
  console.log("Gap Detection for Snitch:", brand?.aiAnalyses);
}
main();
