-- Jenny's own browser could never be told where to go (Bryce, 2026-10-23:
-- "she couldn't even read my email").
--
-- The background browser (2026-10-19) added three kinds — navigate (go to an
-- address), show and hide (bring her window up for a sign-in, then put it
-- back). The leash (computerGrants.ts) and the agent know all three, and it
-- was tested by driving the agent directly. But every action Arnie takes is
-- first written to arnie_computer_actions, whose kind check was never widened,
-- so through Arnie each of them failed on the insert: "a database error from
-- the app". Not one navigate/show/hide row exists. Without navigate she fell
-- back to the person's own Chrome, found the JobScout app window in front, and
-- stopped.
alter table public.arnie_computer_actions drop constraint if exists arnie_computer_actions_kind_check;
alter table public.arnie_computer_actions add constraint arnie_computer_actions_kind_check
  check (kind = any (array['screenshot','click','double_click','right_click','type','key','scroll','drag','launch','read_text','navigate','show','hide']));
