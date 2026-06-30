import prisma from '../src/lib/db';

async function checkBrands() {
  const brands = await prisma.brand.findMany({
    where: {
      name: { contains: 'American Eagle' }
    }
  });
  console.log('Brands:', brands.map(b => ({ id: b.id, name: b.name, website: b.website })));
}

checkBrands();
