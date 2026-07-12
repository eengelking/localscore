# Red path: a broken Dependabot update

This is the current convention for a Dependabot PR with a red CI check (or an
update otherwise found to be broken during investigation). It replaces an
earlier "investigate in place, fix on the same branch" approach. Filing an
issue and closing the PR keeps the automated update from lingering half-broken
while giving the incompatibility a durable, trackable home.

## Steps

1. **Investigate enough to describe the failure concretely.** You don't need
   to fix it yet, but you need to know *what* actually broke, which test
   failed and why, or which build step errored, not just "CI is red." Read the
   actual failure output (see the `testing` skill's `fixing-failures.md` for
   how to diagnose a failure in general).

2. **File a new issue** describing the incompatibility:

   ```bash
   gh issue create --title "..." --body "..."
   ```

   The body must **reference the original Dependabot PR** (`#<n>`) so the
   history is traceable. Issue bodies must be self-contained: describe the
   failure in the issue body itself, don't cite line numbers in ephemeral
   docs or transient CI output that won't exist by the time someone reads the
   issue later. Include the concrete failure (error message, failing test
   name) directly in the body.

3. **Close the original PR**, with a comment pointing at the new issue:

   ```bash
   gh pr close <number> --comment "Superseded by #<issue-number>. CI failure needs investigation before this update can land. See the issue for details."
   ```

4. **Stop there.** Filing the issue is not authorization to start the fix.
   This is the same rule as the repo's general issue-intake convention: wait
   for the user to say which filed issue to pick up next, same as any other
   task.

## When the fix is later picked up

Once the user says to work on the issue, it's handled like any other task, not
specially because it originated from Dependabot:

- Branch off `main` (not off the closed Dependabot branch, which is gone).
- Resolve the incompatibility. This may mean taking the dependency bump plus
  a code fix, or it may mean the bump itself needs to wait on an upstream fix;
  use judgment based on what the investigation found.
- Open a fresh PR through the `release` skill's normal flow (this is a regular
  code-changing PR at that point, subject to the same version-bump/release
  rules as anything else. The bump size is whatever the actual change
  warrants, not necessarily still "patch" just because the trigger was a
  dependency bump).
