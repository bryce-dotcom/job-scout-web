// Reply-address tokens — re-export shim.
//
// Implementation lives in supabase/functions/_shared/replyToken.ts so the
// sender, the inbound receiver and these tests share ONE definition. If the
// generator and the parser ever disagreed, every customer reply would silently
// fail to match and fall back to guessing by sender.
//
// Do not reimplement anything here.

export {
  replyToken,
  replyAddress,
  parseReplyToken,
  tokenFromAddresses,
} from '../../supabase/functions/_shared/replyToken.ts'
