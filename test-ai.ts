import { runWebsiteAnalysis } from './src/actions/ai-actions';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ datasources: { db: { url: "file:./prisma/dev.db" } } });

async function main() {
  const brand = await prisma.brand.findFirst({ where: { name: 'Artknit Studios' } });
  if (!brand) return console.log('Brand not found');
  
  console.log('Running analysis for', brand.name);
  const res = await runWebsiteAnalysis(brand.id);
  console.log('Result:', res);
}
main().catch(console.error);
