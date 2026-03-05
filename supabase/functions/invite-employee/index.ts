import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { companyId, email, name, role, userRole, invitedById } = await req.json();

    if (!companyId || !email || !name) {
      return new Response(JSON.stringify({ error: 'companyId, email, and name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 1. Verify caller belongs to company
    if (invitedById) {
      const { data: caller, error: callerError } = await supabase
        .from('employees')
        .select('id, company_id')
        .eq('id', invitedById)
        .eq('company_id', companyId)
        .single();

      if (callerError || !caller) {
        return new Response(JSON.stringify({ error: 'Unauthorized: caller not found in company' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // 2. Check if employee already exists
    const { data: existingEmployee } = await supabase
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('email', email)
      .single();

    if (existingEmployee) {
      return new Response(JSON.stringify({ error: 'An employee with this email already exists' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Create employee record (active immediately so they appear in the team)
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .insert({
        company_id: companyId,
        name,
        email,
        role: role || 'Field Tech',
        user_role: userRole || 'User',
        active: true
      })
      .select()
      .single();

    if (empError) {
      return new Response(JSON.stringify({ error: 'Failed to create employee: ' + empError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Create invitation record
    const { data: invitation, error: invError } = await supabase
      .from('employee_invitations')
      .insert({
        company_id: companyId,
        email,
        role: role || 'Field Tech',
        user_role: userRole || 'User',
        invited_by: invitedById || null,
        status: 'pending'
      })
      .select()
      .single();

    if (invError) {
      console.error('Invitation record error (non-fatal):', invError);
    }

    // 5. Send invite email via Supabase Auth
    const siteUrl = Deno.env.get('SITE_URL') || 'https://jobscout.appsannex.com';
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback`
    });

    if (inviteError) {
      console.error('Invite email error:', inviteError);
      // Don't fail — employee record is created, they can still sign up manually
    }

    return new Response(JSON.stringify({
      success: true,
      employeeId: employee.id,
      invitationId: invitation?.id || null,
      emailSent: !inviteError
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
