import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
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
      return jsonResponse({ success: false, error: 'companyId, employeeId, email, and password are required' });
    }

    if (password.length < 6) {
      return jsonResponse({ success: false, error: 'Password must be at least 6 characters' });
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
        return jsonResponse({ success: false, error: 'Unauthorized' });
      }

      // Must be Admin+ to set credentials
      const adminRoles = ['Admin', 'Super Admin', 'Developer'];
      if (!caller.is_admin && !caller.is_developer && !adminRoles.includes(caller.user_role)) {
        return jsonResponse({ success: false, error: 'Only admins can set employee credentials' });
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
      return jsonResponse({ success: false, error: 'Employee not found in this company' });
    }

    // Try to create the auth user first; if they already exist, update instead
    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let existingUser = false;

    if (createError) {
      // User already exists — find them and update password
      if (createError.message?.includes('already been registered') || (createError as any).status === 422) {
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

        if (listError) {
          return jsonResponse({ success: false, error: 'Failed to look up existing user: ' + listError.message });
        }

        const found = (users || []).find(
          (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
        );

        if (!found) {
          return jsonResponse({ success: false, error: 'User exists but could not be found for update' });
        }

        const { error: updateError } = await supabase.auth.admin.updateUserById(
          found.id,
          { password, email_confirm: true }
        );

        if (updateError) {
          return jsonResponse({ success: false, error: 'Failed to update password: ' + updateError.message });
        }

        existingUser = true;
      } else {
        return jsonResponse({ success: false, error: 'Failed to create auth account: ' + createError.message });
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
    return jsonResponse({ success: false, error: error.message });
  }
});
