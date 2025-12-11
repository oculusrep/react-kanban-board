/**
 * Deal Synopsis Edge Function
 *
 * Generates AI-powered deal synopses by analyzing:
 * - All activities (tasks, calls, emails) for a deal
 * - Recent corrections for context
 *
 * Can be triggered:
 * 1. On-demand for a specific deal
 * 2. Scheduled for all active deals
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  generateDealSynopsis,
  ActivityForSynopsis,
} from '../_shared/gemini.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const DEFAULT_STALLED_DAYS = 7;

interface SynopsisRequest {
  deal_id?: string; // Specific deal, or null for all active deals
  force_refresh?: boolean;
}

interface SynopsisResult {
  deal_id: string;
  deal_name: string;
  synopsis: any;
  activity_count: number;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: SynopsisResult[] = [];

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    let dealId: string | null = null;
    let forceRefresh = false;

    try {
      const body: SynopsisRequest = await req.json();
      dealId = body.deal_id || null;
      forceRefresh = body.force_refresh || false;
    } catch {
      // No body - process all active deals
    }

    // Fetch deals to process
    let dealsQuery = supabase
      .from('deal')
      .select('id, name')
      .in('stage', ['Active', 'Pending', 'Negotiating', 'Under Contract', 'LOI']);

    if (dealId) {
      dealsQuery = supabase
        .from('deal')
        .select('id, name')
        .eq('id', dealId);
    }

    const { data: deals, error: dealsError } = await dealsQuery.limit(50);

    if (dealsError) {
      throw new Error(`Failed to fetch deals: ${dealsError.message}`);
    }

    if (!deals || deals.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No deals to process', results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing synopses for ${deals.length} deal(s)`);

    // Process each deal
    for (const deal of deals) {
      const result: SynopsisResult = {
        deal_id: deal.id,
        deal_name: deal.name || 'Unnamed Deal',
        synopsis: null,
        activity_count: 0,
      };

      try {
        // Check if we have a recent synopsis (skip if not forcing refresh)
        if (!forceRefresh) {
          const { data: existingSynopsis } = await supabase
            .from('deal_synopsis')
            .select('generated_at')
            .eq('deal_id', deal.id)
            .single();

          if (existingSynopsis) {
            const age = Date.now() - new Date(existingSynopsis.generated_at).getTime();
            const maxAge = 6 * 60 * 60 * 1000; // 6 hours

            if (age < maxAge) {
              console.log(`Skipping ${deal.name} - synopsis is recent`);
              continue;
            }
          }
        }

        // Fetch all activities for this deal
        const { data: activities, error: activitiesError } = await supabase
          .from('activity')
          .select(`
            id,
            subject,
            description,
            activity_date,
            completed_at,
            direction,
            activity_type:activity_type_id (name),
            activity_status:status_id (is_closed),
            contact:contact_id (first_name, last_name)
          `)
          .eq('deal_id', deal.id)
          .order('activity_date', { ascending: true });

        if (activitiesError) {
          throw new Error(`Failed to fetch activities: ${activitiesError.message}`);
        }

        result.activity_count = activities?.length || 0;

        if (!activities || activities.length === 0) {
          // No activities - create a basic synopsis
          await supabase.from('deal_synopsis').upsert(
            {
              deal_id: deal.id,
              ball_in_court: 'Unknown',
              ball_in_court_type: 'unknown',
              status_summary: 'No activity recorded for this deal yet.',
              alert_level: 'yellow',
              alert_reason: 'No activities to analyze',
              days_since_activity: null,
              generated_at: new Date().toISOString(),
            },
            { onConflict: 'deal_id' }
          );

          result.synopsis = { alert_level: 'yellow', message: 'No activities' };
          results.push(result);
          continue;
        }

        // Transform activities for AI
        const activitiesForAI: ActivityForSynopsis[] = activities.map((a: any) => ({
          id: a.id,
          activity_type: a.activity_type?.name || 'Task',
          subject: a.subject,
          description: a.description,
          activity_date: a.activity_date,
          completed_at: a.completed_at,
          is_completed: a.activity_status?.is_closed || false,
          direction: a.direction,
          contact_name: a.contact
            ? `${a.contact.first_name} ${a.contact.last_name}`
            : undefined,
        }));

        // Calculate days since last activity
        const lastActivity = activities[activities.length - 1];
        const lastActivityDate = lastActivity?.activity_date
          ? new Date(lastActivity.activity_date)
          : null;
        const daysSinceActivity = lastActivityDate
          ? Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        // Generate synopsis with AI
        const synopsis = await generateDealSynopsis(
          deal.name || 'Deal',
          activitiesForAI,
          DEFAULT_STALLED_DAYS,
          GEMINI_API_KEY
        );

        // Store synopsis
        await supabase.from('deal_synopsis').upsert(
          {
            deal_id: deal.id,
            ball_in_court: synopsis.ball_in_court,
            ball_in_court_type: synopsis.ball_in_court_type,
            status_summary: synopsis.status_summary,
            key_document_status: synopsis.key_document_status,
            alert_level: synopsis.alert_level,
            alert_reason: synopsis.alert_reason,
            last_activity_at: lastActivityDate?.toISOString(),
            days_since_activity: daysSinceActivity,
            stalled_threshold_days: DEFAULT_STALLED_DAYS,
            synopsis_json: synopsis,
            generated_at: new Date().toISOString(),
          },
          { onConflict: 'deal_id' }
        );

        result.synopsis = synopsis;
        console.log(`Generated synopsis for ${deal.name}: ${synopsis.alert_level}`);
      } catch (dealError: any) {
        console.error(`Error processing deal ${deal.id}:`, dealError);
        result.error = dealError.message;
      }

      results.push(result);
    }

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        processed: results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in deal-synopsis:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        results,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
