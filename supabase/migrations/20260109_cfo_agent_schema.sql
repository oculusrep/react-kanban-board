-- CFO Agent Schema - AI-Native Financial Data
-- Created: January 9, 2026
-- Purpose: Schema additions to support AI-powered CFO Agent

-- ============================================================
-- 1. FINANCIAL SNAPSHOT TABLE - Time-Series Aggregations
-- ============================================================
-- Pre-computed financial summaries for fast AI analysis

CREATE TABLE IF NOT EXISTS financial_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  period_type text NOT NULL,  -- 'daily', 'weekly', 'monthly'

  -- Actuals
  total_income numeric DEFAULT 0,
  total_expenses numeric DEFAULT 0,
  net_cash_flow numeric DEFAULT 0,

  -- By category (JSONB for flexibility)
  income_by_account jsonb DEFAULT '{}',
  expenses_by_account jsonb DEFAULT '{}',

  -- AR/AP status at snapshot time
  total_receivables numeric DEFAULT 0,
  receivables_current numeric DEFAULT 0,
  receivables_30_60 numeric DEFAULT 0,
  receivables_60_90 numeric DEFAULT 0,
  receivables_over_90 numeric DEFAULT 0,
  total_payables numeric DEFAULT 0,

  created_at timestamptz DEFAULT now(),

  UNIQUE(snapshot_date, period_type)
);

CREATE INDEX IF NOT EXISTS idx_financial_snapshot_date ON financial_snapshot(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_financial_snapshot_period ON financial_snapshot(period_type);

-- RLS
ALTER TABLE financial_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view financial snapshots" ON financial_snapshot
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role = 'admin'
    )
  );

CREATE POLICY "Service role has full access to financial snapshots" ON financial_snapshot
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 2. AI FINANCIAL CONTEXT TABLE - Business Knowledge Store
-- ============================================================
-- Stores context the CFO Agent needs to understand business patterns

CREATE TABLE IF NOT EXISTS ai_financial_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type text NOT NULL,  -- 'budget_note', 'client_payment_pattern', 'seasonal_pattern', 'vendor_note'
  entity_type text,            -- 'account', 'client', 'vendor', 'category'
  entity_id text,              -- Reference ID (client_id, account_id, etc.)
  context_text text NOT NULL,  -- Natural language description
  metadata jsonb DEFAULT '{}', -- Structured data if needed

  created_by uuid REFERENCES "user"(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_context_type ON ai_financial_context(context_type);
CREATE INDEX IF NOT EXISTS idx_ai_context_entity ON ai_financial_context(entity_type, entity_id);

-- RLS
ALTER TABLE ai_financial_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage ai_financial_context" ON ai_financial_context
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role = 'admin'
    )
  );

CREATE POLICY "Service role has full access to ai_financial_context" ON ai_financial_context
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 3. AI FINANCIAL QUERIES TABLE - Query/Analysis Audit Trail
-- ============================================================
-- Stores AI queries and responses for learning and audit

CREATE TABLE IF NOT EXISTS ai_financial_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  query_type text,              -- 'expense_analysis', 'forecast', 'anomaly', 'report'
  context_used jsonb,           -- What data the AI examined
  response_text text,           -- AI's analysis/answer
  confidence_score numeric,     -- AI's confidence (0-1)

  user_id uuid REFERENCES "user"(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_queries_type ON ai_financial_queries(query_type);
CREATE INDEX IF NOT EXISTS idx_ai_queries_date ON ai_financial_queries(created_at);

-- RLS
ALTER TABLE ai_financial_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage ai_financial_queries" ON ai_financial_queries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role = 'admin'
    )
  );

CREATE POLICY "Service role has full access to ai_financial_queries" ON ai_financial_queries
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 4. QBO EXPENSE TABLE ENHANCEMENTS - AI Analysis Fields
-- ============================================================

-- Recurring expense detection
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS recurring_pattern text;  -- 'monthly', 'quarterly', 'annual', 'weekly'
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS recurring_group_id uuid;  -- Groups related recurring transactions

-- Anomaly detection
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS anomaly_score numeric;  -- 0-1, higher = more unusual
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS anomaly_reason text;    -- Why it was flagged

-- AI-extracted metadata
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS ai_parsed_memo jsonb;   -- Extracted entities from description

