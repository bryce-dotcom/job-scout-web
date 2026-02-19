import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_TYPES = ['follow_up', 'quote_reminder', 'seasonal', 'newsletter', 'win_back', 'custom'] as const;
const VALID_TONES = ['professional', 'friendly', 'urgent'] as const;

// Build the system prompt for email generation
function buildSystemPrompt(
  type: string,
  tone: string,
  companyInfo: { name?: string; phone?: string; address?: string; website?: string }
): string {
  const companyName = companyInfo?.name || 'Our Company';
  const companyPhone = companyInfo?.phone || '';
  const companyAddress = companyInfo?.address || '';
  const companyWebsite = companyInfo?.website || '';

  return `You are Conrad, an expert email marketing copywriter for a commercial lighting and energy services company called "${companyName}".

COMPANY INFO:
- Name: ${companyName}
- Phone: ${companyPhone || 'N/A'}
- Address: ${companyAddress || 'N/A'}
- Website: ${companyWebsite || 'N/A'}

Your job is to write a ${tone} ${type.replace(/_/g, ' ')} email that:
1. Is compelling and drives action
2. Uses merge variables for personalization: {{first_name}}, {{company_name}}, {{last_name}}
3. Is Constant Contact compatible — uses inline CSS styles only (no <style> blocks)
4. Has a clean single-column layout that works on mobile
5. Includes a clear call-to-action button
6. Stays on-brand for a professional services company

TONE GUIDELINES:
- professional: Polished, trustworthy, data-driven language. Emphasize expertise and ROI.
- friendly: Warm, approachable, conversational. Use "we" and "you" naturally.
- urgent: Creates healthy urgency without being pushy. Time-sensitive language, deadlines.

EMAIL TYPE GUIDELINES:
- follow_up: Thank the customer for recent service, ask for feedback, offer next steps
- quote_reminder: Gentle reminder about an outstanding quote, emphasize value and savings
- seasonal: Seasonal promotion or maintenance reminder (tie to time of year)
- newsletter: Company update with tips, industry news, recent projects
- win_back: Re-engage inactive customers with a special offer or useful information
- custom: Flexible — follow the context provided

MERGE VARIABLES you may use:
- {{first_name}} — recipient's first name
- {{last_name}} — recipient's last name
- {{company_name}} — recipient's company/business name

Return ONLY valid JSON with this structure:
{
  "subject": "Primary subject line",
  "subject_alternatives": ["Alternative subject 1", "Alternative subject 2"],
  "html_content": "<html>...</html>",
  "text_content": "Plain text version...",
  "variables_used": ["first_name", "company_name"]
}

HTML REQUIREMENTS:
- Full HTML document with DOCTYPE
- Inline styles only (no <style> tags)
- Single-column layout, max-width 600px, centered
- Background: #f7f7f7, content area: #ffffff
- Use a header area with the company name
- Include a styled CTA button (background: #2563eb, color: white, padding, border-radius)
- Footer with company info, unsubscribe placeholder, and physical address
- Mobile-friendly: use percentage widths, readable font sizes (14-16px body)
- Keep total HTML under 100KB

Return ONLY the JSON. No other text.`;
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { type, context, tone, companyInfo } = await req.json();

    // Validate email type
    if (!type || !VALID_TYPES.includes(type)) {
      return new Response(JSON.stringify({
        success: false,
        error: `type must be one of: ${VALID_TYPES.join(', ')}`,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const effectiveTone = VALID_TONES.includes(tone) ? tone : 'professional';

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = buildSystemPrompt(type, effectiveTone, companyInfo || {});

    // Build user message with context
    let userMessage = `Generate a ${effectiveTone} ${type.replace(/_/g, ' ')} email.`;
    if (context) {
      if (typeof context === 'string') {
        userMessage += `\n\nContext:\n${context}`;
      } else {
        userMessage += `\n\nContext:\n${JSON.stringify(context, null, 2)}`;
      }
    }

    console.log(`Generating ${type} email (tone: ${effectiveTone}), prompt: ${systemPrompt.length + userMessage.length} chars`);

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      const errMsg = data.error.message || 'Anthropic API error';
      console.error('Claude API error:', errMsg);
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = (data.content || [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n');

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ success: false, error: 'Could not parse email content from AI response', raw: content.substring(0, 500) }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailContent = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!emailContent.subject || !emailContent.html_content) {
      return new Response(JSON.stringify({ success: false, error: 'AI response missing required fields (subject, html_content)', raw: emailContent }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure arrays and defaults
    if (!Array.isArray(emailContent.subject_alternatives)) {
      emailContent.subject_alternatives = [];
    }
    if (!emailContent.text_content) {
      // Generate basic plain text from HTML by stripping tags
      emailContent.text_content = emailContent.html_content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    if (!Array.isArray(emailContent.variables_used)) {
      emailContent.variables_used = [];
    }

    return new Response(JSON.stringify({
      success: true,
      subject: emailContent.subject,
      subject_alternatives: emailContent.subject_alternatives,
      html_content: emailContent.html_content,
      text_content: emailContent.text_content,
      variables_used: emailContent.variables_used,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
