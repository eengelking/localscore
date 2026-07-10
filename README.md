# localscore

**localscore** turns a CVSS base score into the score that actually applies to *your* systems.

A vulnerability scanner reports a 10.0 and everyone panics — but the CVSS base score describes a worst-case target: reachable from anywhere, full of secrets, and impossible to lose. Most real systems don't look like that. CVSS has environmental metrics built in to correct for this, but the official calculators are expert-facing and almost nobody uses them.

localscore fixes that by asking plain-English questions about a location instead of CVSS jargon, then applying the answers to any vulnerability you paste in.

> Self-hosted, single container, SQLite on a volume. No account, no cloud dependency — the only optional network call is looking up a CVE by ID from NVD.

## How it works

1. **Define a location.** Give it a name, e.g. *"My Data Center"*, *"Retail Kiosks"*, *"Dev Lab"*.
2. **Answer the interview.** ~12 short questions — how reachable it is, whether it needs a login, what happens if data on it leaks or the box goes down, whether compromising it gives an attacker a path to anything else. No CVSS knowledge required.
3. **Repeat for each location you care about.** Every environment gets its own saved profile.
4. **Paste a CVSS vector, or look one up by CVE ID.** localscore parses the base score and, for every environment you've defined, shows the *modified* score next to it — with a plain-English breakdown of exactly which answers caused each change. A CVE lookup that finds multiple disagreeing NVD-reported scores lets you pick which one to score.

A 9.8 "Critical" against a production database might land at 9.8 for your data center and 0.0 for a disposable dev environment that gets rebuilt from a pipeline every morning. Same vulnerability, two very different stories — and now you can see both.

## Features

- **The interview & environment profiles.** ~12 plain-English questions per location, saved as an editable profile — revisit and re-answer at any time, with prior answers pre-selected.
- **Scoring.** Paste any CVSS v4.0, v3.1, or v3.0 vector (v3.0 is scored with v3.1's equations, disclosed in the UI), or look one up by CVE ID. Every defined environment gets its own modified score, animated from base to modified on load, with a plain-English "why" breakdown of exactly which answers moved the number and by how much.
- **Risk warnings.** Environments are flagged two independent ways: when an answer can legitimately *raise* a score above base (e.g. "compromising this is a stepping stone to something bigger"), and when a combination of high stakes plus a readiness gap (uncertain recovery, concentrated availability, hard-to-patch systems) suggests the profile itself deserves a second look.
- **NVD CVE lookup** — cache-first, throttled, and tolerant of NVD being unreachable, with description, references, and affected products pulled from the same cached response. Supports an optional `NVD_API_KEY` to raise the lookup rate limit.
- **A Major CVEs feed** — the 10 most critical CVEs published in the last 30 days, refreshed daily, one click away from scoring against your environments.
- **Saved vulnerabilities** with full-content search (label, CVE ID, vector, description, and the cached NVD payload), type/severity filters, inline editing, and markdown-rendered descriptions.
- **A design system with light/dark theming** and offline-aware UI — CVE lookup and the Major CVEs tab disable themselves with an explanatory tooltip when there's no network, rather than hanging or erroring.
- **A container image under 300 MB** that builds and runs cleanly under Podman or Docker, with its own `HEALTHCHECK`, and a **published image** on Docker Hub so you can run it without building locally.

## Running it

Pull and run the published image:

```bash
podman run -d --name localscore -p 8080:8080 \
  -v localscore-data:/data \
  docker.io/eengelking/localscore:latest
```

or with a bind mount so the database lands on disk somewhere you control:

```bash
podman run -d --name localscore -p 8080:8080 \
  -v "$PWD/data:/data" \
  docker.io/eengelking/localscore:latest
```

Then open `http://localhost:8080`.

To build locally instead (e.g. to test an unreleased change):

```bash
podman build --format docker -t localscore .
```

(The `--format docker` flag matters: Podman defaults to the OCI image format, which silently drops the Dockerfile's `HEALTHCHECK` instruction. Without it, `podman ps` and `podman inspect` won't show a health status.)

Then run it the same way, swapping `docker.io/eengelking/localscore:latest` for the locally built `localscore` tag.

`PORT` and `DATA_DIR` are configurable (see `.env.example`); there's also an optional `NVD_API_KEY` that raises NVD's CVE-lookup rate limit above the default ~5 requests/30s — pass it through with `-e NVD_API_KEY=...` if you hit that limit.

Any OCI-compatible tool (Docker included) works the same way — the image and `compose.yaml` aren't Podman-specific. Also see `compose.yaml` for the same setup as a single `podman compose up` (or `docker compose up`).

## Developing locally

Without a container, for iterating on the code:

```bash
npm install
npm run dev:server   # API on :8080, reloads on change
npm run dev:web      # Vite dev server, proxies /api to :8080
```

`npm test`, `npm run typecheck`, and `npm run lint` all run against both workspaces — the same checks a GitHub Actions CI run enforces on every pull request. See [`CLAUDE.md`](./CLAUDE.md) for the full command reference and architecture notes, and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to propose and submit changes.

## Using the API directly

Every route the UI uses — environments, the interview, scoring, CVE lookup, saved vulnerabilities — is also usable directly. See [`docs/API.md`](./docs/API.md) for curl examples and response shapes for every route.

## What it does *not* do

- It doesn't scan anything or talk to your infrastructure — you tell it about a location by answering questions, and you paste in vectors or CVE IDs.
- It doesn't guess whether an exploit exists in the wild (CVSS threat/temporal metrics) — those are per-vulnerability, not per-environment, and are shown read-only from whatever you paste in.
- It doesn't support CVSS v2.0 (NVD stopped assigning it in 2022).
- It doesn't require an internet connection, except for the optional "look up this CVE by ID" convenience.

## Contributing

Bug reports, feature ideas, and pull requests are welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev setup, test/lint commands, branch conventions, and PR expectations.

## Why this exists

Longer background on the problem this tool solves: [*"That CVSS 10 Might Actually Be a Zero"*](https://edengelking.com/blog/that-cvss-10-might-actually-be-a-zero) — the base score is only one input into a much bigger scoring system, and the environmental metrics are the part almost nobody reads.
