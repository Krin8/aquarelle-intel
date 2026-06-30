import re

with open('src/actions/scrape-actions.ts', 'r') as f:
    content = f.read()

# 1. Update signature
content = content.replace(
    'export async function scrapeBrand(brandId: string, options?: { useDataProvider?: boolean; useLinkedin?: boolean }) {',
    "export async function scrapeBrand(brandId: string, options?: { useDataProvider?: boolean; useLinkedin?: boolean; target?: 'all' | 'contacts' | 'overview' | 'images' }) {"
)

# 2. Add target to scrapeUrl
content = content.replace(
    'const result = await scrapeUrl(brand.website, corporateUrl ?? undefined);',
    "const target = options?.target || 'all';\n    const result = await scrapeUrl(brand.website, corporateUrl ?? undefined, target);"
)

# 3. Wrap Contacts
contacts_start = "    // AI Contact Extraction"
contacts_end = """    if (optInContactCount > 0) {
      console.log(`[Scrape] Saved ${optInContactCount} opt-in contacts`);
    }"""
contacts_end_fixed = contacts_end + "\n    }"

# First split
parts = content.split(contacts_start)
if len(parts) == 2:
    parts2 = parts[1].split(contacts_end)
    if len(parts2) == 2:
        new_contacts_block = "    if (target === 'all' || target === 'contacts') {\n" + contacts_start + parts2[0] + contacts_end_fixed
        content = parts[0] + new_contacts_block + parts2[1]

# 4. Wrap Documents
docs_start = "    // Save Scraped Documents"
docs_end = "    console.log(`[Scrape] Saved ${savedDocumentCount} documents`);"
docs_end_fixed = docs_end + "\n    }"

parts = content.split(docs_start)
if len(parts) == 2:
    parts2 = parts[1].split(docs_end)
    if len(parts2) == 2:
        new_docs_block = "    if (target === 'all' || target === 'overview') {\n" + docs_start + parts2[0] + docs_end_fixed
        content = parts[0] + new_docs_block + parts2[1]

with open('src/actions/scrape-actions.ts', 'w') as f:
    f.write(content)

print("Done")
