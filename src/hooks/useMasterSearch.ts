import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface SearchResult {
  id: string;
  type: 'deal' | 'client' | 'contact' | 'property' | 'site_submit';
  title: string;
  subtitle?: string;
  description?: string;
  metadata?: string;
  url?: string;
  score?: number; // For relevance scoring
}

interface SearchOptions {
  limit?: number;
  types?: Array<'deal' | 'client' | 'contact' | 'property' | 'site_submit'>;
  includeInactive?: boolean;
}

export const useMasterSearch = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (
    query: string, 
    options: SearchOptions = {}
  ): Promise<SearchResult[]> => {
    const {
      limit = 10,
      types = ['deal', 'client', 'contact', 'property', 'site_submit'],
      includeInactive = false
    } = options;

    if (!query.trim()) {
      return [];
    }

    console.log(`🔍 Starting search for: "${query}" with options:`, options);
    setLoading(true);
    setError(null);
    
    const searchResults: SearchResult[] = [];
    const trimmedQuery = query.trim().toLowerCase();

    try {
      // Search Deals
      if (types.includes('deal')) {
        console.log('🔍 Searching deals...');
        const { data: deals, error: dealsError } = await supabase
          .from('deal')
          .select('*')
          .or(`deal_name.ilike.%${trimmedQuery}%,sf_broker.ilike.%${trimmedQuery}%,sf_address.ilike.%${trimmedQuery}%`)
          .limit(Math.ceil(limit / types.length));

        if (dealsError) throw dealsError;

        if (deals) {
          console.log(`📊 Found ${deals.length} deals:`, deals);
          deals.forEach((deal: any) => {
            const title = deal.deal_name || 'Unnamed Deal';
            const titleMatch = title.toLowerCase().includes(trimmedQuery);
            const brokerMatch = deal.sf_broker?.toLowerCase().includes(trimmedQuery);
            const addressMatch = deal.sf_address?.toLowerCase().includes(trimmedQuery);
            
            // Calculate relevance score
            let score = 0;
            if (title.toLowerCase().startsWith(trimmedQuery)) score += 10;
            else if (titleMatch) score += 5;
            if (brokerMatch) score += 3;
            if (addressMatch) score += 2;

            searchResults.push({
              id: deal.id,
              type: 'deal',
              title,
              subtitle: deal.sf_broker || 'Deal',
              description: deal.sf_address || '',
              metadata: '',
              url: `/deal/${deal.id}`,
              score
            });
          });
        }
      }

      // Search Clients
      if (types.includes('client')) {
        const { data: clients, error: clientsError } = await supabase
          .from('client')
          .select('*')
          .or(`client_name.ilike.%${trimmedQuery}%,description.ilike.%${trimmedQuery}%,sf_client_type.ilike.%${trimmedQuery}%`)
          .limit(Math.ceil(limit / types.length));

        if (clientsError) throw clientsError;

        if (clients) {
          clients.forEach((client) => {
            const title = client.client_name;
            const titleMatch = title.toLowerCase().includes(trimmedQuery);
            
            let score = 0;
            if (title.toLowerCase().startsWith(trimmedQuery)) score += 10;
            else if (titleMatch) score += 5;
            if (client.description?.toLowerCase().includes(trimmedQuery)) score += 4;
            if (client.sf_client_type?.toLowerCase().includes(trimmedQuery)) score += 3;
            
            searchResults.push({
              id: client.id,
              type: 'client',
              title,
              subtitle: 'Client',
              description: client.sf_client_type || client.description || '',
              metadata: client.website || '',
              url: `/client/${client.id}`,
              score
            });
          });
        }
      }

      // Search Contacts
      if (types.includes('contact')) {
        const { data: contacts, error: contactsError } = await supabase
          .from('contact')
          .select('*')
          .or(`first_name.ilike.%${trimmedQuery}%,last_name.ilike.%${trimmedQuery}%,company.ilike.%${trimmedQuery}%,email.ilike.%${trimmedQuery}%,title.ilike.%${trimmedQuery}%`)
          .limit(Math.ceil(limit / types.length));

        if (contactsError) throw contactsError;

        if (contacts) {
          contacts.forEach((contact: any) => {
            const firstName = contact.first_name || '';
            const lastName = contact.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();
            const displayName = fullName || 'Unnamed Contact';
            
            let score = 0;
            if (firstName.toLowerCase().startsWith(trimmedQuery) || 
                lastName.toLowerCase().startsWith(trimmedQuery)) score += 10;
            else if (fullName.toLowerCase().includes(trimmedQuery)) score += 7;
            if (contact.company?.toLowerCase().includes(trimmedQuery)) score += 5;
            if (contact.email?.toLowerCase().includes(trimmedQuery)) score += 4;
            if (contact.title?.toLowerCase().includes(trimmedQuery)) score += 3;
            
            const contactInfo = [contact.email, contact.phone, contact.mobile_phone]
              .filter(Boolean)[0] || '';
            
            searchResults.push({
              id: contact.id,
              type: 'contact',
              title: displayName,
              subtitle: contact.company || contact.title || 'Contact',
              description: contactInfo,
              metadata: contact.source_type || '',
              url: `/contact/${contact.id}`,
              score
            });
          });
        }
      }

      // Search Properties
      if (types.includes('property')) {
        const { data: properties, error: propertiesError } = await supabase
          .from('property')
          .select('*')
          .or(`property_name.ilike.%${trimmedQuery}%,address.ilike.%${trimmedQuery}%,city.ilike.%${trimmedQuery}%,state.ilike.%${trimmedQuery}%,trade_area.ilike.%${trimmedQuery}%`)
          .limit(Math.ceil(limit / types.length));

        if (propertiesError) throw propertiesError;

        if (properties) {
          properties.forEach((property: any) => {
            const title = property.property_name || 'Unnamed Property';
            const titleMatch = title.toLowerCase().includes(trimmedQuery);
            
            let score = 0;
            if (title.toLowerCase().startsWith(trimmedQuery)) score += 10;
            else if (titleMatch) score += 7;
            if (property.address?.toLowerCase().includes(trimmedQuery)) score += 6;
            if (property.city?.toLowerCase().includes(trimmedQuery)) score += 5;
            if (property.state?.toLowerCase().includes(trimmedQuery)) score += 4;
            if (property.trade_area?.toLowerCase().includes(trimmedQuery)) score += 3;
            
            const address = [property.address, property.city, property.state]
              .filter(Boolean).join(', ');
            
            searchResults.push({
              id: property.id,
              type: 'property',
              title,
              subtitle: address || 'Property',
              description: property.trade_area || '',
              metadata: '',
              url: `/property/${property.id}`,
              score
            });
          });
        }
      }

      // Search Site Submits
      if (types.includes('site_submit')) {
        const { data: siteSubmits, error: siteSubmitsError } = await supabase
          .from('site_submit')
          .select(`
            *,
            client!client_id (client_name),
            property (property_name, address, city, state),
            submit_stage (name),
            property_unit (property_unit_name)
          `)
          .or(`site_submit_name.ilike.%${trimmedQuery}%,sf_account.ilike.%${trimmedQuery}%,notes.ilike.%${trimmedQuery}%`)
          .limit(Math.ceil(limit / types.length));

        if (siteSubmitsError) throw siteSubmitsError;

        if (siteSubmits) {
          siteSubmits.forEach((siteSubmit: any) => {
            const title = siteSubmit.site_submit_name || 'Unnamed Site Submit';
            const titleMatch = title.toLowerCase().includes(trimmedQuery);
            
            let score = 0;
            if (title.toLowerCase().startsWith(trimmedQuery)) score += 10;
            else if (titleMatch) score += 7;
            if (siteSubmit.sf_account?.toLowerCase().includes(trimmedQuery)) score += 5;
            if (siteSubmit.notes?.toLowerCase().includes(trimmedQuery)) score += 3;
            
            const propertyInfo = siteSubmit.property?.property_name || 
                               [siteSubmit.property?.address, siteSubmit.property?.city, siteSubmit.property?.state]
                               .filter(Boolean).join(', ');
            
            searchResults.push({
              id: siteSubmit.id,
              type: 'site_submit',
              title,
              subtitle: siteSubmit.client?.client_name || 'No Client',
              description: propertyInfo,
              metadata: siteSubmit.submit_stage?.name || 'No Stage',
              url: `/site-submit/${siteSubmit.id}`,
              score
            });
          });
        }
      }

      // Sort results by score (highest first), then by type priority, then alphabetically
      const typePriority = { deal: 1, property: 2, client: 3, contact: 4, site_submit: 5 };
      searchResults.sort((a, b) => {
        // Primary sort by score
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        
        // Secondary sort by type priority
        const priorityDiff = typePriority[a.type] - typePriority[b.type];
        if (priorityDiff !== 0) return priorityDiff;
        
        // Tertiary sort alphabetically
        return a.title.localeCompare(b.title);
      });

      const finalResults = searchResults.slice(0, limit);
      console.log(`✅ Search completed. Found ${searchResults.length} total results, returning ${finalResults.length}`);
      console.log('Final results:', finalResults);
      return finalResults;

    } catch (err) {
      console.error('❌ Search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const searchByType = useCallback(async (
    query: string,
    type: 'deal' | 'client' | 'contact' | 'property' | 'site_submit',
    limit: number = 10
  ): Promise<SearchResult[]> => {
    return search(query, { types: [type], limit });
  }, [search]);

  return {
    search,
    searchByType,
    loading,
    error
  };
};