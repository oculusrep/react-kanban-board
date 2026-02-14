/**
 * CFO Query Edge Function
 *
 * Natural language query interface for the CFO Agent.
 * Accepts user queries, runs them through Claude with financial tools,
 * and returns analysis with optional chart specifications.
 *
 * Required Supabase Secrets:
 * - ANTHROPIC_API_KEY: Anthropic API key for Claude access
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { runCFOAgent } from '../_shared/claude-cfo-agent.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CFOQueryRequest {
  query: string;
  conversation_history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  context?: {
    period?: string;
    focus_area?: 'expenses' | 'revenue' | 'cash_flow' | 'ar' | 'general';
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user role (admin only) - uses user table with ovis_role column
    const { data: userData, error: roleError } = await supabase
      .from('user')
      .select('ovis_role')
      .eq('auth_user_id', user.id)
      .single();

    if (roleError || userData?.ovis_role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Access denied. Admin role required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const request: CFOQueryRequest = await req.json();

    if (!request.query || typeof request.query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CFO Query] Processing: "${request.query.substring(0, 100)}..."`);

    // Run the CFO Agent (using the service role client we already have)
    const startTime = Date.now();
    const result = await runCFOAgent(
      supabase,
      request.query,
      request.conversation_history || []
    );
    const duration = Date.now() - startTime;

    console.log(`[CFO Query] Completed in ${duration}ms, tools used: ${result.tool_calls_made.join(', ')}`);

    // Store query in audit trail
    const { data: queryRecord, error: insertError } = await supabase
      .from('ai_financial_queries')
      .insert({
        query_text: request.query,
        query_type: request.context?.focus_area || 'general',
        context_used: {
          conversation_history_length: request.conversation_history?.length || 0,
          tools_used: result.tool_calls_made,
          duration_ms: duration,
        },
        response_text: result.answer,
        user_id: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      console.warn('[CFO Query] Failed to store query audit:', insertError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        answer: result.answer,
        chart_spec: result.chart_spec,
        query_id: queryRecord?.id || null,
        tools_used: result.tool_calls_made,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CFO Query] Error:', error);

    // Return detailed error for debugging
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || 'Internal server error',
        errorType: (error as Error).name || 'Unknown',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
