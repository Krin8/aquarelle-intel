import re

with open('src/actions/scrape-actions.ts', 'r') as f:
    content = f.read()

# Add import
if "import { after }" not in content:
    content = content.replace("import { revalidatePath } from 'next/cache';", "import { revalidatePath } from 'next/cache';\nimport { after } from 'next/server';")

# Replace Promise.resolve
content = content.replace("Promise.resolve().then(async () => {", "after(async () => {")

with open('src/actions/scrape-actions.ts', 'w') as f:
    f.write(content)

print("Done")
