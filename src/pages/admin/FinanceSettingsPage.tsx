/**
 * Finance Settings Page
 *
 * Admin settings for deal forecasting and CFO tools.
 * Accessible via gear icon in Finance Hub.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, ArrowLeft, Save, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import Toast from '../../components/Toast';
import { useToast } from '../../hooks/useToast';

interface ForecastingSettings {
  velocity_loi_days_default: number;
  velocity_lease_psa_days_default: number;
  default_rent_commencement_days: number;
  default_closing_deadline_days: number;
  velocity_min_deals_for_historical: number;
  behind_schedule_threshold_days: number;
}

const DEFAULT_SETTINGS: ForecastingSettings = {
  velocity_loi_days_default: 30,
  velocity_lease_psa_days_default: 45,
  default_rent_commencement_days: 180,
  default_closing_deadline_days: 30,
  velocity_min_deals_for_historical: 5,
  behind_schedule_threshold_days: 7,
};

export default function FinanceSettingsPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { toast, showToast } = useToast();

  const [settings, setSettings] = useState<ForecastingSettings>(DEFAULT_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<ForecastingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Check admin access
  useEffect(() => {
    if (userRole && !['admin', 'broker_full'].includes(userRole)) {
      navigate('/finance');
    }
  }, [userRole, navigate]);

  // Load settings from app_settings table
  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        const settingKeys = Object.keys(DEFAULT_SETTINGS);

        const { data, error } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', settingKeys);

        if (error) {
          console.error('Error loading settings:', error);
          showToast('Failed to load settings', { type: 'error' });
          return;
        }

        // Build settings object from fetched data
        const loadedSettings: ForecastingSettings = { ...DEFAULT_SETTINGS };

        if (data) {
          data.forEach(row => {
            const key = row.key as keyof ForecastingSettings;
            if (key in loadedSettings) {
              // Parse the JSON value
              try {
                const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
                loadedSettings[key] = typeof parsed === 'number' ? parsed : DEFAULT_SETTINGS[key];
              } catch {
                loadedSettings[key] = DEFAULT_SETTINGS[key];
              }
            }
          });
        }

        setSettings(loadedSettings);
        setOriginalSettings(loadedSettings);
      } catch (err) {
        console.error('Error loading settings:', err);
        showToast('Failed to load settings', { type: 'error' });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleSettingChange = (key: keyof ForecastingSettings, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1) return;

    setSettings(prev => {
      const updated = { ...prev, [key]: numValue };
      setHasChanges(JSON.stringify(updated) !== JSON.stringify(originalSettings));
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert each setting
      const promises = Object.entries(settings).map(([key, value]) =>
        supabase
          .from('app_settings')
          .upsert(
            { key, value: JSON.stringify(value), updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          )
      );

      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        console.error('Error saving settings:', errors);
        showToast('Failed to save some settings', { type: 'error' });
        return;
      }

      setOriginalSettings({ ...settings });
      setHasChanges(false);
      showToast('Settings saved successfully', { type: 'success' });
    } catch (err) {
      console.error('Error saving settings:', err);
      showToast('Failed to save settings', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({ ...originalSettings });
    setHasChanges(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/finance')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to Finance"
              >
                <ArrowLeft className="h-5 w-5 text-gray-500" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Settings className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Finance Settings</h1>
                  <p className="text-sm text-gray-500">Configure deal forecasting defaults</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {hasChanges && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Velocity Defaults Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Stage Velocity Defaults</h2>
          <p className="text-sm text-gray-500 mb-6">
            Default duration for each deal stage. Used when calculating estimated payment dates.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                LOI Stage Duration (days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.velocity_loi_days_default}
                onChange={(e) => handleSettingChange('velocity_loi_days_default', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Expected duration in "Negotiating LOI" stage
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                At Lease/PSA Stage Duration (days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.velocity_lease_psa_days_default}
                onChange={(e) => handleSettingChange('velocity_lease_psa_days_default', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Expected duration in "At Lease / PSA" stage
              </p>
            </div>
          </div>
        </div>

        {/* Deal Timeline Defaults Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Deal Timeline Defaults</h2>
          <p className="text-sm text-gray-500 mb-6">
            Default values used when brokers don't enter specific timeline fields on deals.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Rent Commencement Period (days)
              </label>
              <input
                type="number"
                min="1"
                max="730"
                value={settings.default_rent_commencement_days}
                onChange={(e) => handleSettingChange('default_rent_commencement_days', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Days from lease execution to rent commencement (for lease deals)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Closing Deadline (days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.default_closing_deadline_days}
                onChange={(e) => handleSettingChange('default_closing_deadline_days', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Days from due diligence to closing (for purchase deals)
              </p>
            </div>
          </div>
        </div>

        {/* Historical Velocity Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Historical Velocity</h2>
          <p className="text-sm text-gray-500 mb-6">
            Settings for using historical data to calculate velocity.
          </p>

          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Deals for Historical Velocity
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={settings.velocity_min_deals_for_historical}
              onChange={(e) => handleSettingChange('velocity_min_deals_for_historical', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Number of closed deals required before using client's historical average
            </p>
          </div>
        </div>

        {/* Behind Schedule Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Behind Schedule Detection</h2>
          <p className="text-sm text-gray-500 mb-6">
            Configure when deals are marked as behind schedule on the Kanban board.
          </p>

          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Behind Schedule Threshold (days)
            </label>
            <input
              type="number"
              min="1"
              max="30"
              value={settings.behind_schedule_threshold_days}
              onChange={(e) => handleSettingChange('behind_schedule_threshold_days', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Days over expected duration before marking deal as behind schedule
            </p>
          </div>

          <div className="mt-4 p-4 bg-pink-50 border border-pink-200 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="w-4 h-4 bg-pink-200 rounded mt-0.5"></div>
              <div>
                <p className="text-sm font-medium text-pink-800">Behind Schedule Indicator</p>
                <p className="text-xs text-pink-600 mt-1">
                  Deals that exceed expected stage duration by {settings.behind_schedule_threshold_days}+ days
                  will appear with a pink background on the Kanban board and a badge showing weeks behind.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
      />
    </div>
  );
}
