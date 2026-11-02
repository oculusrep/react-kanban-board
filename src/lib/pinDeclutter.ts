// Pin declutter for the tour PDF maps (page coordinates, pt). Pure — no jsPDF, no Google.
// The live map is untouched: Google handles its own markers there.
//
//   1. Merge: same-key pins (same day color, text labels) whose anchors are within
//      `mergeDist` (~2 mm) become ONE pin labeled "3·4".
//   2. Displace: remaining markers whose anchors are closer than `overlapFactor` × their
//      combined radii form clusters; each cluster is fanned out on a ring around its center.
//      The ring's rotation is chosen to keep badges inside the frame and off the route.
//      Displaced markers are drawn as badges with a leader line to a dot at the true spot.
//   3. Logos (Atlas stores, lowest priority): kept, nudged a little, or hidden — never on top
//      of a stop marker or another logo.

export interface Pt {
  x: number;
  y: number;
}

export interface DeclutterItem {
  id: string;
  anchor: Pt; // where the marker's head sits when not displaced
  r: number; // collision radius
  label?: string; // merged with '·' when items merge
  mergeKey?: string | null; // items merge only with the same key (null = never merges)
}

export interface PlacedMarker {
  ids: string[];
  label?: string;
  r: number;
  anchor: Pt; // true position (mean of merged anchors)
  at: Pt; // where to draw
  displaced: boolean;
  merged: boolean;
}

export interface Frame {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface DeclutterOptions {
  frame: Frame;
  mergeDist?: number; // pt; 2 mm ≈ 5.67 pt
  overlapFactor?: number; // overlap when anchor distance < factor × (ri + rj)
  obstacles?: Pt[]; // route points to keep badges off
  /** Radius for a merged label (wider labels need bigger badges). */
  radiusFor?: (label: string, baseR: number) => number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function unionFind(n: number) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (p[i] === i ? i : (p[i] = find(p[i])));
  const union = (a: number, b: number) => {
    p[find(a)] = find(b);
  };
  return { find, union };
}

const numericAware = (a: string, b: string) => {
  const na = Number(a), nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
};

export function declutterPins(items: DeclutterItem[], opts: DeclutterOptions): PlacedMarker[] {
  const mergeDist = opts.mergeDist ?? 5.67;
  const factor = opts.overlapFactor ?? 1.2;
  const obstacles = opts.obstacles ?? [];
  const f = opts.frame;

  // ---- 1. merge near-identical same-key pins ----
  const uf = unionFind(items.length);
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.mergeKey && a.mergeKey === b.mergeKey && dist(a.anchor, b.anchor) <= mergeDist) uf.union(i, j);
    }
  const groups = new Map<number, DeclutterItem[]>();
  items.forEach((it, i) => {
    const k = uf.find(i);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(it);
  });
  let markers: PlacedMarker[] = [...groups.values()].map((g) => {
    const anchor = { x: g.reduce((s, i) => s + i.anchor.x, 0) / g.length, y: g.reduce((s, i) => s + i.anchor.y, 0) / g.length };
    const labels = g.map((i) => i.label).filter((l): l is string => !!l);
    const label = g.length > 1 ? [...labels].sort(numericAware).join('·') : g[0].label;
    const baseR = Math.max(...g.map((i) => i.r));
    const r = g.length > 1 && label && opts.radiusFor ? opts.radiusFor(label, baseR) : baseR;
    return { ids: g.map((i) => i.id), label, r, anchor, at: { ...anchor }, displaced: false, merged: g.length > 1 };
  });

  // ---- 2. fan out overlapping clusters ----
  const overlaps = (a: PlacedMarker, b: PlacedMarker, useAt: boolean) =>
    dist(useAt ? a.at : a.anchor, useAt ? b.at : b.anchor) < factor * (a.r + b.r);
  const clamp = (p: Pt, r: number): Pt => ({
    x: Math.min(Math.max(p.x, f.x0 + r + 1), f.x1 - r - 1),
    y: Math.min(Math.max(p.y, f.y0 + r + 1), f.y1 - r - 1),
  });

  // Clusters by anchor overlap; grown when fanned badges still collide with another cluster.
  const cuf = unionFind(markers.length);
  for (let i = 0; i < markers.length; i++)
    for (let j = i + 1; j < markers.length; j++) if (overlaps(markers[i], markers[j], false)) cuf.union(i, j);

  let spread = 1;
  for (let pass = 0; pass < 5; pass++) {
    const clusters = new Map<number, number[]>();
    markers.forEach((_, i) => {
      const k = cuf.find(i);
      (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(i);
    });
    for (const idx of clusters.values()) {
      if (idx.length === 1) {
        const m = markers[idx[0]];
        m.at = { ...m.anchor };
        m.displaced = false;
        continue;
      }
      const c = { x: idx.reduce((s, i) => s + markers[i].anchor.x, 0) / idx.length, y: idx.reduce((s, i) => s + markers[i].anchor.y, 0) / idx.length };
      const rMax = Math.max(...idx.map((i) => markers[i].r));
      const chord = 2 * rMax * 1.15; // spacing between neighbours on the ring
      const R = spread * Math.max(rMax * 2.6, (idx.length * chord) / (2 * Math.PI));
      // Keep the markers' relative bearing so the fan reads like the real layout.
      const order = [...idx].sort((a, b) => {
        const A = Math.atan2(markers[a].anchor.y - c.y, markers[a].anchor.x - c.x);
        const B = Math.atan2(markers[b].anchor.y - c.y, markers[b].anchor.x - c.x);
        return A - B || a - b;
      });
      let best: { score: number; pos: Pt[] } | null = null;
      for (let k = 0; k < 12; k++) {
        const rot = (k / 12) * 2 * Math.PI - Math.PI / 2;
        const pos = order.map((_, n) => {
          const a = rot + (n / order.length) * 2 * Math.PI;
          return clamp({ x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) }, markers[order[n]].r);
        });
        let score = 0;
        pos.forEach((p, n) => {
          const r = markers[order[n]].r;
          const raw = { x: c.x + R * Math.cos(rot + (n / order.length) * 2 * Math.PI), y: c.y + R * Math.sin(rot + (n / order.length) * 2 * Math.PI) };
          if (dist(p, raw) > 0.5) score += 3; // had to be clamped into the frame
          for (const o of obstacles) if (dist(p, o) < r + 1.5) score += 1;
          for (let m = 0; m < n; m++) if (dist(p, pos[m]) < markers[order[m]].r + r) score += 10;
        });
        if (!best || score < best.score) best = { score, pos };
      }
      order.forEach((i, n) => {
        markers[i].at = best!.pos[n];
        markers[i].displaced = true;
      });
    }
    // Any badges (fanned or not) still colliding? Join their clusters and widen the fan.
    let collided = false;
    for (let i = 0; i < markers.length; i++)
      for (let j = i + 1; j < markers.length; j++)
        if (dist(markers[i].at, markers[j].at) < markers[i].r + markers[j].r) {
          if (cuf.find(i) !== cuf.find(j)) cuf.union(i, j);
          collided = true;
        }
    if (!collided) break;
    spread *= 1.3;
  }
  return markers;
}

