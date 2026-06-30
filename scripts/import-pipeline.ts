import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  const jsonPath = '/Users/navneetbavineni/Downloads/sop-pipeline.json';
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  
  // The JSON has some malformed sections (array with object syntax).
  // We need to fix these before parsing. Replace the problematic "Pipeline Review format" section.
  const fixed = raw.replace(/"Pipeline Review format":\[[\s\S]*?\]/, '"Pipeline Review format":[]');
  
  let data: any;
  try {
    data = JSON.parse(fixed);
  } catch (e) {
    // If still failing, try a more aggressive fix - parse sections individually
    console.log('Standard JSON parse failed, trying section-by-section...');
    // Remove problematic sections and try again
    const cleaned = raw
      .replace(/"Pipeline Review format":\[[\s\S]*?\n\],/g, '"Pipeline Review format":[],')
      .replace(/"Turnover \(USD\)":\s*null,\s*\n\s*"Turnover \(USD\)":\s*null,/g, '"Turnover (USD)": null,');
    data = JSON.parse(cleaned);
  }

  // =========================================================================
  // 1. Import Pipeline Customers from "Cu-Priorti Pro-Appropriate Grid"
  // =========================================================================
  const pipelineGrid = data['Cu-Priorti Pro-Appropriate Grid'] || [];
  
  // Build a lookup of ROS% financial data
  const rosData: Record<string, any> = {};
  const rosFormula = data['Ros% Formula'] || [];
  for (const row of rosFormula) {
    if (row?.Customer) {
      rosData[row.Customer.trim()] = {
        smv: row.smv,
        stdCPU: row['std CPU'],
        actCPU: row['act CPU'],
        stdMargin: row['std Margin'],
        actualMargin: row['Actual Margin'],
        profitPct: row['Profit %'],
        fobPrice: row['FOB PRICE'],
        cpuGrade: row.Column12 || null,
        cpu: row.cpu || null,
        margin: row.margin || null,
      };
    }
  }

  // Build market segmentation lookup from the "MARKET SEGMENTATION-BUYER" section
  const segData = data['MARKET SEGMENTATION-BUYER'] || [];
  const marketBrands: Record<string, { grade: string; volume: string }> = {};
  
  // Parse the segmentation data - it's organized by grade rows
  let currentGrade = '';
  let currentVolume = '';
  for (const row of segData) {
    if (!row) continue;
    const seg = row['AIPL MARKET   SEGMENTATION'];
    if (seg?.startsWith('Grade')) {
      currentGrade = seg.replace('Grade ', '').trim();
    }
    // Extract brand names from Column3, Column4, Column5 (High, Medium, Small volume)
    for (const [col, vol] of [['Column3', 'High'], ['Column4', 'Medium'], ['Column5', 'Small']] as const) {
      const val = row[col];
      if (val && typeof val === 'string' && val.length > 1 && !val.startsWith('>') && !val.startsWith('<') && currentGrade) {
        marketBrands[val.trim()] = { grade: currentGrade, volume: vol };
      }
    }
  }

  let importedCount = 0;
  let skippedCount = 0;

  for (const row of pipelineGrid) {
    if (!row) continue;
    const name = row[' Priortisation Process -Pipeline - Rating Paramaters'];
    if (!name || name === 'Customer') continue; // Skip header row
    
    const region = row['Column3'] || 'Global';
    const pipelineScore = row['Column14'] || null;
    const prospectForAqrlMur = row['Column15'] || null;
    const listType = row['Column2'] || 'Pipeline';

    // Check if brand already exists
    const existing = await prisma.brand.findFirst({
      where: { name: { contains: name.trim().split(' ')[0] } },
    });

    if (existing) {
      // Update existing brand with pipeline data
      const financials = rosData[name.trim()] || null;
      await prisma.brand.update({
        where: { id: existing.id },
        data: {
          customerType: 'pipeline',
          pipelineScore: pipelineScore ? Math.round(pipelineScore) : null,
          pipelineData: financials ? JSON.stringify({
            ...financials,
            prospectForAqrlMur,
            listType,
          }) : null,
          region: mapRegion(region),
        },
      });
      console.log(`  ✅ Updated: ${name.trim()} (pipelineScore: ${pipelineScore})`);
      skippedCount++;
      continue;
    }

    // Create new brand
    const financials = rosData[name.trim()] || null;
    const website = `https://www.${name.trim().toLowerCase().replace(/\s+/g, '')}.com`;

    await prisma.brand.create({
      data: {
        name: name.trim(),
        website,
        status: 'discovered',
        customerType: 'pipeline',
        region: mapRegion(region),
        pipelineScore: pipelineScore ? Math.round(pipelineScore) : null,
        pipelineData: financials ? JSON.stringify({
          ...financials,
          prospectForAqrlMur,
          listType,
        }) : null,
      },
    });
    console.log(`  🆕 Created: ${name.trim()} (${region}, score: ${pipelineScore})`);
    importedCount++;
  }

  // =========================================================================
  // 2. Update Market Segmentation for known brands
  // =========================================================================
  let segUpdated = 0;
  for (const [brandName, seg] of Object.entries(marketBrands)) {
    const existing = await prisma.brand.findFirst({
      where: { name: { contains: brandName.split(' ')[0] } },
    });
    if (existing) {
      await prisma.brand.update({
        where: { id: existing.id },
        data: {
          marketGrade: seg.grade,
          segment: mapSegment(seg.grade),
        },
      });
      console.log(`  📊 Market Grade: ${brandName} → Grade ${seg.grade} (${seg.volume} Volume)`);
      segUpdated++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Import Complete!`);
  console.log(`  Pipeline brands created: ${importedCount}`);
  console.log(`  Pipeline brands updated: ${skippedCount}`);
  console.log(`  Market grades applied: ${segUpdated}`);
  console.log(`========================================\n`);
}

function mapRegion(region: string): string {
  const r = region.toLowerCase();
  if (r.includes('north america') || r.includes('usa')) return 'North America';
  if (r.includes('europe')) return 'Europe';
  if (r.includes('japan') || r.includes('asia')) return 'Asia Pacific';
  if (r.includes('south america')) return 'South America';
  if (r.includes('middle east') || r.includes('uae')) return 'Middle East';
  return 'Global';
}

function mapSegment(grade: string): string {
  switch (grade) {
    case 'A': return 'premium';
    case 'B': return 'mid-range';
    case 'C': return 'value';
    case 'D': return 'fast-fashion';
    default: return 'mid-range';
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Import failed:', e);
    prisma.$disconnect();
    process.exit(1);
  });
