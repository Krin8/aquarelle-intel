import { filterShirts, dedupeProductVariants } from './src/lib/scraper/shirt-filter';
import { categorizeProducts } from './src/lib/ai/analyzers/product-categorizer';

async function test() {
  const products = [
    { name: 'AE Boxy Fit Rugby Shirt', sourceUrl: 'http://ae.com/rugby', localPrice: 34.96 },
    { name: 'AE Relaxed Coors Light Camp Collar Button-Up Shirt', sourceUrl: 'http://ae.com/camp', localPrice: 41.96 },
    { name: 'AE Slim Fit Logo Pique Polo Shirt', sourceUrl: 'http://ae.com/polo-1', localPrice: 14.97 },
    { name: 'AE Standard Fit Lived-In Pique Polo Shirt', sourceUrl: 'http://ae.com/polo-2', localPrice: 19.46 },
    { name: 'AE Plaid Flannel Shirt', sourceUrl: 'http://ae.com/flannel', localPrice: 20 },
    { name: 'AE Solid Camp Shirt', sourceUrl: 'http://ae.com/solid', localPrice: 20 },
    { name: 'AE Premium Linen Oxford', sourceUrl: 'http://ae.com/oxford', localPrice: 20 },
    { name: 'AE Standard Fit Graphic Logo T-Shirt', sourceUrl: 'http://ae.com/tee', localPrice: 20 },
    { name: 'AE Denim Shirt', sourceUrl: 'http://ae.com/denim', localPrice: 20 },
    { name: 'AE Button-Up Resort Shirt', sourceUrl: 'http://ae.com/resort', localPrice: 20 }
  ];

  console.log('--- RAW PRODUCTS ---', products.length);
  const deduped = dedupeProductVariants(products);
  console.log('--- DEDUPED ---', deduped.length);
  
  const valid = filterShirts(deduped);
  console.log('--- VALID SHIRTS ---', valid.length);
  valid.forEach(p => console.log('  ', p.name));
  
  const categorized = await categorizeProducts(valid, 'American Eagle');
  console.log('--- CATEGORIZED ---', categorized.length);
  categorized.forEach(p => console.log('  ', p.name, '->', p.category));
}

test();
