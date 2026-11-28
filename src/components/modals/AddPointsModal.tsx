import React, { useMemo, useRef, useState } from 'react';
import { mapLayerService } from '../../services/mapLayerService';
import {
  parsePointList,
  POINT_TEMPLATE_CSV,
} from '../mapping/utils/parsePointList';

interface AddPointsModalProps {
  isOpen: boolean;
  layerId: string;
  layerName: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

const PREVIEW_ROWS = 8;

export default function AddPointsModal({
  isOpen,
  layerId,
  layerName,
  onClose,
  onSuccess,
}: AddPointsModalProps) {
  const [text, setText] = useState('');
  const [swap, setSwap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const result = useMemo(
    () => (text.trim() ? parsePointList(text, { swap }) : null),
    [text, swap]
  );

  const reset = () => {
    setText('');
    setSwap(false);
    setSaveError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    setSwap(false);
  };

  const downloadTemplate = () => {
    const blob = new Blob([POINT_TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'layer-points-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!result || result.points.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const count = await mapLayerService.createPoints(layerId, result.points);
      reset();
      onSuccess(count);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to add points');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const pointCount = result?.points.length ?? 0;
  const blockedBySwap = !!result?.looksSwapped;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold" style={{ color: '#002147' }}>Add Points</h2>
          <p className="text-sm text-gray-500 mt-1">Add points to "{layerName}"</p>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="text-sm text-gray-600">
            Paste rows from Excel or Google Sheets, or load a CSV. Use columns{' '}
            <strong>name, lat, lng</strong> (header row optional). Any other columns are
            saved on the point.{' '}
            <button onClick={downloadTemplate} className="text-blue-600 hover:underline">
              Download template
            </button>
          </div>

          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setSaveError(null); }}
            placeholder={'name,lat,lng\nSite A,33.7490,-84.3880\nSite B,34.0232,-84.6155'}
            rows={8}
            className="w-full font-mono text-xs border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ borderColor: '#8FA9C8' }}
            disabled={saving}
          />

          <div className="flex items-center justify-between">
            <label className="text-sm text-blue-600 hover:underline cursor-pointer">
              Load CSV file…
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFile}
                className="hidden"
              />
            </label>
            {text && (
              <button onClick={reset} className="text-sm text-gray-500 hover:underline" disabled={saving}>
                Clear
              </button>
            )}
          </div>

          {result && (
            <div className="space-y-3">
              {blockedBySwap && (
                <div className="p-3 rounded-md text-sm border" style={{ borderColor: '#A27B5C', color: '#7a5a40' }}>
                  Latitude and longitude look swapped (lat should be ~30–35 and lng ~-80 to -90 in the Southeast).{' '}
                  <button onClick={() => setSwap(s => !s)} className="font-medium underline">
                    Swap columns
                  </button>
                </div>
              )}
              {swap && !blockedBySwap && (
                <div className="text-xs text-gray-500">
                  Columns swapped.{' '}
                  <button onClick={() => setSwap(false)} className="underline">Undo</button>
                </div>
              )}

              <div className="text-sm font-medium" style={{ color: '#002147' }}>
                {pointCount} point{pointCount === 1 ? '' : 's'} ready
                {result.errors.length > 0 && (
                  <span className="text-red-600 font-normal">
                    {' '}· {result.errors.length} line{result.errors.length === 1 ? '' : 's'} skipped
                  </span>
                )}
              </div>

              {pointCount > 0 && (
                <table className="w-full text-xs border" style={{ borderColor: '#8FA9C8' }}>
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-1">Name</th>
                      <th className="text-right px-2 py-1">Lat</th>
                      <th className="text-right px-2 py-1">Lng</th>
                      <th className="text-left px-2 py-1">Other fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.points.slice(0, PREVIEW_ROWS).map(pt => (
                      <tr key={pt.line} className="border-t">
                        <td className="px-2 py-1">{pt.name ?? <span className="text-gray-400">—</span>}</td>
                        <td className="px-2 py-1 text-right font-mono">{pt.lat}</td>
                        <td className="px-2 py-1 text-right font-mono">{pt.lng}</td>
                        <td className="px-2 py-1 text-gray-500 truncate max-w-[200px]">
                          {Object.entries(pt.attributes).map(([k, v]) => `${k}: ${v}`).join('; ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pointCount > PREVIEW_ROWS && (
                <div className="text-xs text-gray-500">…and {pointCount - PREVIEW_ROWS} more</div>
              )}

              {result.errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 max-h-32 overflow-y-auto">
                  {result.errors.map(e => (
                    <div key={`${e.line}-${e.reason}`}>
                      Line {e.line}: {e.reason}
                      <span className="text-red-400"> — {e.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
              {saveError}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-white"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={pointCount === 0 || blockedBySwap || saving}
            className="px-4 py-2 text-white rounded-md disabled:opacity-50"
            style={{ backgroundColor: '#002147' }}
          >
            {saving ? 'Adding…' : `Add ${pointCount} point${pointCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
