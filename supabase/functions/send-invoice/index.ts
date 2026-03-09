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
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const {
      company_id,
      invoice_id,
      recipient_email,
      pdf_storage_path,
      company_name,
      invoice_number,
      amount,
      portal_url,
      business_unit_name,
      business_unit_phone,
      business_unit_email,
      business_unit_address,
    } = await req.json();

    if (!recipient_email || !invoice_id) {
      return new Response(JSON.stringify({ error: 'recipient_email and invoice_id are required' }),
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

    // Resolve branding
    const displayName = business_unit_name || company_name || 'Our Company';
    const contactPhone = business_unit_phone || '';
    const contactEmail = business_unit_email || '';
    const contactAddress = business_unit_address || '';
    const invNum = invoice_number || `INV-${invoice_id}`;
    const amountStr = amount ? `$${parseFloat(amount).toFixed(2)}` : '';

    // Build contact info line for footer
    const contactParts: string[] = [];
    if (contactPhone) contactParts.push(contactPhone);
    if (contactEmail) contactParts.push(contactEmail);
    if (contactAddress) contactParts.push(contactAddress);
    const contactLine = contactParts.join(' &nbsp;|&nbsp; ');

    // Portal CTA button
    const portalButton = portal_url ? `
      <div style="text-align:center;margin:28px 0 8px 0;">
        <a href="${portal_url}" style="display:inline-block;padding:14px 36px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
          View &amp; Pay Invoice
        </a>
      </div>
      <p style="text-align:center;color:#7d8a7f;font-size:12px;margin:8px 0 0 0;">
        Click above to view your invoice online and make a payment.
      </p>
    ` : '';

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f7f5ef;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Accent bar -->
    <div style="height:4px;background-color:#5a6349;border-radius:4px 4px 0 0;"></div>

    <div style="background-color:#ffffff;border-radius:0 0 12px 12px;padding:40px 32px;border:1px solid #d6cdb8;border-top:none;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:28px;">
        <h1 style="color:#3e4532;font-size:26px;margin:0 0 6px 0;font-weight:700;">${displayName}</h1>
        <div style="display:inline-block;background-color:rgba(90,99,73,0.1);padding:6px 16px;border-radius:20px;">
          <span style="color:#5a6349;font-size:14px;font-weight:600;">Invoice ${invNum}${amountStr ? ` &mdash; ${amountStr}` : ''}</span>
        </div>
      </div>

      <!-- Body -->
      <div style="border-top:1px solid #e8e4db;padding-top:24px;">
        <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
          Please find your invoice attached to this email as a PDF document.${amountStr ? ` The total amount due is <strong>${amountStr}</strong>.` : ''}
        </p>
        <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
          If you have any questions about this invoice, please don't hesitate to reach out${contactPhone ? ` at <strong>${contactPhone}</strong>` : ''}.
        </p>

        ${portalButton}
      </div>

      <!-- Footer -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e8e4db;text-align:center;">
        <p style="color:#5a6349;font-size:13px;font-weight:600;margin:0 0 4px 0;">${displayName}</p>
        ${contactLine ? `<p style="color:#7d8a7f;font-size:11px;margin:0 0 8px 0;">${contactLine}</p>` : ''}
        <p style="color:#b4b9af;font-size:10px;margin:0;">
          Sent via Job Scout
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;

    // Send via Resend API
    const emailPayload: Record<string, unknown> = {
      from: `${displayName} <invoices@jobscout.appsannex.com>`,
      to: [recipient_email],
      subject: `Invoice ${invNum} from ${displayName}`,
      html: htmlBody,
    };

    // Attach PDF if available
    if (pdfBase64) {
      emailPayload.attachments = [{
        filename: `${invNum}.pdf`,
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
    console.error('send-invoice error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
