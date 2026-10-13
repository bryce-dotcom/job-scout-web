// What is published, and whether the agent on somebody's machine is it.
//
// The launcher re-fetches the agent every time it starts, so a person who
// restarts it is always current. A person who does NOT restart it can run the
// same copy for weeks — and nothing told them. That is not hypothetical: a
// live session sat there taking screenshots it was allowed to take, which
// completed with no picture, because its agent predated the upload. Nothing
// in the app, the log or the agent's own window could say why.
//
// Comparing version numbers would not have caught it either. A build with
// eyes and a build without both called themselves 0.4.0, because a version
// only changes when somebody remembers. `agent_build` is a hash of the
// agent's own sources, so it cannot be forgotten — that is what is compared.

import { useState, useEffect } from 'react'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/agent-releases`

/** The published release, or null while it loads / if it cannot be read. */
export function useRelease() {
  const [release, setRelease] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`${BASE}/release.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setRelease(j) }, () => {})
    return () => { alive = false }
  }, [])
  return release
}

export const releaseBase = BASE

/**
 * Is the agent on this machine behind what is published?
 *
 * Says NO unless it can be sure. An unknown answer must not nag somebody
 * whose agent is fine — and an agent too old to report a build at all is left
 * alone rather than accused, because "restart it" is bad advice if the real
 * problem is something else.
 */
export function agentIsStale(session, release) {
  if (!session || !release) return false
  const running = session.agent_build
  const published = release.agent_build
  if (!running || !published) return false
  return running !== published
}
