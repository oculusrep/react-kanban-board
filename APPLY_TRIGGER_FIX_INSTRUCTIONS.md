# How to Apply the Payment Trigger Fix

## Problem
When you create a new deal and add brokers to the commission tab, payments are created but payment_split records are NOT being created automatically. This causes the "No Broker Split" placeholder to appear instead of broker names.

## Root Cause
The trigger `trigger_auto_create_splits_on_payment` was deleted, which normally creates payment_split records whenever a payment is inserted.

## Solution
Apply the SQL from `/tmp/restore_triggers.sql` to your database.

## Steps to Apply

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/ryvdqlkqoevohvzxzlkd

2. Click on **SQL Editor** in the left sidebar

3. Click **New Query**

4. Copy the contents of `/tmp/restore_triggers.sql` (shown below)

5. Paste into the SQL editor

6. Click **Run** (or press Cmd+Enter)

7. You should see success messages indicating the triggers were created

### Option 2: Using psql Command Line

```bash
psql "postgresql://postgres.ryvdqlkqoevohvzxzlkd:IamSpyderman22!@aws-0-us-west-1.pooler.supabase.com:6543/postgres" < /tmp/restore_triggers.sql
```

## SQL to Apply

```sql
-- TRIGGER 1: Calculate Payment AGCI
CREATE OR REPLACE FUNCTION calculate_payment_agci()
RETURNS TRIGGER AS $$
DECLARE
    v_referral_fee_percent NUMERIC;
    v_house_percent NUMERIC;
    v_payment_gci NUMERIC;
    v_house_split NUMERIC;
BEGIN
    SELECT referral_fee_percent, house_percent
    INTO v_referral_fee_percent, v_house_percent
    FROM deal WHERE id = NEW.deal_id;

    v_payment_gci := NEW.payment_amount - (NEW.payment_amount * COALESCE(v_referral_fee_percent, 0) / 100);
    v_house_split := COALESCE(v_house_percent, 0) / 100 * v_payment_gci;
    NEW.agci := v_payment_gci - v_house_split;
    NEW.referral_fee_usd := NEW.payment_amount * COALESCE(v_referral_fee_percent, 0) / 100;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_payment_agci_trigger ON payment;
CREATE TRIGGER calculate_payment_agci_trigger
    BEFORE INSERT OR UPDATE OF payment_amount, amount_override
    ON payment FOR EACH ROW
    EXECUTE FUNCTION calculate_payment_agci();

-- TRIGGER 2: Update Broker Splits
CREATE OR REPLACE FUNCTION update_broker_splits_on_agci_change()
RETURNS TRIGGER AS $$
DECLARE
    v_origination_percent NUMERIC;
    v_site_percent NUMERIC;
    v_deal_percent NUMERIC;
    v_origination_total NUMERIC;
    v_site_total NUMERIC;
    v_deal_total NUMERIC;
BEGIN
    SELECT origination_percent, site_percent, deal_percent
    INTO v_origination_percent, v_site_percent, v_deal_percent
    FROM deal WHERE id = NEW.deal_id;

    v_origination_total := NEW.agci * COALESCE(v_origination_percent, 0) / 100;
    v_site_total := NEW.agci * COALESCE(v_site_percent, 0) / 100;
    v_deal_total := NEW.agci * COALESCE(v_deal_percent, 0) / 100;

    UPDATE payment_split
    SET
        split_origination_usd = v_origination_total * COALESCE(split_origination_percent, 0) / 100,
        split_site_usd = v_site_total * COALESCE(split_site_percent, 0) / 100,
        split_deal_usd = v_deal_total * COALESCE(split_deal_percent, 0) / 100,
        split_broker_total = (
            (v_origination_total * COALESCE(split_origination_percent, 0) / 100) +
            (v_site_total * COALESCE(split_site_percent, 0) / 100) +
            (v_deal_total * COALESCE(split_deal_percent, 0) / 100)
        )
    WHERE payment_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_broker_splits_trigger ON payment;
CREATE TRIGGER update_broker_splits_trigger
    AFTER INSERT OR UPDATE ON payment FOR EACH ROW
    EXECUTE FUNCTION update_broker_splits_on_agci_change();

-- TRIGGER 3: Auto-create payment splits
CREATE OR REPLACE FUNCTION auto_create_payment_splits_on_payment_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_commission_split RECORD;
  v_deal_origination_percent NUMERIC;
  v_deal_site_percent NUMERIC;
  v_deal_deal_percent NUMERIC;
  v_payment_agci NUMERIC;
  v_origination_total NUMERIC;
  v_site_total NUMERIC;
  v_deal_total NUMERIC;
BEGIN
  SELECT origination_percent, site_percent, deal_percent
  INTO v_deal_origination_percent, v_deal_site_percent, v_deal_deal_percent
  FROM deal WHERE id = NEW.deal_id;

  v_payment_agci := COALESCE(NEW.agci, 0);
  v_origination_total := v_payment_agci * COALESCE(v_deal_origination_percent, 0) / 100;
  v_site_total := v_payment_agci * COALESCE(v_deal_site_percent, 0) / 100;
  v_deal_total := v_payment_agci * COALESCE(v_deal_deal_percent, 0) / 100;

  FOR v_commission_split IN
    SELECT id, broker_id, split_origination_percent, split_site_percent, split_deal_percent
    FROM commission_split
    WHERE deal_id = NEW.deal_id
  LOOP
    INSERT INTO payment_split (
      payment_id, broker_id,
      split_origination_percent, split_site_percent, split_deal_percent,
      split_origination_usd, split_site_usd, split_deal_usd,
      split_broker_total, paid
    ) VALUES (
      NEW.id, v_commission_split.broker_id,
      v_commission_split.split_origination_percent,
      v_commission_split.split_site_percent,
      v_commission_split.split_deal_percent,
      v_origination_total * COALESCE(v_commission_split.split_origination_percent, 0) / 100,
      v_site_total * COALESCE(v_commission_split.split_site_percent, 0) / 100,
      v_deal_total * COALESCE(v_commission_split.split_deal_percent, 0) / 100,
      (v_origination_total * COALESCE(v_commission_split.split_origination_percent, 0) / 100) +
      (v_site_total * COALESCE(v_commission_split.split_site_percent, 0) / 100) +
      (v_deal_total * COALESCE(v_commission_split.split_deal_percent, 0) / 100),
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_splits_on_payment ON payment;
CREATE TRIGGER trigger_auto_create_splits_on_payment
  AFTER INSERT ON payment FOR EACH ROW
  EXECUTE FUNCTION auto_create_payment_splits_on_payment_insert();
```

