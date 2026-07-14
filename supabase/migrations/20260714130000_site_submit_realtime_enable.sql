-- Enable Supabase Realtime on site_submit so postgres_changes events
-- broadcast to the map's SiteSubmitLayer subscription. Without this,
-- the layer's channel.on('postgres_changes', {table: 'site_submit'}, ...)
-- is silently no-op — the map only refreshes on manual reload or a
-- LayerManager refreshTrigger bump.
--
-- Necessary complement to the deal_submit_stage_sync triggers: those
-- write to site_submit inside the database, and Realtime must be
-- enabled for the browser to hear about it.

ALTER PUBLICATION supabase_realtime ADD TABLE public.site_submit;
