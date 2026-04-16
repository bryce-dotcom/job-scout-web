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
      discount,
      job_description,
      invoice_lines,
      customer_name,
      portal_url,
      logo_url,
      due_date,
      business_unit_name,
      business_unit_phone,
      business_unit_email,
      business_unit_address,
      payment_methods,
      custom_subject,
      extra_attachments,
    } = await req.json();

    if (!recipient_email || !invoice_id) {
      return new Response(JSON.stringify({ error: 'recipient_email and invoice_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Sanitize recipient: strip "Name <email>" wrapper, trim, lowercase, validate format
    const extractMatch = String(recipient_email).match(/<([^>]+)>/);
    const cleanedRecipient = (extractMatch ? extractMatch[1] : String(recipient_email)).trim().toLowerCase();
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
    if (!emailRegex.test(cleanedRecipient)) {
      return new Response(JSON.stringify({
        error: `Invalid recipient email format: "${recipient_email}". Please verify the customer's email address before resending.`
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
    const amountNum = parseFloat(amount) || 0;
    const discountNum = parseFloat(discount) || 0;
    const balanceDue = amountNum - discountNum;
    const amountStr = balanceDue > 0 ? `$${balanceDue.toFixed(2)}` : '';
    const greeting = customer_name ? `Hi ${customer_name.split(' ')[0]},` : 'Hello,';

    // Format due date
    let dueDateStr = '';
    if (due_date) {
      try {
        dueDateStr = new Date(due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      } catch { /* ignore */ }
    }

    // Logo HTML
    const logoHtml = logo_url ? `
      <div style="text-align:center;margin-bottom:16px;">
        <img src="${logo_url}" alt="${displayName}" style="max-height:60px;max-width:200px;object-fit:contain;" />
      </div>
    ` : '';

    // Build payment methods section
    const methods = payment_methods || [];
    let paymentMethodsHtml = '';
    if (portal_url && methods.length > 0) {
      const methodButtons = methods.map((m: string) => {
        const icons: Record<string, string> = {
          'Credit Card': '&#128179;',
          'ACH / Bank Transfer': '&#127974;',
          'PayPal': '&#128176;',
          'Venmo': '&#128176;',
        };
        const icon = icons[m] || '&#128176;';
        return `<td style="padding:4px 6px;">
          <a href="${portal_url}" style="display:inline-block;padding:10px 20px;background-color:#f7f5ef;border:1px solid #d6cdb8;border-radius:8px;text-decoration:none;color:#2c3530;font-size:13px;font-weight:500;white-space:nowrap;">
            ${icon}&nbsp; ${m}
          </a>
        </td>`;
      }).join('');

      paymentMethodsHtml = `
        <div style="margin:24px 0 8px 0;">
          <p style="color:#4d5a52;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px 0;">Payment Methods Accepted</p>
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>${methodButtons}</tr></table>
        </div>
      `;
    }

    // Invoice summary table
    let summaryRows = '';

    // Prefer an itemized table of invoice_lines when available (each line shows
    // qty, description, unit price, line total). Fall back to job_description
    // for older invoices that don't have invoice_lines populated.
    const lines = Array.isArray(invoice_lines) ? invoice_lines : [];
    if (lines.length > 0) {
      // Header row
      summaryRows += `
        <tr>
          <td colspan="2" style="padding:0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;">
              <tr>
                <td style="padding:6px 0;color:#7d8a7f;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #d6cdb8;">Description</td>
                <td style="padding:6px 0;color:#7d8a7f;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:center;width:40px;border-bottom:1px solid #d6cdb8;">Qty</td>
                <td style="padding:6px 0;color:#7d8a7f;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:right;width:80px;border-bottom:1px solid #d6cdb8;">Price</td>
                <td style="padding:6px 0;color:#7d8a7f;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:right;width:90px;border-bottom:1px solid #d6cdb8;">Total</td>
              </tr>
              ${lines.map((l: any) => {
                const desc = String(l.description || l.item_name || 'Item').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const qty = parseFloat(l.quantity) || 1;
                const unit = parseFloat(l.unit_price || l.price) || 0;
                const total = parseFloat(l.line_total || l.total) || (qty * unit);
                return `<tr>
                  <td style="padding:8px 0;color:#2c3530;font-size:13px;border-bottom:1px solid #f0ece4;">${desc}</td>
                  <td style="padding:8px 0;color:#4d5a52;font-size:13px;text-align:center;border-bottom:1px solid #f0ece4;">${qty}</td>
                  <td style="padding:8px 0;color:#4d5a52;font-size:13px;text-align:right;border-bottom:1px solid #f0ece4;">$${unit.toFixed(2)}</td>
                  <td style="padding:8px 0;color:#2c3530;font-size:13px;text-align:right;font-weight:500;border-bottom:1px solid #f0ece4;">$${total.toFixed(2)}</td>
                </tr>`;
              }).join('')}
            </table>
          </td>
        </tr>`;
    } else if (job_description) {
      summaryRows += `
        <tr>
          <td style="padding:10px 0;color:#4d5a52;font-size:13px;border-bottom:1px solid #f0ece4;">Description</td>
          <td style="padding:10px 0;color:#2c3530;font-size:13px;text-align:right;border-bottom:1px solid #f0ece4;">${String(job_description).replace(/\n/g, '<br/>')}</td>
        </tr>`;
    }
    if (amountNum > 0) {
      summaryRows += `
        <tr>
          <td style="padding:10px 0;color:#4d5a52;font-size:13px;border-bottom:1px solid #f0ece4;">Subtotal</td>
          <td style="padding:10px 0;color:#2c3530;font-size:13px;text-align:right;border-bottom:1px solid #f0ece4;">$${amountNum.toFixed(2)}</td>
        </tr>`;
    }
    if (discountNum > 0) {
      summaryRows += `
        <tr>
          <td style="padding:10px 0;color:#4d5a52;font-size:13px;border-bottom:1px solid #f0ece4;">Discount</td>
          <td style="padding:10px 0;color:#16a34a;font-size:13px;text-align:right;border-bottom:1px solid #f0ece4;">-$${discountNum.toFixed(2)}</td>
        </tr>`;
    }

    const summaryTable = summaryRows ? `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
        ${summaryRows}
        <tr>
          <td style="padding:14px 0;color:#2c3530;font-size:16px;font-weight:700;">Amount Due</td>
          <td style="padding:14px 0;color:#2c3530;font-size:16px;font-weight:700;text-align:right;">${amountStr}</td>
        </tr>
      </table>
    ` : '';

    // Due date badge
    const dueDateBadge = dueDateStr ? `
      <div style="display:inline-block;background-color:#fff7ed;border:1px solid #fed7aa;padding:6px 14px;border-radius:6px;margin-bottom:16px;">
        <span style="color:#c2410c;font-size:12px;font-weight:600;">Due: ${dueDateStr}</span>
      </div>
    ` : '';

    // Contact info
    const contactParts: string[] = [];
    if (contactPhone) contactParts.push(contactPhone);
    if (contactEmail) contactParts.push(`<a href="mailto:${contactEmail}" style="color:#5a6349;text-decoration:none;">${contactEmail}</a>`);
    if (contactAddress) contactParts.push(contactAddress);
    const contactLine = contactParts.join(' &nbsp;&bull;&nbsp; ');

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

      <!-- Header with accent bar -->
      <div style="background-color:#5a6349;padding:28px 32px;">
        ${logo_url ? `<div style="text-align:center;margin-bottom:12px;"><img src="${logo_url}" alt="${displayName}" style="max-height:48px;max-width:180px;object-fit:contain;" /></div>` : ''}
        <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;text-align:center;">${displayName}</h1>
        ${contactAddress ? `<p style="color:rgba(255,255,255,0.7);font-size:12px;margin:6px 0 0;text-align:center;">${contactAddress}</p>` : ''}
      </div>

      <!-- Invoice Badge -->
      <div style="text-align:center;padding:20px 32px 0;">
        <div style="display:inline-block;background-color:rgba(90,99,73,0.08);padding:8px 20px;border-radius:24px;">
          <span style="color:#5a6349;font-size:14px;font-weight:600;letter-spacing:0.3px;">INVOICE ${invNum}</span>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:24px 32px 0;">
        ${dueDateBadge}

        <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 6px 0;">
          ${greeting}
        </p>
        <p style="color:#4d5a52;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
          Here is your invoice${amountStr ? ` for <strong style="color:#2c3530;">${amountStr}</strong>` : ''}. ${pdfBase64 ? 'A PDF copy is attached for your records.' : ''} You can also view and pay this invoice online using the button below.
        </p>

        <!-- Summary -->
        ${summaryTable}
      </div>

      <!-- Pay Now CTA -->
      ${portal_url ? `
      <div style="padding:0 32px 24px;text-align:center;">
        <a href="${portal_url}" style="display:inline-block;padding:16px 48px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;border-radius:10px;letter-spacing:0.3px;">
          View &amp; Pay Invoice
        </a>
      </div>
      ` : ''}

      <!-- Payment Methods -->
      ${paymentMethodsHtml}

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
      from: `${displayName} <invoices@appsannex.com>`,
      to: [cleanedRecipient],
      subject: custom_subject || `Invoice ${invNum}${amountStr ? ` — ${amountStr}` : ''} from ${displayName}`,
      html: htmlBody,
    };

    // Build attachments list
    const attachmentsList: Array<{filename: string; content: string}> = [];
    if (pdfBase64) {
      attachmentsList.push({ filename: `${invNum}.pdf`, content: pdfBase64 });
    }
    // Add any extra file attachments (base64-encoded, passed from client)
    if (extra_attachments && Array.isArray(extra_attachments)) {
      for (const att of extra_attachments) {
        if (att.filename && att.content) {
          attachmentsList.push({ filename: att.filename, content: att.content });
        }
      }
    }
    if (attachmentsList.length > 0) {
      emailPayload.attachments = attachmentsList;
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
      recipient: cleanedRecipient,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('send-invoice error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
