import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { companyId, employeeId, email, password, callerEmployeeId } = await req.json();

    if (!companyId || !employeeId || !email || !password) {
      return jsonResponse({ error: 'companyId, employeeId, email, and password are required' }, 400);
    }

    if (password.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters' }, 400);
    }

    // Verify caller is in the same company (security check)
    if (callerEmployeeId) {
      const { data: caller } = await supabase
        .from('employees')
        .select('id, company_id, user_role, is_admin, is_developer')
        .eq('id', callerEmployeeId)
        .eq('company_id', companyId)
        .single();

      if (!caller) {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }

      // Must be Admin+ to set credentials
      const adminRoles = ['Admin', 'Super Admin', 'Developer'];
      if (!caller.is_admin && !caller.is_developer && !adminRoles.includes(caller.user_role)) {
        return jsonResponse({ error: 'Only admins can set employee credentials' }, 403);
      }
    }

    // Verify the employee belongs to the company
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, email, name')
      .eq('id', employeeId)
      .eq('company_id', companyId)
      .single();

    if (empError || !employee) {
      return jsonResponse({ error: 'Employee not found in this company' }, 404);
    }

    // Check if an auth user already exists with this email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const existingUser = (users || []).find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      // Update the existing auth user's password
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { password, email_confirm: true }
      );

      if (updateError) {
        return jsonResponse({ error: 'Failed to update password: ' + updateError.message }, 500);
      }
    } else {
      // Create a new auth user with confirmed email (no verification email sent)
      const { error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        return jsonResponse({ error: 'Failed to create auth account: ' + createError.message }, 500);
      }
    }

    // Update the employee's email if it changed
    if (employee.email !== email) {
      await supabase
        .from('employees')
        .update({ email, updated_at: new Date().toISOString() })
        .eq('id', employeeId);
    }

    return jsonResponse({
      success: true,
      message: existingUser ? 'Password updated' : 'Account created',
      email,
    });

  } catch (error) {
    console.error('set-employee-credentials error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});
