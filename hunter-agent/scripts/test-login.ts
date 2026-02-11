#!/usr/bin/env ts-node
/**
 * Login Diagnostic Script for Hunter Agent
 * Tests login for NRN and BizJournals with detailed logging
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import path from 'path';

// Add stealth plugin to avoid bot detection
chromium.use(StealthPlugin());

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TIMEOUT = 30000;

async function testNRNLogin() {
  console.log('\n========================================');
  console.log('Testing NRN Login');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: false }); // Set to false to see what's happening
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  try {
    const username = process.env.NRN_USERNAME;
    const password = process.env.NRN_PASSWORD;

    if (!username || !password) {
      console.error('❌ NRN credentials not found in .env file');
      return false;
    }

    console.log('✓ Credentials loaded');
    console.log(`  Username: ${username.substring(0, 3)}***`);

    // Step 1: Navigate to homepage (not the old /user/login which is now 404)
    console.log('\n[1/6] Navigating to NRN homepage...');
    await page.goto('https://www.nrn.com', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    console.log(`  Current URL: ${page.url()}`);
    console.log(`  Page title: ${await page.title()}`);

    // Step 2: Handle any interstitial/popup that appears
    await page.waitForTimeout(2000);

    // NRN shows cookie consent banner - accept it first
    console.log('\n[2/7] Checking for cookie consent...');
    const cookieSelectors = [
      'button:has-text("Accept all")',
      'button:has-text("Accept")',
      'button:has-text("I Accept")',
      'button:has-text("Agree")',
      '[class*="accept"]',
      '#onetrust-accept-btn-handler'
    ];

    for (const selector of cookieSelectors) {
      try {
        const cookieBtn = await page.$(selector);
        if (cookieBtn && await cookieBtn.isVisible()) {
          console.log(`  Found cookie consent, clicking: ${selector}`);
          await cookieBtn.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch {
        continue;
      }
    }

    // NRN often shows a flash/popup - try to dismiss it
    console.log('\n[3/7] Checking for interstitial popup...');
    const dismissSelectors = [
      'button:has-text("Close")',
      'button:has-text("×")',
      'button:has-text("X")',
      '.close-button',
      '[class*="close"]',
      '[aria-label="Close"]',
      '.modal-close',
      'button[class*="dismiss"]'
    ];

    for (const selector of dismissSelectors) {
      try {
        const closeBtn = await page.$(selector);
        if (closeBtn && await closeBtn.isVisible()) {
          console.log(`  Found popup, clicking: ${selector}`);
          await closeBtn.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch {
        continue;
      }
    }

    console.log('\n[4/7] Looking for Sign in button...');
    // Try button first (NRN uses a button with span inside)
    let signInElement = await page.$('button:has-text("Sign in")');
    if (!signInElement) {
      signInElement = await page.$('text=/Sign in/i');
    }

    if (!signInElement) {
      console.error('❌ Sign in button not found');
      await page.screenshot({ path: 'nrn-no-signin.png', fullPage: true });
      return false;
    }

    const isVisible = await signInElement.isVisible();
    if (!isVisible) {
      console.error('❌ Sign in button found but not visible');
      return false;
    }

    console.log('  ✓ Sign in button found, clicking...');
    await signInElement.click();
    await page.waitForTimeout(3000);

    // Step 5: Wait for login form
    console.log('\n[5/7] Waiting for login form...');
    try {
      await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
      console.log('  ✓ Login form appeared');
    } catch {
      console.error('❌ Login form did not appear');
      await page.screenshot({ path: 'nrn-no-form.png', fullPage: true });
      return false;
    }

    // Step 6: Fill in credentials
    console.log('\n[6/7] Filling credentials...');
    await page.fill('input[name="email"], input[type="email"]', username);
    console.log('  ✓ Email filled');
    await page.waitForTimeout(500);

    await page.fill('input[name="password"], input[type="password"]', password);
    console.log('  ✓ Password filled');
    await page.waitForTimeout(500);

    // Step 6: Submit form
    console.log('\n[6/7] Submitting login form...');
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Sign in")',
      'input[type="submit"]'
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        await page.click(selector, { timeout: 3000 });
        submitted = true;
        console.log(`  ✓ Clicked: ${selector}`);
        break;
      } catch {
        continue;
      }
    }

    if (!submitted) {
      // Try pressing Enter as fallback
      await page.keyboard.press('Enter');
      console.log('  ✓ Pressed Enter to submit');
    }

    // Step 7: Verify login
    console.log('\n[7/7] Verifying login...');
    await page.waitForTimeout(5000);

    // First check for error messages in the login form
    const errorMsg = await page.$eval('.error, .alert-error, .error-message, [class*="error"]:not([class*="close"])',
      el => el.textContent?.trim()
    ).catch(() => null);

    if (errorMsg && errorMsg.length > 0 && errorMsg.toLowerCase().includes('invalid')) {
      console.log(`\n❌ NRN Login FAILED - Error: "${errorMsg}"`);
      await page.screenshot({ path: 'nrn-login-failed.png', fullPage: true });
      console.log('📸 Screenshot saved: nrn-login-failed.png');
      return false;
    }

    // Check for logout button (Iris authentication uses #irisLogoutBtn)
    const logoutBtn = await page.$('#irisLogoutBtn');
    if (logoutBtn && await logoutBtn.isVisible()) {
      console.log('\n✅ NRN Login SUCCESSFUL! (logout button visible)');
      await page.screenshot({ path: 'nrn-logged-in.png', fullPage: true });
      console.log('📸 Screenshot saved: nrn-logged-in.png');
      return true;
    }

    // Check for user account menu/icon that appears when logged in
    const userMenuSelectors = [
      '[class*="user-menu"]',
      '[class*="account"]',
      '[class*="profile"]',
      'button:has-text("Account")',
      'a:has-text("My Account")'
    ];

    for (const selector of userMenuSelectors) {
      try {
        const userMenu = await page.$(selector);
        if (userMenu && await userMenu.isVisible()) {
          console.log(`\n✅ NRN Login SUCCESSFUL! (found: ${selector})`);
          await page.screenshot({ path: 'nrn-logged-in.png', fullPage: true });
          console.log('📸 Screenshot saved: nrn-logged-in.png');
          return true;
        }
      } catch {
        continue;
      }
    }

    // Navigate to a protected page to verify login
    console.log('  Checking login by navigating to protected area...');
    await page.goto('https://www.nrn.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // After navigating away, check if Sign In is still visible in header
    const signInStillVisible = await page.$('button:has-text("Sign in")');
    if (!signInStillVisible || !(await signInStillVisible.isVisible())) {
      console.log('\n✅ NRN Login SUCCESSFUL! (Sign in button hidden after navigation)');
      await page.screenshot({ path: 'nrn-logged-in.png', fullPage: true });
      return true;
    }

    console.log('\n❌ NRN Login FAILED - Sign in still visible');
    await page.screenshot({ path: 'nrn-login-failed.png', fullPage: true });
    console.log('📸 Screenshot saved: nrn-login-failed.png');
    return false;

  } catch (error) {
    console.error('\n❌ Error during NRN login test:', error);
    await page.screenshot({ path: 'nrn-error.png', fullPage: true });
    return false;
  } finally {
    await browser.close();
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function testBizJournalsLogin() {
  console.log('\n========================================');
  console.log('Testing BizJournals Login');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    const username = process.env.BIZJOURNALS_USERNAME;
    const password = process.env.BIZJOURNALS_PASSWORD;

    if (!username || !password) {
      console.error('❌ BizJournals credentials not found in .env file');
      return false;
    }

    console.log('✓ Credentials loaded');
    console.log(`  Username: ${username.substring(0, 3)}***`);

    // Step 1: Navigate directly to sign-in page (not the create/sign-in chooser)
    console.log('\n[1/6] Navigating to direct sign-in page...');
    await page.goto('https://www.bizjournals.com/atlanta/login#/sign-in', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    console.log(`  Current URL: ${page.url()}`);
    console.log(`  Page title: ${await page.title()}`);

    // Step 2: Wait for page to load
    await page.waitForTimeout(3000);

    // Step 3: Check for form fields
    console.log('\n[2/6] Looking for login form fields...');

    // Wait for the form to fully load
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });

    const emailField = await page.$('input[type="email"], input[name="email"]');
    const passwordField = await page.$('input[type="password"], input[name="password"]');

    console.log(`  Email field found: ${!!emailField}`);
    console.log(`  Password field found: ${!!passwordField}`);

    if (!emailField || !passwordField) {
      console.error('\n❌ Login form fields not found!');
      await page.screenshot({ path: 'bizjournals-login-page.png', fullPage: true });
      return false;
    }

    // Step 4: Fill in email - click first, then type character by character
    console.log('\n[3/6] Filling email...');
    await emailField.click();
    await page.waitForTimeout(200);
    await emailField.fill(username);
    await page.waitForTimeout(500);

    // Step 5: Fill in password - click first, then type
    console.log('\n[4/6] Filling password...');
    await passwordField.click();
    await page.waitForTimeout(200);
    await passwordField.type(password, { delay: 50 });
    await page.waitForTimeout(500);

    // Step 6: Submit form
    console.log('\n[5/6] Clicking submit button...');
    const submitBtn = await page.$('button[type="submit"], button:has-text("Sign In")');
    if (submitBtn) {
      await submitBtn.click();
      console.log('  ✓ Clicked submit button');
    } else {
      await page.keyboard.press('Enter');
      console.log('  ✓ Pressed Enter');
    }

    // Step 7: Wait for navigation
    console.log('\n[6/6] Waiting for post-login navigation...');
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`  Post-login URL: ${currentUrl}`);

    // Check for error messages first
    const errorMsg = await page.$eval('.alert, .error, [class*="error"]',
      el => el.textContent?.trim()
    ).catch(() => null);

    if (errorMsg) {
      console.log(`  Error message: "${errorMsg}"`);
    }

    // Check if login was successful
    const isLoggedIn = !currentUrl.includes('/login');

    if (isLoggedIn) {
      console.log('\n✅ BizJournals Login SUCCESSFUL!');
      await page.screenshot({ path: 'bizjournals-logged-in.png', fullPage: true });
      console.log('📸 Screenshot saved: bizjournals-logged-in.png');
      return true;
    } else {
      console.log('\n❌ BizJournals Login FAILED - Still on login page');
      await page.screenshot({ path: 'bizjournals-login-failed.png', fullPage: true });
      console.log('📸 Screenshot saved: bizjournals-login-failed.png');
      return false;
    }
  } catch (error) {
    console.error('\n❌ Error during BizJournals login test:', error);
    await page.screenshot({ path: 'bizjournals-error.png', fullPage: true });
    return false;
  } finally {
    await browser.close();
  }
}

// Run tests
async function main() {
  console.log('Hunter Agent - Login Diagnostic Tool\n');
  console.log('This script will test login for NRN only\n');

  const nrnSuccess = await testNRNLogin();

  console.log('\n========================================');
  console.log('Test Results Summary');
  console.log('========================================\n');
  console.log(`NRN:          ${nrnSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log('\nScreenshots saved in hunter-agent/ directory');
}

main().catch(console.error);
