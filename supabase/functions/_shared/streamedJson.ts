// Supabase's gateway drops any request that has produced no response bytes
// for 150 seconds:  HTTP 504 {"code":"IDLE_TIMEOUT"}.  A single Claude call
// that writes a large JSON document (utility research, PDF extraction) runs
// longer than that, so those functions were killed mid-flight on every press
// of the button — before they even reached their own usage logging, which is
// why ai_usage had no row for either feature since metering began.
//
// Streaming the body keeps the connection alive: a space every few seconds
// while the work runs, then the real JSON document. JSON.parse ignores the
// leading whitespace, so a caller reads the whole body with response.json()
// or text() exactly as before. The status is necessarily 200 (headers go out
// before the work finishes) — failures are reported in the body as
// { success: false, error } and every caller already branches on `success`.
//
// The runtime's wall-clock limit still applies; keep each request's work
// under it by splitting big jobs into phases (see ai-utility-research).

export function streamedJson(
  headers: Record<string, string>,
  work: () => Promise<unknown>,
  heartbeatMs = 10_000,
): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const tick = setInterval(() => {
        try { controller.enqueue(enc.encode(' ')) } catch { /* closed */ }
      }, heartbeatMs)
      let body: unknown
      try {
        body = await work()
      } catch (e) {
        body = {
          success: false,
          error: (e as Error)?.message || 'Unknown error',
          ai_unavailable: (e as { ai_unavailable?: boolean })?.ai_unavailable === true,
        }
      } finally {
        clearInterval(tick)
      }
      try {
        controller.enqueue(enc.encode(JSON.stringify(body)))
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
