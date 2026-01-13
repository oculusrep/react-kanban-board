# Annual W-9 QuickBooks Invoice Update Procedure

## Overview

This document describes how to update the W-9 attachment on all unpaid invoices in QuickBooks Online. This is typically done once per year when a new W-9 form is issued.

## Prerequisites

1. The new W-9 PDF file must be uploaded to Dropbox at:
   ```
   /Salesforce Documents/Invoice Attachments/W9-Oculus REP - CURRENT.pdf
   ```

2. You must be logged into OVIS as an admin user

3. The `quickbooks-update-w9-attachments` edge function must be deployed

## How It Works

The update function:
1. Queries QuickBooks for all unpaid invoices (Balance > 0)
2. For each invoice:
   - Finds any existing W-9 attachments (files containing "w9" or "w-9" in the name)
   - Deletes the old W-9 attachments
   - Uploads the new W-9 from Dropbox
3. Returns a detailed report of what was updated

## Step-by-Step Instructions

### Step 1: Update the W-9 File in Dropbox

Replace the file at `/Salesforce Documents/Invoice Attachments/W9-Oculus REP - CURRENT.pdf` with the new W-9.

### Step 2: Run Dry Run First (Recommended)

Open the browser console (F12 or Cmd+Option+I) while logged into OVIS and paste:

```javascript
(async () => {
  const authData = localStorage.getItem('ovis-auth-token');
  if (!authData) { console.log('Not logged in!'); return; }
  const { access_token } = JSON.parse(authData);
  console.log('Running W9 update dry run...');
  const response = await fetch(
    'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/quickbooks-update-w9-attachments',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true })
    }
  );
  console.log('Status:', response.status);
  const result = await response.json();
  console.log('Result:', JSON.stringify(result, null, 2));
})();
```

This will show how many unpaid invoices would be updated without making any changes.

### Step 3: Run the Actual Update

Once you've verified the dry run results, run the actual update by changing `dryRun: true` to `dryRun: false`:

```javascript
(async () => {
  const authData = localStorage.getItem('ovis-auth-token');
  if (!authData) { console.log('Not logged in!'); return; }
  const { access_token } = JSON.parse(authData);
  console.log('Updating W9 attachments on all unpaid invoices...');
  const response = await fetch(
    'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/quickbooks-update-w9-attachments',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false })
    }
  );
  console.log('Status:', response.status);
  const result = await response.json();
  console.log('Result:', JSON.stringify(result, null, 2));
})();
```

**Note:** This will take approximately 10-15 seconds to process ~50 invoices (200ms delay between each to avoid rate limiting).

### Step 4: Verify Results

The output will show:
- `totalUnpaidInvoices`: Number of unpaid invoices found
- `updated`: Number successfully updated
- `errors`: Number of errors (if any)
- `results`: Detailed array showing each invoice's status

Example successful output:
```json
{
  "success": true,
  "message": "Updated W-9 attachments on 48 invoices (0 errors)",
  "dryRun": false,
  "totalUnpaidInvoices": 48,
  "updated": 48,
  "skipped": 0,
  "errors": 0,
  "results": [...]
}
```

## Troubleshooting

### "Not logged in!" error
Make sure you're logged into OVIS before running the script.

### 401 Unauthorized
Your session may have expired. Refresh the page, log in again, and retry.

### 403 Forbidden
Only admin users can run this function. Check your user role.

### Individual invoice errors
Check the `results` array for specific invoice errors. Common issues:
- Rate limiting (try again later)
- Invoice was deleted in QBO
- Attachment permissions issue

## Related Files

- Edge Function: `supabase/functions/quickbooks-update-w9-attachments/index.ts`
- W-9 path config: `supabase/functions/_shared/dropbox.ts` (INVOICE_ATTACHMENT_FOLDER)
- Invoice attachment logic: `supabase/functions/quickbooks-sync-invoice/index.ts`

## Notes

- This only updates **unpaid** invoices (Balance > 0)
- Paid invoices are not modified since they're historical records
- New invoices created after this update will automatically get the new W-9 from Dropbox
