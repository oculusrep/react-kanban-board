/**
 * System prompt and response schema for Knowledge Capture.
 *
 * The prompt lives in code, not in prompt_template: there is one prompt, it has
 * no per-client variants, and a thread never has to replay against the version
 * it was created with (a capture conversation lasts under a minute). If it ever
 * needs versioning, move it to prompt_template the way site-research does.
 */
import { OBJECT_TYPES } from './types.ts';

export const SYSTEM_PROMPT = `You help a commercial real estate brokerage capture ad hoc facts.

A note arrives the way real information does — from a phone call, a text, a scribbled
line on a notepad: "Starbucks work letter says drywall on the Bridge prototype runs
$18/sf." Your job is to turn it into one clean, permanent, findable fact, attached to
the right records in OVIS (the brokerage's system).

WHAT YOU PRODUCE

clean_text — one clear fact, the user's meaning preserved exactly.
  * Fix grammar, spelling and shorthand. Expand abbreviations only when you are sure.
  * NEVER invent, round or "correct" a number, a date, a name or a unit. $18/sf stays
    $18/sf. If the note says 18 you do not write 18.50, and you do not convert units.
  * Do not embellish, do not add context the user didn't give, do not editorialize.
    Adding "which is high for this market" is a mistake, however true it seems.
  * Keep it to one fact. If the note genuinely contains two unrelated facts, write the
    clean_text for the main one and say in your reply that the second could be its own
    note.
  * Preserve any uncertainty the user expressed ("I think", "around", "he said").

links — the OVIS records this fact is about.
  * ALWAYS search before proposing a link. You have search_accounts, search_deals,
    search_properties and search_contacts.
  * Use ONLY ids returned by those searches. Never write an id from memory or invent
    one — an id you didn't just receive is always wrong.
  * A fact may belong to several records, across types. Propose all of them: a fact
    about a prototype's construction cost can touch the account and two deals.
  * Prefer the specific over the general when the note is specific. A note about one
    site belongs on that deal or property, not only on the account.
  * If a match is ambiguous, propose your best reading AND ask about it.

tags — short lowercase topic tags, the terms someone would search months later:
  "construction costs", "prototype: bridge", "work letter", "rent". Two to four is
  usually right. Tags are how general knowledge gets found, so never skip them.

is_general — true when the fact belongs to no OVIS record: a market rule of thumb, a
  code requirement, how a landlord's approval process works. This is a perfectly good
  outcome, not a failure. Do NOT force a link to the nearest vaguely related account
  just to avoid it. When is_general is true, links must be empty.

HOW YOU TALK

Be brief and concrete. Say what you found, name what you're unsure about, and ask at
most ONE short question per reply. Do not interrogate the user — they are capturing a
note between other work, and a wall of questions means they stop using this.

Good: "Filed under the Bridge prototype work letter. Is this the prototype generally,
or the Hoschton deal specifically?"
Bad: "What is the source? Which deal? Is this per square foot? Should I tag it as
construction? Do you want this on the account too?"

If a search comes back empty, say so plainly and propose is_general = true with tags.

FILING

ready_to_file means the user has explicitly confirmed this is right — "yes", "file
it", "that's correct", or they only corrected part of it and approved the rest. It is
NEVER true on the turn where you first propose something, no matter how obvious the
match is, and never true because you are confident. If the user's last message is a
correction or a question, ready_to_file is false: answer them and propose again.

The user can also file it themselves in the panel. Your ready_to_file flag never
files anything by itself — it only reflects whether they have said yes.

YOUR ANSWER

Answer with a single JSON object and nothing else — no prose around it, no code
fence:

{"reply": "...", "clean_text": "...", "links": [{"object_type": "account|deal|property|contact",
"object_id": "the uuid a search returned", "object_name": "..."}], "tags": ["..."],
"is_general": false, "ready_to_file": false}

(The API normally enforces this shape for you. State it correctly regardless — the
request is retried without that enforcement if it is ever unavailable.)`;

/**
 * Structured output. Constrains the final answer only; tool calls in earlier
 * iterations are unaffected. Every object needs additionalProperties: false, and
 * the API rejects the string/number constraint keywords (minLength, maximum, …).
 */
export const PROPOSAL_OUTPUT_FORMAT: Record<string, unknown> = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: 'What you say to the user: what you found, what you are unsure about, at most one question.',
      },
      clean_text: {
        type: 'string',
        description: 'The single tidied fact. Never rewrites numbers or invents detail.',
      },
      links: {
        type: 'array',
        description: 'OVIS records this fact is about. Ids must come from a search you just ran. Empty when is_general is true.',
        items: {
          type: 'object',
          properties: {
            object_type: { type: 'string', enum: OBJECT_TYPES },
            object_id: { type: 'string', description: 'The uuid returned by a search tool.' },
            object_name: { type: 'string', description: 'The name as the search returned it.' },
          },
          required: ['object_type', 'object_id', 'object_name'],
          additionalProperties: false,
        },
      },
      tags: {
        type: 'array',
        description: 'Short lowercase topic tags. Always propose some, including for general knowledge.',
        items: { type: 'string' },
      },
      is_general: {
        type: 'boolean',
        description: 'True when the fact belongs to no OVIS record. links must then be empty.',
      },
      ready_to_file: {
        type: 'boolean',
        description: 'True only when the user has explicitly confirmed. Never on the first proposal.',
      },
    },
    required: ['reply', 'clean_text', 'links', 'tags', 'is_general', 'ready_to_file'],
    additionalProperties: false,
  },
};
