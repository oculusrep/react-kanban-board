// Tour itinerary Status — the one config for what a stop's status reads as on the tour
// cards and the PDF agenda.
//
//   effective = tour_stop.status_override (if set)
//             → site-submit stops: the site submit's current stage, in client-friendly text
//             → store / custom stops: their kind default
//
// Stage names match submit_stage.name exactly. A stage not listed here (or no stage) falls
// back to SITE_SUBMIT_DEFAULT_STATUS.

import type { StopKind } from './tourRouting';

export const SITE_SUBMIT_DEFAULT_STATUS = 'New store opportunity';

export const STAGE_STATUS: Record<string, string> = {
  'Mike to Review': 'New store opportunity',
  'Ready to Submit': 'New store opportunity',
  'Pre-Submittal': 'New store opportunity',
  'Pursuing Ownership': 'New store opportunity',
  'Submitted-Reviewing': 'Under review',
  Tour: 'Under review',
  Monitor: 'Under review',
  Protected: 'Under review',
  LOI: 'At LOI',
  'At Lease/PSA': 'At lease/PSA',
  'Under Contract / Contingent': 'Under contract',
  'Executed Deal': 'Deal executed',
  Booked: 'Deal executed',
  'Closed - Under Construction': 'Under construction',
  'Store Open': 'Existing store',
  Pass: 'Passed',
  'Use Declined': 'Passed',
  'Lost / Killed': 'Not pursuing',
  'Not Available': 'Not available',
  'Use Conflict': 'Not available',
  'Unassigned Territory': 'Not available',
};

export const KIND_DEFAULT_STATUS: Record<StopKind, string> = {
  site_submit: SITE_SUBMIT_DEFAULT_STATUS,
  atlas_store: 'Existing store',
  licensed_store: 'Licensed store',
  custom: '',
};

/** Quick picks offered by the inline status editor (free text is also allowed). */
export const STATUS_SUGGESTIONS = ['New store opportunity', 'At LOI', 'Committee approved', 'At lease', 'Fly-by'];

/** Status without the override: stage mapping for site submits, kind default otherwise. */
export function autoStopStatus(kind: StopKind, stageName?: string | null): string {
  if (kind !== 'site_submit') return KIND_DEFAULT_STATUS[kind];
  const stage = stageName?.trim();
  return (stage && STAGE_STATUS[stage]) || SITE_SUBMIT_DEFAULT_STATUS;
}

/** Override always wins; blank/whitespace counts as no override. */
export function effectiveStopStatus(kind: StopKind, stageName: string | null | undefined, override: string | null | undefined): string {
  return override?.trim() || autoStopStatus(kind, stageName);
}
