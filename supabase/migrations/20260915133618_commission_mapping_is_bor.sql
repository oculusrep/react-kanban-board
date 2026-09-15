-- Allow one referral partner to carry BOTH a normal referral mapping and a
-- Broker of Record (pass-through) mapping.
--
-- A company can refer deals to Oculus (Bill debits the referral-fee expense)
-- AND use Oculus as Broker of Record (Bill debits BOR Pass-Through Clearing +
-- JE recognizes the BOR Fee). Same payee / same QBO vendor, different accounts.
-- Previously qb_commission_mapping_client_unique allowed only one active
-- mapping per client, and "BOR mode" was inferred from bill + credit account.
--
-- is_bor makes the mapping's purpose explicit; the disbursement edge function
-- (quickbooks-create-referral-entry) selects the mapping whose is_bor matches
-- whether the deal is a BOR deal.

ALTER TABLE qb_commission_mapping
  ADD COLUMN IF NOT EXISTS is_bor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN qb_commission_mapping.is_bor IS
  'Broker of Record pass-through mapping (debit = clearing liability, credit = BOR Referral Income). A referral partner may have one active mapping per is_bor value.';

-- Backfill: existing BOR mappings were identified in the admin UI as a
-- referral-partner Bill mapping that also carries a credit account.
UPDATE qb_commission_mapping
   SET is_bor = true
 WHERE entity_type = 'referral_partner'
   AND payment_method = 'bill'
   AND qb_credit_account_id IS NOT NULL;

ALTER TABLE qb_commission_mapping
  ADD CONSTRAINT bor_mapping_shape CHECK (
    NOT is_bor
    OR (entity_type = 'referral_partner'
        AND payment_method = 'bill'
        AND qb_credit_account_id IS NOT NULL)
  );

DROP INDEX IF EXISTS qb_commission_mapping_client_unique;
CREATE UNIQUE INDEX qb_commission_mapping_client_unique
  ON qb_commission_mapping (client_id, is_bor)
  WHERE client_id IS NOT NULL AND is_active = true;
