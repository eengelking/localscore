# Verifying a published image's attestation

Anyone with `cosign` installed can verify a published localscore image's
signature and SBOM attestation without needing any localscore-specific
credentials. That's the point of Sigstore's public transparency log.

## Verify the signature

```bash
cosign verify docker.io/eengelking/localscore:<version> \
  --certificate-identity-regexp ".*" \
  --certificate-oidc-issuer-regexp ".*"
```

For real verification (not just "does *a* signature exist"), pin the identity
and issuer to what was actually used to sign, rather than a wildcard regexp.
Once you know which identity/provider is used for this project's releases,
narrow this to something like:

```bash
cosign verify docker.io/eengelking/localscore:<version> \
  --certificate-identity "<signer-email-or-identity>" \
  --certificate-oidc-issuer "https://github.com/login/oauth" # or Google's issuer URL, whichever was used
```

A wildcard regexp confirms *a* valid keyless signature exists in the
transparency log. A pinned identity confirms it was *this project's
maintainer* who signed it, not merely that someone did. Prefer the pinned form
once the actual signing identity is known and stable.

## Verify the SBOM attestation

```bash
cosign verify-attestation docker.io/eengelking/localscore:<version> \
  --type spdxjson \
  --certificate-identity-regexp ".*" \
  --certificate-oidc-issuer-regexp ".*"
```

This prints the signed attestation envelope (a JWT-like structure); the
`payload` field, base64-decoded, is the actual SPDX SBOM document. On success,
`cosign` also confirms the attestation's signature validates against the
digest you queried. If the image content changed since it was attested,
verification fails outright rather than showing you stale data silently.

## What "good" looks like

- `cosign verify` exits 0 and prints at least one valid signature with a
  certificate subject/issuer you recognize.
- `cosign verify-attestation` exits 0 and the decoded SBOM's package list
  looks like a plausible localscore dependency tree (Hono, better-sqlite3,
  React, `ae-cvss-calculator`, etc.). A wildly different or empty package
  list would suggest the attestation doesn't correspond to the image you
  think it does.

## Verifying by digest instead of tag

Since `latest` is a mutable pointer, prefer verifying by digest when the check
matters (e.g. confirming a specific deployed image, not "whatever `latest`
currently resolves to"):

```bash
cosign verify docker.io/eengelking/localscore@sha256:<digest> ...
```
