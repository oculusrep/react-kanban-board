import { applyAdvances, buildTaxEvents, addDays } from './calendar.ts';
import { buildProjection, projectionHorizonDays, scenarioEvents, Projection, Scenario } from './projection.ts';
import { CashData } from './data.ts';
import { buildCashEvents, CashSummary } from './events.ts';

export interface ProjectionBundle {
  summary: CashSummary;
  committed: Projection;
  pipeline: Projection;
  locAvailable: number;
  cushion: number;
  topInflows: { label: string; date: string; amount: number; probability: number }[];
}

/** Both 12-month scenarios from one data load. Each scenario re-applies Arty advances and the tax reserve. */
export function computeProjections(data: CashData, today: string): ProjectionBundle {
  const horizon = projectionHorizonDays(today);
  const end = addDays(today, horizon - 1);
  const summary = buildCashEvents(data, today, horizon);
  const locAvailable = data.credit.filter((c) => c.active).reduce((t, c) => t + (Number(c.available) || 0), 0);
  const base = { startBalance: summary.startBalance, today, cushion: data.cushion, locAvailable };
  const finalize = (scenario: Scenario) => {
    const adv = applyAdvances(scenarioEvents(summary.rawEvents, summary.upside, scenario), summary.arty.advanceNow ?? 0);
    return [...adv.events, ...buildTaxEvents(adv.events, today, end, summary.taxReservePct)];
  };
  const committed = buildProjection({ ...base, scenario: 'committed', events: finalize('committed') });
  const pipeline = buildProjection({ ...base, scenario: 'pipeline', events: finalize('pipeline') });
  const topInflows = [...summary.rawEvents.filter((e) => e.kind === 'commission'), ...summary.upside]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((e) => ({ label: e.label, date: e.date, amount: e.amount, probability: e.probability ?? 0 }));
  return { summary, committed, pipeline, locAvailable, cushion: data.cushion, topInflows };
}


