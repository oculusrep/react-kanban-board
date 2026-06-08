import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface StartResearchModalProps {
  siteSubmitId: string;
  siteSubmitLabel: string;
  onClose: () => void;
  onStarted: (response: { openclaw_response?: unknown; radius_miles: number }) => void;
}

const RADIUS_PRESETS = [3, 5, 10, 15];

export default function StartResearchModal({
  siteSubmitId,
  siteSubmitLabel,
  onClose,
  onStarted,
}: StartResearchModalProps) {
  const [radius, setRadius] = useState<number>(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'ovis-research-trigger',
        { body: { site_submit_id: siteSubmitId, radius_miles: radius } },
      );
      if (invokeErr) {
        const detail = (invokeErr as { context?: { error?: string; detail?: string } }).context;
        throw new Error(detail?.detail ?? detail?.error ?? invokeErr.message);
      }
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error((data as { detail?: string; error?: string }).detail ?? (data as { error: string }).error);
      }
      onStarted({ openclaw_response: (data as { openclaw_response?: unknown })?.openclaw_response, radius_miles: radius });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-5 py-4 border-b" style={{ borderColor: '#8FA9C8' }}>
          <h3 className="text-lg font-semibold" style={{ color: '#002147' }}>Start Market Research</h3>
          <p className="text-sm mt-1" style={{ color: '#4A6B94' }}>{siteSubmitLabel}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#002147' }}>
              Search radius
            </label>
            <div className="grid grid-cols-4 gap-2">
              {RADIUS_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadius(r)}
                  disabled={submitting}
                  className="py-2 rounded-lg border transition-colors text-sm font-medium"
                  style={{
                    backgroundColor: radius === r ? '#002147' : '#FFFFFF',
                    color: radius === r ? '#FFFFFF' : '#4A6B94',
                    borderColor: radius === r ? '#002147' : '#8FA9C8',
                  }}
                >
                  {r} mi
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: '#8FA9C8' }}>
              Use a smaller radius (3–5 mi) for dense metro areas; 10–15 mi for rural sites. The agent
              researches every incorporated city + county that falls within the radius.
            </p>
          </div>

          {error && (
            <div
              className="rounded-md p-3 text-sm border"
              style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFF7F0' }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: '#8FA9C8', backgroundColor: '#F8FAFC' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm border transition-colors"
            style={{ borderColor: '#8FA9C8', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: submitting ? '#8FA9C8' : '#002147',
              color: '#FFFFFF',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Starting…' : `Start Research (${radius} mi)`}
          </button>
        </div>
      </div>
    </div>
  );
}
