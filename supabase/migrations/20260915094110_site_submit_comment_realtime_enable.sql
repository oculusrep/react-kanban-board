-- Enable Supabase Realtime on site_submit_comment so PortalChatTab's
-- channel.on('postgres_changes', {table: 'site_submit_comment'}, ...) actually
-- receives events. Without this the subscription is silently a no-op and new
-- comments only appear when the tab refetches. Same fix as
-- 20260714130000_site_submit_realtime_enable.sql (9137b33c).
--
-- Realtime respects RLS: clients only receive rows their SELECT policies allow.

ALTER PUBLICATION supabase_realtime ADD TABLE public.site_submit_comment;
