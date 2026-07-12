# Security Policy

localscore is a personal, educational project (see [`README.md`](../README.md#a-personal-educational-project)). It's released as-is under the MIT license, with no warranty and no SLA, but security reports are still welcome and will be looked at.

## Supported versions

Only the latest published release (`docker.io/eengelking/localscore:latest` and the matching git tag) is supported. Older tags aren't maintained. If you're running an older version, please upgrade before reporting so the fix, if one already exists, isn't wasted effort.

## Reporting a vulnerability

Please don't open a public GitHub issue for a security vulnerability. Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/eengelking/localscore/security) of this repository.
2. Click "Report a vulnerability" to open a private advisory.

This lets a fix be prepared and released before the issue is public. As a solo-maintained project there's no guaranteed response time, but reports will be read and acted on.

## Scope

localscore is self-hosted with no accounts and no cloud dependency other than the optional NVD CVE lookup. Things worth reporting include, but aren't limited to:

- Injection or XSS in any user-supplied input (environment name/description, vector strings, saved-vulnerability fields).
- Anything that lets one API caller read or modify data it shouldn't be able to touch. The app has no auth model by design, so some checks that would apply in a multi-tenant app don't apply here, but bugs are still worth flagging if they cross that assumption in an unexpected way.
- Container or image issues (running as root, exposed secrets, an overly broad attack surface).
- Issues in the NVD lookup path, such as SSRF-style abuse or unsafe handling of NVD's response data.
