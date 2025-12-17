import express from 'express';
import { config, validateConfig } from './config';
import { createLogger } from './utils/logger';
import { supabase } from './db/client';
import { RunError } from './types';

const logger = createLogger('main');

// Import modules
import { Gatherer } from './modules/gatherer';
import { Analyzer } from './modules/analyzer';
import { Enricher } from './modules/enricher';
import { OutreachDrafter } from './modules/outreach';
import { BriefingSender } from './modules/briefing';

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Trigger a Hunter run
app.post('/run', async (_req, res) => {
  logger.info('Hunter run triggered');

  try {
    // Create run log entry
    const { data: runLog, error: runError } = await supabase
      .from('hunter_run_log')
      .insert({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (runError || !runLog) {
      throw new Error(`Failed to create run log: ${runError?.message}`);
    }

    // Return immediately with run ID (actual processing happens async)
    res.json({
      run_id: runLog.id,
      status: 'started',
      started_at: runLog.started_at,
    });

    // Execute the run asynchronously
    executeHunterRun(runLog.id).catch((err) => {
      logger.error('Hunter run failed', { runId: runLog.id, error: err.message });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start Hunter run', { error: message });
    res.status(500).json({ error: message });
  }
});

// Get status of a specific run
app.get('/status/:runId', async (req, res): Promise<void> => {
  const { runId } = req.params;

  try {
    const { data: runLog, error } = await supabase
      .from('hunter_run_log')
      .select('*')
      .eq('id', runId)
      .single();

    if (error || !runLog) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json(runLog);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Get latest run status
app.get('/status', async (_, res): Promise<void> => {
  try {
    const { data: runLog, error } = await supabase
      .from('hunter_run_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !runLog) {
      res.status(404).json({ error: 'No runs found' });
      return;
    }

    res.json(runLog);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * Execute the full Hunter run pipeline
 */
async function executeHunterRun(runId: string): Promise<void> {
  const errors: RunError[] = [];
  const metrics = {
    sources_scraped: 0,
    signals_collected: 0,
    leads_created: 0,
    leads_updated: 0,
    contacts_enriched: 0,
    outreach_drafted: 0,
  };

  logger.info('Starting Hunter run', { runId });

  try {
    // Phase 1: Gather signals from all sources
    logger.info('Phase 1: Gathering signals...');
    const gatherer = new Gatherer();
    const gatherResult = await gatherer.run();
    metrics.sources_scraped = gatherResult.sourcesScraped;
    metrics.signals_collected = gatherResult.signalsCollected;
    errors.push(...gatherResult.errors);

    // Phase 2: Analyze signals and create/update leads
    logger.info('Phase 2: Analyzing signals...');
    const analyzer = new Analyzer();
    const analyzeResult = await analyzer.run();
    metrics.leads_created = analyzeResult.leadsCreated;
    metrics.leads_updated = analyzeResult.leadsUpdated;
    errors.push(...analyzeResult.errors);

    // Phase 3: Enrich leads with contact information
    logger.info('Phase 3: Enriching leads...');
    const enricher = new Enricher();
    const enrichResult = await enricher.run();
    metrics.contacts_enriched = enrichResult.contactsEnriched;
    errors.push(...enrichResult.errors);

    // Phase 4: Draft outreach for HOT leads
    logger.info('Phase 4: Drafting outreach...');
    const outreachDrafter = new OutreachDrafter();
    const outreachResult = await outreachDrafter.run();
    metrics.outreach_drafted = outreachResult.draftedCount;
    errors.push(...outreachResult.errors);

    // Phase 5: Send daily briefing
    logger.info('Phase 5: Sending briefing...');
    const briefingSender = new BriefingSender();
    const briefingResult = await briefingSender.send(runId, metrics);
    errors.push(...briefingResult.errors);

    // Update run log with success
    await supabase
      .from('hunter_run_log')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        ...metrics,
        errors: errors.length > 0 ? errors : null,
      })
      .eq('id', runId);

    logger.info('Hunter run completed', { runId, metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;

    errors.push({
      module: 'main',
      message,
      timestamp: new Date().toISOString(),
      stack,
    });

    await supabase
      .from('hunter_run_log')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        ...metrics,
        errors,
      })
      .eq('id', runId);

    logger.error('Hunter run failed', { runId, error: message });
    throw error;
  }
}

// Start server
async function main(): Promise<void> {
  try {
    validateConfig();
    logger.info('Configuration validated');

    // Test database connection
    const { error } = await supabase.from('hunter_source').select('count').limit(1);
    if (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
    logger.info('Database connection successful');

    app.listen(config.app.port, () => {
      logger.info(`Hunter Agent listening on port ${config.app.port}`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start Hunter Agent', { error: message });
    process.exit(1);
  }
}

main();
