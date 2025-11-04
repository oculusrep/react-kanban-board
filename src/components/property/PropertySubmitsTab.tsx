import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';
import SiteSubmitItem from '../sidebar/SiteSubmitItem';

type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];

interface PropertySubmitsTabProps {
  propertyId: string;
  onSiteSubmitClick?: (siteSubmitId: string) => void;
}

/**
 * Displays site submits associated with a property
 * Used in Property Details slideout
 */
export default function PropertySubmitsTab({ propertyId, onSiteSubmitClick }: PropertySubmitsTabProps) {
  const [siteSubmits, setSiteSubmits] = useState<SiteSubmit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSiteSubmits = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('site_submit')
          .select(`
            *,
            client!client_id (
              client_name
            ),
            property_unit (
              property_unit_name
            ),
            submit_stage!site_submit_submit_stage_id_fkey (
              name
            ),
            assignment!assignment_id (
              assignment_name
            )
          `)
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

        setSiteSubmits(data || []);
      } catch (err) {
        console.error('Error fetching site submits:', err);
        setError(err instanceof Error ? err.message : 'Failed to load site submits');
      } finally {
        setLoading(false);
      }
    };

    if (propertyId) {
      fetchSiteSubmits();
    }
  }, [propertyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500 text-sm">Loading site submits...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="text-red-500 font-medium text-sm mb-1">Error loading site submits</div>
          <div className="text-gray-600 text-xs">{error}</div>
        </div>
      </div>
    );
  }

  if (siteSubmits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="text-gray-500 text-sm">No site submits for this property</div>
        <div className="text-gray-400 text-xs mt-1">Site submits will appear here when created</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">
          Site Submits ({siteSubmits.length})
        </h3>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {siteSubmits.map((siteSubmit) => (
          <SiteSubmitItem
            key={siteSubmit.id}
            siteSubmit={siteSubmit}
            onClick={onSiteSubmitClick}
          />
        ))}
      </div>
    </div>
  );
}
