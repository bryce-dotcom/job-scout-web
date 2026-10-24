// walter-analyze — count the windows in a photograph.
//
// The glass twin of analyze-fixture. A rep stands in the yard, takes one
// picture of the elevation, and gets back the runs of windows in it: this type,
// this many, this storey, this far off the ground. The count then goes through
// the same priceTakeoff() the count sheet uses, so the bid comes off the
// tenant's own price book and this function never sees a price.
//
// The catalogue is read HERE, at request time, rather than sent by the client.
// window_types and window_scale_reference are global reference data — the
// physics of windows, not anybody's settings — and they carry the
// identification_tips and common_mistakes that were written for exactly this
// call. A client that passed its own copy could pass a stale one.
//
// Everything the model returns goes through normalizeAnalysis() before it
// leaves here. See _shared/windowPhoto.ts for why none of it is trusted.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { buildWindowPhotoPrompt, normalizeAnalysis } from "../_shared/windowPhoto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

// Reference data, service-role, read-only. Returns [] on any failure — the
// prompt degrades to a shorter catalogue rather than the call failing, which
// is wrong enough to be worth saying out loud in the response.
async function querySupabase(table: string, params = ''): Promise<any[]> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${params}`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return [];
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

const MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { context } = body;

    // A phone gives you a data URL and it is easy to forward the whole thing.
    // Stripping it here costs nothing and saves an opaque 400 from the API.
    let imageBase64 = String(body.imageBase64 || '');
    let mediaType = MEDIA.includes(body.mediaType) ? body.mediaType : null;
    const dataUrl = imageBase64.match(/^data:([^;,]+);base64,(.*)$/s);
    if (dataUrl) {
      if (!mediaType && MEDIA.includes(dataUrl[1])) mediaType = dataUrl[1];
      imageBase64 = dataUrl[2];
    }
    if (!imageBase64) return json({ success: false, error: 'No photo was sent.' }, 400);

    const [types, scale] = await Promise.all([
      querySupabase('window_types', 'select=type_code,type_name,family,panes_per_unit,lites_per_unit,bill_lites,typical_width_in,typical_height_in,size_band,screens_per_unit,has_track,identification_tips,common_mistakes,typical_locations&order=family,type_code'),
      querySupabase('window_scale_reference', 'select=reference_code,reference_name,dimension_in,dimension_of,reliability,notes&order=reliability,reference_code'),
    ]);

    // Without the catalogue the model has nothing to name windows FROM, and
    // every type_code it invented would be refused downstream — so the whole
    // answer would come back blank. Refuse early and say why.
    if (types.length === 0) {
      return json({
        success: false,
        error: 'The window catalogue could not be read, so there is nothing to count against. Try again in a moment.',
      }, 503);
    }

    const promptText = buildWindowPhotoPrompt({ types, scale, context });
    console.log(`Walter prompt: ${promptText.length} chars, ${types.length} window types, ${scale.length} scale references`);

    const ai = await callAnthropic(
      { feature: 'walter-analyze', companyId: null, req },
      {
        model: 'claude-sonnet-5-5',
        // 4096 was not enough and the failure was ugly: the model reasons
        // before it answers — which is the whole point of step 1, looking
        // before naming — and an elevation with a dozen runs then truncated
        // the JSON mid-string, so a complete count came back as "malformed".
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
            },
            { type: 'text', text: promptText },
          ],
        }],
      },
    );

    if (!ai.ok) {
      return json({ success: false, error: ai.friendly, ai_unavailable: ai.unavailable === true }, 500);
    }

    // Every TEXT block, not content[0]. A reasoning model puts a thinking
    // block first and content[0].text is then undefined — which came back as
    // an empty string and read, for one confusing deploy, as "the model said
    // nothing" when it had answered in full.
    const blocks: any[] = Array.isArray(ai.data?.content) ? ai.data.content : [];
    const content = blocks.filter((b) => b?.type === 'text').map((b) => b.text || '').join('\n');
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return json({
        success: false,
        error: ai.data?.stop_reason === 'max_tokens'
          ? 'Walter ran out of room before he finished counting. Try a photo of one elevation rather than the whole street.'
          : 'Walter looked at the photo but did not answer in a form the count sheet can read.',
        // What actually came back, so a failure like this is diagnosable from
        // the response instead of from the function logs.
        raw: content.slice(0, 500),
        stop_reason: ai.data?.stop_reason ?? null,
        blocks: blocks.map((b) => b?.type),
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({
        success: false,
        error: ai.data?.stop_reason === 'max_tokens'
          ? 'Walter ran out of room before he finished counting. Try one elevation at a time rather than the whole building.'
          : 'Walter looked at the photo but his answer came back malformed.',
        raw: content.slice(0, 500),
        stop_reason: ai.data?.stop_reason ?? null,
      });
    }

    const analysis = normalizeAnalysis(parsed, types, scale);

    // A photograph with no runs in it is a real answer, not a failure — a
    // close-up of a wall, a blurred frame, the inside of a pocket. Say it
    // plainly rather than returning an empty success the screen has to guess at.
    if (analysis.runs.length === 0) {
      return json({
        success: true,
        analysis,
        nothing_counted: true,
      });
    }

    return json({ success: true, analysis });
  } catch (error) {
    return json({ success: false, error: (error as Error).message }, 500);
  }
});
