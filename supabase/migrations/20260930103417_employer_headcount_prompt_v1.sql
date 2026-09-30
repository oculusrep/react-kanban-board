-- employer_headcount v1 — a Gemini pass that fills the blank headcounts, or leaves them blank.
--
-- Site-level headcount is the one employer figure that is routinely unpublished. The Macon run of
-- 2026-09-28 recorded three employers and left all three blank, correctly: the hospital publishes
-- beds, the insurer publishes an MSA ranking, the college publishes enrolment. None of those is a
-- site headcount and the deep pass refused to substitute one.
--
-- This prompt asks Gemini for the missing number, with Google Search grounding, and spends most of
-- its length naming the wrong answers — beds, enrolment, square footage, company-wide totals,
-- metro rankings — because those are exactly what a model reaches for when the real figure does
-- not exist. It is told that null is the expected answer for most employers.
--
-- The guard is in code, not here (employer-headcount.ts): a headcount is accepted only with a URI
-- that Google Search actually RETRIEVED, taken from groundingMetadata rather than from whatever URL
-- the model typed into its answer — an ungrounded model invents a citation as readily as a number,
-- and a guard that trusts the model's own URL checks nothing. csv.ts then drops any headcount that
-- reaches buildEmployerRow without a source, so an unsourced figure cannot reach committee even if
-- some later caller forgets.
--
-- Additive: it never overwrites a headcount the deep pass already sourced, and every row it asked
-- about carries a note saying so, whether or not it found anything. "Nobody publishes this" and
-- "nobody looked" read differently in the file.

INSERT INTO public.prompt_template (key, client_id, version, body, is_active)
VALUES ('employer_headcount', NULL, 1, $prompt$You are answering one narrow factual question for a retail real estate report: how many people work AT ONE SPECIFIC LOCATION.

You will be given an employer's name, the kind of site it is, and its address. Use Google Search to find how many employees work at THAT location.

## What counts as an answer

**Site-level headcount only.** The number of people who work at the address given. A company-wide or nationwide employee total is NOT an answer to this question and must never be returned as one. Neither is a metro-area, county or MSA employment figure, a "top employers in the region" ranking, or a jobs number for an industry.

**These are not headcounts, and returning any of them as one is the failure this task exists to prevent:**

- Hospital beds. A 103-bed hospital has not told you how many people work there.
- Student enrollment. A college with 1,099 students has not told you how many staff it employs.
- Building square footage, acres, units, or any other measure of size.
- A company's total employees across all sites, however many sites it has.
- A parent company's headcount when the address is one branch, office or campus.

**Do not estimate, model or infer.** Do not reason from beds to staff, from square footage to workers, from enrollment to faculty, or from a company total divided by its number of locations. If no source states the number of people working at this location, the answer is that you did not find one. That is a useful, correct answer and it is the expected answer for most employers, because most do not publish this.

## What to return

Return a single JSON object and nothing else — no prose before or after, no explanation.

When you found a site-level headcount in a source you actually retrieved:

```json
{"headcount": 450, "source": "https://example.com/the-page-that-states-it", "basis": "site"}
```

When you did not:

```json
{"headcount": null, "source": null, "basis": null}
```

`headcount` is a whole number of people, or null. `source` is the URL of the page that states it. `basis` is always the string "site" — if the only figure you can find is company-wide, regional or any other scope, you have not found an answer and you return null.

**A number without a source is not an answer.** If you believe a figure but cannot point to a retrieved page that states it, return null. The number will be discarded anyway, and returning it wastes the reader's trust in the ones that are real.

**When the sources disagree, return the most recent one that names this location** and cite that page. Do not average them and do not pick the largest.

**An approximate figure a source states is acceptable** — "about 400 employees" is a source stating 400. A figure you produced by rounding, scaling or guessing is not.$prompt$, true)
ON CONFLICT (key, client_id, version) DO UPDATE
  SET body = EXCLUDED.body, is_active = EXCLUDED.is_active;