## Verification

After applying, run this query to verify the triggers exist:

```sql
SELECT
    trigger_name,
    action_timing || ' ' || event_manipulation as when_fires
FROM information_schema.triggers
WHERE event_object_table = 'payment'
  AND trigger_name IN (
    'calculate_payment_agci_trigger',
    'update_broker_splits_trigger',
    'trigger_auto_create_splits_on_payment'
  )
ORDER BY action_timing, trigger_name;
```

You should see 3 triggers:
1. `calculate_payment_agci_trigger` - BEFORE INSERT OR UPDATE
2. `update_broker_splits_trigger` - AFTER INSERT OR UPDATE
3. `trigger_auto_create_splits_on_payment` - AFTER INSERT

## Testing

1. Create a new deal
2. Add 2-3 brokers to the commission tab
3. Go to the Payment tab
4. You should now see broker names instead of "No Broker Split"
5. Each payment should have splits for each broker

## What These Triggers Do

1. **calculate_payment_agci_trigger**: Calculates the payment AGCI (Agent Gross Commission Income) and referral fee whenever a payment amount changes

2. **update_broker_splits_trigger**: Updates all existing broker splits when the payment AGCI changes (for payment overrides)

3. **trigger_auto_create_splits_on_payment**: **THIS IS THE MISSING ONE** - Automatically creates payment_split records for each broker when a new payment is inserted

The third trigger is the critical one that was deleted, causing your issue.
