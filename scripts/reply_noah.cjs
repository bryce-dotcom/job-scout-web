require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const updates = [
  {
    id: 'ae50c3b7-5c7f-47d0-b293-99974dd91ed7',
    status: 'resolved',
    reply: "Found and fixed the root cause. Looking at your time_clock data, you had several entries where the database had you marked as still clocked in days after you stopped working - one ran 23 hours, another 31 hours, and four entries were all manually closed at the same exact second on Apr 8 (looks like someone bulk-cleaned them). What was happening: the Clock In button never checked whether you were already clocked in before creating a new entry, so any time the local app state missed a stale row, tapping Clock In silently created a SECOND open entry. Then Clock Out would close one of them and leave the other open, so next session the app would say 'still clocked in' when you thought you were out. Three things shipped: (1) Clock In now does a database pre-check and refuses to create a duplicate, (2) the time-clock screen now shows a red banner with a 'Close forgotten entries' button if you have any stale opens, and (3) the active timer always picks the most-recent open instead of the first one found. Should be fully self-healing now. Live after the next deploy."
  },
  {
    id: 'e3eb8078-3016-45f6-b443-d0ddc128e182',
    status: 'in_progress',
    reply: "I want to dig into this but the report doesn't have enough to pinpoint the crash. Can you reply with: (1) the exact text of the error message you see, (2) what page you're on when it happens (URL or what the screen shows), (3) what action triggered it (tap, swipe, save, etc.), and (4) what device + browser you're using? If it's an iOS PWA, can you try fully closing the app and reopening it once? The clock-in fix I just shipped may have been related if the crash was happening on the time-clock screen, so try again after the deploy lands and let me know if it persists."
  },
];

(async () => {
  const now = new Date().toISOString();
  for (const u of updates) {
    const r = await supabase.from('feedback').update({
      status: u.status,
      resolved_at: u.status === 'resolved' ? now : null,
      resolved_by: u.status === 'resolved' ? 'bryce@hhh.services' : null,
      reply_message: u.reply,
      replied_at: now,
    }).eq('id', u.id).select('id, status');
    console.log(u.id, '->', r.error ? 'ERR ' + r.error.message : 'OK ' + r.data?.[0]?.status);
  }
})();
