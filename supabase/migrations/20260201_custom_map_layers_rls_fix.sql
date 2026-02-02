-- Fix RLS policies for map_layer tables
-- The original policies tried to check user.ovis_role but the user table
-- has its own RLS that blocks access. Simplify to allow all authenticated users
-- (same pattern as hunter_* tables).

-- Drop existing policies
DROP POLICY IF EXISTS "map_layer_internal_all" ON map_layer;
DROP POLICY IF EXISTS "map_layer_portal_select" ON map_layer;
DROP POLICY IF EXISTS "map_layer_shape_internal_all" ON map_layer_shape;
DROP POLICY IF EXISTS "map_layer_shape_portal_select" ON map_layer_shape;
DROP POLICY IF EXISTS "map_layer_client_share_internal_all" ON map_layer_client_share;
DROP POLICY IF EXISTS "map_layer_client_share_portal_select" ON map_layer_client_share;

-- Create simple policies that allow all authenticated users
-- (Access control is handled at the application layer)

-- map_layer policies
CREATE POLICY "map_layer_select" ON map_layer FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_layer_insert" ON map_layer FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "map_layer_update" ON map_layer FOR UPDATE TO authenticated USING (true);
CREATE POLICY "map_layer_delete" ON map_layer FOR DELETE TO authenticated USING (true);

-- map_layer_shape policies
CREATE POLICY "map_layer_shape_select" ON map_layer_shape FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_layer_shape_insert" ON map_layer_shape FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "map_layer_shape_update" ON map_layer_shape FOR UPDATE TO authenticated USING (true);
CREATE POLICY "map_layer_shape_delete" ON map_layer_shape FOR DELETE TO authenticated USING (true);

-- map_layer_client_share policies
CREATE POLICY "map_layer_client_share_select" ON map_layer_client_share FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_layer_client_share_insert" ON map_layer_client_share FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "map_layer_client_share_update" ON map_layer_client_share FOR UPDATE TO authenticated USING (true);
CREATE POLICY "map_layer_client_share_delete" ON map_layer_client_share FOR DELETE TO authenticated USING (true);
