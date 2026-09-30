import { useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  useMunicipalPrecision,
  type PrecisionSubject,
} from '../../../hooks/useMunicipalPrecision';

interface Props {
  map: google.maps.Map | null;
  /** The municipal project whose slideout is open, or null when none is. */
  project: PrecisionSubject | null;
}

/** Steel Blue edge over a barely-there Light Slate Blue wash: reads as an AREA
 *  to search, not as an object on the map, and cannot be mistaken for a drawn
 *  project boundary (those carry stage colors and a solid fill). */
const STROKE = '#4A6B94';
const FILL = '#8FA9C8';

type Ring = [number, number][];
type Shape = google.maps.Polygon | google.maps.Circle;

/**
 * The search area for an UNPLACED municipal project.
 *
 * Two tiers, best available first:
 *
 * 1. **The approximate area around its geocode.** An unplaced record usually has
 *    a road- or intersection-level geocode that was rejected for PLACEMENT
 *    because it isn't precise enough to be a pin — but it is by far the best
 *    thing we know about where the project is, and it was previously shown
 *    nowhere on the map. Ardent's "GA-61 & Cartersville Hwy" resolves to a
 *    quarter-mile circle; its county is 300 square miles. A circle sized to
 *    Google's own uncertainty box says "somewhere in here" honestly.
 * 2. **The municipality outline**, only when there is nothing better — the
 *    geocode resolves no finer than the county, or fails outright.
 *
 * DISPLAY ONLY, and structurally so: the tier-1 coordinate is resolved from
 * `geocoded_address` text at view time and lives for the life of a render. It is
 * never written, never cached onto the record, and cannot become the pin. Both
 * shapes are `clickable: false` precisely so they can never intercept the click
 * that actually places the record.
 */
export default function MunicipalProjectOrientationOverlay({ map, project }: Props) {
  const shapesRef = useRef<Shape[]>([]);
  // The project we have already framed. Without this, a re-render while the
  // slideout is open would yank the viewport back and fight the user panning
  // around looking for the parcel.
  const fittedRef = useRef<string | null>(null);

  const { geocode, loading } = useMunicipalPrecision(project);
  const projectId = project?.id ?? null;
  const isUnplaced = project?.is_unplaced !== false && !project?.geometry_geojson;

  useEffect(() => {
    const clear = () => {
      shapesRef.current.forEach((s) => s.setMap(null));
      shapesRef.current = [];
    };

    if (!projectId) fittedRef.current = null;
    if (!map || !projectId || !isUnplaced || loading) {
      clear();
      return;
    }

    let cancelled = false;

    // ---- Tier 1: the geocoded approximate area -----------------------------
    if (geocode) {
      clear();
      const circle = new google.maps.Circle({
        map,
        center: geocode.center,
        radius: geocode.radiusMeters,
        strokeColor: STROKE,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: FILL,
        fillOpacity: 0.15,
        clickable: false,
        zIndex: 1,
      });
      shapesRef.current = [circle];

      if (fittedRef.current !== projectId) {
        map.fitBounds(
          new google.maps.LatLngBounds(
            { lat: geocode.bounds.minLat, lng: geocode.bounds.minLng },
            { lat: geocode.bounds.maxLat, lng: geocode.bounds.maxLng }
          ),
          80
        );
        fittedRef.current = projectId;
      }
      return () => { cancelled = true; clear(); };
    }

    // ---- Tier 2: the municipality outline ----------------------------------
    // Only reached when the address resolves no finer than the county, or not
    // at all. A 300-square-mile outline is nearly useless for placement, which
    // is exactly what the "County only" badge is there to say in advance.
    (async () => {
      const { data, error } = await supabase
        .rpc('municipal_project_orientation_boundary', { p_id: projectId })
        .maybeSingle();
      if (cancelled) return;

      const row = data as {
        boundary_geojson: { type?: string; coordinates?: unknown } | null;
        min_lat: number; min_lng: number; max_lat: number; max_lng: number;
      } | null;

      if (error || !row?.boundary_geojson?.coordinates) {
        // Say why there's no anchor rather than leaving a blank map to be read
        // as "nothing here". No municipality on the record, and no boundary on
        // file for its name, are different problems — and both belong to Market
        // Research, not here.
        console.warn(
          '[municipal orientation] no geocode and no municipality outline for project',
          projectId, error ?? '(no boundary matched)'
        );
        clear();
        return;
      }

      const gj = row.boundary_geojson;
      // A Polygon is [ring, ...holes]; a MultiPolygon is a list of those. Each
      // part becomes its own google.maps.Polygon so holes stay holes.
      const parts: Ring[][] =
        gj.type === 'MultiPolygon' ? (gj.coordinates as Ring[][]) : [gj.coordinates as Ring[]];

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
            fillOpacity: 0.06,
            clickable: false,
            zIndex: 1,
          })
      );

      if (fittedRef.current !== projectId && typeof row.min_lat === 'number') {
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

    return () => { cancelled = true; clear(); };
  }, [map, projectId, isUnplaced, geocode, loading]);

  return null;
}
