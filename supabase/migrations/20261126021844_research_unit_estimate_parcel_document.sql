-- Market Research lead pass automation (docs/MARKET_RESEARCH_LEAD_PASS_2026-11-26.md):
-- research_unit_estimate logs two new post-run count steps.
--   parcel   — county parcel layer count (research-unit-parcels.ts); model = layer label
--   document — cited-document reader, Gemini url_context (research-unit-documents.ts);
--              sources = {given, read, search, url, page, quote, status}
-- No new relation, so no grants block.

ALTER TABLE public.research_unit_estimate DROP CONSTRAINT research_unit_estimate_method_check;
ALTER TABLE public.research_unit_estimate ADD CONSTRAINT research_unit_estimate_method_check
  CHECK (method = ANY (ARRAY['gemini'::text, 'density'::text, 'lead'::text, 'error'::text, 'parcel'::text, 'document'::text]));
