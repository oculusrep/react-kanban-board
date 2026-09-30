import { useEffect, useState } from 'react';
import { adapterFor } from '../services/parcelFabric';
import {
  precisionBadge,
  type PrecisionBadge,
  type PrecisionInput,
} from '../services/placementPrecision';
import {
  geocodeForOrientation,
  type OrientationGeocode,
} from '../services/orientationGeocode';

/** The subset of a municipal_project row this needs. Loose on purpose so it can
 *  be fed a worklist row or a slideout's project without a cast. */
export interface PrecisionSubject {
  id: string;
  municipality_name?: string | null;
  geocoded_address?: string | null;
  address?: string | null;
  parcel_numbers?: string[] | null;
  is_unplaced?: boolean;
  geometry_geojson?: unknown;
  geometry_source?: 'hand_drawn' | 'parcel_fetch' | 'parcel_fetch_adjusted' | null;
  centroid_source?: 'address_geocode' | 'polygon' | 'manual_pin' | null;
}

export interface MunicipalPrecision {
  badge: PrecisionBadge;
  /** Resolved orientation area, or null when there is nothing better than the
   *  municipality (or while the lookup is still in flight). */
  geocode: OrientationGeocode | null;
  loading: boolean;
}

/**
 * One resolution of "how well do we know where this is", shared by the map
 * overlay, the slideout badge and the unplaced worklist rows.
 *
 * They must agree: a row badged "Intersection / road" in the list and then
 * framed on a county when opened would be worse than no badge at all. Sharing a
 * hook — over a module-level cache keyed by address — makes agreement
 * structural rather than something two call sites have to remember.
 *
 * The geocode is resolved at view time and never written. That is the point:
 * the coordinate exists for the life of a render, so it cannot drift into being
 * treated as the record's location.
 */
export function useMunicipalPrecision(
  subject: PrecisionSubject | null | undefined
): MunicipalPrecision {
  const [geocode, setGeocode] = useState<OrientationGeocode | null>(null);
  const [loading, setLoading] = useState(false);

  const isUnplaced = subject?.is_unplaced !== false && !subject?.geometry_geojson;
  const address = subject?.geocoded_address || subject?.address || null;
  const parcelCount = subject?.parcel_numbers?.length ?? 0;
  const parcelFetchable =
    parcelCount > 0 && !!adapterFor(subject?.municipality_name);

  useEffect(() => {
    // A placed record needs no orientation, and a fetchable-parcel record is
    // already better located than any geocode would say.
    if (!subject || !isUnplaced || !address || parcelFetchable) {
      setGeocode(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    geocodeForOrientation(address).then((g) => {
      if (cancelled) return;
      setGeocode(g);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [subject?.id, address, isUnplaced, parcelFetchable]);

  const input: PrecisionInput = {
    isUnplaced,
    parcelFetchable,
    parcelCount,
    granularity: geocode?.granularity ?? null,
    geometrySource: subject?.geometry_source ?? null,
    centroidSource: subject?.centroid_source ?? null,
    hasGeometry: !!subject?.geometry_geojson,
  };

  return { badge: precisionBadge(input), geocode, loading };
}
