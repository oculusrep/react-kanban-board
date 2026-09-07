import { supabase } from './supabaseClient';

/**
 * Correction logging — single entry point for every UI path that corrects an
 * AI email classification.
 *
 * WHY THIS EXISTS
 * ---------------
 * There are two correction tables and only one of them is read:
 *
 *   agent_corrections  -- READ by getRelevantCorrections() in the triage agent
 *                         and injected into the Gemini system prompt. This is
 *                         the learning loop.
 *   ai_correction_log  -- read by nothing except EmailClassificationReviewPage,
 *                         which uses it as an "already reviewed" dedupe filter.
 *
 * Before this helper, six UI/edge paths wrote only ai_correction_log. The
 * result: agent_corrections took its last row on 2026-01-30 while corrections
 * kept happening through 2026-08-12, so the agent learned nothing for seven
 * months. Every link correction must now reach BOTH tables — agent_corrections
 * so the agent sees it, ai_correction_log so the review UI keeps working.
 *
 * SENTINEL CONVENTION (agent_corrections)
 * ---------------------------------------
 * correct_object_type / correct_object_id are NOT NULL, so removals and
 * additions are encoded with sentinels rather than nulls. These exact values
 * are what formatCorrectionsForPrompt() and getRelevantCorrections() branch on
 * (gemini-agent.ts) — do not change them without changing the reader.
 *
 *   remove : incorrect_* = the wrong link, correct_object_type = 'none',
 *            correct_object_id = NULL_UUID
 *   add    : incorrect_object_type = 'none', incorrect_object_id = NULL_UUID,
 *            correct_* = the right object
 *   correct: both sides populated with real values
 */

const NULL_UUID = '00000000-0000-0000-0000-000000000000';

export type CorrectionObjectType = 'deal' | 'contact' | 'client' | 'property';

export interface LogCorrectionArgs {
  emailId: string;
  /** Corrector's public.user id. ai_correction_log.user_id is NOT NULL, so
   *  without it only the agent_corrections half can be written. */
  userId?: string | null;
  emailSnippet?: string | null;
  senderEmail?: string | null;
  emailSubject?: string | null;
  /** Free text. Stored as agent_corrections.feedback_text and
   *  ai_correction_log.reasoning_hint. */
  reasoning?: string | null;
}

export interface AddTagArgs extends LogCorrectionArgs {
  objectType: CorrectionObjectType;
  objectId: string;
  objectName?: string | null;
}

export interface RemoveTagArgs extends AddTagArgs {
  /** email_object_link.id of the link being removed, when known. */
  linkId?: string | null;
}

export interface RetargetArgs extends LogCorrectionArgs {
  incorrectObjectType: CorrectionObjectType;
  incorrectObjectId: string;
  incorrectObjectName?: string | null;
  incorrectLinkId?: string | null;
  correctObjectType: CorrectionObjectType;
  correctObjectId: string;
  correctObjectName?: string | null;
}

/** Never throw. A correction that fails to log must not fail the user's edit. */
async function write(
  agentRow: Record<string, unknown>,
  logRow: Record<string, unknown> | null
): Promise<void> {
  const { error: agentError } = await supabase.from('agent_corrections').insert(agentRow);
  if (agentError) {
    console.error('[Correction] agent_corrections insert failed:', agentError.message, agentError.details);
  }

  // ai_correction_log.user_id is NOT NULL — skip rather than fail the insert.
  if (logRow && logRow.user_id) {
    const { error: logError } = await supabase.from('ai_correction_log').insert(logRow);
    if (logError) {
      console.error('[Correction] ai_correction_log insert failed:', logError.message, logError.details);
    }
  } else if (logRow) {
    console.warn('[Correction] no user id — skipped ai_correction_log, agent_corrections still written');
  }
}

/** The AI missed a link and the user added it. */
export async function logAddedTag(a: AddTagArgs): Promise<void> {
  const label = a.objectName ? `${a.objectType} "${a.objectName}"` : a.objectType;
  const text = a.reasoning || `AI missed linking to ${label} - user manually added this link`;

  await write(
    {
      email_id: a.emailId,
      incorrect_link_id: null,
      incorrect_object_type: 'none',
      incorrect_object_id: NULL_UUID,
      correct_object_type: a.objectType,
      correct_object_id: a.objectId,
      feedback_text: text,
      sender_email: a.senderEmail ?? null,
      email_subject: a.emailSubject ?? null,
      created_by_user_id: a.userId ?? null,
    },
    {
      user_id: a.userId ?? null,
      email_id: a.emailId,
      correction_type: 'added_tag',
      object_type: a.objectType,
      correct_object_id: a.objectId,
      email_snippet: a.emailSnippet ?? null,
      sender_email: a.senderEmail ?? null,
      reasoning_hint: text,
    }
  );
}

/** The AI made a link it should not have, and the user removed it. */
export async function logRemovedTag(a: RemoveTagArgs): Promise<void> {
  const label = a.objectName ? `${a.objectType} "${a.objectName}"` : a.objectType;
  const text = a.reasoning || `AI incorrectly linked to ${label} - user removed this link`;

  await write(
    {
      email_id: a.emailId,
      incorrect_link_id: a.linkId ?? null,
      incorrect_object_type: a.objectType,
      incorrect_object_id: a.objectId,
      correct_object_type: 'none',
      correct_object_id: NULL_UUID,
      feedback_text: text,
      sender_email: a.senderEmail ?? null,
      email_subject: a.emailSubject ?? null,
      created_by_user_id: a.userId ?? null,
    },
    {
      user_id: a.userId ?? null,
      email_id: a.emailId,
      correction_type: 'removed_tag',
      object_type: a.objectType,
      incorrect_object_id: a.objectId,
      email_snippet: a.emailSnippet ?? null,
      sender_email: a.senderEmail ?? null,
      reasoning_hint: text,
    }
  );
}

/** The AI linked to the wrong object and the user pointed it at the right one. */
export async function logRetargetedTag(a: RetargetArgs): Promise<void> {
  const from = a.incorrectObjectName ? `${a.incorrectObjectType} "${a.incorrectObjectName}"` : a.incorrectObjectType;
  const to = a.correctObjectName ? `${a.correctObjectType} "${a.correctObjectName}"` : a.correctObjectType;
  const text = a.reasoning || `Corrected from ${from} to ${to}`;

  await write(
    {
      email_id: a.emailId,
      incorrect_link_id: a.incorrectLinkId ?? null,
      incorrect_object_type: a.incorrectObjectType,
      incorrect_object_id: a.incorrectObjectId,
      correct_object_type: a.correctObjectType,
      correct_object_id: a.correctObjectId,
      feedback_text: text,
      sender_email: a.senderEmail ?? null,
      email_subject: a.emailSubject ?? null,
      created_by_user_id: a.userId ?? null,
    },
    {
      user_id: a.userId ?? null,
      email_id: a.emailId,
      correction_type: 'removed_tag',
      object_type: a.incorrectObjectType,
      incorrect_object_id: a.incorrectObjectId,
      correct_object_id: a.correctObjectId,
      email_snippet: a.emailSnippet ?? null,
      sender_email: a.senderEmail ?? null,
      reasoning_hint: text,
    }
  );
}
