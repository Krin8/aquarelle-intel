import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  await prisma.brand.updateMany({
    where: { name: { contains: 'TH' } },
    data: { corporateUrl: 'https://newsroom.tommy.com/corporate/contact-us/' }
  });
  console.log('Fixed TH corporate URL');
}
run();
