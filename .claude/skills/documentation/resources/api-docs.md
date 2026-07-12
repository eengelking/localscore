# Keeping docs/API.md in sync

`docs/API.md` is the single route table for localscore's JSON API: one section
per route, each with a working `curl` example and the actual response shape.
Anyone building against the API (including a future Claude session) should be
able to read this file and never need to open `server/src/routes/`.

## When to update it

Any change to routes, request/response shapes, status codes, or error bodies
gets a matching update to `docs/API.md` in the **same commit** as the code
change, not a follow-up. Concretely, that includes:

- A new route.
- A changed request body shape (new/renamed/removed field, changed type).
- A changed response shape.
- A new status code a route can now return (e.g. a route that only ever 200'd
  now also 404s in some case).
- A new or changed error condition.

## Conventions to preserve

- Everything lives under `/api`, there is no authentication, and errors are
  always `{ "error": "message" }` with an appropriate HTTP status code, never a
  stack trace or an unstructured message. If a change introduces an error case
  that doesn't follow this shape, that's a bug to fix, not a doc discrepancy to
  paper over.
- Every route gets a real, runnable `curl` example against
  `http://localhost:8080`, plus the actual JSON response shape below it (or a
  representative example if the shape is large/nested).
- Where a route's behavior has a non-obvious rule (a cache-first read, an
  upsert-by-different-keys-depending-on-source, a COALESCE-style partial
  update), state the rule in prose next to the route, not just the shape. The
  shape alone doesn't tell a reader *why* two calls with the same body might
  produce different results.
- Keep the route ordering and section-heading style consistent with the rest of
  the file (health, catalog, environments, score, cve, vulnerabilities, ...).
  Skim the existing file for the current order before adding a new section, and
  insert new routes near their closest sibling rather than appending everything
  at the end.

## What NOT to do

- Don't describe internal implementation details (which SQL table backs a
  route, which function computes a field) unless that detail is itself part of
  the contract a caller needs to know (e.g. "a cached CVE is served with no
  network call unless `?refresh=1`" is caller-relevant; "this reads from the
  `vulnerabilities` table" usually isn't).
- Don't let `docs/API.md` drift into a second copy of `CLAUDE.md`'s
  architecture narration. It's a route table with examples, not an essay.
