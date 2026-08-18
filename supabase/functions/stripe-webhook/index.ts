import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleStripeWebhook } from "./webhook.ts";

// Thin entrypoint. All request handling lives in ./webhook.ts so the
// signature-verification gate and event handling can be unit-tested
// without booting an HTTP server. See webhook_test.ts.
serve(handleStripeWebhook);
