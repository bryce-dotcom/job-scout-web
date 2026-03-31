import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const {
      recipient_email,
      customer_name,
      invoice_number,
      payment_amount,
      payment_method,
      payment_date,
      balance_remaining,
      invoice_total,
      total_paid,
      company_name,
      business_unit_name,
      business_unit_phone,
      business_unit_email,
      business_unit_address,
      logo_url,
      portal_url,
    } = await req.json();

    if (!recipient_email) {
      return new Response(JSON.stringify({ success: false, error: 'recipient_email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const displayName = business_unit_name || company_name || 'Our Company';
    const contactPhone = business_unit_phone || '';
    const contactEmail = business_unit_email || '';
    const contactAddress = business_unit_address || '';
    const greeting = customer_name ? `Hi ${customer_name.split(' ')[0]},` : 'Hello,';
    const invNum = invoice_number || 'N/A';
    const paidAmt = parseFloat(payment_amount) || 0;
    const balanceAmt = parseFloat(balance_remaining) || 0;
    const invoiceAmt = parseFloat(invoice_total) || 0;
    const totalPaidAmt = parseFloat(total_paid) || 0;
    const isPaidInFull = balanceAmt <= 0;

    // Format date
    let dateStr = '';
    if (payment_date) {
      try {
        dateStr = new Date(payment_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      } catch { dateStr = payment_date; }
    }

    // Contact line
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

    <div style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #e8e4db;">

      <!-- Header -->
      <div style="background-color:#22c55e;padding:28px 32px;text-align:center;">
        ${logo_url ? `<div style="margin-bottom:12px;"><img src="${logo_url}" alt="${displayName}" style="max-height:48px;max-width:180px;object-fit:contain;" /></div>` : ''}
        <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">${displayName}</h1>
        <div style="margin-top:12px;display:inline-block;background-color:rgba(255,255,255,0.2);padding:6px 20px;border-radius:24px;">
          <span style="color:#ffffff;font-size:14px;font-weight:600;">PAYMENT RECEIPT</span>
        </div>
      </div>

      <!-- Checkmark -->
      <div style="text-align:center;padding:24px 32px 0;">
        <div style="display:inline-block;width:56px;height:56px;background-color:rgba(34,197,94,0.1);border-radius:50%;line-height:56px;font-size:28px;">
          &#10003;
        </div>
        <h2 style="color:#16a34a;font-size:18px;margin:12px 0 4px;font-weight:700;">
          Payment Received${isPaidInFull ? ' — Paid in Full' : ''}
        </h2>
        <p style="color:#4d5a52;font-size:14px;margin:0;">
          Thank you for your payment of <strong style="color:#2c3530;">$${paidAmt.toFixed(2)}</strong>
        </p>
      </div>

      <!-- Details Table -->
      <div style="padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9f8f4;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:14px 20px;color:#4d5a52;font-size:13px;border-bottom:1px solid #e8e4db;">Invoice</td>
            <td style="padding:14px 20px;color:#2c3530;font-size:13px;text-align:right;border-bottom:1px solid #e8e4db;font-weight:600;">${invNum}</td>
          </tr>
          <tr>
            <td style="padding:14px 20px;color:#4d5a52;font-size:13px;border-bottom:1px solid #e8e4db;">Payment Date</td>
            <td style="padding:14px 20px;color:#2c3530;font-size:13px;text-align:right;border-bottom:1px solid #e8e4db;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding:14px 20px;color:#4d5a52;font-size:13px;border-bottom:1px solid #e8e4db;">Payment Method</td>
            <td style="padding:14px 20px;color:#2c3530;font-size:13px;text-align:right;border-bottom:1px solid #e8e4db;">${payment_method || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:14px 20px;color:#4d5a52;font-size:13px;border-bottom:1px solid #e8e4db;">Amount Paid</td>
            <td style="padding:14px 20px;color:#16a34a;font-size:14px;text-align:right;border-bottom:1px solid #e8e4db;font-weight:700;">$${paidAmt.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:14px 20px;color:#4d5a52;font-size:13px;border-bottom:1px solid #e8e4db;">Invoice Total</td>
            <td style="padding:14px 20px;color:#2c3530;font-size:13px;text-align:right;border-bottom:1px solid #e8e4db;">$${invoiceAmt.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:14px 20px;color:#4d5a52;font-size:13px;border-bottom:1px solid #e8e4db;">Total Paid</td>
            <td style="padding:14px 20px;color:#2c3530;font-size:13px;text-align:right;border-bottom:1px solid #e8e4db;">$${totalPaidAmt.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:14px 20px;color:#4d5a52;font-size:14px;font-weight:600;">Balance Remaining</td>
            <td style="padding:14px 20px;color:${isPaidInFull ? '#16a34a' : '#2c3530'};font-size:14px;text-align:right;font-weight:700;">
              ${isPaidInFull ? '$0.00' : `$${balanceAmt.toFixed(2)}`}
            </td>
          </tr>
        </table>
      </div>

      ${!isPaidInFull && portal_url ? `
      <div style="padding:0 32px 24px;text-align:center;">
        <a href="${portal_url}" style="display:inline-block;padding:14px 40px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:10px;">
          Pay Remaining Balance
        </a>
      </div>
      ` : ''}

      <!-- Footer -->
      <div style="background-color:#f9f8f4;padding:20px 32px;border-top:1px solid #e8e4db;">
        <p style="color:#5a6349;font-size:13px;font-weight:600;margin:0 0 4px 0;">${displayName}</p>
        ${contactLine ? `<p style="color:#7d8a7f;font-size:11px;margin:0;line-height:1.6;">${contactLine}</p>` : ''}
      </div>

    </div>

    <p style="text-align:center;color:#b4b9af;font-size:10px;margin:16px 0 0;">
      This is an automated receipt. Please keep for your records.
    </p>
  </div>
</body>
</html>`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${displayName} <receipts@appsannex.com>`,
        to: [recipient_email],
        subject: `Payment Receipt — $${paidAmt.toFixed(2)} for Invoice ${invNum}`,
        html: htmlBody,
      }),
    });

    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      console.error('Resend error:', errorText);
      return new Response(JSON.stringify({ success: false, error: 'Failed to send receipt: ' + errorText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resendData = await resendRes.json();
    return new Response(JSON.stringify({ success: true, emailId: resendData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('send-receipt error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
