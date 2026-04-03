import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const WATCHDOG_PARTNER_KEY = Deno.env.get('WATCHDOG_PARTNER_KEY') || ''
const WATCHDOG_BASE_URL = 'https://partner.api.motowatchdog.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!WATCHDOG_PARTNER_KEY) {
      return new Response(
        JSON.stringify({ error: 'WATCHDOG_PARTNER_KEY not configured. Contact support to set up the Moto Watchdog integration.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { action, auth_token, params } = await req.json()

    if (!auth_token) {
      return new Response(
        JSON.stringify({ error: 'auth_token is required. Connect your Moto Watchdog account in Freddy Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build the API URL based on action
    let path = ''
    let method = 'GET'
    let body: string | undefined

    switch (action) {
      // Devices
      case 'devices':
        path = '/devices'
        break
      case 'device_trips':
        path = `/devices/${params?.device_id}/trips`
        break
      case 'device_alerts':
        path = `/devices/${params?.device_id}/alerts`
        break
      case 'device_geofences':
        path = `/devices/${params?.device_id}/geofences`
        break
      case 'device_engine_logs':
        path = `/devices/${params?.device_id}/engine_change_logs`
        break
      case 'update_device':
        path = `/devices/${params?.device_id}`
        method = 'PUT'
        body = JSON.stringify(params?.data)
        break

      // Alerts
      case 'alerts':
        path = '/alerts'
        break

      // Geofences
      case 'geofences':
        path = '/geofences'
        break
      case 'create_geofence':
        path = '/geofences'
        method = 'POST'
        body = JSON.stringify(params?.data)
        break
      case 'update_geofence':
        path = `/geofences/${params?.geofence_id}`
        method = 'PUT'
        body = JSON.stringify(params?.data)
        break
      case 'delete_geofence':
        path = `/geofences/${params?.geofence_id}`
        method = 'DELETE'
        break
      case 'geofence_logs':
        path = `/geofences/${params?.geofence_id}/logs`
        break

      // Trips
      case 'trips':
        path = '/trips'
        break
      case 'trips_in_progress':
        path = '/trips/in_progress'
        break
      case 'trips_completed':
        path = '/trips/completed'
        break
      case 'trips_between': {
        const qs = new URLSearchParams()
        if (params?.start_date) qs.set('start_date', params.start_date)
        if (params?.end_date) qs.set('end_date', params.end_date)
        path = `/trips/between?${qs.toString()}`
        break
      }
      case 'trip_detail':
        path = `/trips/${params?.trip_id}`
        break
      case 'trip_locations':
        path = `/trips/${params?.trip_id}/locations`
        break

      // Analytics
      case 'analytics':
        path = '/analytics'
        break
      case 'webhook_analytics':
        path = '/webhooks/analytics'
        break

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    // Make the request to Moto Watchdog API
    const url = `${WATCHDOG_BASE_URL}${path}`
    const headers: Record<string, string> = {
      'AUTH_TOKEN': auth_token,
      'PARTNER': WATCHDOG_PARTNER_KEY,
      'Content-Type': 'application/json',
    }

    const fetchOptions: RequestInit = { method, headers }
    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = body
    }

    const response = await fetch(url, fetchOptions)
    const data = await response.json()

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data?.message || data?.error || 'Watchdog API error', status: response.status, details: data }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[watchdog-proxy] Error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
