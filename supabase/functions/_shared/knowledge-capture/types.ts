/**
 * The vocabulary shared by every Knowledge Capture module. Deliberately imports
 * nothing: tools.ts (supabase-js) and config.ts (the Anthropic SDK) both pull in
 * npm type trees, and anything that imports them can't be type-checked by a bare
 * `deno test`. Pure modules import from here instead.
 */

/** 'account' is the public.client table — OVIS has no `account` table. */
export type ObjectType = 'account' | 'deal' | 'property' | 'contact';

export const OBJECT_TYPES: ObjectType[] = ['account', 'deal', 'property', 'contact'];

export function isObjectType(v: unknown): v is ObjectType {
  return typeof v === 'string' && (OBJECT_TYPES as string[]).includes(v);
}

/** A link as proposed (by the model, or by the browser sending one back). */
export interface ProposedLink {
  object_type: string;
  object_id: string;
  object_name?: string;
}

/**
 * A proposed link that has passed shape validation — the type is known-good, but
 * the id has not been looked up yet.
 */
export interface CleanLink {
  object_type: ObjectType;
  object_id: string;
  object_name?: string;
}

/**
 * A name the model picked out of the note that it could NOT find in OVIS. Carried
 * so the panel can offer to create the record instead of silently dropping the
 * reference — a note naming a contact who isn't in OVIS yet is the normal way a
 * new contact first appears.
 */
export interface UnresolvedName {
  /** The type the model expected this name to be. */
  object_type: ObjectType;
  name: string;
  /**
   * Details for this record that appear LITERALLY in the user's note — typically
   * because they pasted a signature block. Every field here has been checked
   * against the note text by verifyDetails(); anything the model produced that
   * isn't in the note is dropped before this is built. A missing field is
   * correct; a plausible invented one would be a durable error on a real record.
   */
  details?: UnresolvedDetails;
}

/** Contact fields (from a signature) and property fields (from an address). */
export interface UnresolvedDetails {
  email?: string;
  /** Desk/main number: the note gave a number with no mobile label. */
  phone?: string;
  /** The note labelled it mobile / cell / M: / C:. */
  mobile_phone?: string;
  title?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/** A link confirmed to exist, carrying the name the database holds right now. */
export interface VerifiedLink {
  object_type: ObjectType;
  object_id: string;
  object_name: string;
}
