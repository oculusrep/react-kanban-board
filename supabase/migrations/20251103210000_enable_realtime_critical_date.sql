-- Enable real-time replication for critical_date table
-- This allows the frontend to receive instant updates when critical dates change

-- Enable real-time for critical_date table
ALTER PUBLICATION supabase_realtime ADD TABLE critical_date;

-- Verify the table is now in the publication
-- You can check with: SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