export interface LogoItem {
  id: string;
  at: Pt; // true position (logo center)
  s: number; // logo size (square side)
}
export interface PlacedLogo extends LogoItem {
  draw: Pt | null; // null = hidden
  nudged: boolean;
}

/** Logos yield to stop markers and to logos placed before them: kept, nudged up to ~1.6
 *  logo widths, or hidden. Never displaced with a leader — they're context, not stops. */
export function declutterLogos(logos: LogoItem[], pins: PlacedMarker[], frame: Frame): PlacedLogo[] {
  const placed: PlacedLogo[] = [];
  const dirs = Array.from({ length: 8 }, (_, k) => ({ x: Math.cos((k * Math.PI) / 4), y: Math.sin((k * Math.PI) / 4) }));
  for (const L of logos) {
    const r = L.s / 2;
    const free = (p: Pt) =>
      p.x - r >= frame.x0 && p.x + r <= frame.x1 && p.y - r >= frame.y0 && p.y + r <= frame.y1 &&
      pins.every((m) => dist(p, m.at) >= m.r + r + 0.5) &&
      placed.every((o) => !o.draw || Math.abs(o.draw.x - p.x) >= (o.s + L.s) / 2 || Math.abs(o.draw.y - p.y) >= (o.s + L.s) / 2);
    let draw: Pt | null = null;
    let nudged = false;
    if (free(L.at)) draw = L.at;
    else
      outer: for (const k of [0.8, 1.6])
        for (const d of dirs) {
          const p = { x: L.at.x + d.x * k * L.s, y: L.at.y + d.y * k * L.s };
          if (free(p)) {
            draw = p;
            nudged = true;
            break outer;
          }
        }
    placed.push({ ...L, draw, nudged });
  }
  return placed;
}
