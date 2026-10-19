# Brief pass, record Q&A, and pitch outcomes

**Built and deployed 2026-09-26.** Migration `20260926101359_site_research_brief_and_outcomes`.

## Why the brief is a separate pass

The deep pass writes the record and is unchanged — Why Here stays dense, because density is right in a
record. The brief is a second pass that reads the finished record:

- a pass reading a finished record cannot cherry-pick what it researched, and
- brief wording can be re-tuned by re-running `brief_pass` alone against a stored record, with no repeat
  of ~$2.85 of research. A brief run costs about **$0.09 and 8 seconds**, with zero web searches.

## Shape

| Pass | Kind | Prompt | Tools | Writes |
|---|---|---|---|---|
| Deep pass | `deep_pass` | `deep_pass` v9 | full toolset, 30 searches | the record (a thread message) + 3 CSVs |
| Brief | `brief` | `brief_pass` v1 | none | `research_thread.brief_text` (+ `brief_generated_at`, `brief_prompt_template_id`, `brief_run_id`) |
| Record Q&A | `record_qa` | `record_qa` v1 | none | a thread message answering from the record, section cited |

`enqueue_brief_run` / `finalize_brief_run` write the brief onto the thread and **no** message, so a brief
can be rewritten in place any number of times. `enqueue_record_qa` mirrors `enqueue_thread_turn` but its
kind gets no tools in the worker. Both are refused when a run is already live on the thread.

Public actions: `start_brief { thread_id }`, `ask_record { thread_id, question }`. Both 409 with
`no_record` when the thread has no completed deep pass.

## The brief

Under 200 words, plain text, no citations. Archetype line; one line per story carrier with its strongest
number; a generators line; the biggest objection — **the unanswered one when the record answers another**;
a lean (pitch / pitch with caveats / don't pitch yet) with what would change it. Only what the record
supports, with the same values and the same scopes. Saying no is an expected output, not a failure.

## UI

Brief first, open. The record below it is collapsed and expands section by section (VERDICT, HEADLINE,
WHY HERE, OBJECTIONS, GENERATOR CALLOUTS, SLIDE GUIDANCE, BACKUP). An "Ask the record" box answers from
the stored record without researching. "Write brief" / "Rewrite brief" sit beside "Run deep pass".

## Pitch outcomes (nothing reads these yet)

On `site_submit`: `pitched` (bool, default false), `pitched_date`, `starbucks_response`
(approved / passed / deferred / not yet pitched, default the last), `pushback` (what they actually
objected to), `broker_note` (was the brief right). They exist so the data accumulates from today; in a few
months they answer which verdicts and which story types actually landed.

## First brief (Macon, from the v8 record, 2026-09-26)

191 words, correctly led with the unanswered objection (Dutch Bros at 0.6 mi / approved 7 Brew at 0.4 mi)
rather than the answered 3.1 mi Starbucks question, and called generators **yes** with the two schools.
