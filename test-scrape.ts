import { PrismaClient } from '@prisma/client';
import { findDomainAndPatternWithHunter, findRobustDomainPattern } from './src/lib/normalizer/email-pattern';

const prisma = new PrismaClient();

async function test() {
  const brand = await prisma.brand.findFirst({ where: { name: 'American Eagle Outfitters, Inc.' } });
  if (!brand) return console.log('Brand not found');
  
  let { domain: hunterDomain, pattern: hunterPattern } = await findDomainAndPatternWithHunter(brand.name);
  console.log('Hunter init:', hunterDomain, hunterPattern);
  
  if (!hunterDomain && brand.website) {
    hunterDomain = brand.website;
  }
  
  if (hunterDomain) {
    hunterDomain = hunterDomain.replace(/^https?:\/\/(www\.)?/, '').replace(/^www\./, '').split('/')[0];
    
    const parts = hunterDomain.split('.');
    if (parts.length > 2 && !['co', 'com'].includes(parts[parts.length - 2])) {
      hunterDomain = parts.slice(-2).join('.');
    } else if (parts.length > 2) {
      hunterDomain = parts.slice(-3).join('.');
    }

    if (!hunterPattern || hunterPattern === 'unknown') {
      const samplePerson = {
        name: 'Jay Schottenstein',
        firstName: 'Jay',
        lastName: 'Schottenstein'
      };
      console.log('Trying robust pattern for:', hunterDomain);
      hunterPattern = (await findRobustDomainPattern(hunterDomain, [samplePerson])).pattern;
    }
  }
  
  console.log('Final Pattern:', hunterPattern);
}

test().catch(console.error);
