import prisma from '../src/lib/db';

async function main() {
  const brands = await prisma.brand.findMany({
    where: {
      countryOfOrigin: { not: null }
    }
  });
  
  let count = 0;
  for (const b of brands) {
    if (b.countryOfOrigin && b.region !== b.countryOfOrigin) {
      await prisma.brand.update({
        where: { id: b.id },
        data: { region: b.countryOfOrigin }
      });
      count++;
    }
  }
  console.log(`Updated ${count} brands to match their country of origin.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
