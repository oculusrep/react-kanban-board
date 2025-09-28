# Notes Truncation Fix Documentation

## Problem
Notes imported from Salesforce ContentVersion records were truncated at 255 characters due to database import limitations. The full content exists in Salesforce but wasn't being retrieved completely during the initial sync.

## Solution
Use the `fix-all-notes.js` script to fetch and restore full content for all truncated notes.

## Script Details

### File: `fix-all-notes.js`
- **Purpose**: Fetches full content from Salesforce ContentVersion VersionData paths and updates truncated notes
- **Processing Order**: ContentSize descending (largest notes first)
- **Rate Limiting**: 150ms delay between API calls to be respectful to Salesforce
- **Pagination**: Processes ALL records (1,310+) using 1000-record pages

### Prerequisites
1. Ensure credentials are set in `.env`:
   ```
   SALESFORCE_INSTANCE_URL=https://your-instance.salesforce.com
   SALESFORCE_USERNAME=your_username
   SALESFORCE_PASSWORD=your_password
   SALESFORCE_SECURITY_TOKEN=your_security_token
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_key
   ```

2. Install dependencies:
   ```bash
   npm install @supabase/supabase-js
   ```

### How to Run
```bash
node fix-all-notes.js
```

### What the Script Does
1. **SOAP Login**: Authenticates with Salesforce to get session ID
2. **Query ContentVersions**: Finds all text-based content > 255 characters using pagination
3. **Fetch Full Content**: Downloads complete content from Salesforce VersionData paths
4. **Update Database**: Updates corresponding notes in Supabase with full content
5. **Progress Tracking**: Shows real-time progress with success/error counts

### Processing Criteria
- Targets ContentVersions with:
  - VersionData path not null
  - ContentSize > 255 characters
  - FileType in: 'SNOTE', 'TEXT', 'HTML', 'text/plain', 'text/html'
- Processes in ContentSize descending order (largest first)

### Expected Results
- Processes ~1,310 notes total
- Updates truncated notes with full content including rich formatting
- Preserves all existing data while restoring complete content
- Shows progress: "✅ Updated note [id] ([old_length] → [new_length] characters)"

### Monitoring Progress
Check progress with:
```bash
# Check if script is running
ps aux | grep "fix-all-notes"

# Check recent updates count
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
supabase.from('note').select('*', { count: 'exact', head: true }).gte('updated_at', new Date().toISOString().split('T')[0] + 'T00:00:00.000Z').then(({count}) => console.log(\`Updated today: \${count}/1310\`));
"
```

### Important Notes
- Script includes automatic pagination to handle all records (not limited to 1000)
- Uses the original working credentials from git history
- Rate limited to prevent API abuse
- Safe to re-run - only updates notes that actually need fixing
- Always processes largest/most important notes first

### Troubleshooting
- **Credentials Error**: Verify `.env` file has correct Salesforce credentials
- **SOAP Login Failed**: Check instance URL and security token
- **Database Errors**: Verify Supabase connection and permissions
- **Partial Results**: Script uses pagination and will process all records even if >1000

## History
- Original script processed only first 1000 records due to database query limits
- Enhanced with pagination to handle all 1,310+ records in the database
- Credentials restored from git commit 639107d when working version was identified