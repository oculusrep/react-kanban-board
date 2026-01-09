# CFO Agent Specification

## Status: Planning Phase
**Created:** January 9, 2026
**Last Updated:** January 9, 2026

---

## Overview

The CFO Agent is an AI-powered autonomous assistant that acts as a Chief Financial Officer for OVIS. Built on the Claude API, it monitors financial health, analyzes trends, flags anomalies, and provides actionable insights.

### Core Responsibilities

1. **Budget Monitoring** - Track spending vs budget by category
2. **Expense Analysis** - Identify anomalies, recurring patterns, and optimization opportunities
3. **AR Management** - Monitor overdue invoices, predict collection issues
4. **Cash Flow Projections** - Forecast cash position based on receivables and recurring expenses
5. **Financial Reporting** - Generate summaries, variance reports, and trend analysis

---

## Architecture

### Data Sources

| Source | Data | Sync Frequency |
|--------|------|----------------|
| QuickBooks Online | Expenses, Income, Chart of Accounts | On-demand + weekly |
| OVIS Payments | Invoices, Receivables, Payment history | Real-time |
| OVIS Deals | Revenue pipeline, Expected close dates | Real-time |
| Financial Snapshots | Pre-aggregated historical data | Daily |

### Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                      CFO Agent (Claude API)                  │
├─────────────────────────────────────────────────────────────┤
│  Inputs:                                                     │
│  - Financial summary endpoint (aggregated data)              │
│  - Invoice aging view (AR status)                            │
│  - Expense anomalies (flagged transactions)                  │
│  - Historical snapshots (trend data)                         │
│  - User context notes (business knowledge)                   │
├─────────────────────────────────────────────────────────────┤
│  Outputs:                                                    │
│  - Analysis reports (stored for audit)                       │
│  - Alerts (in-app notifications)                             │
│  - Recommendations (actionable items)                        │
│  - Natural language answers to queries                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema for AI-Native Financial Data

### New Tables

#### `financial_snapshot` - Time-Series Aggregations
Pre-computed financial summaries for fast AI analysis.

```sql
CREATE TABLE financial_snapshot (
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

CREATE INDEX idx_financial_snapshot_date ON financial_snapshot(snapshot_date);
CREATE INDEX idx_financial_snapshot_period ON financial_snapshot(period_type);
```

#### `ai_financial_context` - Business Knowledge Store
Stores context the CFO Agent needs to understand business patterns.

```sql
CREATE TABLE ai_financial_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_type text NOT NULL,  -- 'budget_note', 'client_payment_pattern', 'seasonal_pattern', 'vendor_note'
  entity_type text,            -- 'account', 'client', 'vendor', 'category'
  entity_id text,              -- Reference ID (client_id, account_id, etc.)
  context_text text NOT NULL,  -- Natural language description
  metadata jsonb DEFAULT '{}', -- Structured data if needed

  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_context_type ON ai_financial_context(context_type);
CREATE INDEX idx_ai_context_entity ON ai_financial_context(entity_type, entity_id);
```

#### `ai_financial_queries` - Query/Analysis Audit Trail
Stores AI queries and responses for learning and audit.

```sql
CREATE TABLE ai_financial_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  query_type text,              -- 'expense_analysis', 'forecast', 'anomaly', 'report'
  context_used jsonb,           -- What data the AI examined
  response_text text,           -- AI's analysis/answer
  confidence_score numeric,     -- AI's confidence (0-1)

  user_id uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_queries_type ON ai_financial_queries(query_type);
CREATE INDEX idx_ai_queries_date ON ai_financial_queries(created_at);
```

### Schema Modifications to Existing Tables

#### `qb_expense` - Enhanced for AI Analysis

```sql
-- Recurring expense detection
ALTER TABLE qb_expense ADD COLUMN is_recurring boolean DEFAULT false;
ALTER TABLE qb_expense ADD COLUMN recurring_pattern text;  -- 'monthly', 'quarterly', 'annual', 'weekly'
ALTER TABLE qb_expense ADD COLUMN recurring_group_id uuid;  -- Groups related recurring transactions

-- Anomaly detection
ALTER TABLE qb_expense ADD COLUMN anomaly_score numeric;  -- 0-1, higher = more unusual
ALTER TABLE qb_expense ADD COLUMN anomaly_reason text;    -- Why it was flagged

-- AI-extracted metadata
ALTER TABLE qb_expense ADD COLUMN ai_parsed_memo jsonb;   -- Extracted entities from description

CREATE INDEX idx_qb_expense_recurring ON qb_expense(is_recurring) WHERE is_recurring = true;
CREATE INDEX idx_qb_expense_anomaly ON qb_expense(anomaly_score) WHERE anomaly_score > 0.7;
```

