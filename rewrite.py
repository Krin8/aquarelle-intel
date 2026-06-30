import re

with open('src/actions/scrape-actions.ts', 'r') as f:
    content = f.read()

# Replace the block from corporateUrl down to the end of the try block
new_content = content.replace(
    """    // 2) Find Corporate URL if it doesn't exist yet""",
    """    // Run heavy scraping in the background to avoid blocking the Next.js API route and causing timeouts
    Promise.resolve().then(async () => {
      try {
        // 2) Find Corporate URL if it doesn't exist yet"""
)

new_content = new_content.replace(
    """  } catch (error) {
    // Restore previous status on error""",
    """      } catch (backgroundError) {
        console.error('Background scrape failed:', backgroundError);
        await prisma.brand.update({
          where: { id: brandId },
          data: { status: previousStatus },
        }).catch(() => {});
      }
    });

    return { success: true };
  } catch (error) {
    // Restore previous status on error"""
)

with open('src/actions/scrape-actions.ts', 'w') as f:
    f.write(new_content)

print("Done")
