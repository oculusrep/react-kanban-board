# Dropbox Email Attachments Integration Plan

## Overview

This document outlines the planned integration for saving email attachments from Gmail to Dropbox folders associated with deals and properties.

## Current State (Phase 1 - Completed)

Email attachments are currently:
1. Extracted during Gmail sync via `extractAttachmentsFromParts()` in `gmail.ts`
2. Stored as metadata in the `email_attachments` table
3. Displayed in the `EmailDetailModal` component

**Note:** Attachment content is NOT downloaded - only metadata (filename, size, mime type, Gmail attachment ID) is stored. The actual attachment content remains in Gmail and can be fetched on-demand using the Gmail API.

## Phase 2 - Dropbox Integration (Future)

### Problem Statement

When an email is tagged to CRM objects (via `email_tags` table), users may want the attachments saved to the corresponding Dropbox folders. However, emails can be tagged to multiple objects (e.g., both a deal AND a property), which raises the question of where to store attachments.

### Recommended Approach: Manual User Selection

Rather than automatically uploading attachments (which could create duplicates across folders), provide a user-driven experience:

1. **Display attachment list** in EmailDetailModal (✅ Done)
2. **Add "Save to Dropbox" button** next to each attachment
3. **Show folder picker dialog** with available destinations based on linked CRM objects
4. **Let user select** which folder(s) to save to
5. **Track saved locations** to prevent accidental duplicate uploads

### Database Changes Required

```sql
-- Track where attachments have been saved
CREATE TABLE email_attachment_dropbox_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_attachment_id UUID NOT NULL REFERENCES email_attachments(id) ON DELETE CASCADE,
  dropbox_path TEXT NOT NULL,
  dropbox_file_id TEXT,  -- Dropbox's file ID after upload
  linked_entity_type TEXT NOT NULL,  -- 'deal' or 'property'
  linked_entity_id UUID NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by_id UUID REFERENCES "user"(id),

  -- Prevent duplicate uploads to same path
  UNIQUE(email_attachment_id, dropbox_path)
);
```

### Implementation Steps

#### 1. Gmail Attachment Fetch Function

Add to `supabase/functions/_shared/gmail.ts`:

```typescript
export async function getAttachmentContent(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<{ data: string; size: number }> {
  return await gmailRequest(
    `/users/me/messages/${messageId}/attachments/${attachmentId}`,
    accessToken
  );
}
```

#### 2. New Edge Function: `save-attachment-to-dropbox`

Create `supabase/functions/save-attachment-to-dropbox/index.ts`:

```typescript
// Input: { attachment_id, target_entity_type, target_entity_id }
// Flow:
// 1. Fetch attachment metadata from email_attachments
// 2. Get the email's gmail_id
// 3. Get Gmail access token for the user
// 4. Fetch attachment content from Gmail API
// 5. Get Dropbox folder path from dropbox_mapping for target entity
// 6. Upload to Dropbox using existing DropboxService patterns
// 7. Record in email_attachment_dropbox_links
```

#### 3. UI Components

Update `EmailDetailModal.tsx`:

```tsx
// Add "Save to Dropbox" button
<button
  onClick={() => openDropboxSaveDialog(attachment)}
  className="text-blue-600 hover:text-blue-800"
>
  <CloudArrowUpIcon className="w-4 h-4" />
</button>

// Show saved locations
{attachment.dropbox_links?.map(link => (
  <span className="text-xs text-green-600">
    Saved to {link.linked_entity_type}: {link.dropbox_path}
  </span>
))}
```

Create `DropboxSaveDialog.tsx`:
- Shows list of linked CRM objects (from email_tags)
- Displays Dropbox folder paths for each
- Allows selection of one or more destinations
- Shows existing saves (grayed out / "Already saved")
- Handles the upload with progress indicator

### Folder Path Structure

Based on existing `dropbox_mapping` table and `DropboxService.ts`:

- **Deals:** `/Salesforce Documents/Opportunities/{deal_name}/Email Attachments/`
- **Properties:** `/Salesforce Documents/Properties/{property_name}/Email Attachments/`

Consider creating an `Email Attachments` subfolder to keep email files organized separately from other deal/property documents.

### Security Considerations

1. **RLS Policies:** Users can only save attachments from emails they have visibility to
2. **Dropbox Permissions:** Use the team's Dropbox credentials (already configured)
3. **Rate Limiting:** Implement per-user rate limiting for attachment downloads

### Alternative Approaches Considered

1. **Automatic upload to all linked folders** - Rejected due to duplicate files issue
2. **Upload only to "primary" entity** - Rejected because determining primary is subjective
3. **Single shared attachments folder** - Rejected because it loses the CRM context
4. **Manual user selection** - ✅ Selected - gives users control and prevents duplicates

### Dependencies

- Existing `DropboxService.ts` for upload functionality
- Existing `dropbox_mapping` table for folder paths
- Gmail API attachment endpoint access
- User's Gmail connection for authentication

### Estimated Effort

- Database migration: 1 hour
- Gmail attachment fetch: 2 hours
- Edge function: 4 hours
- UI components: 4 hours
- Testing: 3 hours

**Total: ~14 hours**

## Open Questions

1. Should we support bulk download of all attachments from an email?
2. Should saved attachments be linkable back to the email in the CRM UI?
3. Do we need to handle very large attachments differently (stream vs buffer)?
4. Should we add a "Save all to Dropbox" option for the whole email?
