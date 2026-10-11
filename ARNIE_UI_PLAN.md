# Arnie's UI — what Grok got right, and the plan

Status: plan only. Nothing in here is built.
Written 2026-10-10, after reading xAI's own documentation rather than guessing.
Companion to `ARNIE_ON_YOUR_COMPUTER_PLAN.md` (Phase 0 of which is live).

---

## What Grok Bot's UI actually is

From xAI's design post and docs, not from blogs:

- **The sidebar is a roster of persistent Bots**, each with an avatar, name and
  title — not a list of past chats. Opening the app shows *who works for you*.
- **The avatar is the progress indicator.** It moves through idle, thinking,
  working, waiting, blocked, done. Hovering reveals the current action. They
  tried showing a text description of every step and found users "wanted more
  detail than was useful", so they kept an ambient signal and made detail
  on-demand. That is a tested finding, not a taste call.
- **The machine has three levels of access**, chosen after trying floating,
  side-by-side, modal and full-screen: **Status** (a title-bar icon turns
  purple while the computer is active) → **Preview** (a pinned side panel you
  follow without leaving the conversation) → **Takeover** (full screen, you
  take control, then hand it back).
- **One transcript** mixes messages, system events, interactive cards and
  visualisations. Creating a routine or messaging another Bot appears inline
  and expands for detail.
- **The approval card** shows the proposed operation and its inputs, with three
  buttons: **Allow once**, **Always allow** (which can save a matching rule),
  **Deny**.
- **Auto-review rules** live at Settings → General → Auto-review, in two kinds:
  **Ask first** and **Allow automatically**. **Ask first wins** when both
  match, and a member's personal rules "can only make behavior stricter" than
  an admin's.
- **Background approvals expire in about 10 minutes** and the card then reads
  **Expired**; the action does not run. Chat-initiated approvals wait forever.
- **Routines were promoted out of settings into the main Bot interface**, so
  their runs and results are reviewable. Per Bot: enable/pause, **Test run**,
  edit, run history, delete.
- **Teach a task**: open the computer view → *Teach a task* → describe the
  outcome → do the work once → stop → review the skill it wrote → test it on a
  safe example. Up to ten minutes, visible interaction only, no microphone.
  Crucially: "**a taught skill is not production-ready until you add its
  approval boundaries**."
- **Skill ≠ routine.** A *skill* is the method — when to use it, inputs,
  steps, how to validate, what needs approval — and is shared. A *routine* says
  when one Bot runs it.

