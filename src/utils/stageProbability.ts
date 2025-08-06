// src/utils/stageProbability.ts
export const STAGE_PROBABILITY: Record<string, number> = {
  "Negotiating LOI": 50,
  "At Lease/PSA": 75,
  "Under Contract / Contingent": 85,
  "Booked": 90,
  "Executed Payable": 95,
  "Closed Paid": 100,
  "Lost": 0
};

export function getDefaultProbability(stageLabel?: string): number | undefined {
  if (!stageLabel) return undefined;
  return STAGE_PROBABILITY[stageLabel];
}
