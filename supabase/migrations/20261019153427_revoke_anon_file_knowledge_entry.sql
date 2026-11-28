-- file_knowledge_entry is SECURITY INVOKER, so anon was already stopped by RLS
-- and table grants; this removes the callable surface anyway.
-- Revoke from PUBLIC as well as anon: anon inherits EXECUTE through PUBLIC,
-- so revoking anon alone leaves it callable.
REVOKE EXECUTE ON FUNCTION public.file_knowledge_entry(text, text, text, boolean, jsonb, text[], text, text, integer, jsonb, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.file_knowledge_entry(text, text, text, boolean, jsonb, text[], text, text, integer, jsonb, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.file_knowledge_entry(text, text, text, boolean, jsonb, text[], text, text, integer, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.file_knowledge_entry(text, text, text, boolean, jsonb, text[], text, text, integer, jsonb, jsonb, text) TO service_role;
