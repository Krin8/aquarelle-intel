import prisma from './src/lib/db';

async function main() {
  const brand = await prisma.brand.findUnique({
    where: { id: 'cmqrllxc2001ebw05yhcvja0a' },
    include: { aiAnalyses: true }
  });
  console.log("AI Analyses for Snitch:", brand?.aiAnalyses);
}
main();
