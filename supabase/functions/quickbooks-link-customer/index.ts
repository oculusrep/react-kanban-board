import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  logSync,
  postgrestQuery,
  postgrestUpdate
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LinkCustomerRequest {
  clientId: string
  qbCustomerId: string
  qbDisplayName?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authorization header is present
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !secretKey) {
      throw new Error('Supabase configuration missing')
    }

    // Get request body
    const { clientId, qbCustomerId, qbDisplayName } = await req.json() as LinkCustomerRequest

    if (!clientId || !qbCustomerId) {
      return new Response(
        JSON.stringify({ error: 'clientId and qbCustomerId are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Verify the client exists
    const clients = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'client',
      `select=id,client_name,qb_customer_id&id=eq.${clientId}`
    )

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const client = clients[0]

    // Check if already linked to a different QB customer
    if (client.qb_customer_id && client.qb_customer_id !== qbCustomerId) {
      return new Response(
        JSON.stringify({
          error: `Client is already linked to a different QuickBooks customer (${client.qb_customer_id}). Unlink first.`,
          existingQbCustomerId: client.qb_customer_id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Update the client with the QB customer ID
    await postgrestUpdate(supabaseUrl, secretKey, 'client', `id=eq.${clientId}`, {
      qb_customer_id: qbCustomerId
    })

    // Log the link operation
    await logSync(
      supabaseUrl,
      secretKey,
      'customer',
      'outbound',
      'success',
      clientId,
      'client_link',
      qbCustomerId
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: `Linked "${client.client_name}" to QuickBooks customer "${qbDisplayName || qbCustomerId}"`,
        clientId,
        clientName: client.client_name,
        qbCustomerId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Link customer error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to link customer'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
