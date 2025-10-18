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
      // Search Deals with multi-stage approach
      if (types.includes('deal')) {
        console.log('🔍 Searching deals...');

        // Exact + prefix match on deal_name
        const { data: exactDeals } = await supabase
          .from('deal')
          .select(`
            *,
            client!client_id (client_name),
            deal_stage (label, sort_order),
            property (property_name, address, city, state)
          `)
          .ilike('deal_name', trimmedQuery)
          .limit(5);

        const { data: prefixDeals } = await supabase
          .from('deal')
          .select(`
            *,
            client!client_id (client_name),
            deal_stage (label, sort_order),
            property (property_name, address, city, state)
          `)
          .ilike('deal_name', `${trimmedQuery}%`)
          .limit(15);

        const fuzzyQuery = buildFuzzyOrQuery(['deal_name', 'sf_broker', 'sf_address'], trimmedQuery);
        const { data: fuzzyDeals, error: dealsError } = await supabase
          .from('deal')
          .select(`
            *,
            client!client_id (client_name),
            deal_stage (label, sort_order),
            property (property_name, address, city, state)
          `)
          .or(fuzzyQuery)
          .limit(30);

        if (dealsError) throw dealsError;

        const seenIds = new Set<string>();
        const allDeals = [];
        for (const deal of [...(exactDeals || []), ...(prefixDeals || []), ...(fuzzyDeals || [])]) {
          if (!seenIds.has(deal.id)) {
            seenIds.add(deal.id);
            allDeals.push(deal);
          }
        }

        console.log(`📊 Found ${allDeals.length} deals (exact: ${exactDeals?.length || 0}, prefix: ${prefixDeals?.length || 0}, fuzzy: ${fuzzyDeals?.length || 0})`);

        if (allDeals.length > 0) {
          allDeals.forEach((deal: any) => {
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

      // Search Clients with multi-stage approach
      if (types.includes('client')) {
        const { data: exactClients } = await supabase
          .from('client')
          .select('*')
          .ilike('client_name', trimmedQuery)
          .limit(5);

        const { data: prefixClients } = await supabase
          .from('client')
          .select('*')
          .ilike('client_name', `${trimmedQuery}%`)
          .limit(15);

        const fuzzyQuery = buildFuzzyOrQuery(['client_name', 'description', 'sf_client_type'], trimmedQuery);
        const { data: fuzzyClients, error: clientsError } = await supabase
          .from('client')
          .select('*')
          .or(fuzzyQuery)
          .limit(30);

        if (clientsError) throw clientsError;

        const seenIds = new Set<string>();
        const allClients = [];
        for (const client of [...(exactClients || []), ...(prefixClients || []), ...(fuzzyClients || [])]) {
          if (!seenIds.has(client.id)) {
            seenIds.add(client.id);
            allClients.push(client);
          }
        }

        if (allClients.length > 0) {
          allClients.forEach((client) => {
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
          .limit(Math.max(150, Math.ceil(limit / types.length) * 20));

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

      // Search Properties with multi-stage approach for better performance
      if (types.includes('property')) {
        console.log('🏢 Searching properties with query:', trimmedQuery);

        // Stage 1: Try exact match first (fastest)
        const { data: exactMatches } = await supabase
          .from('property')
          .select(`
            *,
            property_type (label),
            property_stage (label)
          `)
          .ilike('property_name', trimmedQuery)
          .limit(5);

        // Stage 2: Try prefix match (starts with)
        const { data: prefixMatches } = await supabase
          .from('property')
          .select(`
            *,
            property_type (label),
            property_stage (label)
          `)
          .ilike('property_name', `${trimmedQuery}%`)
          .limit(20);

        // Stage 3: Try broader fuzzy match only if needed
        const fuzzyQuery = buildFuzzyOrQuery(['property_name', 'address', 'city', 'state', 'trade_area'], trimmedQuery);
        const { data: fuzzyMatches, error: propertiesError } = await supabase
          .from('property')
          .select(`
            *,
            property_type (label),
            property_stage (label)
          `)
          .or(fuzzyQuery)
          .limit(50); // Much smaller limit now

        if (propertiesError) throw propertiesError;

        // Combine and deduplicate results
        const seenIds = new Set<string>();
        const allProperties = [];

        for (const prop of [...(exactMatches || []), ...(prefixMatches || []), ...(fuzzyMatches || [])]) {
          if (!seenIds.has(prop.id)) {
            seenIds.add(prop.id);
            allProperties.push(prop);
          }
        }

        console.log(`🏢 Found ${allProperties.length} properties (exact: ${exactMatches?.length || 0}, prefix: ${prefixMatches?.length || 0}, fuzzy: ${fuzzyMatches?.length || 0})`);

        if (allProperties.length > 0) {
          allProperties.forEach((property: any) => {
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

      // Search Site Submits with multi-stage approach
      if (types.includes('site_submit')) {
        console.log('🔍 Searching site submits...');

        const { data: exactSubmits } = await supabase
          .from('site_submit')
          .select(`
            *,
            client!client_id (client_name),
            property (property_name, address, city, state),
            property_unit (property_unit_name)
          `)
          .ilike('site_submit_name', trimmedQuery)
          .limit(5);

        const { data: prefixSubmits } = await supabase
          .from('site_submit')
          .select(`
            *,
            client!client_id (client_name),
            property (property_name, address, city, state),
            property_unit (property_unit_name)
          `)
          .ilike('site_submit_name', `${trimmedQuery}%`)
          .limit(15);

        const fuzzyQuery = buildFuzzyOrQuery(['site_submit_name', 'sf_account', 'notes'], trimmedQuery);
        const { data: fuzzySubmits, error: siteSubmitsError } = await supabase
          .from('site_submit')
          .select(`
            *,
            client!client_id (client_name),
            property (property_name, address, city, state),
            property_unit (property_unit_name)
          `)
          .or(fuzzyQuery)
          .limit(30);

        if (siteSubmitsError) throw siteSubmitsError;

        const seenIds = new Set<string>();
        const allSubmits = [];
        for (const submit of [...(exactSubmits || []), ...(prefixSubmits || []), ...(fuzzySubmits || [])]) {
          if (!seenIds.has(submit.id)) {
            seenIds.add(submit.id);
            allSubmits.push(submit);
          }
        }

        console.log(`📋 Found ${allSubmits.length} site submits (exact: ${exactSubmits?.length || 0}, prefix: ${prefixSubmits?.length || 0}, fuzzy: ${fuzzySubmits?.length || 0})`);

        if (allSubmits.length > 0) {
          allSubmits.forEach((siteSubmit: any) => {
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
          .limit(Math.max(150, Math.ceil(limit / types.length) * 20));

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
      // Priority order: Contacts, Deals, Properties, Clients, Assignments, Site Submits
      const typePriority = { contact: 1, deal: 2, property: 3, client: 4, assignment: 5, site_submit: 6 };
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