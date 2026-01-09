This specification is designed for **Claude Code** to execute. It leverages your existing **Supabase + React + shadcn/ui** stack while introducing a high-end "Chat-like" notes experience that avoids tab-clutter.

---

# Specification: AI-Ready Activity Notes System

## 1. Database Schema (Supabase/PostgreSQL)

We will implement a dedicated `notes` table. This separates "narrative" data (conversations) from "structured" data (tasks/calls), which is critical for clean AI summarization.

```sql
-- Create a dedicated notes table
CREATE TABLE notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  
  -- Polymorphic associations
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE,
  site_submit_id uuid REFERENCES site_submits(id) ON DELETE CASCADE,
  
  -- Metadata for AI and UX
  is_internal boolean DEFAULT true, -- False only for Site Submits shared with clients
  metadata jsonb DEFAULT '{}',      -- For future AI tagging (e.g., { "sentiment": "positive", "topic": "pricing" })
  
  created_by uuid REFERENCES user_profiles(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notes;

-- Row Level Security (RLS)
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Policy: Internal staff can see everything
CREATE POLICY "Staff can view all notes" ON notes
  FOR SELECT TO authenticated
  USING ( (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'staff' );

-- Policy: Clients can ONLY see non-internal notes on their Site Submits
CREATE POLICY "Clients can view shared site submit notes" ON notes
  FOR SELECT TO authenticated
  USING (
    is_internal = false 
    AND site_submit_id IS NOT NULL 
    AND site_submit_id IN (SELECT id FROM site_submits WHERE client_id = auth.uid())
  );

```

---

## 2. UX Strategy: The "Persistent Dock"

To solve the **"Tab Fatigue"** and **"Map Sidebar conflict,"** we will implement a **Contextual Note Dock**.

* **Placement:** A floating, expandable "Note Card" in the bottom-right corner of the `Slideout` components.
* **Behavior:** When you open a Property or Deal slideout, the Note Card "activates" for that ID. If you close the slideout, the card remains as a small "Ghost Bubble" so you can finish typing while looking at the map.
* **Visuals:** * **Internal Note:** Standard chat bubble.
* **Client Note:** Bordered with a "Client Visible" badge (Lucide `Eye` icon).
* **Toggle:** A simple toggle switch above the input box: `[ Internal | Client ]`.



---

## 3. Implementation Plan for Claude Code

### Task 1: Component Architecture

Create a new directory `src/components/notes/` containing:

1. `NoteStream.tsx`: The scrolling list of messages using `shadcn/ui` ScrollArea and Avatars.
2. `NoteInput.tsx`: A `textarea` that auto-expands. Includes a "Pop-out" button for full-screen mode.
3. `NoteDock.tsx`: The wrapper that handles the floating/snapping logic.

### Task 2: Real-time Integration

Update `src/services/noteService.ts` to include:

* A `subscribeToNotes(recordId)` function using Supabase Realtime to push new notes to the UI without refreshing.

### Task 3: Keyboard Shortcuts

Implement a global listener (using `react-hotkeys-hook` or native listener):

* `Cmd/Ctrl + K`: Focuses the Note Input immediately.
* `Cmd/Ctrl + Enter`: Submits the note.

---

## 4. Decision Points for the User (Finalizing with Claude)

When you run this in Claude Code, you will need to confirm these two final UX details:

1. **The "Ghost" State:** When you navigate away from a record with a half-written note, do you want the note to **auto-save as a draft** or **stay open as a floating bubble** until you hit send?
2. **Activity Feed Interleaving:** Even though notes live in their own table, should they *also* show up in the main Activity Timeline tab as "Chatter" items, or stay strictly in their own floating window?

---

**Would you like me to generate the specific React code for the `NoteDock` component to get you started?**