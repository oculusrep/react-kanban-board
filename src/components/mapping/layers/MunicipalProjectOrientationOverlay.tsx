import { useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';

interface Props {
  map: google.maps.Map | null;
  /** The municipal project whose slideout is open, or null when none is. */
  projectId: string | null;
  /**
   * Skip the lookup for a record already known to be placed. Only `false`
   * suppresses it — `undefined` still asks, because a cached row's placement
   * flag can lag the database and the RPC is the authority either way.
   */
  isUnplaced?: boolean;
  /** Frame the municipality as well as outlining it. Once per project opened. */
  fitBounds?: boolean;
}

/** Steel Blue outline over a barely-there Light Slate Blue wash: reads as an
 *  AREA to search, not as an object on the map, and cannot be mistaken for a
 *  drawn project boundary (those carry stage colors and a solid fill). */
const STROKE = '#4A6B94';
const FILL = '#8FA9C8';

type Ring = [number, number][];

/**
 * The search area for an UNPLACED municipal project: its municipality's outline.
 *
 * An unplaced record is deliberately absent from the map, so opening one used to
 * leave the reviewer with no visual anchor at all for where to draw — only a
 * viewport change they had to take on faith. This draws the municipality the
 * record belongs to, so "somewhere in Paulding County" is something you can see.
 *
 * DISPLAY ONLY. The outline is a simplified ring fetched fresh on every open; it
 * is never written, never cached onto the record, and never a placement source.
 * Placement still comes only from a drawn boundary, a fetched parcel or a dropped
 * pin. The overlay is `clickable: false` precisely so it can never intercept one
 * of those clicks.
 *
 * Owning the fitBounds here — rather than in the caller that opens the slideout —
 * means orientation fires on EVERY path that opens an unplaced record (the
 * unplaced worklist, a deep link, and pin clicks, which never called the page's
 * focus helper at all), and that the viewport change always comes with something
 * on screen to justify it.
 */
export default function MunicipalProjectOrientationOverlay({
  map,
  projectId,
  isUnplaced,
  fitBounds = true,
}: Props) {
  const shapesRef = useRef<google.maps.Polygon[]>([]);
  // The project we have already framed. Without this, any re-render while the
  // slideout is open would yank the viewport back and fight the user panning
  // around to find the parcel.
  const fittedRef = useRef<string | null>(null);

  useEffect(() => {
    const clear = () => {
      shapesRef.current.forEach((p) => p.setMap(null));
      shapesRef.current = [];
    };

    if (!map || !projectId || isUnplaced === false) {
      clear();
      if (!projectId) fittedRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .rpc('municipal_project_orientation_boundary', { p_id: projectId })
        .maybeSingle();

      if (cancelled) return;

      const row = data as {
        municipality_name: string | null;
        boundary_geojson: { type?: string; coordinates?: unknown } | null;
        min_lat: number; min_lng: number; max_lat: number; max_lng: number;
      } | null;

      if (error || !row?.boundary_geojson?.coordinates) {
        // Say why there's no anchor rather than leaving a blank map to be read
        // as "nothing here". No municipality on the record, or no boundary on
        // file for its name, are different problems and both belong to Market
        // Research, not here.
        console.warn(
          '[municipal orientation] no municipality outline for project',
          projectId,
          error ?? '(no boundary matched)'
        );
        clear();
        return;
      }

      const gj = row.boundary_geojson;
      // A Polygon is [ring, ...holes]; a MultiPolygon is a list of those. Each
      // part becomes its own google.maps.Polygon so holes stay holes.
      const parts: Ring[][] =
        gj.type === 'MultiPolygon'
          ? (gj.coordinates as Ring[][])
          : [gj.coordinates as Ring[]];

      clear();
      shapesRef.current = parts.map(
        (rings) =>
          new google.maps.Polygon({
            paths: rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
            map,
            strokeColor: STROKE,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: FILL,
            fillOpacity: 0.08,
            // Never intercept a click: the whole point of this view is that the
            // next click places the record.
            clickable: false,
            // Under the project pins and under anything being drawn.
            zIndex: 1,
          })
      );

      if (
        fitBounds &&
        fittedRef.current !== projectId &&
        typeof row.min_lat === 'number' && typeof row.min_lng === 'number' &&
        typeof row.max_lat === 'number' && typeof row.max_lng === 'number'
      ) {
        map.fitBounds(
          new google.maps.LatLngBounds(
            { lat: row.min_lat, lng: row.min_lng },
            { lat: row.max_lat, lng: row.max_lng }
          ),
          60
        );
        fittedRef.current = projectId;
      }
    })();

    return () => {
      cancelled = true;
      clear();
    };
  }, [map, projectId, isUnplaced, fitBounds]);

  return null;
}
