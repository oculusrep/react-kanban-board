-- Comp Database — reuse the existing chat (site_submit_comment) for comps, mirroring how deals were
-- added (a nullable target column + relaxed check). Internal RLS already allows internal users to
-- read/write any comment, so no policy changes are needed. Existing comp_note rows migrate in.

ALTER TABLE site_submit_comment ADD COLUMN IF NOT EXISTS comp_property_id UUID REFERENCES comp_property(id) ON DELETE CASCADE;

ALTER TABLE site_submit_comment DROP CONSTRAINT IF EXISTS site_submit_comment_target_present;
ALTER TABLE site_submit_comment ADD CONSTRAINT site_submit_comment_target_present
  CHECK (site_submit_id IS NOT NULL OR deal_id IS NOT NULL OR comp_property_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_site_submit_comment_comp_property ON site_submit_comment(comp_property_id);

-- Migrate any existing comp-level notes into the chat thread as internal comments.
INSERT INTO site_submit_comment (comp_property_id, author_id, content, visibility, created_at, updated_at)
SELECT comp_property_id, created_by_id, body, 'internal', created_at, updated_at
FROM comp_note
WHERE created_by_id IS NOT NULL AND char_length(trim(body)) > 0;
