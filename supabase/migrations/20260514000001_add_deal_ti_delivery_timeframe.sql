-- Migration: Snapshot TI and Delivery Timeframe onto the deal at LOI
--
-- Until now, TI and Delivery Timeframe lived only on site_submit. With the
-- snapshot pattern established for the other Deal Details fields
-- (see 20260514000000_add_site_submit_economics.sql), the deal record should
-- own its own copies of these terms as well so they can diverge independently
-- from the originating site submit after LOI.

ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_ti numeric;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS deal_delivery_timeframe text;

COMMENT ON COLUMN deal.deal_ti IS 'Negotiated tenant improvement allowance (inherited from site_submit.ti at LOI)';
COMMENT ON COLUMN deal.deal_delivery_timeframe IS 'Negotiated delivery timeframe (inherited from site_submit.delivery_timeframe at LOI)';

-- Backfill existing deals from their originating site submit.
UPDATE deal d
SET
  deal_ti = ss.ti,
  deal_delivery_timeframe = ss.delivery_timeframe
FROM site_submit ss
WHERE ss.id = d.site_submit_id
  AND d.deal_ti IS NULL
  AND d.deal_delivery_timeframe IS NULL;
