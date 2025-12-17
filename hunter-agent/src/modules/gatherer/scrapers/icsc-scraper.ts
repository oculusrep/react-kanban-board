import { BrowserContext, Page } from 'playwright';
import { HunterContactEnrichment } from '../../../types';
import { config } from '../../../config';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('icsc-scraper');

export interface ICSCContact {
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  profileUrl: string | null;
}

export class ICSCScraper {
  private context: BrowserContext;
  private page: Page | null = null;
  private isLoggedIn = false;

  constructor(context: BrowserContext) {
    this.context = context;
  }

  async initPage(): Promise<Page> {
    if (this.page) {
      await this.page.close();
    }
    this.page = await this.context.newPage();
    return this.page;
  }

  async login(): Promise<boolean> {
    if (this.isLoggedIn) {
      logger.debug('Already logged into ICSC');
      return true;
    }

    if (!this.page) {
      await this.initPage();
    }

    const { username, password } = config.sources.icsc;
    if (!username || !password) {
      logger.error('ICSC credentials not configured');
      return false;
    }

    try {
      logger.info('Navigating to ICSC login page');
      await this.page!.goto('https://www.icsc.com/login', { waitUntil: 'domcontentloaded' });
      await this.randomDelay(2000, 4000);

      // ICSC login form - using Member ID
      await this.page!.fill('input[name="memberId"], input[name="username"], #memberId, #username', username);
      await this.randomDelay(500, 1000);

      await this.page!.fill('input[name="password"], input[type="password"], #password', password);
      await this.randomDelay(500, 1000);

      // Submit
      await this.page!.click('button[type="submit"], input[type="submit"], .login-btn');

      // Wait for navigation
      await this.page!.waitForLoadState('domcontentloaded');
      await this.randomDelay(3000, 5000);

      // Verify login
      const currentUrl = this.page!.url();
      this.isLoggedIn = !currentUrl.includes('/login');

      if (this.isLoggedIn) {
        logger.info('ICSC login successful');
      } else {
        logger.warn('ICSC login may have failed');
      }

      return this.isLoggedIn;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`ICSC login failed: ${message}`);
      return false;
    }
  }

  /**
   * Search ICSC member directory for contacts at a company
   */
  async searchCompany(companyName: string): Promise<ICSCContact[]> {
    if (!this.isLoggedIn) {
      const success = await this.login();
      if (!success) {
        logger.error('Cannot search ICSC - not logged in');
        return [];
      }
    }

    const contacts: ICSCContact[] = [];

    try {
      // Navigate to member search
      const searchUrl = `https://www.icsc.com/search?type=members&query=${encodeURIComponent(companyName)}`;
      logger.info(`Searching ICSC for: ${companyName}`);

      await this.page!.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await this.randomDelay(2000, 4000);

      // Wait for search results
      await this.page!.waitForSelector('.search-results, .member-results, .results-list', { timeout: 10000 }).catch(() => {
        logger.warn('Search results container not found');
      });

      // Get all member cards/rows
      const memberElements = await this.page!.$$('.member-card, .member-row, .search-result-item, .result-item');
      logger.info(`Found ${memberElements.length} potential matches`);

      // Process up to 5 results
      for (const memberEl of memberElements.slice(0, 5)) {
        try {
          const contact = await this.extractContactFromResult(memberEl);
          if (contact) {
            contacts.push(contact);
          }
          await this.randomDelay(1500, 3000); // Be polite between reveals
        } catch (error) {
          logger.warn('Error extracting contact from result');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`ICSC search failed for ${companyName}: ${message}`);
    }

    return contacts;
  }

  /**
   * Search ICSC by person name
   */
  async searchPerson(personName: string, company?: string): Promise<ICSCContact[]> {
    if (!this.isLoggedIn) {
      const success = await this.login();
      if (!success) {
        return [];
      }
    }

    const contacts: ICSCContact[] = [];
    const query = company ? `${personName} ${company}` : personName;

    try {
      const searchUrl = `https://www.icsc.com/search?type=members&query=${encodeURIComponent(query)}`;
      logger.info(`Searching ICSC for person: ${query}`);

      await this.page!.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await this.randomDelay(2000, 4000);

      // Wait for results
      await this.page!.waitForSelector('.search-results, .member-results', { timeout: 10000 }).catch(() => {
        logger.warn('Search results not found');
      });

      const memberElements = await this.page!.$$('.member-card, .member-row, .search-result-item');

      for (const memberEl of memberElements.slice(0, 3)) {
        try {
          const contact = await this.extractContactFromResult(memberEl);
          if (contact) {
            contacts.push(contact);
          }
          await this.randomDelay(1500, 3000);
        } catch (error) {
          logger.warn('Error extracting contact');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`ICSC person search failed: ${message}`);
    }

    return contacts;
  }

  /**
   * Extract contact info from a search result element
   * Handles clicking "reveal" links for email/phone
   */
  private async extractContactFromResult(element: any): Promise<ICSCContact | null> {
    try {
      // Extract basic info
      const name = await element.$eval(
        '.member-name, .name, .contact-name, h3, h4',
        (el: Element) => el.textContent?.trim() || ''
      ).catch(() => '');

      if (!name) {
        return null;
      }

      const title = await element.$eval(
        '.member-title, .title, .job-title',
        (el: Element) => el.textContent?.trim() || ''
      ).catch(() => null);

      const company = await element.$eval(
        '.member-company, .company, .organization',
        (el: Element) => el.textContent?.trim() || ''
      ).catch(() => null);

      // Try to reveal email by clicking the reveal link
      let email: string | null = null;
      const emailRevealLink = await element.$('a:has-text("Show Email"), a:has-text("Reveal Email"), .reveal-email, .show-email');
      if (emailRevealLink) {
        try {
          await emailRevealLink.click();
          await this.randomDelay(500, 1000);
          // After clicking, look for the revealed email
          email = await element.$eval(
            '.email-revealed, .email, a[href^="mailto:"]',
            (el: Element) => {
              const href = el.getAttribute('href');
              if (href && href.startsWith('mailto:')) {
                return href.replace('mailto:', '');
              }
              return el.textContent?.trim() || null;
            }
          ).catch(() => null);
        } catch {
          logger.debug('Could not reveal email');
        }
      } else {
        // Email might already be visible
        email = await element.$eval(
          '.email, a[href^="mailto:"]',
          (el: Element) => {
            const href = el.getAttribute('href');
            if (href && href.startsWith('mailto:')) {
              return href.replace('mailto:', '');
            }
            return el.textContent?.trim() || null;
          }
        ).catch(() => null);
      }

      // Try to reveal phone
      let phone: string | null = null;
      const phoneRevealLink = await element.$('a:has-text("Show Phone"), a:has-text("Reveal Phone"), .reveal-phone, .show-phone');
      if (phoneRevealLink) {
        try {
          await phoneRevealLink.click();
          await this.randomDelay(500, 1000);
          phone = await element.$eval(
            '.phone-revealed, .phone, a[href^="tel:"]',
            (el: Element) => {
              const href = el.getAttribute('href');
              if (href && href.startsWith('tel:')) {
                return href.replace('tel:', '');
              }
              return el.textContent?.trim() || null;
            }
          ).catch(() => null);
        } catch {
          logger.debug('Could not reveal phone');
        }
      } else {
        phone = await element.$eval(
          '.phone, a[href^="tel:"]',
          (el: Element) => {
            const href = el.getAttribute('href');
            if (href && href.startsWith('tel:')) {
              return href.replace('tel:', '');
            }
            return el.textContent?.trim() || null;
          }
        ).catch(() => null);
      }

      // Check for LinkedIn
      const linkedinUrl = await element.$eval(
        'a[href*="linkedin.com"]',
        (el: Element) => (el as HTMLAnchorElement).href
      ).catch(() => null);

      logger.debug(`Extracted contact: ${name}, ${email || 'no email'}, ${phone || 'no phone'}`);

      return {
        name,
        title,
        company,
        email,
        phone,
        linkedinUrl,
        profileUrl: null,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Convert ICSC contacts to Hunter enrichment format
   */
  toEnrichments(leadId: string, contacts: ICSCContact[]): Omit<HunterContactEnrichment, 'id'>[] {
    return contacts.map((contact, index) => ({
      lead_id: leadId,
      person_name: contact.name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
      linkedin_url: contact.linkedinUrl,
      enrichment_source: 'icsc' as const,
      source_url: 'https://www.icsc.com/search?type=members',
      confidence_score: contact.email ? 0.95 : 0.7, // Higher confidence if we got email
      is_verified: false,
      is_primary: index === 0, // First result is primary
    }));
  }

  private async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs) + minMs);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    this.isLoggedIn = false;
  }
}

export default ICSCScraper;
