import { chromium, Browser, BrowserContext } from 'playwright';
import { createLogger } from '../../utils/logger';

const logger = createLogger('playwright-browser');

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();

  async initialize(): Promise<void> {
    if (this.browser) {
      logger.debug('Browser already initialized');
      return;
    }

    logger.info('Initializing Playwright browser');
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
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
      viewport: { width: 1920, height: 1080 },
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
    for (const [key, context] of this.contexts) {
      logger.debug(`Closing context: ${key}`);
      await context.close();
    }
    this.contexts.clear();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('Browser closed');
  }

  isInitialized(): boolean {
    return this.browser !== null;
  }
}

// Singleton instance
let browserManagerInstance: BrowserManager | null = null;

export function getBrowserManager(): BrowserManager {
  if (!browserManagerInstance) {
    browserManagerInstance = new BrowserManager();
  }
  return browserManagerInstance;
}

export default BrowserManager;
