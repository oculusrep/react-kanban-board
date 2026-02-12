# Hunter Auth Scrapers - OVIS Button Setup

The "Run Auth Scrapers" button in OVIS triggers scrapers for NRN and BizJournals that require login. These must run from your Mac (residential IP) to avoid bot detection.

## One-Time Setup

1. **Open the app once to register it with macOS:**
   ```bash
   open /Users/mike/Documents/GitHub/react-kanban-board/hunter-agent/HunterAuthScrapers.app
   ```

2. **If macOS blocks it** (unidentified developer), go to:
   - System Preferences → Security & Privacy → General
   - Click "Open Anyway" next to the blocked app message

3. **Test the URL scheme works:**
   ```bash
   open "ovis-hunter://run"
   ```
   This should open Terminal and start the scrapers.

## How It Works

1. Click "Run Auth Scrapers" button in OVIS Hunter Sources tab
2. Browser opens the `ovis-hunter://` URL scheme
3. macOS launches the HunterAuthScrapers.app
4. The app opens Terminal and runs the scraper script
5. Scrapers log into NRN and BizJournals using your saved credentials
6. Signals are stored directly to the database
7. Next Hunter run on Render will analyze the new signals

## Troubleshooting

### Button does nothing
- Make sure the app is registered (run the setup command above)
- Check if your browser blocks custom URL schemes

### Scrapers fail with login errors
- Verify credentials in `.env` file:
  ```
  NRN_USERNAME="your-email@example.com"
  NRN_PASSWORD="your-password"
  BIZJOURNALS_USERNAME="your-email@example.com"
  BIZJOURNALS_PASSWORD="your-password"
  ```

### Terminal shows permission errors
- Make sure the script is executable:
  ```bash
  chmod +x hunter-agent/HunterAuthScrapers.app/Contents/MacOS/run-hunter
  ```
