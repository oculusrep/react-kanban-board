-- Critical Dates Feature Migration
-- Creates critical_dates table for tracking important deal milestones and deadlines
-- Supports automated email reminders based on configurable days prior to date

-- Create critical_date table
CREATE TABLE IF NOT EXISTS critical_date (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,

  -- Critical Date Information
  subject TEXT NOT NULL,                    -- The type/name of the critical date
  critical_date DATE,                       -- The actual date (nullable to allow TBD dates)
  description TEXT,                         -- Optional description/notes

  -- Email Notification Settings
  send_email BOOLEAN DEFAULT FALSE,         -- Whether to send reminder email
  send_email_days_prior INTEGER,            -- Days before critical_date to send email
  sent_at TIMESTAMPTZ,                      -- Timestamp when email was sent (auto-populated)

  -- Metadata
  is_default BOOLEAN DEFAULT FALSE,         -- Whether auto-created based on deal type

  -- Salesforce Integration
  sf_id TEXT UNIQUE,                        -- Salesforce Critical Date ID
  sf_opportunity_id TEXT,                   -- Salesforce Opportunity reference

  -- Audit Fields
  created_by_id UUID REFERENCES "user"(id),
  updated_by_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_critical_date_deal_id ON critical_date(deal_id);
CREATE INDEX idx_critical_date_critical_date ON critical_date(critical_date);
CREATE INDEX idx_critical_date_send_email ON critical_date(send_email) WHERE send_email = TRUE;
CREATE INDEX idx_critical_date_sf_id ON critical_date(sf_id);

-- Composite index for email job queries (find dates that need emails sent)
CREATE INDEX idx_critical_date_email_pending ON critical_date(critical_date, send_email, sent_at)
  WHERE send_email = TRUE AND sent_at IS NULL;

-- Add constraint to ensure send_email_days_prior is set when send_email is true
ALTER TABLE critical_date ADD CONSTRAINT check_send_email_days_prior
  CHECK (
    (send_email = FALSE OR send_email IS NULL) OR
    (send_email = TRUE AND send_email_days_prior IS NOT NULL AND send_email_days_prior >= 0)
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_critical_date_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_critical_date_updated_at
  BEFORE UPDATE ON critical_date
  FOR EACH ROW
  EXECUTE FUNCTION update_critical_date_updated_at();

-- Add "Critical Dates Reminders" role to contact client role types
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_client_role_type') THEN
    -- Insert the new role if it doesn't already exist
    INSERT INTO contact_client_role_type (role_name, sort_order, is_active)
    VALUES (
      'Critical Dates Reminders',
      (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM contact_client_role_type),
      TRUE
    )
    ON CONFLICT (role_name) DO NOTHING;
  END IF;
END $$;

COMMENT ON TABLE critical_date IS 'Tracks critical dates and deadlines for deals with automated email reminder functionality';
COMMENT ON COLUMN critical_date.subject IS 'The type/name of the critical date (e.g., "Contract X Date", "Delivery Date")';
COMMENT ON COLUMN critical_date.send_email_days_prior IS 'Number of days before critical_date to send reminder email';
COMMENT ON COLUMN critical_date.sent_at IS 'Timestamp when the reminder email was sent (auto-populated by email job)';
COMMENT ON COLUMN critical_date.is_default IS 'TRUE if this critical date was auto-created based on deal type (Purchase/Lease)';

-- ============================================================================
-- DATA MIGRATION FROM SALESFORCE
-- ============================================================================

-- Migrate existing critical dates from Salesforce (only if table exists)
DO $$
DECLARE
  migrated_count INTEGER := 0;
  sf_total_count INTEGER := 0;
BEGIN
  -- Check if Salesforce critical dates table exists (check both lowercase and exact case)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND (table_name = 'salesforce_critical_date__c' OR table_name = 'salesforce_Critical_Date__c')
  ) THEN
    RAISE NOTICE 'Salesforce critical dates table found, migrating data...';

    -- Migrate existing critical dates from Salesforce
    INSERT INTO critical_date (
      id,
      deal_id,
      subject,
      critical_date,
      description,
      send_email,
      send_email_days_prior,
      sent_at,
      is_default,
      sf_id,
      sf_opportunity_id,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid() AS id,
      d.id AS deal_id,
      sf_cd."Subject__c" AS subject,
      sf_cd."Critical_Date__c"::DATE AS critical_date,
      sf_cd."Description__c" AS description,
      -- If send_email is true but days_prior is null, default to FALSE for send_email
      CASE
        WHEN COALESCE(sf_cd."Send_Email__c", FALSE) = TRUE AND sf_cd."Send_Email_Days_Prior__c" IS NULL THEN FALSE
        ELSE COALESCE(sf_cd."Send_Email__c", FALSE)
      END AS send_email,
      sf_cd."Send_Email_Days_Prior__c"::INTEGER AS send_email_days_prior,
      sf_cd."Send_Email_Date__c"::TIMESTAMPTZ AS sent_at,
      FALSE AS is_default, -- Salesforce records are not default templates
      sf_cd."Id" AS sf_id,
      sf_cd."Opportunity__c" AS sf_opportunity_id,
      COALESCE(sf_cd."CreatedDate"::TIMESTAMPTZ, NOW()) AS created_at,
      COALESCE(sf_cd."LastModifiedDate"::TIMESTAMPTZ, NOW()) AS updated_at
    FROM "salesforce_Critical_Date__c" sf_cd
    LEFT JOIN deal d ON d.sf_id = sf_cd."Opportunity__c"
    WHERE d.id IS NOT NULL -- Only migrate critical dates with valid deal references
    ON CONFLICT (sf_id) DO UPDATE SET
      deal_id = EXCLUDED.deal_id,
      subject = EXCLUDED.subject,
      critical_date = EXCLUDED.critical_date,
      description = EXCLUDED.description,
      send_email = EXCLUDED.send_email,
      send_email_days_prior = EXCLUDED.send_email_days_prior,
      sent_at = EXCLUDED.sent_at,
      sf_opportunity_id = EXCLUDED.sf_opportunity_id,
      updated_at = EXCLUDED.updated_at;

    -- Get counts for report
    SELECT COUNT(*) INTO migrated_count FROM critical_date WHERE sf_id IS NOT NULL;
    SELECT COUNT(*) INTO sf_total_count FROM "salesforce_Critical_Date__c";
  ELSE
    RAISE NOTICE 'Salesforce critical dates table not found, skipping data migration';
  END IF;

  -- Report migration results
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Critical Dates Migration Summary';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Total Salesforce records: %', sf_total_count;
  RAISE NOTICE 'Successfully migrated: %', migrated_count;
  RAISE NOTICE '============================================';
END $$;
