# Hunter Agent - Complete Implementation Plan

**Version:** 1.0
**Created:** December 16, 2025
**Status:** Ready for Implementation

---

## Executive Summary

The Hunter is an autonomous AI agent for commercial real estate prospecting. It scrapes industry news, podcasts, and trade publications to identify emerging retail/restaurant concepts expanding in target markets, enriches leads with contact information, and drafts personalized outreach for broker approval.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [Project Structure](#3-project-structure)
4. [Module Specifications](#4-module-specifications)
5. [Environment Variables](#5-environment-variables)
6. [Implementation Phases](#6-implementation-phases)
7. [API Contracts](#7-api-contracts)
8. [UI Components](#8-ui-components)
9. [Deployment](#9-deployment)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           HUNTER AGENT SERVICE                               │
│                    (Dockerized Node.js/TypeScript)                          │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Gatherer   │  │   Analyzer   │  │   Enricher   │  │   Outreach   │   │
│  │   Module     │  │   Module     │  │   Module     │  │   Module     │   │
│  │              │  │              │  │              │  │              │   │
│  │ - Playwright │  │ - Gemini AI  │  │ - OVIS DB    │  │ - Gemini AI  │   │
│  │ - RSS Parser │  │ - Scoring    │  │ - ICSC       │  │ - Templates  │   │
│  │ - Whisper    │  │ - Dedup      │  │ - LinkedIn   │  │ - Drafts     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │            │
│         └─────────────────┴─────────────────┴─────────────────┘            │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE POSTGRESQL                                  │
│                                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │hunter_signal│ │ hunter_lead │ │hunter_action│ │ hunter_outreach_    │   │
│  │             │ │             │ │             │ │ draft               │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                           │
│  │hunter_      │ │hunter_source│ │hunter_      │  + Existing OVIS tables  │
│  │feedback     │ │             │ │contact_     │  (contact, client, etc.) │
│  │             │ │             │ │enrichment   │                           │
│  └─────────────┘ └─────────────┘ └─────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OVIS FRONTEND                                   │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ /hunter         │  │ /hunter/leads   │  │ /hunter/outreach            │ │
│  │ (Dashboard)     │  │ (Lead Detail)   │  │ (Draft Review Queue)        │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SERVICES                                  │
│                                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Gemini   │ │ Whisper  │ │ Gmail    │ │ Resend   │ │ pg_cron  │         │
│  │ 2.5 Flash│ │ API      │ │ API      │ │ (Email)  │ │ (Sched)  │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ (TypeScript) |
| Scraping | Playwright with stealth plugin |
| LLM Analysis | Gemini 2.5 Flash (direct API) |
| Transcription | OpenAI Whisper API |
| Database | Supabase PostgreSQL |
| Scheduling | pg_cron (triggers Edge Function) |
| Email Sending | Gmail API (outreach) + Resend (briefings) |
| Hosting | Docker on Cloud Run or Railway |

### Data Flow

1. **pg_cron** triggers daily at 7:00 AM EST
2. **Gatherer** scrapes all sources, stores raw signals
3. **Analyzer** processes signals with Gemini, creates/updates leads
4. **Enricher** looks up contacts in OVIS, then ICSC
5. **Outreach** drafts emails/voicemail scripts for HOT leads
6. **Briefing** sends daily summary email + updates dashboard

---

## 2. Database Schema

### New Tables

#### `hunter_source`
Tracks configured data sources and their authentication status.

```sql
CREATE TABLE hunter_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identification
  name TEXT NOT NULL,                    -- "Nation's Restaurant News"
  slug TEXT NOT NULL UNIQUE,             -- "nrn"
  source_type TEXT NOT NULL,             -- 'website' | 'rss' | 'podcast'
  base_url TEXT NOT NULL,                -- "https://nrn.com"

  -- Authentication
  requires_auth BOOLEAN DEFAULT false,
  auth_type TEXT,                        -- 'form_login' | 'api_key' | null
  login_url TEXT,

  -- Scraping configuration
  scrape_config JSONB,                   -- Playwright selectors, RSS feed URL, etc.

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_scraped_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial sources
INSERT INTO hunter_source (name, slug, source_type, base_url, requires_auth, auth_type, login_url, scrape_config) VALUES
('Nation''s Restaurant News', 'nrn', 'website', 'https://www.nrn.com', true, 'form_login', 'https://www.nrn.com/user/login', '{"target_paths": ["/emerging-chains", "/growth"], "article_selector": "article"}'),
('QSR Magazine', 'qsr', 'website', 'https://www.qsrmagazine.com', true, 'form_login', 'https://www.qsrmagazine.com/login', '{"target_paths": ["/growth", "/franchising"], "article_selector": "article"}'),
('Franchise Times', 'franchise-times', 'website', 'https://www.franchisetimes.com', false, null, null, '{"target_paths": ["/news", "/franchise-development"], "article_selector": "article"}'),
('Atlanta Business Chronicle', 'bizjournals-atl', 'website', 'https://www.bizjournals.com/atlanta', true, 'form_login', 'https://www.bizjournals.com/atlanta/login', '{"target_paths": ["/news/retail", "/news/restaurant"], "article_selector": "article"}'),
('Restaurant Unstoppable', 'restaurant-unstoppable', 'podcast', 'https://restaurantunstoppable.libsyn.com/rss', false, null, null, '{"rss_url": "https://restaurantunstoppable.libsyn.com/rss"}'),
('Franchise Times Dealmakers', 'ft-dealmakers', 'podcast', 'https://www.franchisetimes.com/podcast', false, null, null, '{"rss_url": null}');
```

#### `hunter_signal`
Raw observations from sources (articles, podcast episodes, etc.).

```sql
CREATE TABLE hunter_signal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source reference
  source_id UUID REFERENCES hunter_source(id),
  source_url TEXT NOT NULL,              -- Full URL to the article/episode
  source_title TEXT,                     -- Article/episode title
  source_published_at TIMESTAMPTZ,       -- When the source was published

  -- Content
  content_type TEXT NOT NULL,            -- 'article' | 'podcast_metadata' | 'podcast_transcript'
  raw_content TEXT,                      -- The scraped text content
  content_hash TEXT,                     -- For deduplication

  -- Processing status
  is_processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,

  -- Metadata
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_hunter_signal_content_hash ON hunter_signal(content_hash);
CREATE INDEX idx_hunter_signal_source_id ON hunter_signal(source_id);
CREATE INDEX idx_hunter_signal_is_processed ON hunter_signal(is_processed);
```

#### `hunter_lead`
Deduplicated company/concept entities with scoring.

```sql
CREATE TABLE hunter_lead (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company identification
  concept_name TEXT NOT NULL,            -- "Wow Wow Hawaiian Lemonade"
  normalized_name TEXT NOT NULL,         -- Lowercase, no punctuation for matching
  website TEXT,

  -- Classification
  industry_segment TEXT,                 -- 'QSR', 'Fast Casual', 'Retail', etc.

  -- Scoring
  signal_strength TEXT NOT NULL,         -- 'HOT' | 'WARM+' | 'WARM' | 'COOL'
  score_reasoning TEXT,                  -- AI explanation of the score

  -- Geography
  target_geography TEXT[],               -- ['Atlanta', 'Georgia', 'Southeast']
  geo_relevance TEXT,                    -- 'primary' | 'secondary' | 'national'

  -- Key contacts discovered
  key_person_name TEXT,
  key_person_title TEXT,

  -- Status
  status TEXT DEFAULT 'new',             -- 'new' | 'enriching' | 'ready' | 'outreach_drafted' | 'contacted' | 'converted' | 'dismissed' | 'watching'

  -- OVIS links (if exists in our system)
  existing_contact_id UUID REFERENCES contact(id),
  existing_client_id UUID REFERENCES client(id),

  -- Rules/preferences
  news_only BOOLEAN DEFAULT false,       -- User marked "don't outreach, just news"

  -- Timestamps
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_signal_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_hunter_lead_normalized_name ON hunter_lead(normalized_name);
CREATE INDEX idx_hunter_lead_status ON hunter_lead(status);
CREATE INDEX idx_hunter_lead_signal_strength ON hunter_lead(signal_strength);
CREATE INDEX idx_hunter_lead_existing_contact ON hunter_lead(existing_contact_id);
```

#### `hunter_lead_signal`
Junction table linking leads to their source signals.

```sql
CREATE TABLE hunter_lead_signal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES hunter_signal(id) ON DELETE CASCADE,

  -- What the AI extracted from this signal for this lead
  extracted_summary TEXT,                -- "Plans 50 locations in Southeast by 2026"
  mentioned_geography TEXT[],            -- ['Atlanta', 'Georgia']
  mentioned_person TEXT,                 -- "John Smith, VP of Real Estate"

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(lead_id, signal_id)
);

CREATE INDEX idx_hunter_lead_signal_lead ON hunter_lead_signal(lead_id);
```

#### `hunter_contact_enrichment`
Contact information discovered through ICSC or other sources.

```sql
CREATE TABLE hunter_contact_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,

  -- Contact info
  person_name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,

  -- Source of this enrichment
  enrichment_source TEXT NOT NULL,       -- 'icsc' | 'article' | 'company_website' | 'manual'
  source_url TEXT,                       -- URL where we found this info

  -- Confidence
  confidence_score NUMERIC(3,2),         -- 0.00 - 1.00

  -- Status
  is_verified BOOLEAN DEFAULT false,     -- User confirmed this is correct

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hunter_contact_enrichment_lead ON hunter_contact_enrichment(lead_id);
```

#### `hunter_outreach_draft`
Drafted emails and voicemail scripts pending approval.

```sql
CREATE TABLE hunter_outreach_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,
  enrichment_id UUID REFERENCES hunter_contact_enrichment(id),

  -- Outreach type
  outreach_type TEXT NOT NULL,           -- 'email' | 'voicemail_script'

  -- Target contact
  contact_name TEXT NOT NULL,
  contact_email TEXT,                    -- Required for email type
  contact_phone TEXT,                    -- Required for voicemail type

  -- Content
  subject TEXT,                          -- For emails
  body TEXT NOT NULL,                    -- Email body or voicemail script

  -- AI context
  ai_reasoning TEXT,                     -- Why Hunter drafted this
  signal_summary TEXT,                   -- The news/signal that triggered this
  source_url TEXT,                       -- Link to the source article/episode

  -- Status
  status TEXT DEFAULT 'draft',           -- 'draft' | 'approved' | 'sent' | 'rejected'

  -- User modifications
  user_edited_subject TEXT,              -- If user modified
  user_edited_body TEXT,                 -- If user modified

  -- Sending
  sent_at TIMESTAMPTZ,
  sent_email_id UUID REFERENCES emails(id),  -- Links to OVIS emails table

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hunter_outreach_draft_lead ON hunter_outreach_draft(lead_id);
CREATE INDEX idx_hunter_outreach_draft_status ON hunter_outreach_draft(status);
```

#### `hunter_feedback`
User feedback for learning/improvement.

```sql
CREATE TABLE hunter_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was acted on
  lead_id UUID REFERENCES hunter_lead(id),
  outreach_draft_id UUID REFERENCES hunter_outreach_draft(id),
  signal_id UUID REFERENCES hunter_signal(id),

  -- Feedback type
  feedback_type TEXT NOT NULL,           -- 'lead_dismissed' | 'lead_converted' | 'outreach_approved' | 'outreach_rejected' | 'outreach_edited' | 'marked_news_only' | 'score_override'

  -- Details
  original_value TEXT,                   -- What the AI produced
  corrected_value TEXT,                  -- What the user changed it to
  feedback_note TEXT,                    -- User explanation

  -- For learning
  concept_name TEXT,                     -- Denormalized for easy querying
  sender_domain TEXT,                    -- If related to a contact

  created_by UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hunter_feedback_lead ON hunter_feedback(lead_id);
CREATE INDEX idx_hunter_feedback_type ON hunter_feedback(feedback_type);
CREATE INDEX idx_hunter_feedback_concept ON hunter_feedback(concept_name);
```

#### `hunter_run_log`
Tracks each execution of the Hunter agent.

```sql
CREATE TABLE hunter_run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Results
  status TEXT DEFAULT 'running',         -- 'running' | 'completed' | 'failed'

  -- Metrics
  sources_scraped INTEGER DEFAULT 0,
  signals_collected INTEGER DEFAULT 0,
  leads_created INTEGER DEFAULT 0,
  leads_updated INTEGER DEFAULT 0,
  contacts_enriched INTEGER DEFAULT 0,
  outreach_drafted INTEGER DEFAULT 0,

  -- Errors
  errors JSONB,                          -- Array of error objects

  -- Briefing
  briefing_sent_at TIMESTAMPTZ,
  briefing_email_id TEXT                 -- Resend message ID
);

CREATE INDEX idx_hunter_run_log_started ON hunter_run_log(started_at);
```

### Views

#### `v_hunter_dashboard`
Aggregated view for the main Hunter dashboard.

```sql
CREATE OR REPLACE VIEW v_hunter_dashboard AS
SELECT
  hl.id,
  hl.concept_name,
  hl.industry_segment,
  hl.signal_strength,
  hl.target_geography,
  hl.status,
  hl.key_person_name,
  hl.key_person_title,
  hl.news_only,
  hl.first_seen_at,
  hl.last_signal_at,

  -- Existing relationship
  hl.existing_contact_id,
  hl.existing_client_id,
  c.first_name || ' ' || c.last_name AS existing_contact_name,
  cl.client_name AS existing_client_name,

  -- Signal count
  (SELECT COUNT(*) FROM hunter_lead_signal hls WHERE hls.lead_id = hl.id) AS signal_count,

  -- Latest signal
  (SELECT hs.source_title
   FROM hunter_lead_signal hls
   JOIN hunter_signal hs ON hs.id = hls.signal_id
   WHERE hls.lead_id = hl.id
   ORDER BY hs.source_published_at DESC
   LIMIT 1) AS latest_signal_title,

  (SELECT hs.source_url
   FROM hunter_lead_signal hls
   JOIN hunter_signal hs ON hs.id = hls.signal_id
   WHERE hls.lead_id = hl.id
   ORDER BY hs.source_published_at DESC
   LIMIT 1) AS latest_signal_url,

  -- Enrichment status
  (SELECT COUNT(*) FROM hunter_contact_enrichment hce WHERE hce.lead_id = hl.id) AS contacts_found,

  -- Pending outreach
  (SELECT COUNT(*) FROM hunter_outreach_draft hod WHERE hod.lead_id = hl.id AND hod.status = 'draft') AS pending_outreach

FROM hunter_lead hl
LEFT JOIN contact c ON c.id = hl.existing_contact_id
LEFT JOIN client cl ON cl.id = hl.existing_client_id
WHERE hl.status NOT IN ('dismissed')
ORDER BY
  CASE hl.signal_strength
    WHEN 'HOT' THEN 1
    WHEN 'WARM+' THEN 2
    WHEN 'WARM' THEN 3
    WHEN 'COOL' THEN 4
  END,
  hl.last_signal_at DESC;
```

#### `v_hunter_reconnect`
Existing contacts that appeared in signals (for "reach out with news").

```sql
CREATE OR REPLACE VIEW v_hunter_reconnect AS
SELECT
  hl.id AS lead_id,
  hl.concept_name,
  c.id AS contact_id,
  c.first_name || ' ' || c.last_name AS contact_name,
  c.email AS contact_email,
  c.phone AS contact_phone,
  cl.client_name,

  -- Latest signal about them
  (SELECT hls.extracted_summary
   FROM hunter_lead_signal hls
   WHERE hls.lead_id = hl.id
   ORDER BY hls.created_at DESC
   LIMIT 1) AS latest_news,

  (SELECT hs.source_url
   FROM hunter_lead_signal hls
   JOIN hunter_signal hs ON hs.id = hls.signal_id
   WHERE hls.lead_id = hl.id
   ORDER BY hs.source_published_at DESC
   LIMIT 1) AS source_url,

  hl.last_signal_at

FROM hunter_lead hl
JOIN contact c ON c.id = hl.existing_contact_id
LEFT JOIN client cl ON cl.id = c.client_id
WHERE hl.existing_contact_id IS NOT NULL
  AND hl.status NOT IN ('dismissed', 'contacted')
ORDER BY hl.last_signal_at DESC;
```

---

## 3. Project Structure

```
hunter-agent/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
│
├── src/
│   ├── index.ts                    # Main entry point
│   ├── config.ts                   # Environment config
│   │
│   ├── modules/
│   │   ├── gatherer/
│   │   │   ├── index.ts            # Gatherer orchestrator
│   │   │   ├── playwright-browser.ts  # Shared browser instance
│   │   │   ├── scrapers/
│   │   │   │   ├── base-scraper.ts    # Abstract base class
│   │   │   │   ├── nrn-scraper.ts     # Nation's Restaurant News
│   │   │   │   ├── qsr-scraper.ts     # QSR Magazine
│   │   │   │   ├── franchise-times-scraper.ts
│   │   │   │   ├── bizjournals-scraper.ts
│   │   │   │   └── icsc-scraper.ts    # ICSC contact lookup
│   │   │   ├── rss/
│   │   │   │   ├── rss-fetcher.ts     # RSS feed parser
│   │   │   │   └── podcast-handler.ts # Episode detection
│   │   │   └── transcription/
│   │   │       └── whisper-client.ts  # OpenAI Whisper API
│   │   │
│   │   ├── analyzer/
│   │   │   ├── index.ts            # Analyzer orchestrator
│   │   │   ├── gemini-client.ts    # Gemini API wrapper
│   │   │   ├── signal-processor.ts # Process raw signals
│   │   │   ├── lead-scorer.ts      # Score leads by geography
│   │   │   └── deduplicator.ts     # Company name matching
│   │   │
│   │   ├── enricher/
│   │   │   ├── index.ts            # Enricher orchestrator
│   │   │   ├── ovis-lookup.ts      # Check existing contacts
│   │   │   ├── icsc-enricher.ts    # ICSC directory lookup
│   │   │   └── linkedin-helper.ts  # Generate LinkedIn search URLs
│   │   │
│   │   ├── outreach/
│   │   │   ├── index.ts            # Outreach orchestrator
│   │   │   ├── email-drafter.ts    # Draft emails with Gemini
│   │   │   ├── voicemail-drafter.ts # Draft voicemail scripts
│   │   │   └── templates.ts        # Base templates/examples
│   │   │
│   │   └── briefing/
│   │       ├── index.ts            # Briefing orchestrator
│   │       ├── report-generator.ts # Generate daily summary
│   │       └── email-sender.ts     # Send via Resend
│   │
│   ├── db/
│   │   ├── client.ts               # Supabase client
│   │   ├── queries/
│   │   │   ├── sources.ts
│   │   │   ├── signals.ts
│   │   │   ├── leads.ts
│   │   │   ├── enrichments.ts
│   │   │   ├── outreach.ts
│   │   │   └── feedback.ts
│   │   └── migrations/             # SQL migration files
│   │
│   ├── utils/
│   │   ├── logger.ts               # Structured logging
│   │   ├── retry.ts                # Retry logic with backoff
│   │   ├── rate-limiter.ts         # Rate limiting for APIs
│   │   └── text-utils.ts           # Name normalization, etc.
│   │
│   └── types/
│       ├── index.ts                # Shared types
│       ├── sources.ts
│       ├── signals.ts
│       ├── leads.ts
│       └── gemini.ts
│
├── tests/
│   ├── gatherer/
│   ├── analyzer/
│   ├── enricher/
│   └── outreach/
│
└── scripts/
    ├── run-local.ts                # Local development runner
    ├── test-scraper.ts             # Test individual scrapers
    └── backfill-signals.ts         # One-time historical scrape
```

---

## 4. Module Specifications

### 4.1 Gatherer Module

#### Playwright Browser Manager

```typescript
// src/modules/gatherer/playwright-browser.ts

import { chromium, Browser, BrowserContext, Page } from 'playwright';

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async getAuthenticatedContext(sourceSlug: string): Promise<BrowserContext> {
    // Return existing context if we have one
    if (this.contexts.has(sourceSlug)) {
      return this.contexts.get(sourceSlug)!;
    }

    // Create new context with stored cookies if available
    const context = await this.browser!.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...',
      viewport: { width: 1920, height: 1080 }
    });

    this.contexts.set(sourceSlug, context);
    return context;
  }

  async close(): Promise<void> {
    for (const context of this.contexts.values()) {
      await context.close();
    }
    await this.browser?.close();
  }
}
```

#### Base Scraper

```typescript
// src/modules/gatherer/scrapers/base-scraper.ts

import { Page } from 'playwright';
import { HunterSource, HunterSignal } from '../../types';

export abstract class BaseScraper {
  protected source: HunterSource;
  protected page: Page;

  constructor(source: HunterSource, page: Page) {
    this.source = source;
    this.page = page;
  }

  abstract login(): Promise<boolean>;
  abstract scrapeArticles(): Promise<HunterSignal[]>;

  protected async waitAndClick(selector: string): Promise<void> {
    await this.page.waitForSelector(selector);
    await this.page.click(selector);
    await this.randomDelay(500, 1500);
  }

  protected async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min) + min);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  protected generateContentHash(content: string): string {
    // Simple hash for deduplication
    return require('crypto')
      .createHash('md5')
      .update(content)
      .digest('hex');
  }
}
```

#### NRN Scraper Example

```typescript
// src/modules/gatherer/scrapers/nrn-scraper.ts

import { BaseScraper } from './base-scraper';
import { HunterSignal } from '../../types';

export class NRNScraper extends BaseScraper {
  async login(): Promise<boolean> {
    try {
      await this.page.goto(this.source.login_url!);
      await this.randomDelay(1000, 2000);

      // Fill login form using user-facing locators
      await this.page.getByLabel('Email Address').fill(process.env.NRN_USERNAME!);
      await this.page.getByLabel('Password').fill(process.env.NRN_PASSWORD!);
      await this.page.getByRole('button', { name: 'Log In' }).click();

      // Wait for navigation to confirm login
      await this.page.waitForURL('**/dashboard**', { timeout: 10000 });
      return true;
    } catch (error) {
      console.error('NRN login failed:', error);
      return false;
    }
  }

  async scrapeArticles(): Promise<HunterSignal[]> {
    const signals: HunterSignal[] = [];
    const config = this.source.scrape_config as { target_paths: string[] };

    for (const path of config.target_paths) {
      await this.page.goto(`${this.source.base_url}${path}`);
      await this.randomDelay(2000, 4000);

      // Get all article links
      const articleLinks = await this.page.$$eval(
        'article a[href*="/article/"]',
        links => links.map(a => ({
          url: (a as HTMLAnchorElement).href,
          title: a.textContent?.trim() || ''
        }))
      );

      // Scrape each article (limit to newest 10)
      for (const link of articleLinks.slice(0, 10)) {
        try {
          await this.page.goto(link.url);
          await this.randomDelay(1500, 3000);

          const content = await this.page.$eval(
            'article .article-body',
            el => el.textContent?.trim() || ''
          );

          const publishedAt = await this.page.$eval(
            'time[datetime]',
            el => el.getAttribute('datetime')
          ).catch(() => null);

          signals.push({
            source_id: this.source.id,
            source_url: link.url,
            source_title: link.title,
            source_published_at: publishedAt ? new Date(publishedAt) : new Date(),
            content_type: 'article',
            raw_content: content,
            content_hash: this.generateContentHash(content)
          });
        } catch (error) {
          console.error(`Failed to scrape article: ${link.url}`, error);
        }
      }
    }

    return signals;
  }
}
```

#### ICSC Enricher

```typescript
// src/modules/gatherer/scrapers/icsc-scraper.ts

import { Page } from 'playwright';
import { ContactEnrichment } from '../../types';

export class ICSCScraper {
  private page: Page;
  private isLoggedIn = false;

  constructor(page: Page) {
    this.page = page;
  }

  async login(): Promise<boolean> {
    try {
      await this.page.goto('https://www.icsc.com/login');
      await this.page.getByLabel('Member ID').fill(process.env.ICSC_USERNAME!);
      await this.page.getByLabel('Password').fill(process.env.ICSC_PASSWORD!);
      await this.page.getByRole('button', { name: 'Sign In' }).click();

      await this.page.waitForURL('**/dashboard**', { timeout: 10000 });
      this.isLoggedIn = true;
      return true;
    } catch (error) {
      console.error('ICSC login failed:', error);
      return false;
    }
  }

  async searchCompany(companyName: string): Promise<ContactEnrichment[]> {
    if (!this.isLoggedIn) {
      await this.login();
    }

    const contacts: ContactEnrichment[] = [];

    try {
      // Navigate to member search
      const searchUrl = `https://www.icsc.com/search?type=members&query=${encodeURIComponent(companyName)}`;
      await this.page.goto(searchUrl);
      await this.page.waitForSelector('.search-results', { timeout: 10000 });

      // Get all member cards
      const memberCards = await this.page.$$('.member-card');

      for (const card of memberCards.slice(0, 5)) { // Limit to top 5
        // Extract basic info
        const name = await card.$eval('.member-name', el => el.textContent?.trim() || '');
        const title = await card.$eval('.member-title', el => el.textContent?.trim() || '').catch(() => '');
        const company = await card.$eval('.member-company', el => el.textContent?.trim() || '').catch(() => '');

        // Click to reveal email
        const emailLink = await card.$('a:has-text("Show Email")');
        let email = '';
        if (emailLink) {
          await emailLink.click();
          await this.page.waitForTimeout(500);
          email = await card.$eval('.email-revealed', el => el.textContent?.trim() || '').catch(() => '');
        }

        // Click to reveal phone
        const phoneLink = await card.$('a:has-text("Show Phone")');
        let phone = '';
        if (phoneLink) {
          await phoneLink.click();
          await this.page.waitForTimeout(500);
          phone = await card.$eval('.phone-revealed', el => el.textContent?.trim() || '').catch(() => '');
        }

        if (name) {
          contacts.push({
            person_name: name,
            title,
            email,
            phone,
            enrichment_source: 'icsc',
            source_url: searchUrl,
            confidence_score: 0.9
          });
        }

        // Polite delay between reveals
        await this.page.waitForTimeout(2000);
      }
    } catch (error) {
      console.error(`ICSC search failed for: ${companyName}`, error);
    }

    return contacts;
  }
}
```

#### Podcast Handler with Whisper

```typescript
// src/modules/gatherer/transcription/whisper-client.ts

import OpenAI from 'openai';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export class WhisperClient {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async transcribeEpisode(audioUrl: string, episodeId: string): Promise<string> {
    // Download audio to temp file
    const tempPath = path.join('/tmp', `${episodeId}.mp3`);

    const response = await axios({
      method: 'GET',
      url: audioUrl,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(tempPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Transcribe with Whisper
    const transcription = await this.openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      response_format: 'text'
    });

    // Cleanup
    fs.unlinkSync(tempPath);

    return transcription;
  }

  async shouldTranscribe(title: string, description: string): Promise<boolean> {
    // Keywords that suggest expansion/growth content
    const expansionKeywords = [
      'expansion', 'expanding', 'growth', 'growing', 'new location',
      'franchise', 'franchising', 'southeast', 'atlanta', 'georgia',
      'texas', 'florida', 'real estate', 'site selection', 'development',
      'opening', 'unit growth', 'multi-unit', 'territory'
    ];

    const text = `${title} ${description}`.toLowerCase();
    return expansionKeywords.some(kw => text.includes(kw));
  }
}
```

### 4.2 Analyzer Module

#### Gemini Client

```typescript
// src/modules/analyzer/gemini-client.ts

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface LeadExtraction {
  concept_name: string;
  industry_segment: string;
  signal_summary: string;
  mentioned_geography: string[];
  key_person_name?: string;
  key_person_title?: string;
  expansion_indicators: string[];
}

export class GeminiClient {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY!;
  }

  async extractLeads(articleContent: string, sourceTitle: string): Promise<LeadExtraction[]> {
    const systemPrompt = `You are The Hunter, an elite prospecting scout for a commercial real estate broker specializing in retail and restaurant tenant representation.

Your job is to analyze articles and extract information about retail/restaurant brands that are:
- Expanding (opening new locations)
- Emerging (new concepts with growth plans)
- Raising capital (PE/VC investment for growth)
- Hiring real estate executives (signals expansion)

For each brand/concept mentioned, extract:
1. concept_name: The brand/company name
2. industry_segment: QSR, Fast Casual, Casual Dining, Fine Dining, Coffee/Beverage, Retail, Fitness, Medical/Dental, Service
3. signal_summary: 1-2 sentence summary of the growth signal
4. mentioned_geography: Array of specific locations mentioned (cities, states, regions)
5. key_person_name: Name of any real estate/development executive mentioned
6. key_person_title: Their title
7. expansion_indicators: Array of specific signals (e.g., "raising $50M", "plans 100 locations", "hiring VP of RE")

Return a JSON array of extractions. If no relevant brands are found, return an empty array.
Only include brands with clear expansion/growth signals. Ignore brands just mentioned in passing.`;

    const userPrompt = `Article Title: ${sourceTitle}

Article Content:
${articleContent}

Extract all retail/restaurant brands with expansion signals from this article.`;

    const response = await this.callGemini(systemPrompt, userPrompt);

    try {
      // Parse JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      return [];
    }
  }

  async scoreLeadGeography(
    geography: string[],
    conceptName: string
  ): Promise<{ strength: 'HOT' | 'WARM+' | 'WARM' | 'COOL'; reasoning: string }> {

    const primaryMarkets = ['georgia', 'ga', 'atlanta', 'alabama', 'al', 'birmingham',
                           'tennessee', 'tn', 'nashville', 'south carolina', 'sc', 'charleston',
                           'north carolina', 'nc', 'charlotte', 'florida', 'fl', 'tampa', 'orlando', 'jacksonville'];

    const secondaryMarkets = ['texas', 'tx', 'dallas', 'austin', 'ohio', 'oh', 'illinois', 'il', 'chicago'];

    const regionalTerms = ['southeast', 'sunbelt', 'southern'];

    const geoLower = geography.map(g => g.toLowerCase());

    // Check for primary market match
    if (primaryMarkets.some(m => geoLower.some(g => g.includes(m)))) {
      return {
        strength: 'HOT',
        reasoning: `Direct mention of primary Southeast market: ${geography.join(', ')}`
      };
    }

    // Check for secondary market match
    if (secondaryMarkets.some(m => geoLower.some(g => g.includes(m)))) {
      return {
        strength: 'WARM+',
        reasoning: `Mention of priority secondary market: ${geography.join(', ')}`
      };
    }

    // Check for regional terms
    if (regionalTerms.some(t => geoLower.some(g => g.includes(t)))) {
      return {
        strength: 'WARM+',
        reasoning: `Regional Southeast/Sunbelt expansion mentioned`
      };
    }

    // National expansion
    if (geoLower.some(g => g.includes('national') || g.includes('nationwide') || g.includes('across the country'))) {
      return {
        strength: 'WARM',
        reasoning: `National expansion - may include target markets`
      };
    }

    // Other specific regions
    if (geography.length > 0) {
      return {
        strength: 'COOL',
        reasoning: `Expansion in other markets: ${geography.join(', ')}`
      };
    }

    return {
      strength: 'WARM',
      reasoning: `Expansion mentioned but no specific geography`
    };
  }

  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${GEMINI_API_BASE}/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}
```

#### Lead Deduplicator

```typescript
// src/modules/analyzer/deduplicator.ts

export class Deduplicator {
  /**
   * Normalize company name for matching
   */
  normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/['']/g, '')           // Remove apostrophes
      .replace(/[^a-z0-9\s]/g, '')    // Remove punctuation
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/\b(inc|llc|corp|co|company|restaurant|restaurants|cafe|grill|kitchen|bar|eatery)\b/g, '')
      .trim();
  }

  /**
   * Check if two names likely refer to the same company
   */
  isSameCompany(name1: string, name2: string): boolean {
    const norm1 = this.normalizeName(name1);
    const norm2 = this.normalizeName(name2);

    // Exact match
    if (norm1 === norm2) return true;

    // One contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

    // Levenshtein distance for fuzzy matching
    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLen = Math.max(norm1.length, norm2.length);
    const similarity = 1 - (distance / maxLen);

    return similarity > 0.85;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }
}
```

### 4.3 Outreach Module

#### Email Drafter

```typescript
// src/modules/outreach/email-drafter.ts

import { GeminiClient } from '../analyzer/gemini-client';
import { HunterLead, ContactEnrichment } from '../../types';

export class EmailDrafter {
  private gemini: GeminiClient;

  constructor() {
    this.gemini = new GeminiClient();
  }

  async draftEmail(
    lead: HunterLead,
    contact: ContactEnrichment,
    signalSummary: string,
    sourceUrl: string
  ): Promise<{ subject: string; body: string; reasoning: string }> {

    const systemPrompt = `You are drafting a prospecting email for Mike Minihan, a commercial real estate broker at Oculus Real Estate Partners who specializes in tenant representation for retail and restaurant brands in the Southeast.

Mike's value proposition:
- Deep market knowledge of Southeast retail real estate
- Relationships with landlords across GA, FL, TN, AL, SC, NC
- Track record helping emerging brands find the right locations
- Hands-on, responsive service

Tone: Professional but warm, not salesy. Like reaching out to a colleague with relevant news.

Format:
- Subject: Brief, references their news/expansion
- Body: 3-4 short paragraphs max
  1. Reference the specific news you saw (shows you did research)
  2. Brief intro of Mike and why he's relevant to their expansion
  3. Soft ask for a conversation
  4. Professional sign-off

Do NOT:
- Use generic "I hope this email finds you well"
- Be pushy or overly salesy
- Make it too long
- Use excessive exclamation points`;

    const userPrompt = `Draft an outreach email for this lead:

Company: ${lead.concept_name}
Industry: ${lead.industry_segment}
Contact: ${contact.person_name}, ${contact.title}
Signal: ${signalSummary}
Source: ${sourceUrl}
Target Geography: ${lead.target_geography?.join(', ') || 'Southeast'}

Draft the email subject and body.`;

    const response = await this.gemini.callGemini(systemPrompt, userPrompt);

    // Parse subject and body from response
    const subjectMatch = response.match(/Subject:\s*(.+?)(?:\n|$)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : `RE: ${lead.concept_name} Expansion`;

    const bodyMatch = response.match(/Body:\s*([\s\S]+)/i);
    const body = bodyMatch ? bodyMatch[1].trim() : response;

    return {
      subject,
      body,
      reasoning: `Drafted based on ${lead.signal_strength} signal: "${signalSummary}"`
    };
  }

  async draftVoicemailScript(
    lead: HunterLead,
    contact: ContactEnrichment,
    signalSummary: string
  ): Promise<{ script: string; reasoning: string }> {

    const systemPrompt = `You are drafting a voicemail script for Mike Minihan, a commercial real estate broker. The voicemail should be:

- 20-30 seconds when spoken (about 60-80 words)
- Reference the specific news about their company
- Brief mention of Mike's relevance
- Clear callback request with phone number

Tone: Friendly, professional, not rushed.`;

    const userPrompt = `Draft a voicemail script for:

Company: ${lead.concept_name}
Contact: ${contact.person_name}, ${contact.title}
Signal: ${signalSummary}
Mike's phone: (404) 555-1234

Keep it under 80 words.`;

    const response = await this.gemini.callGemini(systemPrompt, userPrompt);

    return {
      script: response.trim(),
      reasoning: `Voicemail script for ${contact.person_name} based on: "${signalSummary}"`
    };
  }
}
```

### 4.4 Briefing Module

#### Daily Report Generator

```typescript
// src/modules/briefing/report-generator.ts

import { createClient } from '@supabase/supabase-js';

interface DailyBriefing {
  runDate: Date;
  newLeads: LeadSummary[];
  reconnectOpportunities: ReconnectSummary[];
  watchingNews: WatchingSummary[];
  pendingOutreach: OutreachSummary[];
  sourceStatus: SourceStatus[];
  metrics: RunMetrics;
}

export class ReportGenerator {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }

  async generateBriefing(runId: string): Promise<DailyBriefing> {
    // Get today's new leads
    const { data: newLeads } = await this.supabase
      .from('v_hunter_dashboard')
      .select('*')
      .gte('first_seen_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .is('existing_contact_id', null)
      .order('signal_strength');

    // Get reconnect opportunities (existing contacts in news)
    const { data: reconnect } = await this.supabase
      .from('v_hunter_reconnect')
      .select('*')
      .gte('last_signal_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get news-only items
    const { data: watching } = await this.supabase
      .from('v_hunter_dashboard')
      .select('*')
      .eq('news_only', true)
      .gte('last_signal_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Get pending outreach drafts
    const { data: pendingOutreach } = await this.supabase
      .from('hunter_outreach_draft')
      .select('*, lead:hunter_lead(*)')
      .eq('status', 'draft');

    // Get source status
    const { data: sources } = await this.supabase
      .from('hunter_source')
      .select('name, last_scraped_at, last_error, consecutive_failures');

    // Get run metrics
    const { data: runLog } = await this.supabase
      .from('hunter_run_log')
      .select('*')
      .eq('id', runId)
      .single();

    return {
      runDate: new Date(),
      newLeads: this.formatLeads(newLeads || []),
      reconnectOpportunities: this.formatReconnect(reconnect || []),
      watchingNews: this.formatWatching(watching || []),
      pendingOutreach: this.formatOutreach(pendingOutreach || []),
      sourceStatus: this.formatSources(sources || []),
      metrics: runLog || {}
    };
  }

  generateEmailHtml(briefing: DailyBriefing): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a365d; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .section { background: #f7fafc; padding: 15px; margin: 10px 0; border-radius: 8px; }
    .hot { border-left: 4px solid #e53e3e; }
    .warm { border-left: 4px solid #ed8936; }
    .cool { border-left: 4px solid #4299e1; }
    .lead-name { font-weight: bold; font-size: 16px; }
    .signal { color: #666; font-size: 14px; }
    .cta { display: inline-block; background: #3182ce; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none; margin-top: 10px; }
    .reconnect { background: #f0fff4; border-left: 4px solid #48bb78; }
    .metrics { display: flex; gap: 20px; margin-top: 15px; }
    .metric { text-align: center; }
    .metric-value { font-size: 24px; font-weight: bold; color: #2d3748; }
    .metric-label { font-size: 12px; color: #718096; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🎯 Hunter Daily Briefing</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">${briefing.runDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>

    <div class="metrics">
      <div class="metric">
        <div class="metric-value">${briefing.newLeads.length}</div>
        <div class="metric-label">New Leads</div>
      </div>
      <div class="metric">
        <div class="metric-value">${briefing.reconnectOpportunities.length}</div>
        <div class="metric-label">Reconnect</div>
      </div>
      <div class="metric">
        <div class="metric-value">${briefing.pendingOutreach.length}</div>
        <div class="metric-label">Drafts Ready</div>
      </div>
    </div>

    ${briefing.newLeads.length > 0 ? `
    <h2>🔥 New Leads</h2>
    ${briefing.newLeads.map(lead => `
      <div class="section ${lead.signal_strength.toLowerCase()}">
        <div class="lead-name">${lead.concept_name} <span style="font-weight: normal; color: #888;">(${lead.signal_strength})</span></div>
        <div class="signal">${lead.signal_summary}</div>
        ${lead.key_person ? `<div style="margin-top: 5px;">👤 ${lead.key_person}</div>` : ''}
        <a href="${lead.source_url}" class="cta" style="color: white;">View Source →</a>
      </div>
    `).join('')}
    ` : ''}

    ${briefing.reconnectOpportunities.length > 0 ? `
    <h2>📞 Reconnect - Your Contacts in the News</h2>
    ${briefing.reconnectOpportunities.map(r => `
      <div class="section reconnect">
        <div class="lead-name">${r.contact_name} (${r.company})</div>
        <div class="signal">${r.news_summary}</div>
        <a href="mailto:${r.email}" class="cta" style="color: white;">Email with News →</a>
      </div>
    `).join('')}
    ` : ''}

    ${briefing.pendingOutreach.length > 0 ? `
    <h2>✉️ Outreach Drafts Ready for Review</h2>
    <p>${briefing.pendingOutreach.length} email/voicemail drafts waiting for your approval.</p>
    <a href="${process.env.OVIS_URL}/hunter/outreach" class="cta" style="color: white;">Review Drafts →</a>
    ` : ''}

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #718096; font-size: 12px;">
      <a href="${process.env.OVIS_URL}/hunter" style="color: #3182ce;">Open Hunter Dashboard</a>
    </div>
  </div>
</body>
</html>`;
  }
}
```

---

## 5. Environment Variables

```bash
# .env.example

# Database
SUPABASE_URL=https://rqbvcvwbziilnycqtmnc.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

# LLM
GEMINI_API_KEY=your_gemini_api_key

# Transcription
OPENAI_API_KEY=your_openai_api_key

# Email
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=hunter@oculusrep.com

# Gmail (for sending outreach)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Source Credentials
NRN_USERNAME=
NRN_PASSWORD=

QSR_USERNAME=
QSR_PASSWORD=

BIZJOURNALS_USERNAME=
BIZJOURNALS_PASSWORD=

ICSC_USERNAME=
ICSC_PASSWORD=

# App Config
OVIS_URL=https://your-ovis-app.com
HUNTER_RUN_HOUR=7
HUNTER_TIMEZONE=America/New_York
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Days 1-2)
- [ ] Initialize TypeScript project with dependencies
- [ ] Set up Docker configuration
- [ ] Create database migrations
- [ ] Implement Supabase client and base queries
- [ ] Build config and logging utilities

### Phase 2: Gatherer Module (Days 3-5)
- [ ] Implement Playwright browser manager
- [ ] Build NRN scraper with authentication
- [ ] Build QSR Magazine scraper
- [ ] Build Franchise Times scraper
- [ ] Build BizJournals scraper
- [ ] Implement RSS feed parser
- [ ] Implement podcast metadata scanner
- [ ] Integrate Whisper for selective transcription
- [ ] Build ICSC contact lookup scraper

### Phase 3: Analyzer Module (Days 6-7)
- [ ] Implement Gemini client
- [ ] Build signal processor (extract leads from content)
- [ ] Implement lead scorer (geography-based)
- [ ] Build deduplicator (company name matching)
- [ ] Implement existing contact/client lookup

### Phase 4: Enricher Module (Day 8)
- [ ] Build OVIS contact lookup
- [ ] Integrate ICSC enricher
- [ ] Build LinkedIn URL generator
- [ ] Implement enrichment status tracking

### Phase 5: Outreach Module (Days 9-10)
- [ ] Build email drafter with Gemini
- [ ] Build voicemail script drafter
- [ ] Implement draft storage and status tracking
- [ ] Build Gmail send integration

### Phase 6: Briefing Module (Day 11)
- [ ] Build daily report generator
- [ ] Create HTML email template
- [ ] Implement Resend email sending
- [ ] Build dashboard data aggregation

### Phase 7: OVIS UI (Days 12-14)
- [ ] Create `/hunter` dashboard page
- [ ] Build lead detail view
- [ ] Create `/hunter/outreach` draft review queue
- [ ] Implement approve/edit/send workflow
- [ ] Add feedback capture UI
- [ ] Build reconnect list component

### Phase 8: Integration & Testing (Days 15-16)
- [ ] Set up pg_cron trigger
- [ ] Create Edge Function to invoke Hunter service
- [ ] End-to-end testing
- [ ] Error handling and alerting
- [ ] Documentation

### Phase 9: Deployment (Day 17)
- [ ] Deploy to Cloud Run or Railway
- [ ] Configure production secrets
- [ ] Set up monitoring
- [ ] Run first production cycle

---

## 7. API Contracts

### Hunter Service Endpoints

The Hunter service exposes a simple HTTP API for triggering runs and checking status.

#### POST /run
Trigger a Hunter run manually.

```typescript
// Request
POST /run
Authorization: Bearer ${SERVICE_KEY}

// Response
{
  "run_id": "uuid",
  "status": "started",
  "started_at": "2025-12-16T12:00:00Z"
}
```

#### GET /status/:runId
Get status of a specific run.

```typescript
// Response
{
  "run_id": "uuid",
  "status": "completed",
  "started_at": "2025-12-16T12:00:00Z",
  "completed_at": "2025-12-16T12:15:00Z",
  "metrics": {
    "sources_scraped": 4,
    "signals_collected": 23,
    "leads_created": 5,
    "leads_updated": 8,
    "contacts_enriched": 3,
    "outreach_drafted": 2
  }
}
```

### Edge Function Trigger

```typescript
// supabase/functions/hunter-trigger/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  // Called by pg_cron daily at 7 AM EST
  const hunterServiceUrl = Deno.env.get('HUNTER_SERVICE_URL');
  const serviceKey = Deno.env.get('HUNTER_SERVICE_KEY');

  const response = await fetch(`${hunterServiceUrl}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    }
  });

  const result = await response.json();

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

---

## 8. UI Components

### Dashboard Page (`/hunter`)

```typescript
// src/pages/HunterDashboardPage.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const HunterDashboardPage: React.FC = () => {
  const [leads, setLeads] = useState([]);
  const [reconnect, setReconnect] = useState([]);
  const [filter, setFilter] = useState<'all' | 'hot' | 'warm' | 'cool'>('all');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const { data: leadsData } = await supabase
      .from('v_hunter_dashboard')
      .select('*');

    const { data: reconnectData } = await supabase
      .from('v_hunter_reconnect')
      .select('*');

    setLeads(leadsData || []);
    setReconnect(reconnectData || []);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Hunter Dashboard</h1>
        <div className="flex gap-2">
          <button onClick={() => setFilter('all')}>All</button>
          <button onClick={() => setFilter('hot')}>🔥 Hot</button>
          <button onClick={() => setFilter('warm')}>🌡️ Warm</button>
          <button onClick={() => setFilter('cool')}>❄️ Cool</button>
        </div>
      </div>

      {/* Reconnect Section */}
      {reconnect.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">📞 Reconnect - Your Contacts in the News</h2>
          <div className="grid gap-4">
            {reconnect.map(r => (
              <ReconnectCard key={r.lead_id} data={r} />
            ))}
          </div>
        </section>
      )}

      {/* New Leads Section */}
      <section>
        <h2 className="text-lg font-semibold mb-4">🎯 Leads</h2>
        <div className="grid gap-4">
          {leads
            .filter(l => filter === 'all' || l.signal_strength.toLowerCase().includes(filter))
            .map(lead => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
        </div>
      </section>
    </div>
  );
};
```

### Outreach Review Page (`/hunter/outreach`)

```typescript
// src/pages/HunterOutreachPage.tsx

const HunterOutreachPage: React.FC = () => {
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');

  const handleApproveAndSend = async (draft) => {
    // Call Gmail API to send email
    const { data, error } = await supabase.functions.invoke('send-hunter-outreach', {
      body: {
        draft_id: draft.id,
        subject: editedSubject || draft.subject,
        body: editedBody || draft.body,
        to_email: draft.contact_email
      }
    });

    if (!error) {
      // Update draft status
      await supabase
        .from('hunter_outreach_draft')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          user_edited_subject: editedSubject || null,
          user_edited_body: editedBody || null
        })
        .eq('id', draft.id);

      // Log feedback for learning
      await supabase
        .from('hunter_feedback')
        .insert({
          outreach_draft_id: draft.id,
          lead_id: draft.lead_id,
          feedback_type: editedBody ? 'outreach_edited' : 'outreach_approved',
          original_value: draft.body,
          corrected_value: editedBody || draft.body
        });

      fetchDrafts();
    }
  };

  const handleReject = async (draft) => {
    await supabase
      .from('hunter_outreach_draft')
      .update({ status: 'rejected' })
      .eq('id', draft.id);

    await supabase
      .from('hunter_feedback')
      .insert({
        outreach_draft_id: draft.id,
        lead_id: draft.lead_id,
        feedback_type: 'outreach_rejected'
      });

    fetchDrafts();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Outreach Review Queue</h1>

      <div className="grid grid-cols-3 gap-6">
        {/* Draft List */}
        <div className="col-span-1 border-r pr-4">
          {drafts.map(draft => (
            <DraftListItem
              key={draft.id}
              draft={draft}
              selected={selectedDraft?.id === draft.id}
              onClick={() => setSelectedDraft(draft)}
            />
          ))}
        </div>

        {/* Draft Editor */}
        <div className="col-span-2">
          {selectedDraft && (
            <DraftEditor
              draft={selectedDraft}
              editedSubject={editedSubject}
              editedBody={editedBody}
              onSubjectChange={setEditedSubject}
              onBodyChange={setEditedBody}
              onApprove={() => handleApproveAndSend(selectedDraft)}
              onReject={() => handleReject(selectedDraft)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
```

---

## 9. Deployment

### Dockerfile

```dockerfile
FROM node:20-slim

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Install Playwright browsers
RUN npx playwright install chromium

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Run
CMD ["node", "dist/index.js"]
```

### docker-compose.yml (for local development)

```yaml
version: '3.8'

services:
  hunter:
    build: .
    env_file: .env
    ports:
      - "3001:3001"
    volumes:
      - ./src:/app/src
    command: npm run dev
```

### Cloud Run Deployment

```bash
# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/PROJECT_ID/hunter-agent

# Deploy to Cloud Run
gcloud run deploy hunter-agent \
  --image gcr.io/PROJECT_ID/hunter-agent \
  --platform managed \
  --region us-east1 \
  --memory 2Gi \
  --timeout 900 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "SUPABASE_URL=supabase-url:latest,SUPABASE_SERVICE_KEY=supabase-key:latest,..." \
  --no-allow-unauthenticated
```

### pg_cron Setup

```sql
-- Enable pg_cron extension (in Supabase dashboard)
-- Settings > Extensions > pg_cron

-- Schedule Hunter trigger at 7 AM EST (12:00 UTC in winter, 11:00 UTC in summer)
SELECT cron.schedule(
  'hunter-daily-run',
  '0 12 * * *',  -- 12:00 UTC = 7:00 AM EST
  $$
  SELECT net.http_post(
    url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/hunter-trigger',
    headers := '{"Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

---

## 10. Testing Strategy

### Unit Tests

```typescript
// tests/analyzer/deduplicator.test.ts

import { Deduplicator } from '../../src/modules/analyzer/deduplicator';

describe('Deduplicator', () => {
  const dedup = new Deduplicator();

  describe('normalizeName', () => {
    it('removes common suffixes', () => {
      expect(dedup.normalizeName("Chick-fil-A, Inc.")).toBe("chickfila");
      expect(dedup.normalizeName("Wow Wow Hawaiian Lemonade LLC")).toBe("wow wow hawaiian lemonade");
    });
  });

  describe('isSameCompany', () => {
    it('matches exact names', () => {
      expect(dedup.isSameCompany("Chick-fil-A", "Chick-fil-A")).toBe(true);
    });

    it('matches with different punctuation', () => {
      expect(dedup.isSameCompany("Chick-fil-A", "Chickfila")).toBe(true);
    });

    it('matches with suffixes', () => {
      expect(dedup.isSameCompany("Starbucks", "Starbucks Coffee Company")).toBe(true);
    });

    it('rejects different companies', () => {
      expect(dedup.isSameCompany("Starbucks", "Dunkin")).toBe(false);
    });
  });
});
```

### Integration Tests

```typescript
// tests/integration/scraper.test.ts

import { NRNScraper } from '../../src/modules/gatherer/scrapers/nrn-scraper';
import { BrowserManager } from '../../src/modules/gatherer/playwright-browser';

describe('NRN Scraper Integration', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.initialize();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('can login and scrape articles', async () => {
    const context = await browser.getAuthenticatedContext('nrn');
    const page = await context.newPage();

    const scraper = new NRNScraper(mockSource, page);
    const loggedIn = await scraper.login();

    expect(loggedIn).toBe(true);

    const signals = await scraper.scrapeArticles();
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0]).toHaveProperty('source_url');
    expect(signals[0]).toHaveProperty('raw_content');
  }, 60000); // 60 second timeout for network operations
});
```

### End-to-End Test

```typescript
// tests/e2e/full-run.test.ts

describe('Hunter Full Run E2E', () => {
  it('completes a full gather-analyze-enrich-draft cycle', async () => {
    // 1. Trigger a run
    const runResult = await triggerHunterRun();
    expect(runResult.status).toBe('started');

    // 2. Wait for completion (poll status)
    const finalStatus = await waitForCompletion(runResult.run_id, 300000);
    expect(finalStatus.status).toBe('completed');

    // 3. Verify signals were collected
    const { data: signals } = await supabase
      .from('hunter_signal')
      .select('*')
      .gte('created_at', runResult.started_at);
    expect(signals.length).toBeGreaterThan(0);

    // 4. Verify leads were created/updated
    const { data: leads } = await supabase
      .from('hunter_lead')
      .select('*')
      .gte('updated_at', runResult.started_at);
    expect(leads.length).toBeGreaterThan(0);

    // 5. Verify briefing was sent
    expect(finalStatus.briefing_sent_at).toBeTruthy();
  }, 600000); // 10 minute timeout
});
```

---

## Appendix A: Lead Scoring Matrix

| Geography Mentioned | Score | Reasoning |
|---------------------|-------|-----------|
| Atlanta, Georgia, GA | HOT 🔥 | Primary market |
| Alabama, Birmingham, AL | HOT 🔥 | Primary market |
| Tennessee, Nashville, TN | HOT 🔥 | Primary market |
| South Carolina, Charleston, SC | HOT 🔥 | Primary market |
| North Carolina, Charlotte, Raleigh, NC | HOT 🔥 | Primary market |
| Florida, Tampa, Orlando, Jacksonville, FL | HOT 🔥 | Primary market |
| Texas, Dallas, Austin, TX | WARM+ 🌡️ | Priority secondary |
| Ohio, OH | WARM+ 🌡️ | Priority secondary |
| Illinois, Chicago, IL | WARM+ 🌡️ | Priority secondary |
| "Southeast", "Sunbelt" | WARM+ 🌡️ | Likely includes primary |
| "National", "Nationwide" | WARM | May include markets |
| Other specific regions | COOL ❄️ | Track but lower priority |
| No geography mentioned | WARM | Unknown, monitor |

---

## Appendix B: Industry Segments

All segments are tracked equally:
- QSR (Quick Service Restaurant)
- Fast Casual
- Casual Dining
- Fine Dining
- Coffee/Beverage
- Retail (general)
- Fitness/Gym
- Medical/Dental retail
- Service retail (salons, spas, etc.)

---

## Appendix C: Signal Keywords

Keywords that indicate expansion/growth (used in podcast metadata filtering):

**Strong Signals:**
- expansion, expanding, growth, growing
- new location, new store, new unit
- franchise, franchising, franchisee
- real estate, site selection
- development, developer
- multi-unit, unit growth

**Geography Signals:**
- southeast, sunbelt, southern
- atlanta, georgia, florida, texas
- (all primary/secondary market names)

**Financial Signals:**
- funding, investment, capital
- private equity, PE, venture
- acquisition, acquired

**Hiring Signals:**
- VP of Real Estate, Director of Real Estate
- Head of Development, VP Development
- Franchise Development Director

---

*Document created: December 16, 2025*
*Ready for implementation*
