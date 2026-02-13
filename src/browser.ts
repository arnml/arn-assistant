import { chromium, type Browser, type Page } from 'playwright';

/** Maximum content length returned to Claude to avoid blowing up context. */
const MAX_CONTENT_LENGTH = 16_000;

/** Page navigation timeout (30 seconds). */
const NAV_TIMEOUT = 30_000;

export interface BrowseResult {
  title: string;
  url: string;
  content: string;
  screenshotBuffer?: Buffer;
}

class BrowserClient {
  private browser: Browser | null = null;

  /** Launch headless Chromium if not already running. */
  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      console.log('[Browser] Launching headless Chromium...');
      this.browser = await chromium.launch({ headless: true });
      console.log('[Browser] Ready');
    }
    return this.browser;
  }

  /**
   * Navigate to a URL, extract page text, and optionally take a screenshot.
   */
  async browse(url: string, screenshot = false): Promise<BrowseResult> {
    const browser = await this.ensureBrowser();
    const page: Page = await browser.newPage();

    try {
      console.log(`[Browser] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

      // Wait a bit for JS-rendered content to settle
      await page.waitForTimeout(2000);

      const title = await page.title();
      const finalUrl = page.url();

      // Extract readable text content
      let content = await page.evaluate(() => document.body.innerText);

      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) + '\n...(truncated)';
      }

      let screenshotBuffer: Buffer | undefined;
      if (screenshot) {
        screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
        console.log(`[Browser] Screenshot captured (${screenshotBuffer.length} bytes)`);
      }

      console.log(`[Browser] Done: "${title}" (${content.length} chars)`);

      return { title, url: finalUrl, content, screenshotBuffer };
    } finally {
      await page.close();
    }
  }

  /** Close the browser instance. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('[Browser] Closed');
    }
  }
}

export default BrowserClient;
