-- Enable real-time replication for map_layer_shape table
-- This allows live updates across browser windows when shapes are modified

ALTER PUBLICATION supabase_realtime ADD TABLE map_layer_shape;

-- You can verify with: SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
