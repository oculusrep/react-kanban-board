import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface ClientForecastingSectionProps {
  clientId: string | null;
  isNewClient: boolean;
}

interface VelocityStats {
  avg_loi_duration_days: number | null;
  avg_lease_psa_duration_days: number | null;
  closed_deals_count: number;
}

interface VelocityOverrides {
  velocity_loi_days_override: number | null;
  velocity_lease_psa_days_override: number | null;
}

const ClientForecastingSection: React.FC<ClientForecastingSectionProps> = ({
  clientId,
  isNewClient
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [velocityStats, setVelocityStats] = useState<VelocityStats | null>(null);
  const [overrides, setOverrides] = useState<VelocityOverrides>({
    velocity_loi_days_override: null,
    velocity_lease_psa_days_override: null
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalOverrides, setOriginalOverrides] = useState<VelocityOverrides | null>(null);

  // Fetch velocity stats and overrides when client loads
  useEffect(() => {
    const fetchData = async () => {
      if (!clientId || isNewClient) return;

      setLoading(true);
      try {
        // Fetch client velocity overrides
        const { data: clientData, error: clientError } = await supabase
          .from('client')
          .select('velocity_loi_days_override, velocity_lease_psa_days_override')
          .eq('id', clientId)
          .single();

        if (clientError) {
          console.error('Error fetching client velocity overrides:', clientError);
        } else if (clientData) {
          const clientOverrides = {
            velocity_loi_days_override: clientData.velocity_loi_days_override,
            velocity_lease_psa_days_override: clientData.velocity_lease_psa_days_override
          };
          setOverrides(clientOverrides);
          setOriginalOverrides(clientOverrides);
        }

        // Fetch historical velocity stats from the view
        const { data: statsData, error: statsError } = await supabase
          .from('client_velocity_stats')
          .select('*')
          .eq('client_id', clientId)
          .single();

        if (statsError && statsError.code !== 'PGRST116') {
          // PGRST116 = no rows found, which is ok
          console.error('Error fetching velocity stats:', statsError);
        } else if (statsData) {
          setVelocityStats({
            avg_loi_duration_days: statsData.avg_loi_duration_days,
            avg_lease_psa_duration_days: statsData.avg_lease_psa_duration_days,
            closed_deals_count: statsData.closed_deals_count || 0
          });
        }
      } catch (err) {
        console.error('Error fetching forecasting data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [clientId, isNewClient]);

  const handleOverrideChange = (field: keyof VelocityOverrides, value: string) => {
    const numValue = value === '' ? null : parseInt(value, 10);

    setOverrides(prev => {
      const updated = { ...prev, [field]: numValue };

      // Check if there are changes
      if (originalOverrides) {
        const changed = JSON.stringify(updated) !== JSON.stringify(originalOverrides);
        setHasChanges(changed);
      }

      return updated;
    });
  };

  const handleSave = async () => {
    if (!clientId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('client')
        .update({
          velocity_loi_days_override: overrides.velocity_loi_days_override,
          velocity_lease_psa_days_override: overrides.velocity_lease_psa_days_override,
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId);

      if (error) throw error;

      setOriginalOverrides({ ...overrides });
      setHasChanges(false);
    } catch (err) {
      console.error('Error saving velocity overrides:', err);
    } finally {
      setSaving(false);
    }
  };

  // Don't render for new clients
  if (isNewClient) {
    return null;
  }

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
          <h3 className="text-lg font-medium text-gray-900">Deal Forecasting</h3>
          {velocityStats && velocityStats.closed_deals_count >= 5 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Using Historical Data
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
              {/* Historical Velocity Stats */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Historical Velocity</h4>

                {velocityStats && velocityStats.closed_deals_count > 0 ? (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Average LOI Duration:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {velocityStats.avg_loi_duration_days !== null
                          ? `${Math.round(velocityStats.avg_loi_duration_days)} days`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Average At Lease/PSA Duration:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {velocityStats.avg_lease_psa_duration_days !== null
                          ? `${Math.round(velocityStats.avg_lease_psa_duration_days)} days`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                      <span className="text-sm text-gray-600">Based on:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {velocityStats.closed_deals_count} closed deal{velocityStats.closed_deals_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {velocityStats.closed_deals_count < 5 && (
                      <p className="text-xs text-amber-600 mt-2">
                        Need 5+ closed deals to use historical velocity automatically. Currently using overrides or global defaults.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-500 italic">
                      No closed deals yet. Using global defaults for forecasting.
                    </p>
                  </div>
                )}
              </div>

              {/* Velocity Overrides */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Velocity Overrides</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Set custom stage durations for this client. These override global defaults but not historical data (when 5+ deals exist).
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      LOI Stage Duration (days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={overrides.velocity_loi_days_override ?? ''}
                      onChange={(e) => handleOverrideChange('velocity_loi_days_override', e.target.value)}
                      placeholder="Default: 30"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      At Lease/PSA Stage Duration (days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={overrides.velocity_lease_psa_days_override ?? ''}
                      onChange={(e) => handleOverrideChange('velocity_lease_psa_days_override', e.target.value)}
                      placeholder="Default: 45"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                {/* Save Button */}
                {hasChanges && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save Overrides'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientForecastingSection;
