// Route renderers + stop focus for the tour map, isolated from React and from the global
// `google` object so the drag/focus interaction can be tested with fakes.
//
// Two facts about google.maps.DirectionsRenderer drive this design (verified in a real
// browser, 2026-10-28):
//   1. `directions_changed` fires SYNCHRONOUSLY inside setDirections().
//   2. getDirections() returns a DIFFERENT object than the one passed to setDirections().
// So "is this event from my own setDirections?" can't be answered by object identity — it
// has to be a re-entrancy flag held around every programmatic setDirections. Getting this
// wrong after a drag made every focus restyle look like a new drag → infinite recursion →
// stack overflow → blank page.

import type { ApproachPoint, RoutePoint } from './tourRouting';

// Minimal shapes of the Google objects this module touches.
export interface LatLngLike {
  lat(): number;
  lng(): number;
}
export interface LegLike {
  via_waypoints?: LatLngLike[];
  steps: { path?: LatLngLike[] }[];
}
export interface ResultLike {
  routes: { legs: LegLike[] }[];
}
export interface RendererLike<R extends ResultLike = ResultLike> {
  getDirections(): R | null;
  setDirections(result: R): void;
  setOptions(opts: object): void;
}
export interface LineLike {
  setMap(map: unknown): void;
}

export interface FocusEntry<R extends ResultLike = ResultLike> {
  renderer: RendererLike<R>;
  points: RoutePoint[]; // the chunk's points as last saved (baseline for drag detection)
  color: string;
}

export interface DragEvent<R extends ResultLike = ResultLike> {
  entry: FocusEntry<R>;
  legIndex: number; // within the chunk
  target: RoutePoint; // stopover the changed leg ends at
  vias: ApproachPoint[]; // the leg's pass-through points after the drag
  result: R;
}

export interface FocusDeps<R extends ResultLike = ResultLike> {
  /** Polyline factory (google.maps.Polyline in the app). Lines must be non-clickable. */
  makeLine(opts: { path: LatLngLike[]; color: string; arrowsColor: string }): LineLike;
  /** Renderer polyline options for a day color at an opacity. */
  rendererStyle(color: string, opacity: number): object;
  /** Called (deferred, never inside Google's event) when the user drags a leg. */
  onDrag(e: DragEvent<R>): void;
  /** Defers onDrag out of the Google event; setTimeout(0) in the app, sync-able in tests. */
  defer?(fn: () => void): void;
}

export const ROUTE_OPACITY = 0.85;
export const FADED_OPACITY = 0.25;
export const INBOUND_COLOR = '#2E7D32';
export const OUTBOUND_COLOR = '#E07B00';

const same5 = (a: ApproachPoint[], b: ApproachPoint[]) =>
  a.length === b.length && a.every((p, i) => p.lat.toFixed(5) === b[i].lat.toFixed(5) && p.lng.toFixed(5) === b[i].lng.toFixed(5));

// First leg whose pass-through points differ from the chunk's saved points.
export function findChangedLeg(
  points: RoutePoint[],
  result: ResultLike
): { legIndex: number; target: RoutePoint; vias: ApproachPoint[] } | null {
  const legs = result.routes[0]?.legs ?? [];
  const stopoverIdx = points.map((p, i) => (p.via ? -1 : i)).filter((i) => i >= 0);
  for (let i = 0; i < legs.length && i < stopoverIdx.length - 1; i++) {
    const expected = points.slice(stopoverIdx[i] + 1, stopoverIdx[i + 1]).map(({ lat, lng }) => ({ lat, lng }));
    const actual = (legs[i].via_waypoints ?? []).map((p) => ({ lat: p.lat(), lng: p.lng() }));
    if (!same5(expected, actual)) return { legIndex: i, target: points[stopoverIdx[i + 1]], vias: actual };
  }
  return null;
}

export class RouteFocusController<R extends ResultLike = ResultLike> {
  private entries: FocusEntry<R>[] = [];
  private lines: LineLike[] = [];
  private programmatic = 0; // > 0 while WE are calling setDirections
  private focusId: string | null = null;

  constructor(private deps: FocusDeps<R>) {}

  get focusedStopId() {
    return this.focusId;
  }

  /** Register a chunk renderer and render its result (programmatically). */
  add(renderer: RendererLike<R>, points: RoutePoint[], color: string, result: R): FocusEntry<R> {
    const entry: FocusEntry<R> = { renderer, points, color };
    this.entries.push(entry);
    this.render(entry, result, this.focusId ? FADED_OPACITY : ROUTE_OPACITY);
    return entry;
  }

  /** Drop all renderers/lines (the page tears the renderers down itself). */
  reset() {
    this.clearLines();
    this.entries = [];
  }

  /** Wire to each renderer's `directions_changed`. Ignores our own setDirections calls. */
  handleDirectionsChanged(entry: FocusEntry<R>) {
    if (this.programmatic > 0) return;
    const result = entry.renderer.getDirections();
    if (!result) return;
    const changed = findChangedLeg(entry.points, result);
    if (!changed) return;
    // Keep the focused stop's in/out legs drawn on the dragged path right away.
    if (this.focusId) this.drawFocusLines();
    const ev: DragEvent<R> = { entry, legIndex: changed.legIndex, target: changed.target, vias: changed.vias, result };
    (this.deps.defer ?? ((fn) => setTimeout(fn, 0)))(() => this.deps.onDrag(ev));
  }

  /** Focus a stop (null clears). Restyles renderers without re-triggering drag handling. */
  setFocus(stopId: string | null) {
    this.focusId = stopId;
    const opacity = stopId ? FADED_OPACITY : ROUTE_OPACITY;
    for (const entry of this.entries) {
      const current = entry.renderer.getDirections();
      if (current) this.render(entry, current, opacity);
    }
    this.drawFocusLines();
  }

  private render(entry: FocusEntry<R>, result: R, opacity: number) {
    this.programmatic++;
    try {
      entry.renderer.setOptions({ polylineOptions: this.deps.rendererStyle(entry.color, opacity) });
      entry.renderer.setDirections(result);
    } finally {
      this.programmatic--;
    }
  }

  private clearLines() {
    this.lines.forEach((l) => l.setMap(null));
    this.lines = [];
  }

  // Inbound (prev stopover → focused stop, incl. its approach) and outbound (focused stop →
  // next stopover) legs, from each renderer's CURRENT directions so an unsaved drag shows.
  private drawFocusLines() {
    this.clearLines();
    const id = this.focusId;
    if (!id) return;
    for (const entry of this.entries) {
      const result = entry.renderer.getDirections();
      if (!result) continue;
      const stopovers = entry.points.filter((p) => !p.via);
      result.routes[0]?.legs.forEach((leg, i) => {
        const dir = stopovers[i + 1]?.id === id ? 'in' : stopovers[i]?.id === id ? 'out' : null;
        if (!dir) return;
        const path = leg.steps.flatMap((st) => st.path ?? []);
        this.lines.push(
          this.deps.makeLine({ path, color: dir === 'in' ? INBOUND_COLOR : OUTBOUND_COLOR, arrowsColor: '#FFFFFF' })
        );
      });
    }
  }

  /** Test/debug aid. */
  get focusLineCount() {
    return this.lines.length;
  }
}
