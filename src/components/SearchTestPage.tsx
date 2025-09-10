import React from 'react';
import MasterSearchBox from './MasterSearchBox';
import { SearchResult } from '../hooks/useMasterSearch';

const SearchTestPage: React.FC = () => {
  const handleSearchSelect = (result: SearchResult) => {
    console.log('Selected search result:', result);
    alert(`Selected: ${result.title} (${result.type})`);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Master Search Test Page
        </h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Search Features</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-700 mb-6">
            <li><strong>Real-time Search:</strong> As you type, results appear instantly</li>
            <li><strong>Multi-entity Search:</strong> Searches across Deals, Clients, Contacts, Properties, and Site Submits</li>
            <li><strong>Intelligent Ranking:</strong> Results are ranked by relevance and type priority</li>
            <li><strong>Keyboard Navigation:</strong> Use arrow keys to navigate, Enter to select</li>
            <li><strong>Advanced Search:</strong> Press Ctrl+Enter or click the link for detailed search</li>
            <li><strong>Quick Access:</strong> Click any result to navigate to that item</li>
          </ul>
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Try searching for:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="font-medium text-green-600">Deals:</div>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Deal names</li>
                  <li>Account names</li>
                  <li>Deal notes</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="font-medium text-blue-600">Clients:</div>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Client names</li>
                  <li>Account names</li>
                  <li>Client types</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="font-medium text-purple-600">Contacts:</div>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>First/last names</li>
                  <li>Company names</li>
                  <li>Email addresses</li>
                  <li>Job titles</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="font-medium text-orange-600">Properties:</div>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Property names</li>
                  <li>Street addresses</li>
                  <li>Cities and states</li>
                  <li>Trade areas</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="font-medium text-teal-600">Site Submits:</div>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li>Submit names</li>
                  <li>Account names</li>
                  <li>Submit notes</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Test the Search</h2>
          <MasterSearchBox 
            onSelect={handleSearchSelect}
            placeholder="Try searching for anything..."
            className="w-full"
          />
          
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-2">Keyboard shortcuts:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">↑/↓</kbd> Navigate results</li>
              <li><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">Enter</kbd> Select result</li>
              <li><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">Ctrl+Enter</kbd> Open advanced search</li>
              <li><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-xs">Esc</kbd> Close dropdown</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchTestPage;