/**
 * Hunter Trigger Run Edge Function
 *
 * Triggers a Hunter agent run. This can either:
 * 1. Proxy to a deployed Hunter agent service (if HUNTER_API_URL is set)
 * 2. Return instructions for running locally
 *
 * The Hunter agent needs to run as a persistent service because it uses
 * Playwright for browser automation which requires more resources and time
 * than edge functions allow.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TriggerRequest {
  action: 'run' | 'status' | 'latest';
  run_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const request = await req.json() as TriggerRequest;
    const hunterApiUrl = Deno.env.get('HUNTER_API_URL');

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // If Hunter API URL is configured, proxy the request
    if (hunterApiUrl) {
      let endpoint: string;
      let method: string = 'GET';

      switch (request.action) {
        case 'run':
          endpoint = `${hunterApiUrl}/run`;
          method = 'POST';
          break;
        case 'status':
          if (request.run_id) {
            endpoint = `${hunterApiUrl}/status/${request.run_id}`;
          } else {
            endpoint = `${hunterApiUrl}/status`;
          }
          break;
        case 'latest':
        default:
          endpoint = `${hunterApiUrl}/status`;
          break;
      }

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      return new Response(
        JSON.stringify(data),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // No Hunter API configured - handle locally via database
    switch (request.action) {
      case 'run': {
        // Create a run request in the database
        // This can be picked up by a locally running Hunter agent
        const { data: runLog, error: runError } = await supabase
          .from('hunter_run_log')
          .insert({
            status: 'pending',
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (runError) {
          throw new Error(`Failed to create run request: ${runError.message}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            run_id: runLog.id,
            status: 'pending',
            message: 'Run request created. Start the Hunter agent locally or deploy it to process this request.',
            instructions: {
              local: 'cd hunter-agent && npm run dev',
              process: 'The agent will pick up pending runs automatically',
            },
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
        if (request.run_id) {
          const { data: runLog, error } = await supabase
            .from('hunter_run_log')
            .select('*')
            .eq('id', request.run_id)
            .single();

          if (error || !runLog) {
            return new Response(
              JSON.stringify({ error: 'Run not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify(runLog),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Fall through to latest
      }

      case 'latest':
      default: {
        const { data: runLog, error } = await supabase
          .from('hunter_run_log')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(1)
          .single();

        if (error || !runLog) {
          return new Response(
            JSON.stringify({
              error: 'No runs found',
              message: 'No Hunter runs have been executed yet. Trigger a run to get started.',
            }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify(runLog),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

  } catch (error) {
    console.error('[Hunter Trigger] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
