-- Per-contact opt-in for portal users to upload into a deal's Dropbox folder from the
-- portal sidebar's Deal Files section. Upload only: no move, delete, or visibility
-- toggles. Off for everyone by default.
--
-- Portal users cannot grant it to themselves: contact UPDATE is limited to
-- admin / broker_full / va / testing ("Allow operations users to modify contacts").
-- No grants block: column on an existing table, covered by its table grants.

ALTER TABLE public.contact
  ADD COLUMN portal_can_upload_deal_files boolean NOT NULL DEFAULT false;

-- Jared Wright (Starbucks - JW (Coastal GA)), requested 2026-10-16.
UPDATE public.contact
   SET portal_can_upload_deal_files = true
 WHERE id = 'aea6975c-3c90-4b05-a3d7-d6b590739657';
