-- Migration: Add admin_update_user function
-- This function allows administrators to update any user's record, bypassing RLS
-- Required because RLS policies prevent direct updates to other users' records

-- Create the function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id UUID,
  p_name TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_ovis_role TEXT DEFAULT NULL,
  p_mobile_phone TEXT DEFAULT NULL,
  p_active BOOLEAN DEFAULT NULL,
  p_permissions JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_result JSONB;
BEGIN
  -- Get the caller's role to verify they're an administrator
  SELECT ovis_role INTO v_caller_role
  FROM public.user
  WHERE auth_user_id = auth.uid();

  -- Only allow administrators to use this function
  IF v_caller_role NOT IN ('administrator', 'broker_full') THEN
    RAISE EXCEPTION 'Only administrators can update user records';
  END IF;

  -- Update the user record
  UPDATE public.user
  SET
    name = COALESCE(p_name, name),
    first_name = COALESCE(p_first_name, first_name),
    last_name = COALESCE(p_last_name, last_name),
    email = COALESCE(p_email, email),
    ovis_role = COALESCE(p_ovis_role, ovis_role),
    mobile_phone = COALESCE(p_mobile_phone, mobile_phone),
    active = COALESCE(p_active, active),
    permissions = CASE
      WHEN p_permissions IS NOT NULL THEN p_permissions
      ELSE permissions
    END,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Return the updated user
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'email', email,
    'permissions', permissions,
    'updated', true
  ) INTO v_result
  FROM public.user
  WHERE id = p_user_id;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users (function will check role internally)
GRANT EXECUTE ON FUNCTION public.admin_update_user TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.admin_update_user IS 'Allows administrators to update any user record, bypassing RLS. Checks caller role internally.';
