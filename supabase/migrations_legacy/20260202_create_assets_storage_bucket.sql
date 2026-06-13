-- Create the 'assets' storage bucket for client logos and other assets
-- This bucket is public so logos can be displayed in the portal

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assets',
  'assets',
  true,  -- Public bucket for client logos
  2097152,  -- 2MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to the assets bucket
CREATE POLICY "Authenticated users can upload assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'assets');

-- Allow authenticated users to update their uploaded assets
CREATE POLICY "Authenticated users can update assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'assets');

-- Allow authenticated users to delete assets
CREATE POLICY "Authenticated users can delete assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'assets');

-- Allow public read access to assets (for displaying logos)
CREATE POLICY "Public read access to assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'assets');
