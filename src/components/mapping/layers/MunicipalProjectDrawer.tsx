import React, { useEffect, useRef, useState } from 'react';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';
import { supabase } from '../../../lib/supabaseClient';

interface Props {
  map: google.maps.Map | null;
  projectId: string;
  // If present, drawer opens in select/edit mode with this polygon pre-loaded.
  // If null, drawer opens in polygon-draw mode for a fresh capture.
  existingGeometryGeoJson: { type: string; coordinates: unknown } | null;
  // Effective stage color for this project (same precedence the layer uses:
  // effective_stage_color > municipality_display_color > brand slate). The
  // terra-draw polygon renders in this so it matches the baked polygon the
  // layer will draw after save — no page refresh needed to "see" the stage color.
  polygonColor: string;
  onCancel: () => void;
  onSaved: () => void;
}

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

// Interior rings across every part of a Polygon / MultiPolygon. GeoJSON:
// Polygon coordinates = ring[]; MultiPolygon coordinates = polygon[][]; ring 0 of
// each polygon is the outer boundary, the rest are holes.
function countInteriorRings(g: { type: string; coordinates: unknown } | null): number {
  if (!g) return 0;
  const c = g.coordinates as unknown[];
  if (!Array.isArray(c)) return 0;
  if (g.type === 'Polygon') return Math.max(0, c.length - 1);
  if (g.type === 'MultiPolygon') {
    return c.reduce<number>((n, poly) => n + Math.max(0, (poly as unknown[]).length - 1), 0);
  }
  return 0;
}

/**
 * Owns the terra-draw lifecycle for capturing or editing a project's polygon
 * (municipal_project.geometry). Mounted by MappingPageNew when the user clicks
 * "Draw polygon" or "Edit polygon" in the slideout; unmounts on cancel or
 * successful save.
 */