-- Indexes for AI queries
CREATE INDEX IF NOT EXISTS idx_qb_expense_recurring ON qb_expense(is_recurring) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_qb_expense_anomaly ON qb_expense(anomaly_score) WHERE anomaly_score IS NOT NULL AND anomaly_score > 0.7;

-- ============================================================
-- 5. QBO ACCOUNT TABLE ENHANCEMENTS - Budget Fields
-- ============================================================

-- Budget fields (add if not already present)
ALTER TABLE qb_account ADD COLUMN IF NOT EXISTS budget_monthly numeric;
ALTER TABLE qb_account ADD COLUMN IF NOT EXISTS budget_annual numeric;
ALTER TABLE qb_account ADD COLUMN IF NOT EXISTS alert_threshold_pct numeric DEFAULT 90;

-- Budget notes for AI context
ALTER TABLE qb_account ADD COLUMN IF NOT EXISTS budget_notes text;  -- "Expect 3% increase in March"

-- ============================================================
-- 6. INVOICE AGING VIEW - AR Status
-- ============================================================

CREATE OR REPLACE VIEW invoice_aging AS
SELECT
  p.id,
  p.orep_invoice,
  p.payment_amount,
  p.payment_date_estimated as due_date,
  p.sf_payment_status as payment_status,
  p.qb_invoice_id,
  d.id as deal_id,
  d.deal_name,
  c.id as client_id,
  c.client_name,
  CURRENT_DATE - p.payment_date_estimated as days_overdue,
  CASE
    WHEN p.payment_date_estimated >= CURRENT_DATE THEN 'current'
    WHEN CURRENT_DATE - p.payment_date_estimated <= 30 THEN '1-30 days'
    WHEN CURRENT_DATE - p.payment_date_estimated <= 60 THEN '31-60 days'
    WHEN CURRENT_DATE - p.payment_date_estimated <= 90 THEN '61-90 days'
    ELSE '90+ days'
  END as aging_bucket
FROM payment p
JOIN deal d ON p.deal_id = d.id
JOIN client c ON d.client_id = c.id
WHERE p.sf_payment_status NOT IN ('received', 'cancelled')
  AND p.payment_amount > 0;

-- Grant access to view
GRANT SELECT ON invoice_aging TO authenticated;
GRANT SELECT ON invoice_aging TO service_role;

-- ============================================================
-- 7. BUDGET VS ACTUAL VIEW - Budget Variance
-- ============================================================

CREATE OR REPLACE VIEW budget_vs_actual AS
SELECT
  a.id as account_id,
  a.qb_account_id,
  a.name as account_name,
  a.account_type,
  a.fully_qualified_name,
  a.budget_monthly,
  a.budget_annual,
  a.alert_threshold_pct,
  COALESCE(e.mtd_actual, 0) as mtd_actual,
  COALESCE(e.ytd_actual, 0) as ytd_actual,
  CASE
    WHEN a.budget_monthly > 0 THEN ROUND((COALESCE(e.mtd_actual, 0) / a.budget_monthly) * 100, 1)
    ELSE 0
  END as mtd_pct_used,
  CASE
    WHEN a.budget_annual > 0 THEN ROUND((COALESCE(e.ytd_actual, 0) / a.budget_annual) * 100, 1)
    ELSE 0
  END as ytd_pct_used
FROM qb_account a
LEFT JOIN (
  SELECT
    account_id,
    SUM(CASE WHEN DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', CURRENT_DATE) THEN ABS(amount) ELSE 0 END) as mtd_actual,
    SUM(CASE WHEN DATE_TRUNC('year', transaction_date) = DATE_TRUNC('year', CURRENT_DATE) THEN ABS(amount) ELSE 0 END) as ytd_actual
  FROM qb_expense
  WHERE transaction_type IN ('Purchase', 'Bill', 'JournalEntry-Debit')
  GROUP BY account_id
) e ON a.qb_account_id = e.account_id
WHERE a.account_type IN ('Expense', 'Other Expense', 'Cost of Goods Sold');

-- Grant access to view
GRANT SELECT ON budget_vs_actual TO authenticated;
GRANT SELECT ON budget_vs_actual TO service_role;

-- ============================================================
-- GRANTS
-- ============================================================

GRANT ALL ON financial_snapshot TO service_role;
GRANT SELECT ON financial_snapshot TO authenticated;

GRANT ALL ON ai_financial_context TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_financial_context TO authenticated;

GRANT ALL ON ai_financial_queries TO service_role;
GRANT SELECT, INSERT ON ai_financial_queries TO authenticated;
