import re

with open('src/lib/scraper/puppeteer-scraper.ts', 'r') as f:
    content = f.read()

# Add target parameter
content = content.replace("export async function scrapeWithPuppeteer(mainUrl: string): Promise<ScrapedContent> {", "export async function scrapeWithPuppeteer(mainUrl: string, target: string = 'all'): Promise<ScrapedContent> {")

# Extract images in extractPageData
image_extraction_code = """
  const images: { src: string; alt: string }[] = [];
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    const alt = $(el).attr('alt') || '';
    if (src && src.startsWith('http')) {
      images.push({ src, alt: alt.slice(0, 100) });
    }
  });

  return {
"""
content = content.replace("  return {\n    url,", image_extraction_code + "    url,")

# Include images in extractPageData return type
content = content.replace("    links,\n    contentLength:", "    links,\n    images,\n    contentLength:")

# Skip subpages if target is 'images'
subpage_logic_old = """
    if (targetLinks.length > 0) {
      console.log(`[DeepCrawl] Found ${targetLinks.length} target sub-pages. Crawling...`);
"""
subpage_logic_new = """
    if (targetLinks.length > 0 && target !== 'images') {
      console.log(`[DeepCrawl] Found ${targetLinks.length} target sub-pages. Crawling...`);
"""
content = content.replace(subpage_logic_old, subpage_logic_new)

# Include images in final combined result
images_return_old = "images: [], // Images are less important for our AI extraction, keeping empty to save space"
images_return_new = "images: target === 'images' ? mainData.images : [],"
content = content.replace(images_return_old, images_return_new)

with open('src/lib/scraper/puppeteer-scraper.ts', 'w') as f:
    f.write(content)

with open('src/lib/scraper/index.ts', 'r') as f:
    index_content = f.read()

index_content = index_content.replace("const content = await scrapeWithPuppeteer(url);", "const content = await scrapeWithPuppeteer(url, target);")

with open('src/lib/scraper/index.ts', 'w') as f:
    f.write(index_content)

print("Done")
