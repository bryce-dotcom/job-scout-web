-- =====================================================================
-- The bid builder is Benny, not Dougie.
--
-- Bryce, 2026-09-26: "Dougie lives in Lenard right now and he's staying
-- there… your version of him should all be Benny so users know what he
-- does." Dougie remains the handwritten-takeoff reader inside Lenard's
-- audit pages; the agent that reads a bid package and builds the bid —
-- shipped 2026-09-25 under Dougie's name — is Benny the Bid Builder.
--
-- The agents row keeps its id (company_agents rows point at it); only the
-- words change. Sidebar rows follow.
-- =====================================================================

update public.agents
   set slug = 'benny-bids',
       name = 'Benny',
       title = 'Bid Builder',
       full_name = 'Benny The Bid Builder',
       tagline = 'Reads the buyer''s bid package and builds the bid.',
       description = 'Drop in an invitation to bid — the PDF the agency or GC sent — and Benny reads the schedule of items, matches each one to your catalog (exact, an equivalent with his reasoning, or flagged to source), prices what the catalog lacks from the web with the supplier page on the line, and builds the bid in the buyer''s format. Anything he sourced stays redlined until someone on your team opens the page and marks it verified.',
       icon = 'ClipboardList',
       ai_capabilities = array['Reads bid packages (PDF or photos)', 'Three-way catalog match with reasoning', 'Web-sourced prices with the supplier page on the line', 'Redlined until a human verifies', 'Bid schedule in the buyer''s format']::text[],
       updated_at = now()
 where slug = 'dougie-docs';

update public.ai_modules
   set module_name = 'benny',
       display_name = 'Benny - Bid Builder',
       icon = 'ClipboardList',
       route_path = '/agents/benny',
       description = 'Reads the buyer''s bid package and builds the bid — web-sourced prices redlined until verified',
       updated_at = now()
 where module_name = 'dougie';
