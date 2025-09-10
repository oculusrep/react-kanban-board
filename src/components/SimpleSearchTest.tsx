import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const SimpleSearchTest: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Simple search for:', query);
      
      // Simple search in deals table
      const { data, error: searchError } = await supabase
        .from('deal')
        .select('id, deal_name, created_at')
        .ilike('deal_name', `%${query}%`)
        .limit(5);
      
      if (searchError) {
        throw searchError;
      }
      
      console.log('Simple search results:', data);
      setResults(data || []);
      
    } catch (err) {
      console.error('Simple search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Simple Search Test</h2>
      
      <div className="flex space-x-4 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search deals..."
          className="flex-1 px-3 py-2 border rounded-md"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md mb-4">
          <p className="text-red-700">Error: {error}</p>
        </div>
      )}
      
      <div className="space-y-2">
        <h3 className="font-medium">Results ({results.length}):</h3>
        {results.map((result) => (
          <div key={result.id} className="p-3 bg-gray-50 rounded border">
            <div className="font-medium">{result.deal_name || 'Unnamed Deal'}</div>
            <div className="text-sm text-gray-600">ID: {result.id}</div>
            <div className="text-sm text-gray-600">Created: {result.created_at}</div>
          </div>
        ))}
        {results.length === 0 && query && !loading && (
          <div className="text-gray-500">No results found</div>
        )}
      </div>
    </div>
  );
};

export default SimpleSearchTest;