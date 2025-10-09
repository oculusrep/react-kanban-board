import React, { useState, useEffect, useRef } from 'react';
import { SearchResult } from '../hooks/useMasterSearch';
import { supabase } from '../lib/supabaseClient';

interface DedicatedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  searchType: 'deal' | 'contact' | 'property' | 'assignment' | 'client' | 'site_submit';
  onSelect: (result: SearchResult) => void;
}

const DedicatedSearchModal: React.FC<DedicatedSearchModalProps> = ({
  isOpen,
  onClose,
  title,
  searchType,
  onSelect
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      setQuery('');
      setResults([]);
      setSelectedIndex(-1);
    }
  }, [isOpen]);

  // Internal search function (like LogCallModal pattern)
  useEffect(() => {
    const performSearch = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const trimmedQuery = query.trim().toLowerCase();
        let searchResults: SearchResult[] = [];

        if (searchType === 'contact') {
          // Contact search with "first name last name" handling like LogCallModal
          let contactQuery = supabase
            .from('contact')
            .select('id, first_name, last_name, company, email, phone, mobile_phone, title');

          const searchTerms = trimmedQuery.split(/\s+/).filter(term => term.length > 0);

          if (searchTerms.length >= 2) {
            // Multi-word search: treat as "first name last name"
            const firstName = searchTerms[0];
            const lastName = searchTerms.slice(1).join(' ');
            contactQuery = contactQuery.or(`and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%),first_name.ilike.%${trimmedQuery}%,last_name.ilike.%${trimmedQuery}%,company.ilike.%${trimmedQuery}%,email.ilike.%${trimmedQuery}%`);
          } else {
            contactQuery = contactQuery.or(`first_name.ilike.%${trimmedQuery}%,last_name.ilike.%${trimmedQuery}%,company.ilike.%${trimmedQuery}%,email.ilike.%${trimmedQuery}%`);
          }

          const { data: contacts, error: contactsError } = await contactQuery
            .order('last_name')
            .limit(20);

          if (contactsError) throw contactsError;

          if (contacts) {
            searchResults = contacts.map((contact) => {
              const firstName = contact.first_name || '';
              const lastName = contact.last_name || '';
              const fullName = `${firstName} ${lastName}`.trim();
              const displayName = fullName || 'Unnamed Contact';

              const contactInfo = [contact.email, contact.phone, contact.mobile_phone]
                .filter(Boolean)[0] || '';

              return {
                id: contact.id,
                type: 'contact' as const,
                title: displayName,
                subtitle: contact.company || contact.title || 'Contact',
                description: contactInfo,
                metadata: '',
                url: `/contact/${contact.id}`
              };
            });
          }
        } else if (searchType === 'deal') {
          // Deal search
          const { data: deals, error: dealsError } = await supabase
            .from('deal')
            .select(`
              *,
              client!client_id (client_name),
              deal_stage (label),
              property (property_name, address, city, state)
            `)
            .or(`deal_name.ilike.%${trimmedQuery}%,sf_broker.ilike.%${trimmedQuery}%,sf_address.ilike.%${trimmedQuery}%`)
            .limit(20);

          if (dealsError) throw dealsError;

          if (deals) {
            searchResults = deals.map((deal: any) => {
              const title = deal.deal_name || 'Unnamed Deal';
              const address = [deal.property?.address, deal.property?.city, deal.property?.state]
                .filter(Boolean).join(', ');

              return {
                id: deal.id,
                type: 'deal' as const,
                title,
                subtitle: deal.client?.client_name || 'No Client',
                description: deal.property?.property_name || address,
                metadata: deal.deal_stage?.label || 'No Stage',
                url: `/deal/${deal.id}`
              };
            });
          }
        } else if (searchType === 'property') {
          // Property search
          const { data: properties, error: propertiesError } = await supabase
            .from('property')
            .select(`
              *,
              property_type (label),
              property_stage (label)
            `)
            .or(`property_name.ilike.%${trimmedQuery}%,address.ilike.%${trimmedQuery}%,city.ilike.%${trimmedQuery}%,state.ilike.%${trimmedQuery}%`)
            .limit(20);

          if (propertiesError) throw propertiesError;

          if (properties) {
            searchResults = properties.map((property: any) => {
              const title = property.property_name || 'Unnamed Property';
              const address = [property.address, property.city, property.state]
                .filter(Boolean).join(', ');

              return {
                id: property.id,
                type: 'property' as const,
                title,
                subtitle: address || 'Property',
                description: property.property_type?.label || '',
                metadata: property.property_stage?.label || '',
                url: `/property/${property.id}`
              };
            });
          }
        } else if (searchType === 'assignment') {
          // Assignment search
          const { data: assignments, error: assignmentsError } = await supabase
            .from('assignment')
            .select('*')
            .or(`assignment_name.ilike.%${trimmedQuery}%,site_criteria.ilike.%${trimmedQuery}%`)
            .limit(20);

          if (assignmentsError) throw assignmentsError;

          if (assignments) {
            searchResults = assignments.map((assignment: any) => {
              const title = assignment.assignment_name || 'Unnamed Assignment';

              return {
                id: assignment.id,
                type: 'assignment' as const,
                title,
                subtitle: 'Assignment',
                description: assignment.site_criteria || assignment.progress || '',
                metadata: '',
                url: `/assignment/${assignment.id}`
              };
            });
          }
        } else if (searchType === 'client') {
          // Client search
          const { data: clients, error: clientsError } = await supabase
            .from('client')
            .select('*')
            .or(`client_name.ilike.%${trimmedQuery}%,description.ilike.%${trimmedQuery}%,sf_client_type.ilike.%${trimmedQuery}%`)
            .limit(20);

          if (clientsError) throw clientsError;

          if (clients) {
            searchResults = clients.map((client: any) => {
              const title = client.client_name || 'Unnamed Client';

              return {
                id: client.id,
                type: 'client' as const,
                title,
                subtitle: client.sf_client_type || 'Client',
                description: client.description || client.website || '',
                metadata: client.website || '',
                url: `/client/${client.id}`
              };
            });
          }
        } else if (searchType === 'site_submit') {
          // Site Submit search
          const { data: siteSubmits, error: siteSubmitsError } = await supabase
            .from('site_submit')
            .select(`
              *,
              client!client_id (client_name),
              property (property_name, address, city, state),
              property_unit (property_unit_name)
            `)
            .or(`site_submit_name.ilike.%${trimmedQuery}%,sf_account.ilike.%${trimmedQuery}%,notes.ilike.%${trimmedQuery}%`)
            .limit(20);

          if (siteSubmitsError) throw siteSubmitsError;

          if (siteSubmits) {
            searchResults = siteSubmits.map((siteSubmit: any) => {
              const title = siteSubmit.site_submit_name || 'Unnamed Site Submit';
              const propertyInfo = siteSubmit.property?.property_name ||
                                 [siteSubmit.property?.address, siteSubmit.property?.city, siteSubmit.property?.state]
                                 .filter(Boolean).join(', ');

              return {
                id: siteSubmit.id,
                type: 'site_submit' as const,
                title,
                subtitle: siteSubmit.client?.client_name || 'No Client',
                description: propertyInfo || '',
                metadata: 'Site Submit',
                url: `/site-submit/${siteSubmit.id}`
              };
            });
          }
        }

        setResults(searchResults);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [query, searchType]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleResultSelect(results[selectedIndex]);
        } else if (results.length > 0) {
          handleResultSelect(results[0]);
        }
        break;
      case 'Escape':
        onClose();
        break;
    }
  };

  const handleResultSelect = (result: SearchResult) => {
    onSelect(result);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'deal':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
          </svg>
        );
      case 'contact':
        return (
          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case 'property':
        return (
          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        );
      case 'assignment':
        return (
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'client':
        return (
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        );
      case 'site_submit':
        return (
          <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-start justify-center p-4 text-center sm:p-0">
          <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="px-6 py-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                  </svg>
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  placeholder={`Search ${searchType}s...`}
                />
                {loading && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Results */}
            <div className="px-6 pb-6">
              {query.trim() && !loading && results.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No results found for "{query}"
                </div>
              )}

              {results.length > 0 && (
                <div className="max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    {results.map((result, index) => (
                      <div
                        key={`${result.type}-${result.id}`}
                        className={`p-4 border border-gray-200 rounded-lg cursor-pointer transition-colors ${
                          index === selectedIndex ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleResultSelect(result)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getTypeIcon(result.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-base font-medium text-gray-900 truncate">
                                {result.title}
                              </p>
                              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                                {result.type}
                              </span>
                            </div>
                            {result.subtitle && (
                              <p className="text-sm text-gray-600 truncate mt-1">
                                {result.subtitle}
                              </p>
                            )}
                            <div className="flex items-center justify-between mt-1">
                              {result.description && (
                                <p className="text-xs text-gray-500 truncate">
                                  {result.description}
                                </p>
                              )}
                              {result.metadata && (
                                <span className="ml-2 text-xs text-gray-400 truncate">
                                  {result.metadata}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-3">
              <div className="flex justify-between items-center text-sm text-gray-500">
                <span>
                  {results.length > 0 && `${results.length} result${results.length === 1 ? '' : 's'} found`}
                </span>
                <span>
                  Press ↑↓ to navigate, Enter to select, Esc to close
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default DedicatedSearchModal;