---
name: attestation
description: Run this skill when publishing a localscore release image, generating an SBOM, signing the image, and attesting the SBOM to it, or when asked to verify the supply-chain attestation of an already-published docker.io/eengelking/localscore image. Invoked as a step inside the release flow, from the release skill's container-publish.md, right after a push is digest-verified. Also consult it if cosign or syft commands, SBOMs, image signing, or provenance/attestation come up for this project.
---

# Attestation

Supply-chain attestation for published localscore images: every version pushed
to `docker.io/eengelking/localscore` gets a Software Bill of Materials (SBOM)
and a cryptographic signature binding that SBOM to the exact image digest, so
anyone (including a future Claude session) can verify what's actually running
in a pulled image and where its dependencies came from.

This is a new capability, not something extracted from old workflow docs. It
did not exist before this skill.

## Why this looks the way it does

localscore's images are built **locally with Podman** and pushed straight to
Docker Hub. There's no CI pipeline building the image, so GitHub's
`gh attestation` / Actions-native provenance doesn't apply here (it attests
builds that happened in GitHub Actions, and this one didn't). If releases ever
move into CI, revisit this: Actions-native attestation would likely be a
better fit at that point. Until then, `cosign` + `syft` running locally is the
mechanism.

**Signing mode: keyless (Sigstore OIDC).** No key material to generate,
protect, or rotate. Each signing does a short browser-based OIDC login
(GitHub or Google identity) against Sigstore's public transparency log. This
was chosen deliberately over a generated key pair for this project: no local
secret to lose or leak, at the cost of an interactive login step per release.
(If this project ever needs unattended/non-interactive signing, e.g. a future
CI-based release flow, a key pair or Sigstore's OIDC-in-CI flow would need
revisiting; don't silently switch signing modes without that conversation.)

## Tooling check

Before signing, confirm `cosign` and `syft` are on `PATH`:

```bash
cosign version
syft version
```

If either is missing, tell the user what to install rather than failing
cryptically:

```bash
brew install cosign syft
```

Don't assume both are present just because they were installed once. A fresh
machine or a fresh environment for a future session won't have them, and the
skill should degrade to a clear instruction, not a confusing tool-not-found
error mid-release.

## Procedure

Run this against the exact digest verified in the `release` skill's
`container-publish.md` step (not the tag: tags are mutable, digests aren't,
and "attest the digest" is the whole point of binding these claims to a
specific image content rather than a name that can be repointed later).

1. **Generate the SBOM**:

   ```bash
   syft docker.io/eengelking/localscore:<version> -o spdx-json > sbom-<version>.spdx.json
   ```

2. **Sign the image by digest** (keyless):

   ```bash
   DIGEST=$(podman inspect docker.io/eengelking/localscore:<version> --format '{{.Digest}}')
   cosign sign docker.io/eengelking/localscore@$DIGEST
   ```

   This opens a browser for the OIDC login on first use in a session (or
   reuses a cached identity token if one's still valid). Sign the digest
   reference (`name@sha256:...`), not the tag reference. See above for why.

3. **Attest the SBOM to the same digest**, binding it cryptographically rather
   than just attaching it as a loose file:

   ```bash
   cosign attest --predicate sbom-<version>.spdx.json --type spdxjson \
     docker.io/eengelking/localscore@$DIGEST
   ```

   Also keyless, same OIDC flow.

4. **Upload the SBOM as a release asset** too, so it's browsable without
   needing `cosign` to extract it:

   ```bash
   gh release upload <version> sbom-<version>.spdx.json
   ```

   Run this after the `release` skill's `tag-and-github-release.md` step has
   created the release (the release must exist before you can upload an asset
   to it).

5. **Verify.** See `resources/verification.md` for the full
   `cosign verify` / `cosign verify-attestation` procedure. Run this once
   after signing to confirm the signature/attestation actually landed and
   validates, don't just trust that the commands exited 0.

## Failure handling

**Attestation failure blocks the release from being announced as complete.**
If signing or attestation fails partway through, report it plainly, don't
report the release as done and quietly skip this step. The image is already
pushed and functional at that point, but an unattested release is a real gap
in this project's supply-chain posture, worth surfacing rather than shrugging
off.

## Resources

- `resources/verification.md`: the `cosign verify`/`verify-attestation`
  commands anyone (including a future session) can run against a published
  image, plus what to check in the output.
