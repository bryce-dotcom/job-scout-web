#!/bin/bash
# ===================================================================
#  JobScout Agent - the file a person downloads and double-clicks.
#
#  A .command file opens in Terminal when double-clicked, which is the
#  only way to hand somebody a runnable thing on a Mac without an
#  Apple developer signature. The window is the point anyway: every
#  action Arnie takes prints in it, and closing it stops him.
#
#  Fetches the current agent each run, so nobody is ever asked to
#  update anything. Nothing to type, no token to paste.
#
#  The release URL and the public key are filled in when this is
#  published, so the copy in the repo is not tied to one environment.
# ===================================================================
set -u

BASE="__BASE__"
export JOBSCOUT_URL="__SUPABASE_URL__"
export JOBSCOUT_ANON_KEY="__ANON_KEY__"
export JOBSCOUT_APP_URL="__APP__"
DIR="$HOME/Library/Application Support/JobScout/agent"

printf '\n   JobScout Agent\n   ==============\n\n'
mkdir -p "$DIR"

# --- Node ----------------------------------------------------------
# Nobody downloading this has any reason to know what Node is. There is
# no install on a Mac we can rely on (Homebrew may not be there, and
# installing it behind somebody's back is not ours to do), so if it is
# missing we open the page and say plainly what to do.
NODE="$(command -v node || true)"
if [ -z "$NODE" ] && [ -x /usr/local/bin/node ]; then NODE=/usr/local/bin/node; fi
if [ -z "$NODE" ] && [ -x /opt/homebrew/bin/node ]; then NODE=/opt/homebrew/bin/node; fi
if [ -z "$NODE" ]; then
  printf '   This computer needs Node first - it is a free install from\n'
  printf '   nodejs.org and takes a minute.\n\n'
  printf '   Opening the page now. Install it, then open this file again.\n\n'
  open 'https://nodejs.org/en/download' || true
  read -r -p '   Press return to close. '
  exit 1
fi

# --- the agent itself ----------------------------------------------
# A failed download must not leave a half-written agent behind, so each
# file lands beside the real one and is moved into place.
printf '   Getting the latest version...\n'
if curl -fsSL -o "$DIR/agent.mjs.new" "$BASE/agent.mjs" \
   && curl -fsSL -o "$DIR/recorder.jxa.js.new" "$BASE/recorder.jxa.js"; then
  mv -f "$DIR/agent.mjs.new" "$DIR/agent.mjs"
  mv -f "$DIR/recorder.jxa.js.new" "$DIR/recorder.jxa.js"
elif [ -f "$DIR/agent.mjs" ]; then
  rm -f "$DIR"/*.new
  printf '   Could not check for a new version - carrying on with the one\n'
  printf '   already on this computer.\n'
else
  rm -f "$DIR"/*.new
  printf '   Could not reach JobScout, and there is nothing downloaded yet.\n'
  printf '   Check the internet connection and open this file again.\n\n'
  read -r -p '   Press return to close. '
  exit 1
fi

printf '\n'
"$NODE" "$DIR/agent.mjs"

# The agent only returns when it is stopped. Hold the window so that
# whatever it said last is still readable.
printf '\n   Arnie has stopped on this computer.\n\n'
read -r -p '   Press return to close. '
