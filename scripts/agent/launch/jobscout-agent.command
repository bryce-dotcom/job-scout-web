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
# Nobody downloading this has any reason to know what Node is, and this
# used to stop and send them to nodejs.org to install it themselves -
# which is where a Mac user gives up. The Windows launcher has fetched
# its own for a while; this does the same: the official build for this
# Mac's chip, checked against nodejs.org's own checksums, unpacked into
# our folder. Nothing is INSTALLED, nothing asks for a password, and
# Homebrew is not touched. A file fetched by curl carries no quarantine
# flag, so Gatekeeper has nothing to refuse.
NODE="$(command -v node || true)"
if [ -z "$NODE" ] && [ -x /usr/local/bin/node ]; then NODE=/usr/local/bin/node; fi
if [ -z "$NODE" ] && [ -x /opt/homebrew/bin/node ]; then NODE=/opt/homebrew/bin/node; fi
if [ -z "$NODE" ] && [ -x "$DIR/node/bin/node" ]; then NODE="$DIR/node/bin/node"; fi
if [ -z "$NODE" ]; then
  printf '   First run on this computer - getting what it needs.\n'
  printf '   About a minute, and only this once. Nothing is installed and\n'
  printf '   nothing will ask for a password.\n\n'
  case "$(uname -m)" in arm64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
  TMPN="$(mktemp -d "${TMPDIR:-/tmp}/jobscout-node.XXXXXX")"
  for LINE in latest-v24.x latest-v22.x; do
    SUMS="$(curl -fsSL "https://nodejs.org/dist/$LINE/SHASUMS256.txt" 2>/dev/null || true)"
    FILE="$(printf '%s\n' "$SUMS" | grep -o "node-v[0-9.]*-darwin-$ARCH\.tar\.gz" | head -n 1)"
    [ -n "$FILE" ] || continue
    WANT="$(printf '%s\n' "$SUMS" | grep " $FILE\$" | cut -d ' ' -f 1)"
    if curl -fsSL -o "$TMPN/$FILE" "https://nodejs.org/dist/$LINE/$FILE"; then
      if command -v shasum >/dev/null 2>&1; then GOT="$(shasum -a 256 "$TMPN/$FILE" | cut -d ' ' -f 1)"; else GOT="$(sha256sum "$TMPN/$FILE" | cut -d ' ' -f 1)"; fi
      if [ -n "$WANT" ] && [ "$GOT" = "$WANT" ] && tar -xzf "$TMPN/$FILE" -C "$TMPN"; then
        rm -rf "$DIR/node"
        mv "$TMPN/${FILE%.tar.gz}" "$DIR/node"
        chmod +x "$DIR/node/bin/node" 2>/dev/null || true
        break
      fi
      printf '   That download did not check out - trying again.\n'
    fi
  done
  rm -rf "$TMPN"
  if [ -x "$DIR/node/bin/node" ]; then NODE="$DIR/node/bin/node"; fi
fi
if [ -z "$NODE" ]; then
  printf '   Could not fetch what it needs automatically (no internet, or\n'
  printf '   a network that blocks nodejs.org).\n\n'
  printf '   Opening the Node download page - install it, then open this\n'
  printf '   file again.\n\n'
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
