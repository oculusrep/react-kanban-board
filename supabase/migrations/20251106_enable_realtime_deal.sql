-- Enable real-time for deal table
-- This allows the Details tab to receive updates when Critical Dates sync changes to deal fields

ALTER PUBLICATION supabase_realtime ADD TABLE deal;

-- Verify it's enabled
DO $$
BEGIN
  RAISE NOTICE 'Real-time enabled for deal table';
END $$;
