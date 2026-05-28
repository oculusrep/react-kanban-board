import React, { useEffect, useRef, useState } from 'react';
import { TerraDraw, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';
import { supabase } from '../../../lib/supabaseClient';

interface Props {
  map: google.maps.Map | null;
  projectId: string;
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
 * Owns the terra-draw lifecycle for capturing a single polygon and writing it
 * to municipal_project.geometry. Mounted by MappingPageNew when the user clicks
 * "Draw polygon" in the slideout; unmounts on cancel or successful save.
 */
const MunicipalProjectDrawer: React.FC<Props> = ({ map, projectId, onCancel, onSaved }) => {
  const drawRef = useRef<TerraDraw | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!map) return;

    let alive = true;
    try {
      const adapter = new TerraDrawGoogleMapsAdapter({
        map,
        lib: google.maps,
        coordinatePrecision: 9,
      });
      const draw = new TerraDraw({
        adapter,
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: '#002147',
              fillOpacity: 0.25,
              outlineColor: '#002147',
              outlineWidth: 2,
            },
          }),
        ],
      });
      draw.start();
      draw.setMode('polygon');
      drawRef.current = draw;

      draw.on('finish', async (featureId: string, ctx: { action: string }) => {
        if (ctx.action !== 'draw' || !alive) return;
        const snapshot = draw.getSnapshot();
        const feature = snapshot.find((f) => f.id === featureId);
        if (!feature || feature.geometry.type !== 'Polygon') return;
        await persistPolygon(feature.geometry.coordinates as number[][][]);
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
    // We intentionally re-init only when map/projectId change.
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

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-xl"
      style={{ backgroundColor: '#FFFFFF', border: `2px solid ${BRAND.midnight}` }}
    >
      <span className="text-sm font-semibold" style={{ color: BRAND.midnight }}>
        Drawing polygon
      </span>
      <span className="text-xs" style={{ color: BRAND.steel }}>
        {saving
          ? 'Saving…'
          : 'Click to add corners • double-click last point to finish'}
      </span>
      {error && (
        <span className="text-xs" style={{ color: BRAND.terracotta }}>
          {error}
        </span>
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
