import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildFuzzyOrQuery, calculateRelevanceScore } from '../utils/searchUtils';

export interface SearchResult {
  id: string;
  type: 'deal' | 'client' | 'contact' | 'property' | 'site_submit' | 'assignment';
  title: string;
  subtitle?: string;
  description?: string;
  metadata?: string;
  url?: string;
  score?: number; // For relevance scoring
}

interface SearchOptions {
  limit?: number;
  types?: Array<'deal' | 'client' | 'contact' | 'property' | 'site_submit' | 'assignment'>;
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
      types = ['deal', 'client', 'contact', 'property', 'site_submit', 'assignment'],
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
        const fuzzyQuery = buildFuzzyOrQuery(['deal_name', 'sf_broker', 'sf_address'], trimmedQuery);
        const { data: deals, error: dealsError } = await supabase
          .from('deal')
          .select(`
            *,
            client!client_id (client_name),
            deal_stage (label, sort_order),
            property (property_name, address, city, state)
          `)
          .or(fuzzyQuery)
          .limit(Math.ceil(limit / types.length) * 3); // Fetch more for better fuzzy results

        if (dealsError) throw dealsError;

        if (deals) {
          console.log(`📊 Found ${deals.length} deals:`, deals);
          deals.forEach((deal: any) => {
            const title = deal.deal_name || 'Unnamed Deal';

            // Calculate relevance score using enhanced scoring
            let score = calculateRelevanceScore(title, trimmedQuery, true);
            score += calculateRelevanceScore(deal.sf_broker, trimmedQuery, false) * 0.6;
            score += calculateRelevanceScore(deal.sf_address, trimmedQuery, false) * 0.4;

            const address = [deal.property?.address, deal.property?.city, deal.property?.state]
              .filter(Boolean).join(', ');

            searchResults.push({
              id: deal.id,
              type: 'deal',
              title,
              subtitle: deal.client?.client_name || 'No Client',
              description: deal.property?.property_name || address,
              metadata: deal.deal_stage?.label || 'No Stage',
              url: `/deal/${deal.id}`,
              score
            });
          });
        }
      }

      // Search Clients
      if (types.includes('client')) {
        const fuzzyQuery = buildFuzzyOrQuery(['client_name', 'description', 'sf_client_type'], trimmedQuery);
        const { data: clients, error: clientsError } = await supabase
          .from('client')
          .select('*')
          .or(fuzzyQuery)
          .limit(Math.ceil(limit / types.length) * 3);

        if (clientsError) throw clientsError;

        if (clients) {
          clients.forEach((client) => {
            const title = client.client_name;

            // Enhanced relevance scoring
            let score = calculateRelevanceScore(title, trimmedQuery, true);
            score += calculateRelevanceScore(client.description, trimmedQuery, false) * 0.7;
            score += calculateRelevanceScore(client.sf_client_type, trimmedQuery, false) * 0.5;
            
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
        const fuzzyQuery = buildFuzzyOrQuery(['first_name', 'last_name', 'company', 'email', 'title'], trimmedQuery);
        const { data: contacts, error: contactsError } = await supabase
          .from('contact')
          .select(`
            *,
            client!client_id (client_name)
          `)
          .or(fuzzyQuery)
          .limit(Math.ceil(limit / types.length) * 3);

        if (contactsError) throw contactsError;

        if (contacts) {
          contacts.forEach((contact: any) => {
            const firstName = contact.first_name || '';
            const lastName = contact.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();
            const displayName = fullName || 'Unnamed Contact';

            // Enhanced relevance scoring
            let score = Math.max(
              calculateRelevanceScore(firstName, trimmedQuery, false),
              calculateRelevanceScore(lastName, trimmedQuery, false),
              calculateRelevanceScore(fullName, trimmedQuery, true)
            );
            score += calculateRelevanceScore(contact.company, trimmedQuery, false) * 0.7;
            score += calculateRelevanceScore(contact.email, trimmedQuery, false) * 0.6;
            score += calculateRelevanceScore(contact.title, trimmedQuery, false) * 0.5;
            
            const contactInfo = [contact.email, contact.phone, contact.mobile_phone]
              .filter(Boolean)[0] || '';
            
            searchResults.push({
              id: contact.id,
              type: 'contact',
              title: displayName,
              subtitle: contact.company || contact.title || 'Contact',
              description: contactInfo,
              metadata: contact.client?.client_name || contact.source_type || '',
              url: `/contact/${contact.id}`,
              score
            });
          });
        }
      }

      // Search Properties
      if (types.includes('property')) {
        const fuzzyQuery = buildFuzzyOrQuery(['property_name', 'address', 'city', 'state', 'trade_area'], trimmedQuery);
        console.log('🏢 Searching properties with query:', trimmedQuery);
        const { data: properties, error: propertiesError } = await supabase
          .from('property')
          .select(`
            *,
            property_type (label),
            property_stage (label)
          `)
          .or(fuzzyQuery)
          .limit(Math.ceil(limit / types.length) * 3);

        if (propertiesError) throw propertiesError;

        console.log(`🏢 Found ${properties?.length || 0} properties`);
        if (properties && properties.length > 0) {
          console.log('🏢 First 5 properties:', properties.slice(0, 5).map(p => p.property_name));
        }

        if (properties) {
          properties.forEach((property: any) => {
            const title = property.property_name || 'Unnamed Property';

            // Enhanced relevance scoring
            let score = calculateRelevanceScore(title, trimmedQuery, true);
            score += calculateRelevanceScore(property.address, trimmedQuery, false) * 0.8;
            score += calculateRelevanceScore(property.city, trimmedQuery, false) * 0.7;
            score += calculateRelevanceScore(property.state, trimmedQuery, false) * 0.6;
            score += calculateRelevanceScore(property.trade_area, trimmedQuery, false) * 0.5;

            const address = [property.address, property.city, property.state]
              .filter(Boolean).join(', ');

            searchResults.push({
              id: property.id,
              type: 'property',
              title,
              subtitle: address || 'Property',
              description: property.property_type?.label || property.trade_area || '',
              metadata: property.property_stage?.label || '',
              url: `/property/${property.id}`,
              score
            });
          });
        }
      }

      // Search Site Submits
      if (types.includes('site_submit')) {
        console.log('🔍 Searching site submits...');
        const fuzzyQuery = buildFuzzyOrQuery(['site_submit_name', 'sf_account', 'notes'], trimmedQuery);
        const { data: siteSubmits, error: siteSubmitsError } = await supabase
          .from('site_submit')
          .select(`
            *,
            client!client_id (client_name),
            property (property_name, address, city, state),
            property_unit (property_unit_name)
          `)
          .or(fuzzyQuery)
          .limit(Math.ceil(limit / types.length) * 3);

        if (siteSubmitsError) throw siteSubmitsError;

        if (siteSubmits) {
          console.log(`📋 Found ${siteSubmits.length} site submits:`, siteSubmits);
          siteSubmits.forEach((siteSubmit: any) => {
            const title = siteSubmit.site_submit_name || 'Unnamed Site Submit';

            // Enhanced relevance scoring
            let score = calculateRelevanceScore(title, trimmedQuery, true);
            score += calculateRelevanceScore(siteSubmit.sf_account, trimmedQuery, false) * 0.7;
            score += calculateRelevanceScore(siteSubmit.notes, trimmedQuery, false) * 0.4;
            
            const propertyInfo = siteSubmit.property?.property_name || 
                               [siteSubmit.property?.address, siteSubmit.property?.city, siteSubmit.property?.state]
                               .filter(Boolean).join(', ');
            
            searchResults.push({
              id: siteSubmit.id,
              type: 'site_submit',
              title,
              subtitle: siteSubmit.client?.client_name || 'No Client',
              description: propertyInfo,
              metadata: 'Site Submit',
              url: `/site-submit/${siteSubmit.id}`,
              score
            });
          });
        }
      }

      // Search Assignments
      if (types.includes('assignment')) {
        console.log('🔍 Searching assignments...');
        const fuzzyQuery = buildFuzzyOrQuery(['assignment_name', 'site_criteria'], trimmedQuery);
        const { data: assignments, error: assignmentsError } = await supabase
          .from('assignment')
          .select('*')
          .or(fuzzyQuery)
          .limit(Math.ceil(limit / types.length) * 3);

        if (assignmentsError) throw assignmentsError;

        if (assignments) {
          assignments.forEach((assignment: any) => {
            const title = assignment.assignment_name || 'Unnamed Assignment';

            // Enhanced relevance scoring
            let score = calculateRelevanceScore(title, trimmedQuery, true);
            score += calculateRelevanceScore(assignment.site_criteria, trimmedQuery, false) * 0.7;
            
            searchResults.push({
              id: assignment.id,
              type: 'assignment',
              title,
              subtitle: 'Assignment',
              description: assignment.progress || '',
              metadata: '',
              url: `/assignment/${assignment.id}`,
              score
            });
          });
        }
      }

      // Sort results by score (highest first), then by type priority, then alphabetically
      const typePriority = { deal: 1, property: 2, client: 3, contact: 4, site_submit: 5, assignment: 6 };
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
      console.log('📊 Top 10 results with scores:');
      searchResults.slice(0, 10).forEach((r, i) => {
        console.log(`  ${i+1}. [${r.type}] ${r.title} (score: ${r.score})`);
      });
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
    type: 'deal' | 'client' | 'contact' | 'property' | 'site_submit' | 'assignment',
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