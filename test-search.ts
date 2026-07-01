import prisma from './src/lib/db';

async function run() {
  const allBrands = await prisma.brand.findMany();
  console.log('All brands:', allBrands.map(b => b.name).join(', '));
  
  const searchLower = await prisma.brand.findMany({
    where: { name: { contains: 'american' } }
  });
  console.log('Search lowercase "american":', searchLower.length);
  
  const searchUpper = await prisma.brand.findMany({
    where: { name: { contains: 'American' } }
  });
  console.log('Search Titlecase "American":', searchUpper.length);
}
run();
