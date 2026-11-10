import { buildProjection, projectionHorizonDays, scenarioEvents, Projection } from '../../lib/cashProjection';
import { CashData } from './useCashData';
import { buildCashEvents, CashSummary } from './cashEvents';

export interface ProjectionBundle {
  summary: CashSummary;
  committed: Projection;
  pipeline: Projection;
  locAvailable: number;
  cushion: number;
  topInflows: { label: string; date: string; amount: number; probability: number }[];
}

/** Both 12-month scenarios from one data load. */
export function computeProjections(data: CashData, today: string): ProjectionBundle {
  const summary = buildCashEvents(data, today, projectionHorizonDays(today));
  const locAvailable = data.credit.filter((c) => c.active).reduce((t, c) => t + (Number(c.available) || 0), 0);
  const base = { startBalance: summary.startBalance, today, cushion: data.cushion, locAvailable };
  const committed = buildProjection({ ...base, scenario: 'committed', events: scenarioEvents(summary.events, summary.upside, 'committed') });
  const pipeline = buildProjection({ ...base, scenario: 'pipeline', events: scenarioEvents(summary.events, summary.upside, 'pipeline') });
  const topInflows = [...summary.events.filter((e) => e.kind === 'commission'), ...summary.upside]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((e) => ({ label: e.label, date: e.date, amount: e.amount, probability: e.probability ?? 0 }));
  return { summary, committed, pipeline, locAvailable, cushion: data.cushion, topInflows };
}
