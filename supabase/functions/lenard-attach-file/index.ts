import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const companyId = Deno.env.get('LENARD_COMPANY_ID');
    if (!key || !companyId) {
      return new Response(JSON.stringify({ error: 'Server configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const leadId = formData.get('leadId') as string;
    const fileName = formData.get('fileName') as string;
    const fileType = formData.get('fileType') as string;
    const bucket = (formData.get('bucket') as string) || 'project-documents';

    if (!file || !leadId || !fileName) {
      return new Response(JSON.stringify({ error: 'Missing file, leadId, or fileName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Upload file to Supabase Storage
    const filePath = `leads/${leadId}/${Date.now()}_${fileName}`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
        'Content-Type': fileType || 'application/octet-stream',
      },
      body: fileBytes,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Storage upload failed: ${err}`);
    }

    // Insert record into file_attachments table
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/file_attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        company_id: parseInt(companyId),
        lead_id: parseInt(leadId),
        file_name: fileName,
        file_path: filePath,
        file_type: fileType || null,
        file_size: fileBytes.length,
        storage_bucket: bucket,
      }),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      throw new Error(`DB insert failed: ${err}`);
    }

    const [record] = await insertRes.json();

    // Optionally update lead status (e.g., to "Won" after contract signing)
    const updateStatus = formData.get('updateStatus') as string;
    if (updateStatus && leadId) {
      await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${key}`,
          'apikey': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: updateStatus, updated_at: new Date().toISOString() }),
      });
    }

    return new Response(JSON.stringify({ success: true, attachment: record }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
