-- can_view_market_research: a read-only grant for the "Market research runs" section
-- on Starbucks site submits. UI gate only; run/cancel/skip stay behind
-- can_run_market_research (user_has_market_research_run_access()), approve behind
-- can_approve_market_research. No new relations, so no grants block.
--
-- Admin is the only role holding can_run_market_research today, so it is the only
-- role that could see the section; carry that forward.
UPDATE role
   SET permissions = permissions || '{"can_view_market_research": true}'::jsonb
 WHERE name = 'admin';