#### `qb_account` - Budget Tracking

```sql
-- Budget fields (if not already present)
ALTER TABLE qb_account ADD COLUMN IF NOT EXISTS budget_monthly numeric;
ALTER TABLE qb_account ADD COLUMN IF NOT EXISTS budget_annual numeric;
ALTER TABLE qb_account ADD COLUMN IF NOT EXISTS alert_threshold_pct numeric DEFAULT 90;

-- Budget notes for AI context
ALTER TABLE qb_account ADD COLUMN budget_notes text;  -- "Expect 3% increase in March"
```

### Views for AI Consumption

#### `invoice_aging` - AR Status View

```sql
CREATE OR REPLACE VIEW invoice_aging AS
SELECT
  p.id,
  p.orep_invoice,
  p.payment_amount,
  p.payment_date_estimated as due_date,
  p.payment_status,
  p.qb_invoice_id,
  d.id as deal_id,
  d.deal_name,
  c.id as client_id,
  c.company_name as client_name,
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
WHERE p.payment_status NOT IN ('received', 'cancelled')
  AND p.payment_amount > 0;
```

#### `budget_vs_actual` - Budget Variance View

```sql
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
    SUM(CASE WHEN DATE_TRUNC('month', transaction_date) = DATE_TRUNC('month', CURRENT_DATE) THEN amount ELSE 0 END) as mtd_actual,
    SUM(CASE WHEN DATE_TRUNC('year', transaction_date) = DATE_TRUNC('year', CURRENT_DATE) THEN amount ELSE 0 END) as ytd_actual
  FROM qb_expense
  WHERE transaction_type IN ('Purchase', 'Bill')
  GROUP BY account_id
) e ON a.qb_account_id = e.account_id
WHERE a.account_type IN ('Expense', 'Other Expense', 'Cost of Goods Sold');
```

---

## API Endpoints for CFO Agent

### `GET /functions/v1/financial-summary`

Returns AI-friendly aggregated financial data.

**Parameters:**
- `period`: Month (YYYY-MM) or year (YYYY)
- `compare_to`: 'prior_month', 'prior_year', 'budget'

**Response:**
```json
{
  "period": "2026-01",
  "income": {
    "total": 125000,
    "by_category": {
      "Commission Income": 115000,
      "Consulting": 10000
    },
    "vs_prior_month": 12.5,
    "vs_budget": -5.2
  },
  "expenses": {
    "total": 45000,
    "by_category": {...},
    "anomalies": [
      {
        "account": "Legal Fees",
        "amount": 8500,
        "typical_amount": 2000,
        "variance_pct": 325,
        "transaction_ids": ["uuid1", "uuid2"]
      }
    ]
  },
  "cash_flow": {
    "net": 80000,
    "projected_30_day": 65000,
    "projected_60_day": 72000
  },
  "receivables": {
    "total": 250000,
    "current": 180000,
    "overdue_30": 45000,
    "overdue_60": 15000,
    "overdue_90": 10000,
    "critical_invoices": [
      {
        "invoice": "INV-2025-0145",
        "client": "ABC Corp",
        "amount": 25000,
        "days_overdue": 67
      }
    ]
  }
}
```

### `GET /functions/v1/expense-anomalies`

Returns transactions flagged as unusual.

**Response:**
```json
{
  "anomalies": [
    {
      "id": "uuid",
      "transaction_date": "2026-01-05",
      "vendor": "Smith & Associates",
      "amount": 8500,
      "account": "Legal Fees",
      "anomaly_score": 0.92,
      "reason": "Amount is 4.25x the 6-month average for this category",
      "typical_range": {"min": 1500, "max": 2500}
    }
  ]
}
```

### `POST /functions/v1/cfo-query`

Natural language query interface for the CFO Agent.

**Request:**
```json
{
  "query": "Why were legal fees so high in January?",
  "context": {
    "period": "2026-01",
    "focus_area": "expenses"
  }
}
```

**Response:**
```json
{
  "answer": "Legal fees in January 2026 totaled $8,500, which is 325% higher than the typical monthly average of $2,000. This was driven by two transactions: $5,000 to Smith & Associates on Jan 5th (memo: 'Contract review - ABC Corp deal') and $3,500 to Johnson Legal on Jan 12th (memo: 'Lease negotiations'). Both appear to be one-time deal-related expenses rather than recurring costs.",
  "supporting_data": {
    "transactions": [...],
    "historical_average": 2000,
    "recommendation": "Consider categorizing deal-related legal fees separately for better tracking"
  },
  "confidence": 0.89
}
```

