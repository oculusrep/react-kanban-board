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
  onCancel: () => void;
  onSaved: () => void;
}

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

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
  onCancel,
  onSaved,
}) => {
  const drawRef = useRef<TerraDraw | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  // We only enter edit mode if a Polygon was pre-loaded; MultiPolygon isn't
  // currently editable (the writer only produces single Polygons anyway).
  const isEditing = !!(
    existingGeometryGeoJson && existingGeometryGeoJson.type === 'Polygon'
  );

  useEffect(() => {
    if (!map) return;

    let alive = true;
    try {
      const adapter = new TerraDrawGoogleMapsAdapter({
        map,
        lib: google.maps,
        coordinatePrecision: 9,
      });
      const polygonMode = new TerraDrawPolygonMode({
        styles: {
          fillColor: '#002147',
          fillOpacity: 0.25,
          outlineColor: '#002147',
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
  }, [map, projectId]);

  async function persistPolygon(rings: number[][][]) {
    // GeoJSON Polygon: rings[0] = outer ring, rings[1..] = holes. Coords are [lng, lat].
    // Build WKT: POLYGON((lng lat, lng lat, ...), (hole...), ...)
    if (!rings.length || rings[0].length < 4) {
      setError('Polygon needs at least 3 points.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const wktRings = rings
        .map((ring) => '(' + ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ') + ')')
        .join(', ');
      const wkt = `SRID=4326;POLYGON(${wktRings})`;

      // Centroid = average of outer ring vertices (skip closing duplicate).
      const outer = rings[0].slice(0, -1);
      const sum = outer.reduce<[number, number]>(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]);
      const cLng = sum[0] / outer.length;
      const cLat = sum[1] / outer.length;
      const centroidWkt = `SRID=4326;POINT(${cLng} ${cLat})`;

      const { error: updateErr } = await supabase
        .from('municipal_project')
        .update({ geometry: wkt, centroid: centroidWkt })
        .eq('id', projectId);
      if (updateErr) throw updateErr;
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
        {isEditing ? 'Editing polygon' : 'Drawing polygon'}
      </span>
      <span className="text-xs" style={{ color: BRAND.steel }}>
        {saving
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
      {isEditing && (
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
