// Broker of Record (BOR) deal constants.
// See docs/BOR_DEAL_FEATURE_SPEC.md for the full feature spec.

/**
 * transaction_type.id for "BOR Referral Fee".
 * Seeded with a fixed id in migration 20260820014509_bor_deal_support.sql so
 * the frontend can reference it without a lookup.
 */
export const BOR_TRANSACTION_TYPE_ID = '71c1b4eb-d468-44b6-a52a-f5f9b1bbf7da';

export const BOR_TRANSACTION_TYPE_LABEL = 'BOR Referral Fee';

/**
 * deal_team.id for "Mike" — BOR deals default their Deal Team to this.
 * (Row already exists in prod; label "Mike", not "Mike & Arty" / "Mike & Greg".)
 */
export const MIKE_DEAL_TEAM_ID = '6574f79d-0127-4c6f-b832-cd2e666cd8b9';

/** True when a deal record is a Broker of Record deal. */
export const isBorDeal = (deal: { transaction_type_id?: string | null } | null | undefined): boolean =>
  deal?.transaction_type_id === BOR_TRANSACTION_TYPE_ID;