Their stated principles: **delegation over operation** (the computer is the
Bot's workspace, not a surface inviting constant supervision — "working with a
coworker, not operating a remote machine"), **interruption only when needed**,
**reduced complexity**, **trust through visibility**.

### Two things of theirs we must not copy

1. **All their Bots share one computer and its logins, and xAI says plainly it
   "is not a security boundary."** That is the exact hole we closed before
   building anything: our session is per employee, grants are per employee, and
   `employee_id` is NOT NULL with no company-wide form. Keep it that way — it
   is a selling point, not an inconvenience.
2. **Their default is a cloud VM.** Ours is the person's own machine, which is
   why we hold no credentials at all.

And one of their own warnings to honour: *"avoid broad rules such as allow
everything in the browser."* Our **Always allow** must write a grant scoped to
app + host + tier, never a blanket one.

---

## What Arnie already has

Not starting from zero:

| Grok has | Arnie today |
|---|---|
| Roster of agents | the agent workspaces — Arnie, Benny, Lenard, Don, Chris, Frankie. The roster exists; we do not need a Bot-creator |
| One transcript with inline cards | `ArnieChat.jsx` — proposal cards render in the conversation |
| Approval card | yes, but **two** buttons: *Approve & apply* and *Reject* |
| Auto-review rules | the leash (`_shared/computerGrants.ts`) decides, but no UI and no user-authored rules |
| Routines | `arnie_routines` table + hourly cron. **No screen at all** |
| Skills | nothing. `arnie_routines.steps` is where a taught workflow would land |
| Agent Computer view | nothing |
| Status indicator | nothing — `AgentHeader` takes only `slug` and `tabs` |
| Run history | `ArnieHistory.jsx` (conversations), `ArnieAtWork.jsx` (admin usage) |

So the gaps are: a computer surface, a status signal, the third approval
button, a rules table, a routines screen, and teach-a-task.

---

## The plan

### 1. `Arnie → Computer` — a fourth tab

New tab in `ArnieWorkspace.jsx` beside Chat / History / Settings, at
`/agents/arnie/computer`. One screen, four things:

- **This computer.** Live / not connected / stopped, device label, last seen.
  **Connect this computer** issues the agent its token (the last Phase 0 gap —
  it is an env var today) and shows the one command to run.
- **What Arnie may touch.** The grants list — app, host, tier, when granted —
  each with Revoke. Adding one is a deliberate act here, not a side effect.
- **What he has done.** The action log from `arnie_computer_actions`, newest
  first, refusals included and visibly different. This table was built for
  this screen.
- **Stop Arnie on this computer.** The kill switch, always on screen, never
  behind a menu.

### 2. The status signal, in the header

`AgentHeader` gains a state: **idle / thinking / working / waiting / blocked**.
Ambient — a dot and a colour, hover for the current action. Copy their tested
finding: **do not** stream a line of text per step into the transcript. One
exception, because it is not progress but a question: **waiting on you** has to
be loud.

### 3. Preview, not remote desktop

A pinned side panel showing **the last screenshot Arnie took, with what he did
next written under it** — a filmstrip, not a live screen. We are driving the
person's own machine, which they can already see; mirroring their own desktop
back at them is noise. This is where their *delegation over operation*
principle bites hardest, and it is also cheaper and simpler than streaming.

Full-screen takeover is unnecessary for the same reason: it is already their
screen. What replaces it is §4.

### 4. The handoff, as a first-class state

Today the leash returns *"That is a credential field. Sign in yourself and tell
me when you are through."* Right words, wrong place — it should not be a line
of chat.

A banner: **Arnie is waiting — sign in to SRP and press Continue.** With the
app named, and a Continue button that resumes the queue. This is the moment the
whole credential design rests on, so it gets a real UI. Their equivalent is a
takeover of the Bot's machine; ours is simpler, because the person is already
sitting at the machine in question.

### 5. The third button

`ArnieChat.jsx` proposal cards gain **Always allow** between Approve and
Reject, on actions that have a grant shape (a computer action, not a money
write). It writes a grant for **that app + host + tier only**.

Never on the rails that cannot be rolled back — a payment, a sent message, a
filed application. Those keep two buttons forever. Grok's own docs note
approval "does not roll back a CRM change that already happened", which is
exactly why our irreversible rails refuse rollback and must never gain an
*always*.

### 6. Rules, in Settings

A table in `ArnieSetup.jsx`: **Ask first** and **Allow automatically**, and
**Ask first wins** when both match — their conflict rule, which is the right
one. Two extras of ours:

- An **Admin** may set rules for the company; a person's own rules may only
  make them **stricter**, never looser. Straight from their team-rules model.
- Our tiers already enforce *narrowest grant wins*, so the two layers agree.

### 7. Routines get a screen

They have a table, a cron and no UI. Per their promotion of routines into the
main interface: list, enable/pause, **Test run**, edit, run history, delete.

Two things to copy exactly because they are hard-won: **a test run does real
work**, so it must say so and keep writes behind approval; and **deleting is
immediate and cannot be undone**, so it confirms.

Plus one thing they have and we need: **a background approval that nobody
answers must expire.** Theirs do, in about ten minutes, and the card reads
*Expired*. A routine that queues an action at 7am and gets approved at 6pm has
done something nobody intended.

### 8. Teach a task

The Phase 1 payoff, and their flow is the right one — adopt it nearly as-is:

1. From the Computer tab: **Teach Arnie a task.**
2. Describe the outcome first, in a sentence.
3. Do the work once. The agent records the **action stream** — clicked this
   element, typed this value into that field — not video.
4. Stop.
5. **Arnie writes the steps back in English and you correct them.** This is the
   step that matters: their docs are blunt that a taught skill is a *draft*,
   and that decision rules, failure handling and approval boundaries have to be
   added by a person because one example cannot reveal them.
6. Test on a safe example before it is ever scheduled.

Their limits are sensible and worth starting with: a ten-minute cap, visible
interaction only, no audio, and a hard rule that **nothing is recorded while
the handoff banner is up** — the demonstration must not capture a password.

**Schema consequence:** split skill from routine, as they do. A *skill* is the
method and is shared across the tenant; a *routine* says when one person's
Arnie runs it. `arnie_routines.steps` currently conflates the two. A new
`arnie_skills` table holds the steps, and `arnie_routines` references one. That
keeps "the steps are shared, the login never is" true in the schema rather than
in a convention.

---

## Order

1. **Computer tab + Connect this computer** — closes the last Phase 0 gap and
   gives everything else somewhere to live.
2. **The handoff banner** — the credential design is the whole story and it has
   no UI.
3. **Status in the header.**
4. **Routines screen** — it exists and is invisible; cheapest real win.
5. **The third button + the rules table.**
6. **Preview filmstrip.**
7. **Teach a task + the skills/routines split** — the biggest, and it wants the
   six above to exist first.

## Worth deciding before 7

Their skills are shared across an account and ours would be shared across a
tenant. Both are right for know-how. But a *taught* skill can embed a
customer's premise number or a rep's own account quirk in a step, so a shared
skill needs a review before it leaves the person who taught it. Worth settling
whether that is an Admin review or the teacher's own publish step — it changes
the table.
