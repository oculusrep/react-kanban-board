# Feature: Property Notes Chat-Style Display with Edit/Delete Permissions

**Date:** March 31, 2026
**Components:** PropertyActivityTab, usePropertyTimeline
**Type:** Enhancement

## Overview

Enhanced the property pin detail sidebar's Activity tab to display notes in a chat-style format (matching the Site Submit Chat tab pattern). Notes now show author avatars, names, timestamps, and support inline editing and deletion with role-based permissions.

## Problem

- Notes in the property Activity tab had no author attribution — users couldn't tell who wrote a note
- No edit capability for notes after they were written
- Delete was available to everyone with no confirmation step
- The experience was inconsistent with the Site Submit Chat tab, which showed full author info and had proper edit/delete controls

## Solution

### UI Changes (PropertyActivityTab.tsx)

**Author Display:**
- Notes now show a colored avatar circle with user initials (consistent color per user, same algorithm as Site Submit Chat)
- Author's full name displayed next to the avatar
- Timestamp shown to the right

**Edit Capability:**
- Pencil icon appears on hover for notes the current user authored
- Inline edit mode with textarea, Save/Cancel buttons
- Keyboard shortcuts: Enter to save, Escape to cancel
- `(edited)` indicator shown on edited notes

**Delete with Confirmation:**
- Trash icon appears on hover
- Clicking shows a Yes/No confirmation popup (matching Site Submit Chat pattern)
- Prevents accidental deletions

**Role-Based Permissions:**
| Action | Own Notes | Others' Notes (User) | Others' Notes (Admin) |
|--------|-----------|----------------------|----------------------|
| Edit   | Yes       | No                   | No                   |
| Delete | Yes       | No                   | Yes                  |

- Users can only edit and delete their own notes
- Admins can delete any note but cannot edit others' notes
- Activities (Call, SMS, etc.) can be deleted by owner or admin but cannot be edited
- Email entries from Gmail cannot be deleted or edited

### Data Changes (usePropertyTimeline.ts)

**Author Name Resolution:**
- Hook now fetches author names from the `user` table for all timeline items with a `created_by` field
- Uses a single batch query with `.in('auth_user_id', authorIds)` for efficiency
- Author names attached to items as `created_by_name`

**New `updateNote()` Method:**
- Updates note content in the `property_note` table
- Sets `is_edited = true` and `updated_at` timestamp
- Optimistically updates local state for instant UI feedback

**New Note Author Attribution:**
- When adding a new note, the hook now resolves the current user's name and attaches it to the new item immediately

### Type Changes (timeline.ts)

- Added `is_edited?: boolean` field to `UnifiedTimelineItem` interface

## Database Migration Required

Run this SQL in the Supabase SQL editor:

```sql
ALTER TABLE property_note
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
```

## Files Modified

1. `src/components/property/PropertyActivityTab.tsx`
   - Added `useAuth` hook for current user and role
   - Added `getUserColor()` and `getUserInitials()` helper functions
   - Added edit state management (`editingItemId`, `editContent`)
   - Added delete confirmation state (`confirmDeleteId`)
   - Added `handleEditNote()` handler
   - Rewrote timeline item rendering with avatar, author name, permission-based actions
   - Added inline edit mode with textarea and keyboard shortcuts

2. `src/hooks/usePropertyTimeline.ts`
   - Added author name resolution from `user` table
   - Added `is_edited` to property_note fetch query
   - Added `updateNote()` mutation method
   - Added author name to `addNote()` result

3. `src/types/timeline.ts`
   - Added `is_edited` field to `UnifiedTimelineItem`

## Design Pattern

This implementation follows the same pattern established in `PortalChatTab.tsx` (Site Submit Chat tab):
- Hash-based consistent user colors
- Initials-based avatars
- Hover-to-reveal action buttons
- Delete confirmation popup
- Inline edit with Save/Cancel
- `(edited)` indicator for modified content

## Related Components

- [PortalChatTab.tsx](../src/components/portal/PortalChatTab.tsx) - The model this feature follows
- [PropertyActivityTab.tsx](../src/components/property/PropertyActivityTab.tsx) - The updated component
- [usePropertyTimeline.ts](../src/hooks/usePropertyTimeline.ts) - The data hook with new capabilities
- [PinDetailsSlideout.tsx](../src/components/property/PinDetailsSlideout.tsx) - Parent slideout that hosts this tab

## Related Documentation

- [FEATURE_2025_11_04_PROPERTY_DETAILS_TABS.md](FEATURE_2025_11_04_PROPERTY_DETAILS_TABS.md) - Property details tabs overview
- [ACTIVITY_TAB_IMPROVEMENTS.md](ACTIVITY_TAB_IMPROVEMENTS.md) - General activity tab system
- [PROPERTY_NOTES_AND_DELETE_FIX.md](PROPERTY_NOTES_AND_DELETE_FIX.md) - Previous property notes fixes

---

**Implementation Status:** Complete
**Database Migration:** Required (see SQL above)
**Build Status:** Passing
