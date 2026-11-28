# Generators slide

**Button:** "Download Generators Slide" in the Site Story section of the site submit sidebar. It appears
when the site has at least one completed deep pass and the user has `can_run_site_story`. That is the
edge function's gate for every action; this action reads stored data and spends nothing.

**What it builds:** one .pptx from the site's **latest completed deep pass** (on any thread), on
Mike's **Starbucks slide template** (`supabase/functions/_shared/site-research/templates/starbucks-slide-template.pptx`):
4:3, the template's master, theme and "1_Title Slide" layout as they are.

| Part | Content |
|---|---|
| Green bar | The template's bar (`#00704A`) and siren, from the layout |
| Title | "Generators", in the layout's own title placeholder (white Calibri 21pt) |
| Totals | In the bar, white: total students (K-12), college students (IPEDS) on their own line and **not added**, total employees. Each line says how many rows have no number ("· 3 not on file"). Summed from the rows, never entered by hand |
| City / street | The template's right-aligned box beside the siren: "City, ST" over the property address. The template shows cross streets; OVIS has no cross-street field, so this is the address, editable on the slide |
| Map | A real **picture placeholder**, "Paste Sites USA map", filling the slide below the bar. It sits first in the shape tree, so a pasted map goes behind the callouts |
| Callouts | One per row of schools.csv, employers.csv and generators.csv. No cap |

Two changes to the template's layout, in the output only: the hard-coded city box moves from the
layout onto the slide (same position and format), and the map placeholder is added. The template's
thumbnail (the Covington mock-up) is dropped; PowerPoint makes a new one on save.

**Replacing the template:** overwrite the .pptx in `templates/`, then regenerate the inline copy (edge
functions can't read sibling files reliably):
`base64 -i templates/starbucks-slide-template.pptx | fold -w 120`, pasted into
`starbucks-slide-template.ts`. A test fails if the two differ. The builder expects layout 12 to keep
its "Rectangle 8" city box and title placeholder idx 13, and throws if they are gone.

Callouts: `wedgeRoundRectCallout`, 1pt black outline, Aptos 8pt black, centred, two lines.

- Schools: white. `Name` / `(1,250 Students)`
- Employers: `#E3A47B`. `Name` / `(1,400 Employees)`
- Generators: white. `Name` / `(120 Beds)`, using the units Seats / Beds / Rooms / SF / Headcount
- No number on the row: `(Students not on file)`, `(Employees not on file)`, `(Size not on file)`.
  Every row still gets a callout. A missing number is never shown as 0.
- No pin number in the text.

## Pins

`pin` is the first column of schools.csv, employers.csv and generators.csv. Each file runs 1..N by
distance, nearest first, so pin numbers repeat across the three files. Rows with no distance come
last, ordered by name. generators.csv keeps its CHECK-first row order, so its pin column is not
in row order. Label the Sites USA pins with this column.

## Same rows as the files

The slide does **not** read the CSVs back from Dropbox. It rebuilds the rows from the run's stored
inputs (`phase_state.schools`, plus the committed `record_school_fill` / `record_employer` /
`record_generator` outputs). It uses the same `buildSchoolsCsv` / `buildEmployersCsv` /
`buildGeneratorsCsv` that wrote the files, so pins, rows and totals match. The one exception is a deep
pass that ran before the `pin` column shipped (2026-11-16). Its Dropbox files have no `pin` column.
The slide still numbers its rows by the same rule (distance), so a Sites USA layer imported from
those files has to be labelled by distance order.

## Hospital in both files

A `hospital_medical` generator that matches an employer row gets **one** callout, the Employers one.
They match on the same street (normalised: Road→Rd, Highway→Hwy, …) or on the name (one contains
the other, at least 8 characters). Other generator categories are never merged.

## Placement

Callouts are staged in rings inside the map edges, sorted by pin (schools, then employers, then
generators), going clockwise:

1. Top row, left to right, pointers down
2. Right column, top to bottom, pointers left
3. Bottom row, right to left, pointers up
4. Left column, bottom to top, pointers right

Then the next ring inward. Rows and columns never share space, and the gaps leave room for the
pointer tails. Anything that doesn't fit inside the map goes on the **pasteboard to the right of the
slide** (still in pin order, still not overlapping), and the response reports the count.

Sizing: the worker has no font engine, so text is measured with Helvetica AFM widths plus 10%, and
each box is sized to its longer line. The font is never shrunk. The text box is set to "resize shape
to fit text", so editing a callout in PowerPoint resizes it.

## Code

- `supabase/functions/_shared/site-research/generators-slide.ts`: rows, callouts, totals, layout,
  and the slide XML, written straight into the template with JSZip (no pptxgenjs).
- `supabase/functions/_shared/site-research/templates/starbucks-slide-template.pptx` + its inline
  copy `starbucks-slide-template.ts`.
- `supabase/functions/ovis-site-research/index.ts`: action `generators_slide { site_submit_id }` → the
  .pptx (`Content-Disposition` filename `Generators - <site>.pptx`).
- `src/components/shared/SiteStoryPanel.tsx`: the button.
- Tests: `generators_slide_test.ts`, plus the pin assertions in `csv_dropbox_test.ts` / `deep_pass_test.ts`.

No deep-pass prompt was changed.
