import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { RefreshCw, AlertTriangle, CheckCircle, Search, ArrowLeft } from "lucide-react";
import { getDropboxSyncDetectionService } from "../services/dropboxSyncDetection";
import { getDropboxPropertySyncService } from "../services/dropboxPropertySync";

interface SyncStatus {
  propertyId: string;
  propertyName: string;
  mappedFolderPath: string;
  mappedFolderName: string;
  status: 'in_sync' | 'name_mismatch' | 'folder_not_found';
  lastVerified: string | null;
  sfId: string | null;
}

interface CandidateFolder {
  path: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  similarity?: number;
  modified?: string;
}

export default function DropboxSyncAdminPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [properties, setProperties] = useState<SyncStatus[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<SyncStatus | null>(null);
  const [candidates, setCandidates] = useState<CandidateFolder[]>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    document.title = "Dropbox Sync Status | OVIS Admin";
    checkSyncStatus();
  }, []);

  const checkSyncStatus = async () => {
    setChecking(true);
    try {
      console.log('🔍 Checking Dropbox sync status...');
      const syncService = getDropboxSyncDetectionService();
      const results = await syncService.checkAllPropertiesSyncStatus();

      setProperties(results);
      setLastChecked(new Date());
      console.log(`✅ Found ${results.length} properties, ${results.filter(p => p.status !== 'in_sync').length} out of sync`);
    } catch (error) {
      console.error('Error checking sync status:', error);
      alert('Failed to check sync status. See console for details.');
    } finally {
      setChecking(false);
      setLoading(false);
    }
  };

  const findCandidates = async (property: SyncStatus) => {
    setSelectedProperty(property);
    setSearchingCandidates(true);
    setCandidates([]);

    try {
      console.log('🔍 Finding candidates for:', property.propertyName);
      const syncService = getDropboxSyncDetectionService();
      const results = await syncService.findCandidateFolders(
        property.propertyName,
        property.mappedFolderPath,
        property.lastVerified
      );

      setCandidates(results);
      console.log(`✅ Found ${results.length} candidates`);
    } catch (error) {
      console.error('Error finding candidates:', error);
      alert('Failed to find candidate folders. See console for details.');
    } finally {
      setSearchingCandidates(false);
    }
  };

  const syncCRMToDropbox = async (property: SyncStatus) => {
    if (!confirm(`Rename Dropbox folder from "${property.mappedFolderName}" to "${property.propertyName}"?`)) {
      return;
    }

    setFixing(true);
    try {
      console.log('🔄 Syncing CRM → Dropbox...');
      const syncService = getDropboxPropertySyncService();

      const result = await syncService.syncPropertyName(
        property.propertyId,
        property.mappedFolderName,
        property.propertyName
      );

      if (result.success) {
        alert('✅ Dropbox folder renamed successfully!');
        // Refresh sync status
        await checkSyncStatus();
        setSelectedProperty(null);
      } else {
        alert(`❌ Failed to sync: ${result.error}`);
      }
    } catch (error: any) {
      console.error('Error syncing to Dropbox:', error);
      alert(`Failed to sync: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  const syncDropboxToCRM = async (property: SyncStatus) => {
    if (!confirm(`Rename property from "${property.propertyName}" to "${property.mappedFolderName}"?`)) {
      return;
    }

    setFixing(true);
    try {
      console.log('🔄 Syncing Dropbox → CRM...');

      const { error } = await supabase
        .from('property')
        .update({ property_name: property.mappedFolderName })
        .eq('id', property.propertyId);

      if (error) {
        throw error;
      }

      alert('✅ Property renamed successfully!');
      // Refresh sync status
      await checkSyncStatus();
      setSelectedProperty(null);
    } catch (error: any) {
      console.error('Error syncing to CRM:', error);
      alert(`Failed to sync: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  const relinkToFolder = async (property: SyncStatus, newPath: string, newName: string) => {
    if (!confirm(`Relink property "${property.propertyName}" to folder "${newName}"?`)) {
      return;
    }

    setFixing(true);
    try {
      console.log('🔗 Relinking property to new folder...');

      // Update the dropbox_mapping table with new path
      const { error } = await supabase
        .from('dropbox_mapping')
        .update({
          dropbox_folder_path: newPath,
          last_verified_at: new Date().toISOString()
        })
        .eq('entity_type', 'property')
        .eq('entity_id', property.propertyId);

      if (error) {
        throw error;
      }

      alert('✅ Property relinked successfully!');
      // Refresh sync status
      await checkSyncStatus();
      setSelectedProperty(null);
      setCandidates([]);
    } catch (error: any) {
      console.error('Error relinking:', error);
      alert(`Failed to relink: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  const removeMapping = async (property: SyncStatus) => {
    if (!confirm(`Remove Dropbox mapping for "${property.propertyName}"? This cannot be undone.`)) {
      return;
    }

    setFixing(true);
    try {
      const { error } = await supabase
        .from('dropbox_mapping')
        .delete()
        .eq('entity_type', 'property')
        .eq('entity_id', property.propertyId);

      if (error) {
        throw error;
      }

      alert('✅ Mapping removed successfully!');
      // Refresh sync status
      await checkSyncStatus();
      setSelectedProperty(null);
    } catch (error: any) {
      console.error('Error removing mapping:', error);
      alert(`Failed to remove mapping: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  const outOfSyncCount = properties.filter(p => p.status !== 'in_sync').length;
  const outOfSyncProperties = properties.filter(p => p.status !== 'in_sync');
  const inSyncProperties = properties.filter(p => p.status === 'in_sync');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking Dropbox sync status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/reports')}
            className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reports
          </button>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dropbox Sync Status</h1>
              <p className="mt-2 text-gray-600">
                Monitor and fix property name sync issues between CRM and Dropbox
              </p>
              {lastChecked && (
                <p className="mt-1 text-sm text-gray-500">
                  Last checked: {lastChecked.toLocaleTimeString()}
                </p>
              )}
            </div>

            <button
              onClick={checkSyncStatus}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Properties</p>
                <p className="text-3xl font-bold text-gray-900">{properties.length}</p>
              </div>
              <div className="text-blue-500">
                <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Sync</p>
                <p className="text-3xl font-bold text-green-600">{inSyncProperties.length}</p>
              </div>
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Out of Sync</p>
                <p className="text-3xl font-bold text-red-600">{outOfSyncCount}</p>
              </div>
              <AlertTriangle className="h-12 w-12 text-red-500" />
            </div>
          </div>
        </div>

        {/* Out of Sync Table */}
        {outOfSyncCount > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Out of Sync Properties</h2>
              <p className="text-sm text-gray-600 mt-1">Properties that need attention</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-1/4 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property Name (CRM)
                    </th>
                    <th className="w-1/4 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dropbox Folder
                    </th>
                    <th className="w-1/6 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="w-1/3 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {outOfSyncProperties.map((property) => (
                    <tr key={property.propertyId}>
                      <td className="px-3 py-3">
                        <div className="text-sm font-medium text-gray-900 truncate" title={property.propertyName}>
                          {property.propertyName}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm text-gray-900 truncate" title={property.mappedFolderName || 'N/A'}>
                          {property.mappedFolderName || 'N/A'}
                        </div>
                        <div className="text-xs text-gray-500 truncate" title={property.mappedFolderPath}>
                          {property.mappedFolderPath}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {property.status === 'folder_not_found' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 whitespace-nowrap">
                            ❌ Not Found
                          </span>
                        )}
                        {property.status === 'name_mismatch' && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 whitespace-nowrap">
                            ⚠️ Mismatch
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <div className="flex gap-2 flex-wrap">
                          {property.status === 'name_mismatch' && (
                            <>
                              <button
                                onClick={() => syncCRMToDropbox(property)}
                                disabled={fixing}
                                className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 whitespace-nowrap"
                              >
                                Fix Dropbox
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                onClick={() => syncDropboxToCRM(property)}
                                disabled={fixing}
                                className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 whitespace-nowrap"
                              >
                                Fix CRM
                              </button>
                            </>
                          )}
                          {property.status === 'folder_not_found' && (
                            <>
                              <button
                                onClick={() => findCandidates(property)}
                                disabled={searchingCandidates}
                                className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
                              >
                                <Search className="h-4 w-4" />
                                Find
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                onClick={() => removeMapping(property)}
                                disabled={fixing}
                                className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50 whitespace-nowrap"
                              >
                                Unlink
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Candidate Folders Modal */}
        {selectedProperty && candidates.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Found {candidates.length} Possible Matches
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Property: <span className="font-medium">{selectedProperty.propertyName}</span>
                </p>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  {candidates.map((candidate, index) => (
                    <div
                      key={index}
                      className={`border rounded-lg p-4 ${
                        candidate.confidence === 'high'
                          ? 'border-green-300 bg-green-50'
                          : candidate.confidence === 'medium'
                          ? 'border-yellow-300 bg-yellow-50'
                          : 'border-gray-300 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {candidate.confidence === 'high' && (
                              <span className="text-lg">⭐</span>
                            )}
                            {candidate.confidence === 'medium' && (
                              <span className="text-lg">🟡</span>
                            )}
                            {candidate.confidence === 'low' && (
                              <span className="text-lg">⚪</span>
                            )}
                            <span className="font-semibold text-gray-900">{candidate.name}</span>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              candidate.confidence === 'high'
                                ? 'bg-green-200 text-green-800'
                                : candidate.confidence === 'medium'
                                ? 'bg-yellow-200 text-yellow-800'
                                : 'bg-gray-200 text-gray-800'
                            }`}>
                              {candidate.confidence.toUpperCase()} CONFIDENCE
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{candidate.reason}</p>
                          <p className="text-xs text-gray-500 mt-1">{candidate.path}</p>
                        </div>
                        <button
                          onClick={() => relinkToFolder(selectedProperty, candidate.path, candidate.name)}
                          disabled={fixing}
                          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          Relink
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setSelectedProperty(null);
                    setCandidates([]);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* In Sync Section (Collapsed by default) */}
        {inSyncProperties.length > 0 && (
          <details className="bg-white rounded-lg shadow">
            <summary className="p-6 cursor-pointer text-lg font-semibold text-gray-900 hover:bg-gray-50">
              In Sync Properties ({inSyncProperties.length})
            </summary>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Property Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dropbox Folder
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Verified
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inSyncProperties.map((property) => (
                    <tr key={property.propertyId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {property.propertyName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {property.mappedFolderName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {property.lastVerified
                          ? new Date(property.lastVerified).toLocaleString()
                          : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {/* No Issues Message */}
        {outOfSyncCount === 0 && properties.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-green-900 mb-2">All Properties In Sync!</h3>
            <p className="text-green-700">
              All {properties.length} properties are synced correctly between CRM and Dropbox.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
