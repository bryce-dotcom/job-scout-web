# Running four sessions at once

Four Claude sessions share this repo through four git worktrees. That is fine —
it is how the work goes fast. What is not fine is what kept happening: sessions
switching each other's branches mid-flight, pushes that reported success and
sent nothing, and dev servers quietly serving the wrong checkout.

Every rule below exists because it already went wrong.

## Before you touch anything

```bash
npm run where
```

Prints which worktree you are in, which branch it is actually on, whether the
tree holds uncommitted work that is not yours, and what the other three
checkouts are doing.

**Never assume the branch.** `js-main-wt` was documented as "tracks main". It
has since been found on `feature/card-at-signup` and on
`feat/company-map-and-watchdog-api`, both times switched by another session
between one commit and the next.

**Never commit into a dirty checkout that is not yours.** One of these trees was
sitting with 483 uncommitted files from another session.

## Landing work on main

```bash
npm run ship               # land HEAD on main and prove it landed
npm run ship -- --dry      # show what it would do
npm run ship -- --count 3  # land the last 3 commits
```

`ship` cherry-picks onto a throwaway worktree cut from `origin/main`, so it
cannot disturb whatever anyone else has checked out or left uncommitted. Then it
re-fetches and checks `merge-base` before claiming success.

**Do not `git push origin main`.** It pushes the local `main` *ref*, not your
HEAD. From a feature branch it sends nothing, prints `Everything up-to-date`,
and exits 0 — so `&& echo PUSHED` reports success while your fix sits on the
wrong branch. That is exactly how a Books fix went missing while production
stayed broken and the deploy poller reported nothing wrong.

Two things now stop it: the local `main` branch is deleted from these worktrees,
so that command errors loudly instead of lying; and a `pre-push` hook blocks any
push to `main` that did not come from `ship`.

If your branch predates these scripts, `npm run ship` will not exist in your
worktree. Use the synced copy, which works from any worktree on any branch:

```bash
node /c/JobScout/.jstools/ship.mjs
node /c/JobScout/.jstools/where.mjs
```

`npm run setup:sessions` refreshes those from the repo, which stays the source
of truth.

## Confirming a deploy

```bash
npm run deployed -- "a string that exists ONLY in this commit"
```

It records which bundle is serving *before* waiting, refuses a marker that is
already present, and only reports LIVE when the bundle hash has changed and the
marker is in it.

Both cheap versions of this check are wrong and both produced a false "LIVE":
comparing bundle hashes against a local build (Vercel bakes env vars in, so they
never match), and grepping for a string that already existed.

## Running the app

Each worktree has its own port, assigned by `npm run setup:sessions`:

| worktree | port |
|---|---|
| `job-scout-web` | 5180 |
| `js-deploy-wt` | 5181 |
| `js-main-wt` | 5182 |
| `js-rls-wt` | 5183 |

Start yours with the launch config named `wt-<worktree-folder>`. `--strictPort`
means it fails loudly rather than drifting onto a neighbour's port — a session
once verified a fix against a dev server that was running a *different*
worktree, on a branch two months stale, and believed the result.

## Before you say it works

`npm run guard && npm test && npm run build` — all three. None is redundant:

- **guard** catches undefined references and newly-added conditional hooks
- **tests** catch logic
- **build** catches what neither does — a JSX comment in an expression position
  passed guard and all 845 tests, and failed only at build

And none of them catches a misplaced hook that renders. Guard, 845 tests and the
build all passed on the commit that white-screened Books.

**Look at the thing.** Read the DOM, not a screenshot — a frozen renderer serves
stale frames, which is how a working page was reported broken and a broken one
reported working in the same session.

## The hooks ratchet

`scripts/hooks-baseline.json` records 28 pre-existing `rules-of-hooks`
violations (19 in Payroll, 5 in ProductsServices, 3 in Inventory, 1 in
CostBreakdownSection). Each is a latent white screen. The build fails if a new
one appears or a recorded file grows another.

Regenerate with `node scripts/guard.mjs --update-hooks-baseline` only after
genuinely fixing some — never to make a failure go away.

## Re-running setup

```bash
npm run setup:sessions
```

Re-installs the shared hooks and re-assigns ports. Safe to re-run; run it after
adding or removing a worktree.
