# Publishing a release image

This is separate from Test 1 (the `testing` skill's container gate, which only
builds `localscore:local` for local verification and is never pushed). A
release build is any container image meant to be published to
`docker.io/eengelking/localscore`.

This runs on the **feature branch itself, before the PR merges**. The image
that gets published is built from the code that will land on `main` once the
PR merges, not from `main` after the fact. Only the git tag and GitHub Release
(see `tag-and-github-release.md`) wait for the actual merge.

## Build, tag, push

```bash
podman build --format docker -t localscore:<version> .
```

Always a fresh build. Never reuse a stale local image, since the whole point
is publishing what's actually on this branch. **`--format docker` is
required**: Podman's default OCI build format silently drops the Dockerfile's
`HEALTHCHECK` instruction with only a warning, no error, and a release image
without a working healthcheck defeats the point of shipping one.

```bash
podman tag localscore:<version> docker.io/eengelking/localscore:<version>
podman tag localscore:<version> docker.io/eengelking/localscore:latest
podman push docker.io/eengelking/localscore:<version>
podman push docker.io/eengelking/localscore:latest
```

Never push an ad-hoc/untagged image, and never push `latest` alone without
also pushing the matching version tag. A `latest`-only push loses the ability
to pin or roll back to a specific release.

## Verify, don't trust exit codes

A clean exit from `podman push` isn't sufficient confirmation. Verify the push
actually landed on the registry:

```bash
podman inspect docker.io/eengelking/localscore:<version> --format '{{.Digest}}'
podman inspect docker.io/eengelking/localscore:latest --format '{{.Digest}}'
```

Assert the two digests are equal. That confirms both tags point at the same
image on the registry, not just that both push commands returned 0.

**`skopeo` is not installed on this machine**, and `podman manifest inspect`
against a plain (non-manifest-list) image returns `"manifests": null`, not a
digest. That method doesn't work here even though it looks like the obvious
choice. The `podman inspect --format '{{.Digest}}'` approach above is the one
that's confirmed to actually work in this environment.

## Using the script

`scripts/release-build.mjs <version>` wraps the whole build, tag, push,
digest-verify, and smoke-test sequence:

1. Fresh build with `--format docker`.
2. Tag and push both `<version>` and `latest`.
3. Digest-verify (the method above).
4. Run the pushed image on a scratch port, poll health, hit `/api/health`
   (reusing the same check the `testing` skill's `scripts/smoke.mjs` performs),
   then remove the scratch container.
5. Print one `RELEASE_RESULT version=<version> build=ok push=ok
   digestMatch=ok healthcheck=ok` line (or a `step=... error="..."
   log=<path>` line on failure, with full chatty output redirected to
   `.release-logs/<version>-build.log`, gitignored).

## After a verified push

Hand off to the `attestation` skill. Every published image gets an SBOM and a
keyless cosign signature/attestation bound to the digest you just verified.
Don't consider the image "published" until that step also succeeds; an
attestation failure blocks the release from being announced as complete, it's
not an optional add-on to shrug off.

## Cleanup

Once the push and attestation are verified, clean up the local build per the
`testing` skill's container-cleanup rules. Ask before removing images, and
run `podman image prune -f` (or `scripts/podman-cleanup.sh --yes`) after
repeated builds against the same tag.
