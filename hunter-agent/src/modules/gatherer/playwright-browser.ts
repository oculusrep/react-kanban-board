import { chromium } from 'playwright-extra';
import { Browser, BrowserContext } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createLogger } from '../../utils/logger';

// Add stealth plugin to avoid bot detection (Cloudflare, etc.)
chromium.use(StealthPlugin());

const logger = createLogger('playwright-browser');

/**
 * Browser manager for Playwright with memory optimization.
 *
 * Each instance manages a single browser. Create a new instance per source
 * and destroy it after use to minimize memory footprint.
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();

  async initialize(): Promise<void> {
    if (this.browser) {
      logger.debug('Browser already initialized');
      return;
    }

    logger.info('Initializing Playwright browser (memory optimized)');
    this.browser = await chromium.launch({
      headless: true,
      args: [
        // Essential sandboxing
        '--no-sandbox',
        '--disable-setuid-sandbox',

        // Memory optimization flags
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-software-rasterizer',

        // Disable features we don't need
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',

        // Reduce memory usage
        '--js-flags=--max-old-space-size=256',
      ],
    });
    logger.info('Browser initialized successfully');
  }

  async getContext(contextKey: string): Promise<BrowserContext> {
    if (!this.browser) {
      await this.initialize();
    }

    // Return existing context if available
    if (this.contexts.has(contextKey)) {
      logger.debug(`Returning existing context: ${contextKey}`);
      return this.contexts.get(contextKey)!;
    }

    // Create new context with realistic browser settings
    logger.debug(`Creating new context: ${contextKey}`);
    const context = await this.browser!.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 }, // Smaller viewport to save memory
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      geolocation: { latitude: 33.749, longitude: -84.388 }, // Atlanta
    });

    this.contexts.set(contextKey, context);
    return context;
  }

  async clearContext(contextKey: string): Promise<void> {
    const context = this.contexts.get(contextKey);
    if (context) {
      logger.debug(`Clearing context: ${contextKey}`);
      await context.close();
      this.contexts.delete(contextKey);
    }
  }

  async close(): Promise<void> {
    logger.info('Closing browser and all contexts');

    // Close all contexts first
    for (const [key, context] of this.contexts) {
      logger.debug(`Closing context: ${key}`);
      try {
        await context.close();
      } catch (err) {
        // Ignore errors during cleanup
      }
    }
    this.contexts.clear();

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        // Ignore errors during cleanup
      }
      this.browser = null;
    }

    logger.info('Browser closed');
  }

  isInitialized(): boolean {
    return this.browser !== null;
  }
}

export default BrowserManager;
