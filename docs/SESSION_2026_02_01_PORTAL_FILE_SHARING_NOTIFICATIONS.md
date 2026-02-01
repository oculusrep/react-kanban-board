# Portal File Sharing Notifications - Session Documentation
## February 1, 2026

## Table of Contents
1. [Overview](#overview)
2. [Features Implemented](#features-implemented)
3. [Technical Implementation](#technical-implementation)
4. [Files Modified](#files-modified)
5. [Bug Fixes](#bug-fixes)
6. [Testing Guide](#testing-guide)

---

## Overview

Implemented automatic chat notifications when files are uploaded in the Portal Files tab, and made file attachment names in chat messages clickable to open the file directly in Dropbox. This creates a seamless file-sharing experience where users can share files and collaborators are immediately notified in the chat thread.

**Status:** Complete and Production-Ready
**Build:** Successful

---

## Features Implemented

### 1. File Upload Chat Notifications
When a user uploads a file (via drag & drop or file picker) in the Portal Files tab, a notification is automatically posted to the chat thread:

- Notification format: `shared a file: filename||/dropbox/path`
- Notification visibility: `client` (visible to all portal users)
- Posted to the `site_submit_comment` table
- Appears immediately in the Chat tab

### 2. Clickable File Attachments in Chat
File share notifications in the chat display the filename as a clickable link:

- Blue text styling with hover underline
- Clicking opens the file in a new Dropbox tab
- Uses existing Dropbox shared link generation
- Falls back to non-clickable text for legacy notifications without path data

### 3. Dropbox Token Refresh Integration
File attachment links use the `useDropboxFiles` hook which properly handles:

- Token refresh when access tokens expire
- Path-based detection for property vs deal files
- Error handling for unavailable files

---

## Technical Implementation

### 1. File Share Notification Function

**File: src/components/portal/PortalFilesTab.tsx**

```typescript
const addFileShareNotification = async (siteSubmitId: string, fileName: string, dropboxPath: string) => {
  console.log('📢 addFileShareNotification called:', { siteSubmitId, fileName, dropboxPath });
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      console.error('❌ No user found for file share notification');
      return;
    }

    // Store path encoded in content for later retrieval: "shared a file: filename||/path/to/file"
    const { data, error } = await supabase.from('site_submit_comment').insert({
      site_submit_id: siteSubmitId,
      author_id: user.user.id,
      content: `shared a file: ${fileName}||${dropboxPath}`,
      visibility: 'client',
    }).select();

    if (error) {
      console.error('❌ Error inserting file share notification:', error);
    } else {
      console.log('✅ File share notification added:', data);
    }
  } catch (err) {
    console.error('Error adding file share notification:', err);
  }
};
```

**Called after uploads in both drag & drop and file picker handlers:**

```typescript
// After successful upload in handleDrop:
console.log('📁 Property upload complete. siteSubmitId:', siteSubmitId, 'folderPath:', propertyFiles.folderPath);
if (siteSubmitId && propertyFiles.folderPath) {
  for (const file of Array.from(files)) {
    const filePath = `${propertyFiles.folderPath}/${file.name}`;
    await addFileShareNotification(siteSubmitId, file.name, filePath);
  }
}
```

### 2. File Attachment Parsing

**File: src/components/portal/PortalChatTab.tsx**

```typescript
const parseFileAttachment = (content: string): { fileName: string; dropboxPath: string | null } => {
  // Handle new format with path: "shared a file: filename||/path"
  const pipeMatch = content.match(/shared a file:\s*(.+?)\|\|(.+)/i);
  if (pipeMatch) {
    return { fileName: pipeMatch[1].trim(), dropboxPath: pipeMatch[2].trim() };
  }
  // Handle old format without path: "Shared file: filename"
  const oldMatch = content.match(/shared file:\s*(.+)/i);
  if (oldMatch) {
    return { fileName: oldMatch[1].trim(), dropboxPath: null };
  }
  // Fallback
  return { fileName: content, dropboxPath: null };
};
```

### 3. File Attachment Opening with Token Refresh

**File: src/components/portal/PortalChatTab.tsx**

```typescript
// Dropbox hooks for file attachments
const propertyFiles = useDropboxFiles('property', propertyId || '');
const dealFiles = useDropboxFiles('deal', dealId || '');

const openFileAttachment = async (dropboxPath: string) => {
  console.log('📎 openFileAttachment called with path:', dropboxPath);
  try {
    // Determine if this is a property or deal file based on path
    const isPropertyFile = dropboxPath.toLowerCase().includes('/properties/');
    const isDealFile = dropboxPath.toLowerCase().includes('/opportunities/');

    let link: string | null = null;

    if (isPropertyFile && propertyFiles.getSharedLink) {
      console.log('📎 Getting shared link via property files hook...');
      link = await propertyFiles.getSharedLink(dropboxPath);
    } else if (isDealFile && dealFiles.getSharedLink) {
      console.log('📎 Getting shared link via deal files hook...');
      link = await dealFiles.getSharedLink(dropboxPath);
    } else {
      // Fallback: try property first, then deal
      console.log('📎 Path type unclear, trying property hook first...');
      try {
        link = await propertyFiles.getSharedLink(dropboxPath);
      } catch {
        link = await dealFiles.getSharedLink(dropboxPath);
      }
    }

    if (link) {
      console.log('📎 Got link:', link);
      window.open(link, '_blank');
    } else {
      console.error('Could not get shared link for file');
    }
  } catch (err) {
    console.error('Error opening file attachment:', err);
  }
};
```

### 4. Clickable Rendering in Chat

**File: src/components/portal/PortalChatTab.tsx**

```tsx
{/shared\s*a?\s*file:/i.test(comment.content) ? (() => {
  const { fileName, dropboxPath } = parseFileAttachment(comment.content);
  return (
    <>
      shared a file:{' '}
      {dropboxPath ? (
        <button
          onClick={() => openFileAttachment(dropboxPath)}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
          title="Click to view attachment"
        >
          {fileName}
        </button>
      ) : (
        <span className="font-medium">{fileName}</span>
      )}
    </>
  );
})() : comment.content}
```

---

## Files Modified

### 1. src/components/portal/PortalFilesTab.tsx
**Changes:**
- Added `addFileShareNotification` function
- Called notification after property file uploads in `handleDrop`
- Called notification after property file uploads in `handleFileUpload`
- Added debug logging for upload flow

### 2. src/components/portal/PortalChatTab.tsx
**Changes:**
- Added `propertyId` and `dealId` props to interface
- Added `useDropboxFiles` hooks for property and deal files
- Added `parseFileAttachment` function for parsing notification content
- Added `openFileAttachment` function using hooks for token-refreshed Dropbox access
- Modified comment rendering to make file names clickable
- Added debug logging for file attachment flow

### 3. src/components/portal/PortalDetailSidebar.tsx
**Changes:**
- Updated PortalChatTab usage to pass `propertyId` and `dealId` props:

```tsx
{activeTab === 'chat' && (
  <PortalChatTab
    siteSubmitId={siteSubmit.id}
    showInternalComments={isInternalUser}
    propertyId={siteSubmit.property_id}
    dealId={siteSubmit.deal_id}
  />
)}
```

---

## Bug Fixes

### Bug 1: activity_type Column Not Found
**Error:**
```
Could not find the 'activity_type' column of 'site_submit_comment' in the schema cache
```

**Root Cause:** Initial implementation tried to insert an `activity_type` field that doesn't exist in the database schema.

**Original Code:**
```typescript
const { data, error } = await supabase.from('site_submit_comment').insert({
  site_submit_id: siteSubmitId,
  author_id: user.user.id,
  content: `shared a file: ${fileName}||${dropboxPath}`,
  visibility: 'client',
  activity_type: 'file_added',  // This field doesn't exist!
}).select();
```

**Fix:** Removed the `activity_type` field from the insert. File share notifications are now detected via content pattern matching (`/shared\s*a?\s*file:/i`) instead of a dedicated column.

### Bug 2: Dropbox Invalid Access Token
**Error:**
```
Failed to get shared link: invalid_access_token/
```

**Root Cause:** Original implementation created a new DropboxService instance with env var tokens on each click:

```typescript
// BROKEN: Creates new service with potentially expired tokens
const openFileAttachment = async (dropboxPath: string) => {
  const dropboxService = new DropboxService(
    import.meta.env.VITE_DROPBOX_APP_KEY,
    import.meta.env.VITE_DROPBOX_APP_SECRET,
    import.meta.env.VITE_DROPBOX_REFRESH_TOKEN
  );
  const link = await dropboxService.getSharedLink(dropboxPath);
  // ...
};
```

**Fix:** Use the `useDropboxFiles` hook instead, which:
- Properly handles token refresh
- Uses the established Dropbox connection
- Has built-in error handling

```typescript
// FIXED: Use hooks with proper token refresh
const propertyFiles = useDropboxFiles('property', propertyId || '');
const dealFiles = useDropboxFiles('deal', dealId || '');

const openFileAttachment = async (dropboxPath: string) => {
  const link = await propertyFiles.getSharedLink(dropboxPath);
  // ...
};
```

---

## Testing Guide

### File Upload Notification Testing
1. Navigate to Portal > Map or Pipeline
2. Open a site submit sidebar
3. Go to the FILES tab
4. Upload a file via drag & drop OR file picker
5. Switch to CHAT tab
6. Verify notification appears: "shared a file: filename"
7. Verify the filename is blue and clickable

### Clickable File Testing
1. In the CHAT tab, find a file share notification
2. Click the blue filename
3. Verify a new tab opens with the Dropbox file
4. Verify no authentication errors in console

### Token Refresh Testing
1. Wait for Dropbox token to potentially expire
2. Click a file attachment link
3. Verify the file still opens (token refresh working)
4. Check console for `📎 Got link:` message

### Path Detection Testing
1. Upload a file to Property Files section
2. Verify click uses property path detection
3. Upload a file to Deal Files section (if available)
4. Verify click uses deal path detection

---

## Data Format

### File Share Notification Content Format
```
shared a file: {filename}||{dropbox_path}
```

**Examples:**
```
shared a file: lease_agreement.pdf||/Properties/123 Main St/Documents/lease_agreement.pdf
shared a file: site_photos.zip||/Opportunities/Deal-001/Files/site_photos.zip
```

### Database Schema
```sql
-- Uses existing site_submit_comment table
INSERT INTO site_submit_comment (
  site_submit_id,
  author_id,
  content,       -- "shared a file: filename||/path"
  visibility     -- 'client' for portal visibility
);
```

---

## Debug Console Logs

The implementation includes console logging for troubleshooting:

| Log Prefix | Location | Purpose |
|------------|----------|---------|
| 📁 | PortalFilesTab | File upload completion |
| 📢 | PortalFilesTab | Notification creation |
| ✅ | PortalFilesTab | Notification success |
| ❌ | PortalFilesTab | Notification errors |
| 📎 | PortalChatTab | File attachment opening |

---

## Summary

This session added seamless file sharing notifications to the Portal:

1. **Upload Notifications**: Files uploaded in the Files tab automatically post to chat
2. **Clickable Links**: File names in chat are clickable, opening directly in Dropbox
3. **Token Management**: Uses hooks with proper token refresh, avoiding authentication errors
4. **Backward Compatibility**: Legacy file notifications without paths still display (just not clickable)

---

**Session Date:** February 1, 2026
**Status:** Complete
**Build:** Successful
**Last Updated:** February 1, 2026
