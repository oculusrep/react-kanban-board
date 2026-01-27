#!/usr/bin/env ts-node
/**
 * Login Diagnostic Script for Hunter Agent
 * Tests login for NRN and BizJournals with detailed logging
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';

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

    // Step 1: Navigate to login page
    console.log('\n[1/6] Navigating to login page...');
    await page.goto('https://www.nrn.com/user/login', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    console.log(`  Current URL: ${page.url()}`);
    console.log(`  Page title: ${await page.title()}`);

    // Step 2: Wait for page to load
    await page.waitForTimeout(3000);

    // Step 3: Check for form fields
    console.log('\n[2/6] Looking for login form fields...');

    const usernameSelectors = ['input[name="name"]', 'input#edit-name', 'input[type="email"]', 'input[name="email"]'];
    const passwordSelectors = ['input[name="pass"]', 'input#edit-pass', 'input[type="password"]', 'input[name="password"]'];

    let usernameField = null;
    let passwordField = null;
    let usernameSelector = '';
    let passwordSelector = '';

    // Try to find username field
    for (const selector of usernameSelectors) {
      usernameField = await page.$(selector);
      if (usernameField) {
        usernameSelector = selector;
        console.log(`  ✓ Username field found: ${selector}`);
        break;
      }
    }

    // Try to find password field
    for (const selector of passwordSelectors) {
      passwordField = await page.$(selector);
      if (passwordField) {
        passwordSelector = selector;
        console.log(`  ✓ Password field found: ${selector}`);
        break;
      }
    }

    if (!usernameField || !passwordField) {
      console.error('\n❌ Login form fields not found!');
      console.log('\nAvailable form inputs on page:');
      const inputs = await page.$$eval('input', (els) =>
        els.map(el => ({
          type: el.getAttribute('type'),
          name: el.getAttribute('name'),
          id: el.getAttribute('id'),
          placeholder: el.getAttribute('placeholder')
        }))
      );
      console.table(inputs);

      // Save screenshot
      await page.screenshot({ path: 'nrn-login-page.png', fullPage: true });
      console.log('\n📸 Screenshot saved: nrn-login-page.png');
      return false;
    }

    // Step 4: Fill in username
    console.log('\n[3/6] Filling username...');
    await page.fill(usernameSelector, username);
    await page.waitForTimeout(1000);

    // Step 5: Fill in password
    console.log('\n[4/6] Filling password...');
    await page.fill(passwordSelector, password);
    await page.waitForTimeout(1000);

    // Step 6: Submit form
    console.log('\n[5/6] Clicking submit button...');
    const submitSelectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Sign in")',
      '.form-submit'
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
      console.error('  ❌ Could not find submit button');
      return false;
    }

    // Step 7: Wait for navigation
    console.log('\n[6/6] Waiting for post-login navigation...');
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`  Post-login URL: ${currentUrl}`);

    // Check if login was successful
    const isLoggedIn = !currentUrl.includes('/user/login') && !currentUrl.includes('/login');

    if (isLoggedIn) {
      console.log('\n✅ NRN Login SUCCESSFUL!');
      await page.screenshot({ path: 'nrn-logged-in.png', fullPage: true });
      console.log('📸 Screenshot saved: nrn-logged-in.png');
      return true;
    } else {
      console.log('\n❌ NRN Login FAILED - Still on login page');

      // Check for error messages
      const errorMsg = await page.$eval('.messages--error, .error-message, .alert-danger',
        el => el.textContent?.trim()
      ).catch(() => null);

      if (errorMsg) {
        console.log(`  Error message: "${errorMsg}"`);
      }

      await page.screenshot({ path: 'nrn-login-failed.png', fullPage: true });
      console.log('📸 Screenshot saved: nrn-login-failed.png');
      return false;
    }
  } catch (error) {
    console.error('\n❌ Error during NRN login test:', error);
    await page.screenshot({ path: 'nrn-error.png', fullPage: true });
    return false;
  } finally {
    await browser.close();
  }
}

async function testBizJournalsLogin() {
  console.log('\n========================================');
  console.log('Testing BizJournals Login');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
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

    // Step 1: Navigate to login page
    console.log('\n[1/6] Navigating to login page...');
    await page.goto('https://www.bizjournals.com/atlanta/login', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    console.log(`  Current URL: ${page.url()}`);
    console.log(`  Page title: ${await page.title()}`);

    // Step 2: Wait for page to load
    await page.waitForTimeout(4000);

    // Step 3: Check for form fields
    console.log('\n[2/6] Looking for login form fields...');

    const emailSelectors = ['input[name="email"]', 'input[type="email"]', '#email', 'input#username'];
    const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];

    let emailField = null;
    let passwordField = null;
    let emailSelector = '';
    let passwordSelector = '';

    // Try to find email field
    for (const selector of emailSelectors) {
      emailField = await page.$(selector);
      if (emailField) {
        emailSelector = selector;
        console.log(`  ✓ Email field found: ${selector}`);
        break;
      }
    }

    // Try to find password field
    for (const selector of passwordSelectors) {
      passwordField = await page.$(selector);
      if (passwordField) {
        passwordSelector = selector;
        console.log(`  ✓ Password field found: ${selector}`);
        break;
      }
    }

    if (!emailField || !passwordField) {
      console.error('\n❌ Login form fields not found!');
      console.log('\nAvailable form inputs on page:');
      const inputs = await page.$$eval('input', (els) =>
        els.map(el => ({
          type: el.getAttribute('type'),
          name: el.getAttribute('name'),
          id: el.getAttribute('id'),
          placeholder: el.getAttribute('placeholder'),
          class: el.getAttribute('class')
        }))
      );
      console.table(inputs);

      // Save screenshot
      await page.screenshot({ path: 'bizjournals-login-page.png', fullPage: true });
      console.log('\n📸 Screenshot saved: bizjournals-login-page.png');
      return false;
    }

    // Step 4: Fill in email
    console.log('\n[3/6] Filling email...');
    await page.fill(emailSelector, username);
    await page.waitForTimeout(1000);

    // Step 5: Fill in password
    console.log('\n[4/6] Filling password...');
    await page.fill(passwordSelector, password);
    await page.waitForTimeout(1000);

    // Step 6: Submit form
    console.log('\n[5/6] Clicking submit button...');
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '.login-button',
      'button:has-text("Log in")',
      'button:has-text("Sign in")'
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
      console.error('  ❌ Could not find submit button');
      return false;
    }

    // Step 7: Wait for navigation
    console.log('\n[6/6] Waiting for post-login navigation...');
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
    await page.waitForTimeout(5000); // BizJournals may be slower

    const currentUrl = page.url();
    console.log(`  Post-login URL: ${currentUrl}`);

    // Check if login was successful
    const isLoggedIn = !currentUrl.includes('/login') && !currentUrl.includes('/sign-in');

    if (isLoggedIn) {
      console.log('\n✅ BizJournals Login SUCCESSFUL!');
      await page.screenshot({ path: 'bizjournals-logged-in.png', fullPage: true });
      console.log('📸 Screenshot saved: bizjournals-logged-in.png');
      return true;
    } else {
      console.log('\n❌ BizJournals Login FAILED - Still on login page');

      // Check for error messages
      const errorMsg = await page.$eval('.error, .alert-error, .error-message, [class*="error"]',
        el => el.textContent?.trim()
      ).catch(() => null);

      if (errorMsg) {
        console.log(`  Error message: "${errorMsg}"`);
      }

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
  console.log('This script will test login for both NRN and BizJournals');
  console.log('Browsers will open in non-headless mode so you can see what happens\n');

  const nrnSuccess = await testNRNLogin();
  const bizJournalsSuccess = await testBizJournalsLogin();

  console.log('\n========================================');
  console.log('Test Results Summary');
  console.log('========================================\n');
  console.log(`NRN:          ${nrnSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`BizJournals:  ${bizJournalsSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log('\nScreenshots saved in hunter-agent/ directory');
}

main().catch(console.error);
