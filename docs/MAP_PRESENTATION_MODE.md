# Map presentation mode

A distraction-free view of the map used for screenshots (slide decks, client
handouts, presentations). Hides every piece of chrome — top nav, search bars,
toolbars, slideouts, Google's own zoom / street-view / map-type controls, GPS
+ ruler buttons, the demographics box — so the map itself fills the viewport.

## How to use

- **Enter:** `Shift + P` while on `/mapping`
- **Exit:** `Esc`

There is no visible toggle button by design — screenshot real-estate is
precious. The keyboard shortcut is guarded against firing while typing in a
search field or text area, so it doesn't hijack keyboard input.

## What stays visible

- The map tiles + labels
- All pins from every enabled layer (properties, site submits, restaurants,
  Starbucks, merchants, municipal projects, etc.)
- Custom-drawn shapes and polygons
- Demographic ring / drive-time / polygon overlays if you opened them before
  entering the mode
- Google's attribution corner (required by TOS)

## What gets hidden

Everything else. Specifically:

- The app's top navbar (rendered by [ProtectedRoute.tsx](../src/components/ProtectedRoute.tsx))
- The top control bar (address search, client selector, layer toggles, admin menu)
- The property-search filter bar + optional table view
- The batch-processing side panel
- The in-map button strip (draw / search / merchants / layers)
- Create-mode banner
- Merchants drawer
- Site-submit legend
- Drawing toolbar + selected-shape action bar
- All slideouts and modals (pin details, site submit, restaurant, Starbucks,
  municipal project, boundary builder, closed business search, share layer,
  shape editor, confirmation dialogs)
- Google Maps' native zoom, street-view, and fullscreen controls
- The custom Map / Satellite / labels-toggle control
- GPS tracking + ruler buttons
- The demographics analysis box

Slideout / modal state is preserved by hiding via `display: none` on a
wrapper div rather than unmounting, so form edits, scroll positions, and
expanded sections survive the toggle.

## How it works

State lives in [MappingPageNew.tsx](../src/pages/MappingPageNew.tsx) as a
single `presentationMode` boolean. Entering it:

1. Swaps the root container from `h-screen w-screen` to
   `fixed inset-0 z-[10000]` so the map overlays the app navbar.
2. Adds a `map-presentation-mode` class to the root, which triggers a scoped
   `<style>` block that hides Google's own controls and any custom control
   tagged with the `gmnoprint` class or one of the app's data attributes:
   - `[data-gps-react-controls]` — GPS + ruler group in
     [GPSTrackingButton.tsx](../src/components/mapping/GPSTrackingButton.tsx)
   - `[data-demographics-slideout]` — the demographics box in
     [DemographicsAnalysisSlideout.tsx](../src/components/mapping/slideouts/DemographicsAnalysisSlideout.tsx)
3. Conditionally renders (or short-circuits with a `hidden` class) each
   overlay/toolbar/panel scattered across the map JSX.

## Adding a new UI element that should hide in presentation mode

Two supported patterns:

1. **DOM element with a stable class or attribute** (preferred for map-mounted
   controls that live outside React, like anything pushed via
   `map.controls[...]`): give it Google's `gmnoprint` class, or add a
   `data-*` attribute and extend the selector list in the presentation-mode
   `<style>` block in `MappingPageNew.tsx`.
2. **React component**: wrap its render (or gate its `isOpen` / `isActive`
   prop) with `!presentationMode`. If it carries meaningful internal state
   the user shouldn't lose, put it inside the outside-map slideouts wrapper
   which uses `style={{ display: 'none' }}` instead of unmounting.

## Not implemented (and why)

- **In-map annotation (text boxes, callouts, arrows drawn on top of the
  map, cleared on exit).** Discussed and deferred. External annotation tools
  (Preview markup, Skitch, Figma) give better UX for static screenshots; the
  only real gain of in-app annotation is that annotations stay locked to
  lat/lng across pan/zoom, which matters for live/interactive presentations,
  not screenshots.
- **Export-to-image button.** Google Maps doesn't expose a canvas snapshot;
  it'd need `html2canvas` or similar. Presentation mode + native OS
  screenshot is enough for now.

## History

- `398ad162` — initial implementation (Shift+P + Esc + exit pill)
- `17dda771` — hide the custom Map / Satellite / labels-toggle control
- `1fc0b534` — hide GPS + ruler controls
- `17159087` — hide the demographics analysis box
- `4fc5d145` — drop the exit pill (Esc is enough)
