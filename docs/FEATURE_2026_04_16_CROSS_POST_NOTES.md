# Cross-Post Notes Between Property Activity & Site Submit Chat

**Date:** 2026-04-16
**Status:** Complete

## Summary

Added the ability to share notes and comments between the Property Activity timeline and Site Submit Chat threads. Brokers can move any user's comments in either direction with a single click, preserving the original author, timestamp, and content.

## Features

### Property Activity -> Site Submit Chat

- Each note/activity with content shows a purple arrow button (always visible, not hover-only)
- Clicking opens a checkbox picker listing all site submits linked to that property
- **Select All** checkbox at the top to quickly select every site submit
- **Multi-select** support: check multiple site submits and send to all at once
- Posts appear as internal comments in the destination site submit chat
- Original author and timestamp are preserved

### Site Submit Chat -> Property Activity

- Each regular comment shows a purple arrow button (always visible)
- Clicking instantly creates a property note in the linked property's activity timeline
- Original author and timestamp are preserved

### Comment Visibility Toggle

- The Internal/Client-visible badge on site submit comments is now clickable
- Admins can toggle any comment between internal and client-visible
- Non-admins can toggle their own comments
- Useful for cross-posted comments that default to internal

### Email Detail Modal

- Email Received/Sent items in the property activity timeline are now clickable
- Opens the existing EmailDetailModal showing full email content (subject, body, from/to/cc, attachments)

### Admin Edit Permissions

- Admins can now edit any user's notes in Property Activity (previously own only)
- Admins can now edit any user's comments in Site Submit Chat (previously own only)
- RLS migration included: `20260416_admin_edit_notes_comments.sql`

## Technical Details

### Files Modified

- `src/components/portal/PortalChatTab.tsx` - Cross-post to property, visibility toggle
- `src/components/property/PropertyActivityTab.tsx` - Cross-post to site submits, email modal, multi-select picker

### Migration Required

- `supabase/migrations/20260416_admin_edit_notes_comments.sql` - Updates RLS policies on `property_note` and `site_submit_comment` to allow admin updates on any row

### Database Tables Involved

- `property_note` - Destination for site submit -> property cross-posts
- `site_submit_comment` - Destination for property -> site submit cross-posts

### Key Design Decisions

- Cross-posted content copies only the original text (no prefix tags)
- `created_by` / `author_id` is set to the original author, not the mover
- `created_at` is preserved from the source so the note appears in correct chronological order
- Property -> site submit posts default to `internal` visibility (toggleable after posting)
- Cross-post buttons are always visible (not hover-only) for discoverability on all devices
- Batch insert used for multi-select to minimize database round trips

## Commits

- `97bf5635` - feat: Cross-post notes between property activity and site submit chat
- `a8ada0cf` - feat: Preserve original timestamps on cross-posted notes
- `c9c56930` - fix: Show cross-post buttons reliably + preserve original author
- `76944e75` - feat: Open email detail on click + toggleable comment visibility
- `3276b0cf` - fix: Remove prefix tags from cross-posted comments
- `dcbac7bd` - feat: Allow admins to edit anyone's notes and comments
- `31b539d6` - feat: Multi-select site submits when cross-posting from property
