import type { Browser } from 'puppeteer';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Automates Google Search in AI Mode via Puppeteer.
 * Navigates to google.com/search?udm=50, types the query, waits for the
 * AI-generated response, and extracts cited results from the DOM.
 *
 * Uses stealth plugin (already applied at the caller level) and human-like
 * delays to reduce CAPTCHA / rate-limit risk.
 */
export async function runGoogleAiSearch(
  browser: Browser,
  query: string
): Promise<SearchResult[]> {
  const page = await browser.newPage();

  try {
    // ── Realistic viewport & UA ──────────────────────────────────────────────
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    // ── Navigate to Google AI Mode ───────────────────────────────────────────
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=50`;
    console.log(`[GoogleAI] Navigating to AI Mode for: "${query}"`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Human-like wait for the page to stabilise
    await humanDelay(1500, 3000);

    // ── Check for CAPTCHA / consent walls ────────────────────────────────────
    const pageContent = await page.content();

    // Google consent screen (GDPR regions)
    if (pageContent.includes('consent.google.com') || pageContent.includes('Before you continue')) {
      try {
        // Try clicking "Accept all" or "I agree"
        const acceptBtn = await page.$('button[id="L2AGLb"], button[aria-label="Accept all"]');
        if (acceptBtn) {
          await acceptBtn.click();
          await humanDelay(1000, 2000);
        }
      } catch {
        // If consent fails, continue — results might still load
      }
    }

    // CAPTCHA detection — wait for the user to solve it since we are in non-headless mode
    if (
      pageContent.includes('unusual traffic') ||
      pageContent.includes('captcha') ||
      pageContent.includes('recaptcha')
    ) {
      console.warn(`[GoogleAI] CAPTCHA detected for query "${query}". PLEASE SOLVE IT IN THE BROWSER WITHIN 90 SECONDS...`);
      try {
        // Wait until the 'unusual traffic' message disappears from the page
        await page.waitForFunction(() => {
          const text = document.body.innerText.toLowerCase();
          return !text.includes('unusual traffic') && !text.includes('solving the above captcha');
        }, { timeout: 90000, polling: 2000 });
        console.log(`[GoogleAI] CAPTCHA solved! Resuming extraction.`);
        await humanDelay(2000, 4000); // Give the actual results a moment to load
      } catch (e) {
        console.warn(`[GoogleAI] CAPTCHA not solved within 90 seconds. Skipping.`);
        return [];
      }
    }

    // ── Wait for AI response to render ───────────────────────────────────────
    // Google AI Mode renders its answer inside various containers.
    // We try multiple selectors that have been observed in the wild.
    const aiSelectors = [
      '[data-attrid="ai_overview"]',     // AI Overview container
      '.wDYxhc',                          // Knowledge panel / AI answer block
      '#kp-wp-tab-overview',              // Overview tab container
      '.xpdopen',                         // Expanded results
      '.MjjYud',                          // Standard search result blocks
      '#search',                          // Fallback: entire search results area
    ];

    let foundSelector = false;
    try {
      await page.waitForSelector(aiSelectors.join(', '), { timeout: 8000 });
      foundSelector = true;
    } catch {
      // It's okay if none are found, we'll extract standard results
    }

    if (!foundSelector) {
      console.warn(`[GoogleAI] No AI response container found for "${query}". Extracting standard results.`);
    }

    // Give the AI content a moment to fully stream in
    await humanDelay(2000, 4000);

    // ── Extract results ──────────────────────────────────────────────────────
    const results: SearchResult[] = await page.evaluate(() => {
      const items: { title: string; snippet: string; url: string }[] = [];

      // Strategy 1: Extract from AI Overview cited sources
      const citedLinks = document.querySelectorAll(
        'a[data-ved][href^="http"], .MjjYud a[href^="http"], .g a[href^="http"]'
      );
      const seenUrls = new Set<string>();

      citedLinks.forEach((el) => {
        const anchor = el as HTMLAnchorElement;
        const href = anchor.href;

        // Skip Google's own links, cached pages, etc.
        if (
          !href ||
          href.includes('google.com') ||
          href.includes('accounts.google') ||
          href.includes('webcache') ||
          href.includes('translate.google') ||
          seenUrls.has(href)
        ) {
          return;
        }
        seenUrls.add(href);

        // Try to find a title — the heading above or inside the link
        const parentBlock =
          anchor.closest('.MjjYud') ||
          anchor.closest('.g') ||
          anchor.closest('.tF2Cxc') ||
          anchor.parentElement;

        const titleEl =
          parentBlock?.querySelector('h3') ||
          parentBlock?.querySelector('[role="heading"]') ||
          anchor;

        const title = titleEl?.textContent?.trim() || '';

        // Snippet: look for the description block near this result
        const snippetEl =
          parentBlock?.querySelector('.VwiC3b') ||
          parentBlock?.querySelector('[data-sncf]') ||
          parentBlock?.querySelector('.lEBKkf') ||
          parentBlock?.querySelector('span');

        const snippet = snippetEl?.textContent?.trim() || '';

        if (title || snippet) {
          items.push({ title, snippet, url: href });
        }
      });

      // Strategy 2: Extract AI overview text as a single "result" if we got it
      const aiOverview =
        document.querySelector('[data-attrid="ai_overview"]') ||
        document.querySelector('.wDYxhc');

      if (aiOverview) {
        const overviewText = aiOverview.textContent?.trim() || '';
        if (overviewText.length > 50) {
          // Don't duplicate if we already captured links
          items.unshift({
            title: 'Google AI Overview',
            snippet: overviewText.slice(0, 1000),
            url: '',
          });
        }
      }

      return items.slice(0, 15);
    });

    // Filter out entries with empty URLs (except the AI Overview entry)
    const cleaned = results.filter(
      (r) => r.url || r.title === 'Google AI Overview'
    );

    console.log(`[GoogleAI] Extracted ${cleaned.length} results for "${query}"`);
    return cleaned;
  } catch (error: any) {
    console.warn(`[GoogleAI] Failed for query "${query}":`, error?.message || error);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
