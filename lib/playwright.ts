const NAVIGATION_TIMEOUT_MS = 20_000;

// Keep the browser beside the Playwright package instead of in the installing
// user's home directory. Build and runtime users frequently differ on serverless
// hosts, which otherwise makes a browser downloaded during `npm install`
// invisible when the function starts.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';

/** Render a Steam page when its initial response does not contain app capsules. */
export async function renderSteamPage(url: URL) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      locale: 'en-US',
      extraHTTPHeaders: { referer: 'https://store.steampowered.com/' },
    });
    const page = await context.newPage();
    await page.goto(url.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // Steam fills some sale capsules after the document has loaded. Waiting for
    // either a capsule or a short quiet period supports both static and dynamic
    // event templates without depending on a particular sale-page component.
    await Promise.race([
      page.locator('[data-ds-appid], [data-app-id], a[href*="/app/"]').first().waitFor({ timeout: 5_000 }),
      page.waitForLoadState('networkidle', { timeout: 5_000 }),
    ]).catch(() => undefined);

    return page.content();
  } finally {
    await browser.close();
  }
}
