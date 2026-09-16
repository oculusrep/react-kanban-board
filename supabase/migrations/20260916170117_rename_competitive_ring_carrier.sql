-- "Competitive ring" -> "Nearby Starbucks" in research_thread.story_carriers.
--
-- The carrier strings are a closed list the prompt hands the model, and they are compared across
-- sites, so the rename in archetype_call v10 has to reach the rows written under v1-v9 or carrier
-- history splits in two. Data only, no schema change. updated_at is left alone: the audit trigger is
-- disabled for this statement inside this transaction.
--
-- Threads keep replaying against their own pinned prompt version; only the stored carrier label moves.

ALTER TABLE public.research_thread DISABLE TRIGGER research_thread_set_updated_at;

UPDATE public.research_thread
   SET story_carriers = array_replace(story_carriers, 'Competitive ring', 'Nearby Starbucks')
 WHERE 'Competitive ring' = ANY (story_carriers);

ALTER TABLE public.research_thread ENABLE TRIGGER research_thread_set_updated_at;
