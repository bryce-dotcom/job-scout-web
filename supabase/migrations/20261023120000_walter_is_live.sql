-- Walter stops being "coming soon".
--
-- The bar for this was never that the pages render. It was that a person can
-- CREATE an assessment and price it without anybody running a seed script for
-- them: start one, enter the building and the glass, type a damage register
-- mark by mark, record a photograph as a repeat of another, mark one as not
-- restorable with a reason, and watch the three tiers move as they go. That
-- all works now, and it was opened in a browser and driven by hand before
-- this line was written.
--
-- Why that bar and not an earlier one: the storefront has described features
-- nobody had built before, and the fix agreed at the time was that status
-- follows what a person can actually do. A workspace that can only display a
-- register somebody seeded is not a product, however well it displays it.
--
-- The capabilities list keeps `count_panes` and `identify_window_type`,
-- because reading a photograph is still the phase after this one. They
-- describe what the agent is for; `status` is what governs whether he is
-- offered, and that is the honest part.

UPDATE public.agents
   SET status = 'active'
 WHERE slug = 'walter-windows';