const MunicipalProjectDrawer: React.FC<Props> = ({
  map,
  projectId,
  existingGeometryGeoJson,
  polygonColor,
  onCancel,
  onSaved,
}) => {
  const drawRef = useRef<TerraDraw | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  // terra-draw's polygon mode edits ONE simple ring set. Two shapes it cannot
  // represent, both of which now reach this component since parcel boundaries are
  // fetched from a county fabric:
  //
  //   * MultiPolygon — a non-contiguous multi-parcel union;
  //   * interior rings (holes) — parcel 161-001 has two.
  //
  // Loading either into the editor and saving what comes back would silently
  // discard the parts it can't hold. Silent loss is worse than a refused edit, so
  // these open read-only with an explanation instead. (The database refuses the
  // ring-dropping save too — belt and braces, since that guard also covers any
  // other caller.)
  const geomType = existingGeometryGeoJson?.type;
  const ringCount = countInteriorRings(existingGeometryGeoJson);
  const uneditableReason: string | null =
    !existingGeometryGeoJson ? null
    : geomType === 'MultiPolygon'
      ? 'This boundary is made of several separate pieces, which the editor can’t hold in one shape.'
    : ringCount > 0
      ? `This boundary has ${ringCount} hole${ringCount === 1 ? '' : 's'} cut out of it, which the editor can’t hold.`
    : geomType !== 'Polygon'
      ? `Unsupported geometry type (${geomType}).`
      : null;
  const isEditing = !!existingGeometryGeoJson && !uneditableReason;

  useEffect(() => {
    if (!map) return;
    // Don't mount the editor at all for a shape it can't represent — otherwise it
    // opens in fresh-draw mode and whatever gets drawn replaces the real boundary.
    if (uneditableReason) return;

    let alive = true;
    try {
      const adapter = new TerraDrawGoogleMapsAdapter({
        map,
        lib: google.maps,
        coordinatePrecision: 9,
      });
      const polygonMode = new TerraDrawPolygonMode({
        styles: {
          fillColor: polygonColor as `#${string}`,
          fillOpacity: 0.25,
          outlineColor: polygonColor as `#${string}`,
          outlineWidth: 2,
        },
      });
      const selectMode = new TerraDrawSelectMode({
        flags: {
          polygon: {
            feature: {
              draggable: true,
              coordinates: {
                draggable: true,
                midpoints: true,
                deletable: true,
              },
            },
          },
        },
      });
      const draw = new TerraDraw({ adapter, modes: [polygonMode, selectMode] });
      draw.start();

      if (isEditing) {
        const id = draw.getFeatureId();
        draw.addFeatures([
          {
            id,
            type: 'Feature',
            geometry: existingGeometryGeoJson as {
              type: 'Polygon';
              coordinates: [number, number][][];
            },
            properties: { mode: 'polygon' },
          },
        ]);
        draw.setMode('select');
        selectMode.selectFeature(id);
      } else {
        draw.setMode('polygon');
      }
      drawRef.current = draw;

      // Auto-persist only for fresh draws — edits go through the Save button so
      // vertex-drag/midpoint-drag events don't spam the DB.
      draw.on('finish', (featureId, ctx) => {
        if (ctx.action !== 'draw' || !alive || isEditing) return;
        const snapshot = draw.getSnapshot();
        const feature = snapshot.find((f) => f.id === featureId);
        if (!feature || feature.geometry.type !== 'Polygon') return;
        void persistPolygon(feature.geometry.coordinates as number[][][]);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }

    return () => {
      alive = false;
      if (drawRef.current) {
        try {
          drawRef.current.stop();
        } catch {
          /* noop */
        }
        drawRef.current = null;
      }
    };
    // We intentionally re-init only when map/projectId change. isEditing +
    // existingGeometryGeoJson are captured at mount; parent unmounts the whole
    // drawer if you switch projects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // uneditableReason gates whether the editor mounts at all; it derives from
    // existingGeometryGeoJson, which is fixed for the life of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, projectId, uneditableReason]);

  async function persistPolygon(rings: number[][][]) {
    // GeoJSON Polygon: rings[0] = outer ring, rings[1..] = holes. Coords are [lng, lat].
    if (!rings.length || rings[0].length < 4) {
      setError('Polygon needs at least 3 points.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // set_municipal_project_polygon owns the rules this used to duplicate:
      //
      //  * the pin comes from ST_PointOnSurface, which is guaranteed to lie
      //    INSIDE the shape. The vertex average this replaced is not a centroid —
      //    it is weighted by where the points happen to be dense, and on a concave
      //    or holed parcel it can land outside the boundary entirely;
      //  * an edit to a fetched boundary is recorded as parcel_fetch_adjusted, so
      //    a hand-tuned shape is never mistaken for what the fabric says;
      //  * a save that would drop interior rings is refused.
      const { error: rpcErr } = await supabase.rpc('set_municipal_project_polygon', {
        p_id: projectId,
        p_geojson: { type: 'Polygon', coordinates: rings },
        p_source: 'hand_drawn',
      });
      if (rpcErr) throw rpcErr;
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdits() {
    const draw = drawRef.current;
    if (!draw) return;
    const snapshot = draw.getSnapshot();
    const feature = snapshot.find((f) => f.geometry.type === 'Polygon');
    if (!feature) {
      setError('No polygon to save.');
      return;
    }
    await persistPolygon(feature.geometry.coordinates as number[][][]);
  }

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-xl"
      style={{ backgroundColor: '#FFFFFF', border: `2px solid ${BRAND.midnight}` }}
    >
      <span className="text-sm font-semibold" style={{ color: BRAND.midnight }}>
        {uneditableReason ? 'Can’t edit this boundary' : isEditing ? 'Editing polygon' : 'Drawing polygon'}
      </span>
      <span className="text-xs" style={{ color: uneditableReason ? BRAND.terracotta : BRAND.steel }}>
        {uneditableReason
          ? `${uneditableReason} Editing it here would throw that detail away, so it’s left as it is.`
          : saving
            ? 'Saving…'
            : isEditing
              ? 'Drag corners or midpoints • click Save when done'
              : 'Click to add corners • double-click last point to finish'}
      </span>
      {error && (
        <span className="text-xs" style={{ color: BRAND.terracotta }}>
          {error}
        </span>
      )}
      {isEditing && !uneditableReason && (
        <button
          type="button"
          onClick={saveEdits}
          disabled={saving}
          className="px-3 py-1 text-xs rounded font-semibold disabled:opacity-40"
          style={{ backgroundColor: BRAND.midnight, color: '#FFFFFF' }}
        >
          Save changes
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="px-2 py-1 text-xs rounded border disabled:opacity-40"
        style={{ borderColor: BRAND.slate, color: BRAND.steel }}
      >
        Cancel
      </button>
    </div>
  );
};

export default MunicipalProjectDrawer;
