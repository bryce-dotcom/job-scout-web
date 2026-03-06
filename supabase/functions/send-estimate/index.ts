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
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured. Add it to your Supabase Edge Function secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { company_id, estimate_id, recipient_email, pdf_storage_path, company_name, estimate_number } = await req.json();

    if (!recipient_email || !estimate_id) {
      return new Response(JSON.stringify({ error: 'recipient_email and estimate_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Download PDF from Supabase Storage
    let pdfBase64 = '';
    if (pdf_storage_path) {
      const { data: pdfData, error: dlError } = await supabase.storage
        .from('project-documents')
        .download(pdf_storage_path);

      if (dlError) {
        console.error('PDF download error:', dlError);
        return new Response(JSON.stringify({ error: 'Failed to download PDF: ' + dlError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (pdfData) {
        const arrayBuffer = await pdfData.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        pdfBase64 = btoa(binary);
      }
    }

    // Build email HTML
    const displayName = company_name || 'Our Company';
    const estNum = estimate_number || `EST-${estimate_id}`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f7f5ef;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="background-color:#ffffff;border-radius:12px;padding:32px;border:1px solid #d6cdb8;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#5a6349;font-size:24px;margin:0 0 8px 0;">${displayName}</h1>
        <p style="color:#7d8a7f;font-size:14px;margin:0;">Estimate ${estNum}</p>
      </div>

      <div style="border-top:1px solid #d6cdb8;padding-top:20px;margin-top:20px;">
        <p style="color:#2c3530;font-size:15px;line-height:1.6;">
          Thank you for your interest. Please find your estimate attached to this email as a PDF document.
        </p>
        <p style="color:#2c3530;font-size:15px;line-height:1.6;">
          If you have any questions or would like to proceed, please don't hesitate to reach out.
        </p>
      </div>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #d6cdb8;text-align:center;">
        <p style="color:#7d8a7f;font-size:12px;margin:0;">
          Sent by ${displayName} via Job Scout
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

    // Send via Resend API
    const emailPayload: Record<string, unknown> = {
      from: `${displayName} <estimates@jobscout.appsannex.com>`,
      to: [recipient_email],
      subject: `Estimate ${estNum} from ${displayName}`,
      html: htmlBody,
    };

    // Attach PDF if available
    if (pdfBase64) {
      emailPayload.attachments = [{
        filename: `${estNum}.pdf`,
        content: pdfBase64,
      }];
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      console.error('Resend API error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to send email: ' + errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resendData = await resendRes.json();

    return new Response(JSON.stringify({
      success: true,
      emailId: resendData.id,
      recipient: recipient_email,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('send-estimate error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
