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

    const {
      company_id: _company_id,
      estimate_id,
      recipient_email,
      pdf_storage_path,
      company_name,
      estimate_number,
      portal_url,
      logo_url,
      business_unit_name,
      business_unit_phone,
      business_unit_email,
      business_unit_address,
      presentation_mode,
      customer_name,
      contract_total,
      down_payment_label,
      down_payment_amount,
    } = await req.json();

    const isInteractive = presentation_mode === 'interactive';
    const isFormal = presentation_mode === 'formal';

    if (!recipient_email || !estimate_id) {
      return new Response(JSON.stringify({ error: 'recipient_email and estimate_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Download PDF from Supabase Storage (PDF estimates only — formal and
    // interactive modes don't attach a PDF since the customer uses the portal)
    let pdfBase64 = '';
    if (pdf_storage_path && !isInteractive && !isFormal) {
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
    const estNum = estimate_number || `EST-${estimate_id}`;
    const totalNum = parseFloat(contract_total) || 0;
    const depositNum = parseFloat(down_payment_amount) || 0;
    const dpLabel = down_payment_label || 'Deposit';
    const greeting = customer_name ? `Hi ${String(customer_name).split(' ')[0]},` : 'Hello,';
    const currency = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Contact info line for footer
    const contactParts: string[] = [];
    if (contactPhone) contactParts.push(contactPhone);
    if (contactEmail) contactParts.push(`<a href="mailto:${contactEmail}" style="color:#5a6349;text-decoration:none;">${contactEmail}</a>`);
    if (contactAddress) contactParts.push(contactAddress);
    const contactLine = contactParts.join(' &nbsp;&bull;&nbsp; ');

    const badgeLabel = isFormal ? `FORMAL PROPOSAL ${estNum}` : isInteractive ? `PROPOSAL ${estNum}` : `ESTIMATE ${estNum}`;
    const subject = isFormal
      ? `Formal Proposal ${estNum} from ${displayName}`
      : isInteractive
        ? `Your Proposal from ${displayName}`
        : `Estimate ${estNum} from ${displayName}`;
    const ctaLabel = isFormal ? 'Review &amp; Sign Proposal' : isInteractive ? 'View Your Proposal' : 'View Estimate Online';

    // Summary table — only for formal (shows contract total + down payment)
    let summaryTable = '';
    if (isFormal && totalNum > 0) {
      let rows = `
        <tr>
          <td style="padding:10px 0;color:#4d5a52;font-size:13px;border-bottom:1px solid #f0ece4;">Contract Total</td>
          <td style="padding:10px 0;color:#2c3530;font-size:13px;text-align:right;border-bottom:1px solid #f0ece4;font-weight:600;">${currency(totalNum)}</td>
        </tr>`;
      if (depositNum > 0) {
        rows += `
        <tr>
          <td style="padding:14px 0;color:#2c3530;font-size:15px;font-weight:700;">${dpLabel} due upon acceptance</td>
          <td style="padding:14px 0;color:#5a6349;font-size:15px;font-weight:700;text-align:right;">${currency(depositNum)}</td>
        </tr>`;
      }
      summaryTable = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
        ${rows}
      </table>`;
    }

    const introCopy = isFormal
      ? `We've prepared a formal proposal for your review. This is a complete legal agreement${totalNum > 0 ? ` for <strong style="color:#2c3530;">${currency(totalNum)}</strong>` : ''}. You can read it top-to-bottom, digitally sign it, and optionally pay the ${dpLabel.toLowerCase()} online using the secure link below.`
      : isInteractive
        ? `We've prepared a detailed proposal for your review. Click below to view your interactive proposal with project details, cost breakdown, and projected savings.`
        : `Thank you for your interest. Please find your estimate attached to this email as a PDF document.`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f3f1ea;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Main Card -->
    <div style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #e8e4db;">

      <!-- Header with accent background -->
      <div style="background-color:#5a6349;padding:28px 32px;">
        ${logo_url ? `<div style="text-align:center;margin-bottom:12px;"><img src="${logo_url}" alt="${displayName}" style="max-height:48px;max-width:180px;object-fit:contain;" /></div>` : ''}
        <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;text-align:center;">${displayName}</h1>
        ${contactAddress ? `<p style="color:rgba(255,255,255,0.7);font-size:12px;margin:6px 0 0;text-align:center;">${contactAddress}</p>` : ''}
      </div>

      <!-- Badge -->
      <div style="text-align:center;padding:20px 32px 0;">
        <div style="display:inline-block;background-color:rgba(90,99,73,0.08);padding:8px 20px;border-radius:24px;">
          <span style="color:#5a6349;font-size:14px;font-weight:600;letter-spacing:0.3px;">${badgeLabel}</span>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:24px 32px 0;">
        <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 6px 0;">${greeting}</p>
        <p style="color:#4d5a52;font-size:14px;line-height:1.7;margin:0 0 20px 0;">${introCopy}</p>
        ${summaryTable}
      </div>

      <!-- CTA -->
      ${portal_url ? `
      <div style="padding:0 32px 24px;text-align:center;">
        <a href="${portal_url}" style="display:inline-block;padding:16px 48px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;border-radius:10px;letter-spacing:0.3px;">
          ${ctaLabel}
        </a>
        ${isFormal ? `<p style="color:#7d8a7f;font-size:12px;margin:10px 0 0;">Secure signature and online payment. Link expires in 30 days.</p>` : ''}
      </div>
      ` : ''}

      <!-- Footer -->
      <div style="background-color:#f9f8f4;padding:20px 32px;border-top:1px solid #e8e4db;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <p style="color:#5a6349;font-size:13px;font-weight:600;margin:0 0 4px 0;">${displayName}</p>
              ${contactLine ? `<p style="color:#7d8a7f;font-size:11px;margin:0;line-height:1.6;">${contactLine}</p>` : ''}
            </td>
          </tr>
        </table>
      </div>

    </div>

    <!-- Sub-footer -->
    <p style="text-align:center;color:#b4b9af;font-size:10px;margin:16px 0 0;">
      Questions? ${contactPhone ? `Call ${contactPhone} or ` : ''}${contactEmail ? `email ${contactEmail}` : 'contact us'}
    </p>
  </div>
</body>
</html>`;

    // Send via Resend API
    const emailPayload: Record<string, unknown> = {
      from: `${displayName} <estimates@appsannex.com>`,
      to: [recipient_email],
      subject,
      html: htmlBody,
    };

    // Attach PDF if available (only for non-interactive, non-formal)
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
    return new Response(JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
