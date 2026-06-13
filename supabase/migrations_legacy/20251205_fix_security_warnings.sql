-- Migration: Fix security warnings from Supabase linter
-- 1. Fix function search_path for update_prospecting_target_updated_at
-- 2. Revoke anon access from restaurant_latest_trends materialized view

-- Fix 1: Recreate function with explicit search_path
CREATE OR REPLACE FUNCTION public.update_prospecting_target_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix 2: Revoke anon access from materialized view (keep authenticated access)
REVOKE SELECT ON public.restaurant_latest_trends FROM anon;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Security fixes applied:';
  RAISE NOTICE '  - update_prospecting_target_updated_at: search_path set to public';
  RAISE NOTICE '  - restaurant_latest_trends: anon access revoked';
END $$;
