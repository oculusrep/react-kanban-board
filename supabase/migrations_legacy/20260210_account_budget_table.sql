-- Account Budget Table for Monthly Budget Tracking
-- This replaces the single budget_monthly column with full 12-month granularity
-- Supports seasonal budgeting and proper CFO Agent variance analysis

CREATE TABLE IF NOT EXISTS account_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qb_account_id text NOT NULL,
  year integer NOT NULL,

  -- Monthly budget amounts
  jan numeric DEFAULT 0,
  feb numeric DEFAULT 0,
  mar numeric DEFAULT 0,
  apr numeric DEFAULT 0,
  may numeric DEFAULT 0,
  jun numeric DEFAULT 0,
  jul numeric DEFAULT 0,
  aug numeric DEFAULT 0,
  sep numeric DEFAULT 0,
  oct numeric DEFAULT 0,
  nov numeric DEFAULT 0,
  dec numeric DEFAULT 0,

  -- Metadata
  notes text,  -- Optional notes about this budget (e.g., "Increased marketing Q1 for trade show")
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES "user"(id),

  -- Ensure one budget per account per year
  UNIQUE(qb_account_id, year)
);

-- Index for fast lookups by year
CREATE INDEX idx_account_budget_year ON account_budget(year);

-- Index for lookups by account
CREATE INDEX idx_account_budget_account ON account_budget(qb_account_id);

-- RLS Policies (admin only)
ALTER TABLE account_budget ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all budgets
CREATE POLICY "Admins can read account budgets"
  ON account_budget FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role = 'admin'
    )
  );

-- Allow admins to insert budgets
CREATE POLICY "Admins can insert account budgets"
  ON account_budget FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role = 'admin'
    )
  );

-- Allow admins to update budgets
CREATE POLICY "Admins can update account budgets"
  ON account_budget FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role = 'admin'
    )
  );

-- Allow admins to delete budgets
CREATE POLICY "Admins can delete account budgets"
  ON account_budget FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "user" u
      WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role = 'admin'
    )
  );

-- Updated budget_vs_actual view with monthly budget support
-- This view can be used by the CFO Agent for variance analysis
CREATE OR REPLACE VIEW budget_vs_actual_monthly AS
SELECT
  a.id as account_id,
  a.qb_account_id,
  a.name as account_name,
  a.account_type,
  a.fully_qualified_name,

  -- Current year budget data
  b.year as budget_year,
  b.jan, b.feb, b.mar, b.apr, b.may, b.jun,
  b.jul, b.aug, b.sep, b.oct, b.nov, b.dec,

  -- Computed annual total
  COALESCE(b.jan, 0) + COALESCE(b.feb, 0) + COALESCE(b.mar, 0) +
  COALESCE(b.apr, 0) + COALESCE(b.may, 0) + COALESCE(b.jun, 0) +
  COALESCE(b.jul, 0) + COALESCE(b.aug, 0) + COALESCE(b.sep, 0) +
  COALESCE(b.oct, 0) + COALESCE(b.nov, 0) + COALESCE(b.dec, 0) as budget_annual,

  -- Current month's budget based on current date
  CASE EXTRACT(MONTH FROM CURRENT_DATE)
    WHEN 1 THEN COALESCE(b.jan, 0)
    WHEN 2 THEN COALESCE(b.feb, 0)
    WHEN 3 THEN COALESCE(b.mar, 0)
    WHEN 4 THEN COALESCE(b.apr, 0)
    WHEN 5 THEN COALESCE(b.may, 0)
    WHEN 6 THEN COALESCE(b.jun, 0)
    WHEN 7 THEN COALESCE(b.jul, 0)
    WHEN 8 THEN COALESCE(b.aug, 0)
    WHEN 9 THEN COALESCE(b.sep, 0)
    WHEN 10 THEN COALESCE(b.oct, 0)
    WHEN 11 THEN COALESCE(b.nov, 0)
    WHEN 12 THEN COALESCE(b.dec, 0)
  END as budget_current_month,

  -- Actuals from qb_expense
  COALESCE(e.mtd_actual, 0) as mtd_actual,
  COALESCE(e.ytd_actual, 0) as ytd_actual,

  -- Variance calculations
  CASE
    WHEN CASE EXTRACT(MONTH FROM CURRENT_DATE)
      WHEN 1 THEN COALESCE(b.jan, 0)
      WHEN 2 THEN COALESCE(b.feb, 0)
      WHEN 3 THEN COALESCE(b.mar, 0)
      WHEN 4 THEN COALESCE(b.apr, 0)
      WHEN 5 THEN COALESCE(b.may, 0)
      WHEN 6 THEN COALESCE(b.jun, 0)
      WHEN 7 THEN COALESCE(b.jul, 0)
      WHEN 8 THEN COALESCE(b.aug, 0)
      WHEN 9 THEN COALESCE(b.sep, 0)
      WHEN 10 THEN COALESCE(b.oct, 0)
      WHEN 11 THEN COALESCE(b.nov, 0)
      WHEN 12 THEN COALESCE(b.dec, 0)
    END > 0 THEN
      ROUND((COALESCE(e.mtd_actual, 0) / CASE EXTRACT(MONTH FROM CURRENT_DATE)
        WHEN 1 THEN COALESCE(b.jan, 0)
        WHEN 2 THEN COALESCE(b.feb, 0)
        WHEN 3 THEN COALESCE(b.mar, 0)
        WHEN 4 THEN COALESCE(b.apr, 0)
        WHEN 5 THEN COALESCE(b.may, 0)
        WHEN 6 THEN COALESCE(b.jun, 0)
        WHEN 7 THEN COALESCE(b.jul, 0)
        WHEN 8 THEN COALESCE(b.aug, 0)
        WHEN 9 THEN COALESCE(b.sep, 0)
        WHEN 10 THEN COALESCE(b.oct, 0)
        WHEN 11 THEN COALESCE(b.nov, 0)
        WHEN 12 THEN COALESCE(b.dec, 0)
      END) * 100, 1)
    ELSE 0
  END as mtd_pct_used

FROM qb_account a
LEFT JOIN account_budget b ON a.qb_account_id = b.qb_account_id
  AND b.year = EXTRACT(YEAR FROM CURRENT_DATE)
LEFT JOIN (
  SELECT
    account_id,
    SUM(CASE WHEN DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', CURRENT_DATE) THEN amount ELSE 0 END) as mtd_actual,
    SUM(CASE WHEN DATE_TRUNC('year', transaction_date) = DATE_TRUNC('year', CURRENT_DATE) THEN amount ELSE 0 END) as ytd_actual
  FROM qb_expense
  WHERE transaction_type IN ('Purchase', 'Bill')
  GROUP BY account_id
) e ON a.qb_account_id = e.account_id
WHERE a.account_type IN ('Expense', 'Other Expense', 'Cost of Goods Sold');

-- Comment on table
COMMENT ON TABLE account_budget IS 'Monthly budget amounts by QBO account. Supports seasonal budgeting for CFO Agent analysis.';
