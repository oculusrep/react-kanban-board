import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useMasterSearch } from '../hooks/useMasterSearch';
import SimpleSearchTest from './SimpleSearchTest';

const SearchDebugPage: React.FC = () => {
  const [testQuery, setTestQuery] = useState('');
  const [debugInfo, setDebugInfo] = useState<any>({});
  const { search, loading, error } = useMasterSearch();

  // Test basic database connectivity
  useEffect(() => {
    const testDatabase = async () => {
      try {
        console.log('Testing database connections...');
        
        const [dealsResult, clientsResult, contactsResult, propertiesResult, siteSubmitsResult] = await Promise.all([
          supabase.from('deal').select('id, deal_name').limit(3),
          supabase.from('client').select('id, client_name').limit(3),
          supabase.from('contact').select('id, first_name, last_name').limit(3),
          supabase.from('property').select('id, property_name').limit(3),
          supabase.from('site_submit').select('id, site_submit_name').limit(3)
        ]);

        console.log('Database test results:', {
          deals: dealsResult,
          clients: clientsResult,
          contacts: contactsResult,
          properties: propertiesResult,
          siteSubmits: siteSubmitsResult
        });

        setDebugInfo({
          deals: { count: dealsResult.data?.length || 0, error: dealsResult.error, sample: dealsResult.data },
          clients: { count: clientsResult.data?.length || 0, error: clientsResult.error, sample: clientsResult.data },
          contacts: { count: contactsResult.data?.length || 0, error: contactsResult.error, sample: contactsResult.data },
          properties: { count: propertiesResult.data?.length || 0, error: propertiesResult.error, sample: propertiesResult.data },
          siteSubmits: { count: siteSubmitsResult.data?.length || 0, error: siteSubmitsResult.error, sample: siteSubmitsResult.data }
        });

      } catch (err) {
        console.error('Database test failed:', err);
        setDebugInfo({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    };

    testDatabase();
  }, []);

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;
    
    console.log(`Testing search for: "${testQuery}"`);
    try {
      const results = await search(testQuery, { limit: 5 });
      console.log('Search results:', results);
      alert(`Found ${results.length} results. Check console for details.`);
    } catch (err) {
      console.error('Search test failed:', err);
      alert(`Search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Search Debug Page
        </h1>

        {/* Database Connection Test */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Database Connection Test</h2>
          <div className="space-y-4">
            {Object.entries(debugInfo).map(([table, info]: [string, any]) => (
              <div key={table} className="border-l-4 border-blue-500 pl-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium capitalize">{table}</h3>
                  <span className={`px-2 py-1 rounded text-xs ${
                    info?.error ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {info?.error ? 'Error' : `${info?.count || 0} records`}
                  </span>
                </div>
                {info?.error && (
                  <p className="text-sm text-red-600 mt-1">
                    {info.error.message || JSON.stringify(info.error)}
                  </p>
                )}
                {info?.sample && info.sample.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 mb-1">Sample data:</p>
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(info.sample, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Manual Search Test */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Manual Search Test</h2>
          <div className="flex space-x-4 mb-4">
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              placeholder="Enter search term..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleTestSearch}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Test Search'}
            </button>
          </div>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-700">Search Error: {error}</p>
            </div>
          )}
        </div>

        {/* Simple Search Test */}
        <SimpleSearchTest />

        {/* Console Instructions */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4 text-yellow-800">Debug Instructions</h2>
          <ul className="space-y-2 text-yellow-700">
            <li>1. Open your browser's developer console (F12)</li>
            <li>2. Check the database connection results above</li>
            <li>3. Try the manual search test</li>
            <li>4. Try the simple search test</li>
            <li>5. Look for any error messages in the console</li>
            <li>6. Check network tab for failed API requests</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SearchDebugPage;