# Test 1: the container gate

This is the final verification step before a change is ready to ship, the
last check confirming the container builds and runs the way it will in
production, on port 8080. It's separate from and later than Test 2 (see
`SKILL.md`): Test 2 is for iterating during development, Test 1 is the
pre-merge/pre-release gate.

## Before building

Check whether anything is already bound to port 8080:

```bash
podman ps --filter "publish=8080"
```

If a container named `localscore-test` (or anything else) is already there,
**ask the user before taking it down.** Don't stop it unilaterally, it might
be something the user is actively using.

## Build

Always build fresh. Never reuse a stale image, since the whole point is
verifying the *current* code:

```bash
podman build --format docker -t localscore:local .
```

**`--format docker` is required.** Podman's default OCI build format silently
drops the Dockerfile's `HEALTHCHECK` instruction with only a warning, no error,
so a build that "succeeds" without this flag produces an image that will
fail the container-health verification below in a confusing way, or worse,
pass verification for the wrong reason (no healthcheck to fail).

## Run and verify

```bash
podman run --name localscore-test -p 8080:8080 -d localscore:local
```

Confirm:
- `/api/health` reports healthy (`curl http://localhost:8080/api/health`
  should return `{"ok": true, "db": true}`).
- The frontend loads (a `curl` of `/` returns the built `index.html`, or check
  visually with the Playwright setup from `ui-verification.md`).
- `podman inspect localscore-test --format '{{.State.Health.Status}}'` reports
  `healthy` (give it a few seconds after start for the healthcheck to run at
  least once).

## The `podman compose` path

`podman compose up` does **not** need `--format docker`. Going through the
external `docker-compose` provider already produces a Docker-format image with
`HEALTHCHECK` intact, confirmed via `podman inspect` reporting `healthy`
after a compose-built image. The `--format docker` flag only matters for a
bare `podman build`, not for compose.

## Cleanup

Once verification is done, this is a temporary test artifact, not something to
leave running:

- **Ask before deleting.** Tell the user what you're about to remove
  (container name, volume, image) and get a go-ahead before `podman rm`,
  `podman rmi`, or `podman volume rm`, even though it's your own test
  container.
- **Clean up dangling images after repeated builds.** Each rebuild against the
  same tag orphans the previous image as a dangling `<none>`. This isn't
  cosmetic, it accumulates real disk (a real instance during initial Podman
  verification: 4 dangling images, ~1.5 GB, from 3 build iterations of the
  same tag). Run `podman image prune -f` after a run of repeated builds
  against the same tag, with the user's go-ahead.
