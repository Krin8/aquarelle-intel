import re

with open('src/actions/scrape-actions.ts', 'r') as f:
    content = f.read()

content = content.replace("after(async () => {", "setTimeout(async () => {")
content = content.replace("    } // <--- CLOSE THE CATCH BLOCK!\n    }); // <--- CLOSE THE PROMISE", "    }\n    }, 0); // <--- CLOSE SETTIMEOUT")
# Remove after import
content = content.replace("import { after } from 'next/server';", "")

# Also need to fix the old syntax that I replaced. 
# It currently looks like:
#    try {
#      revalidatePath(`/brands/${brandId}`);
#    } catch (e) {
#      // Ignore if revalidatePath fails in background context
#    }
#    }
#    });

# Let's fix it universally:
content = re.sub(r'after\s*\(\s*async\s*\(\)\s*=>\s*\{', 'setTimeout(async () => {', content)
content = re.sub(r'\s*\}\s*\n\s*\}\s*\n\s*\}\s*\);\s*\n\s*return\s*\{\s*success\s*:\s*true\s*\}\s*;', '\n    }\n    }, 100);\n\n    return { success: true };', content)

with open('src/actions/scrape-actions.ts', 'w') as f:
    f.write(content)

print("Done")
