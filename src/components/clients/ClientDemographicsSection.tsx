import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface ClientDemographicsSectionProps {
  clientId: string | null;
  isNewClient: boolean;
}

interface DemographicsConfig {
  demographics_radii: number[] | null;
  demographics_drive_times: number[] | null;
  demographics_sidebar_radius: number | null;
}

const DEFAULT_RADII = [1, 3, 5];
const DEFAULT_DRIVE_TIMES = [10];

const ClientDemographicsSection: React.FC<ClientDemographicsSectionProps> = ({
  clientId,
  isNewClient
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [config, setConfig] = useState<DemographicsConfig>({
    demographics_radii: null,
    demographics_drive_times: null,
    demographics_sidebar_radius: null
  });
  const [radiiInput, setRadiiInput] = useState('');
  const [driveTimesInput, setDriveTimesInput] = useState('');
  const [sidebarRadiusInput, setSidebarRadiusInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<DemographicsConfig | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!clientId || isNewClient) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('client')
          .select('demographics_radii, demographics_drive_times, demographics_sidebar_radius')
          .eq('id', clientId)
          .single();

        if (error) {
          console.error('Error fetching client demographics config:', error);
          return;
        }

        if (data) {
          const clientConfig: DemographicsConfig = {
            demographics_radii: data.demographics_radii,
            demographics_drive_times: data.demographics_drive_times,
            demographics_sidebar_radius: data.demographics_sidebar_radius
          };
          setConfig(clientConfig);
          setOriginalConfig(clientConfig);
          setRadiiInput(data.demographics_radii ? data.demographics_radii.join(', ') : '');
          setDriveTimesInput(data.demographics_drive_times ? data.demographics_drive_times.join(', ') : '');
          setSidebarRadiusInput(data.demographics_sidebar_radius != null ? String(data.demographics_sidebar_radius) : '');
        }
      } catch (err) {
        console.error('Error fetching demographics config:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [clientId, isNewClient]);

  const parseNumbers = (input: string): number[] | null => {
    if (!input.trim()) return null;
    const nums = input
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(s => parseFloat(s));

    if (nums.some(n => isNaN(n) || n <= 0)) return null;
    return nums.sort((a, b) => a - b);
  };

  const handleRadiiChange = (value: string) => {
    setRadiiInput(value);
    const parsed = parseNumbers(value);
    const updated: DemographicsConfig = {
      ...config,
      demographics_radii: parsed
    };
    setConfig(updated);
    if (originalConfig) {
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalConfig));
    }
  };

  const handleDriveTimesChange = (value: string) => {
    setDriveTimesInput(value);
    const parsed = parseNumbers(value);
    const updated: DemographicsConfig = {
      ...config,
      demographics_drive_times: parsed
    };
    setConfig(updated);
    if (originalConfig) {
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalConfig));
    }
  };

  const handleSidebarRadiusChange = (value: string) => {
    setSidebarRadiusInput(value);
    const numValue = value.trim() === '' ? null : parseFloat(value);
    const updated: DemographicsConfig = {
      ...config,
      demographics_sidebar_radius: numValue && !isNaN(numValue) && numValue > 0 ? numValue : null
    };
    setConfig(updated);
    if (originalConfig) {
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalConfig));
    }
  };

  const handleSave = async () => {
    if (!clientId) return;

    // Validate
    if (radiiInput.trim()) {
      const parsed = parseNumbers(radiiInput);
      if (!parsed) {
        alert('Invalid radii. Enter positive numbers separated by commas (e.g., 0.5, 1, 3)');
        return;
      }
      if (parsed.length > 5) {
        alert('Maximum 5 radii allowed.');
        return;
      }
      if (parsed.some(r => r > 25)) {
        alert('Maximum radius is 25 miles.');
        return;
      }
    }

    if (driveTimesInput.trim()) {
      const parsed = parseNumbers(driveTimesInput);
      if (!parsed) {
        alert('Invalid drive times. Enter positive numbers separated by commas (e.g., 5, 10)');
        return;
      }
      if (parsed.length > 3) {
        alert('Maximum 3 drive times allowed.');
        return;
      }
      if (parsed.some(t => t > 60)) {
        alert('Maximum drive time is 60 minutes.');
        return;
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('client')
        .update({
          demographics_radii: config.demographics_radii,
          demographics_drive_times: config.demographics_drive_times,
          demographics_sidebar_radius: config.demographics_sidebar_radius,
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId);

      if (error) throw error;

      setOriginalConfig({ ...config });
      setHasChanges(false);
    } catch (err) {
      console.error('Error saving demographics config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRadiiInput('');
    setDriveTimesInput('');
    setSidebarRadiusInput('');
    const resetConfig: DemographicsConfig = {
      demographics_radii: null,
      demographics_drive_times: null,
      demographics_sidebar_radius: null
    };
    setConfig(resetConfig);
    if (originalConfig) {
      setHasChanges(JSON.stringify(resetConfig) !== JSON.stringify(originalConfig));
    }
  };

  if (isNewClient) {
    return null;
  }

  const activeRadii = config.demographics_radii || DEFAULT_RADII;
  const activeDriveTimes = config.demographics_drive_times || DEFAULT_DRIVE_TIMES;
  const sidebarRadius = config.demographics_sidebar_radius;
  const isCustom = config.demographics_radii !== null || config.demographics_drive_times !== null || config.demographics_sidebar_radius !== null;

  return (
    <div className="bg-white shadow rounded-lg">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900">Demographics Settings</h3>
          {isCustom && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#002147', color: '#ffffff' }}>
              Custom
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="px-6 pb-6 border-t border-gray-100">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {/* Current Settings Display */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Active Radii:</span>
                  <span className="text-sm font-medium text-gray-900">
                    {activeRadii.map(r => `${r} mi`).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Active Drive Times:</span>
                  <span className="text-sm font-medium text-gray-900">
                    {activeDriveTimes.map(t => `${t} min`).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Sidebar Display:</span>
                  <span className="text-sm font-medium text-gray-900">
                    {sidebarRadius != null ? `${sidebarRadius} mi` : 'Default (3 mi)'}
                  </span>
                </div>
                {!isCustom && (
                  <p className="text-xs text-gray-500 mt-2 italic">
                    Using system defaults. Set custom values below to override.
                  </p>
                )}
              </div>

              {/* Custom Configuration */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Custom Configuration</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Set custom ring buffer radii and drive times for this client's site submits. Leave empty to use system defaults (1, 3, 5 miles + 10-min drive).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Ring Buffer Radii (miles)
                    </label>
                    <input
                      type="text"
                      value={radiiInput}
                      onChange={(e) => handleRadiiChange(e.target.value)}
                      placeholder="e.g., 0.5, 1, 3"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">Comma-separated, max 5 values, max 25 miles</p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Drive Times (minutes)
                    </label>
                    <input
                      type="text"
                      value={driveTimesInput}
                      onChange={(e) => handleDriveTimesChange(e.target.value)}
                      placeholder="e.g., 5, 10"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">Comma-separated, max 3 values, max 60 min</p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Sidebar Display Radius (miles)
                    </label>
                    <input
                      type="text"
                      value={sidebarRadiusInput}
                      onChange={(e) => handleSidebarRadiusChange(e.target.value)}
                      placeholder="e.g., 2"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">Which radius to show in sidebar summary</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 flex gap-2">
                  {hasChanges && (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                  )}
                  {isCustom && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                      Reset to Defaults
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientDemographicsSection;
