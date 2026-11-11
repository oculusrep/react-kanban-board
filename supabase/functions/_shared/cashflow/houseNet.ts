/**
 * House-net math for a commission payment — the one copy.
 *
 *   GCI      = payment_amount − referral fee
 *   houseNet = GCI − agci          (agci = total internal broker splits, set by DB trigger)
 *
 * Modes:
 *  - 'profit' (default): subtracts every referral fee. The Cash Flow Forecast and Broker Splits
 *    pages use this; their numbers must not move.
 *  - 'cash': subtracts only referral fees not yet paid (referral_fee_paid = false). A paid fee
 *    has already left the bank (QBO check), so subtracting it again would double-count.
 *
 * Outside co-broker splits are entered as referral fees and flow through the same path.
 * See docs/CASH_FLOW_DASHBOARD_AUDIT.md.
 */
export type HouseNetMode = 'profit' | 'cash';

export interface HouseNetInput {
  payment_amount: number | null;
  referral_fee_usd: number | null;
  referral_fee_paid?: boolean | null;
  agci: number | null;
}

export interface HouseNetResult {
  paymentAmount: number;
  /** Referral fee subtracted under this mode (0 in cash mode once paid). */
  referralFee: number;
  gci: number;
  agci: number;
  houseNet: number;
}

export function computeHouseNet(p: HouseNetInput, mode: HouseNetMode = 'profit'): HouseNetResult {
  const paymentAmount = p.payment_amount || 0;
  const fullReferral = p.referral_fee_usd || 0;
  const referralFee = mode === 'cash' && p.referral_fee_paid ? 0 : fullReferral;
  const gci = paymentAmount - referralFee;
  const agci = p.agci || 0;
  return { paymentAmount, referralFee, gci, agci, houseNet: gci - agci };
}