---

## CFO Agent Capabilities

### Phase 1: Monitoring & Alerts

- **Budget Threshold Alerts**: Notify when category spending exceeds threshold
- **Overdue Invoice Alerts**: Daily summary of aging receivables
- **Anomaly Detection**: Flag unusual transactions for review
- **Cash Position Alerts**: Warn when projected cash drops below threshold

### Phase 2: Analysis & Reporting

- **Monthly Financial Summary**: Auto-generated P&L analysis
- **Variance Analysis**: Budget vs actual with explanations
- **Trend Reports**: Quarter-over-quarter and year-over-year comparisons
- **Client Payment Behavior**: Predict collection likelihood

### Phase 3: Recommendations & Actions

- **Expense Optimization**: Suggest cost-cutting opportunities
- **Collection Prioritization**: Rank overdue invoices by likelihood to collect
- **Cash Flow Optimization**: Recommend invoice timing
- **Budget Adjustments**: Suggest budget reallocations based on actuals

---

## Implementation Phases

### Phase 1: Data Foundation (Current)
1. ✅ P&L Statement with expense sync from QBO
2. ✅ Expense recategorization (OVIS → QBO)
3. ✅ Schema migration applied (January 9, 2026):
   - `financial_snapshot` table created
   - `ai_financial_context` table created
   - `ai_financial_queries` table created
   - `qb_expense` enhanced with `is_recurring`, `recurring_pattern`, `anomaly_score`, `ai_parsed_memo`
   - `qb_account` enhanced with `budget_monthly`, `budget_annual`, `alert_threshold_pct`, `budget_notes`
   - `invoice_aging` view created
   - `budget_vs_actual` view created
4. 🔲 Verify P&L expense sync and recategorization working correctly
5. 🔲 Implement recurring expense detection logic
6. 🔲 Populate budget fields for expense accounts

### Phase 2: AI Infrastructure
1. ✅ Create ai_financial_context table (done in Phase 1 migration)
2. ✅ Create ai_financial_queries table (done in Phase 1 migration)
3. 🔲 Build financial-summary Edge Function
4. 🔲 Build anomaly detection during expense sync
5. 🔲 Create daily snapshot cron job

### Phase 3: CFO Agent Core
1. 🔲 Claude API integration
2. 🔲 Natural language query interface
3. 🔲 Budget monitoring alerts
4. 🔲 AR aging alerts
5. 🔲 Monthly report generation

### Phase 4: Advanced Features
1. 🔲 Cash flow projections
2. 🔲 Client payment behavior analysis
3. 🔲 Expense optimization recommendations
4. 🔲 Proactive insights ("You should know...")

---

## Security & Access Control

- **CFO Agent queries**: Admin only
- **Financial summaries**: Admin only
- **Budget editing**: Admin only
- **AI context notes**: Admin only
- **Query history**: Visible to admin who created query

---

## Data Retention

- **Financial snapshots**: Indefinite (historical analysis)
- **AI queries**: 2 years (audit trail)
- **Anomaly flags**: Until reviewed + 1 year
- **Context notes**: Indefinite (business knowledge)

---

## Dependencies

- **Claude API**: Anthropic API access for LLM capabilities
- **QuickBooks Online**: Production access (currently blocked pending Intuit approval)
- **Supabase**: Database, Edge Functions, Cron jobs

---

## Related Documentation

- [QUICKBOOKS_INTEGRATION_SPEC.md](./QUICKBOOKS_INTEGRATION_SPEC.md) - QBO integration details
- [QUICKBOOKS_INTEGRATION.md](./QUICKBOOKS_INTEGRATION.md) - Implementation guide
- [NOTES_SYSTEM_PLANNING.md](./NOTES_SYSTEM_PLANNING.md) - Notes feature (shares AI infrastructure)

---

## Resume Point

**Current State**: Schema migration complete (January 9, 2026). Ready for P&L verification and troubleshooting.

**Next Steps**:
1. ✅ Schema migration applied
2. 🔲 Verify P&L expense sync from QBO is working correctly
3. 🔲 Test expense recategorization sync back to QBO (OVIS as source of truth)
4. 🔲 Review and recategorize all 2025 expenses
5. 🔲 Set up budgets by account
6. 🔲 Build financial snapshot infrastructure

**Immediate Priority**: Troubleshoot P&L/expense sync issues before proceeding with budgeting
