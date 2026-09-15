/**
 * Archetype block parsing and conversation replay, shared by the public
 * ovis-site-research function (enqueue) and ovis-site-research-worker (finalize).
 */

export const ARCHETYPES = ['GROWTH', 'MATURE', 'REDEVELOPMENT', 'RELIEF', 'WHITE_SPACE'] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** The user turn that opens every archetype run. Replayed before seq 0 on follow-ups. */
export const OPENING_USER_MESSAGE =
  'Make the archetype call for this site and write the executive summary, following your instructions.';

export interface ParsedArchetype {
  archetype_primary: Archetype;
  archetype_secondary: Archetype | null;
  story_carriers: string[];
  /** The prose with the trailing JSON fence removed, for display. */
  prose: string;
}

function isArchetype(v: unknown): v is Archetype {
  return typeof v === 'string' && (ARCHETYPES as readonly string[]).includes(v);
}

// The model returns prose plus a fenced JSON block. A bad parse must NEVER lose the
// text: on any failure this returns null, the caller stores the message verbatim, and
// the columns stay NULL ("not called") rather than wrong.
export function parseArchetypeBlock(text: string): ParsedArchetype | null {
  // Last fenced json block wins — if the model narrated an example earlier in the
  // message, the real answer is the one it ended on.
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (fences.length === 0) return null;
  const last = fences[fences.length - 1];

  let parsed: unknown;
  try {
    parsed = JSON.parse(last[1]);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  // Primary is the one field that must be valid — without it there is no call to
  // record, and a thread with a wrong archetype is worse than one with none.
  if (!isArchetype(obj.archetype_primary)) return null;

  const carriers = Array.isArray(obj.story_carriers)
    ? obj.story_carriers
        .filter((c): c is string => typeof c === 'string')
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && c.length <= 200)
        .slice(0, 10)
    : [];

  return {
    archetype_primary: obj.archetype_primary,
    archetype_secondary: isArchetype(obj.archetype_secondary) ? obj.archetype_secondary : null,
    story_carriers: carriers,
    prose: (text.slice(0, last.index ?? 0) + text.slice((last.index ?? 0) + last[0].length)).trim(),
  };
}

/**
 * Rebuild the API conversation from stored messages. The API is stateless, so the
 * seq-0 archetype message must be replayed too, and messages[] must start with a user
 * turn — a history that opens with the assistant's seq 0 gets the opening turn back.
 */
export function replayMessages(
  messages: Array<{ seq: number; role: 'user' | 'assistant'; content: string }>,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const sorted = [...messages].sort((a, b) => a.seq - b.seq);
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (sorted.length === 0 || sorted[0].role === 'assistant') out.push({ role: 'user', content: OPENING_USER_MESSAGE });
  for (const m of sorted) out.push({ role: m.role, content: m.content });
  return out;
}
