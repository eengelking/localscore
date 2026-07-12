# Keeping testing procedure docs in sync

localscore's testing procedure is documented in more than one place: the
`testing` skill's own resources (the authoritative HOW), and shorter mentions in
`CLAUDE.md`/`CONTRIBUTING.md` (pointers, not full copies). The risk with more
than one home for the same procedure is that they fork silently: someone
updates the command in one place and the other goes stale, and a future reader
follows the stale one.

## The rule

When a change alters how the project is tested (a new test suite, a new
Vitest config option, a new verification procedure, a changed command, a new
mandated test case), update the `testing` skill's relevant resource file *and*
any `CLAUDE.md`/`CONTRIBUTING.md` mention of that same procedure, in the same
commit. Don't update one and leave the other implicitly "still basically
right"; check it explicitly.

Concretely, before committing a testing-relevant change, ask:

- Did the command to run tests change (new flag, new workspace target, a
  renamed npm script)? Check the `testing` skill's `running-tests.md` resource
  and any place `CLAUDE.md`/`CONTRIBUTING.md` quotes that command.
- Did a new mandated test case get added (something that must always exist,
  like the zero-answers-reproduces-base-score invariant or the markdown
  sanitizer safety test)? Check `writing-tests.md`.
- Did the container verification procedure change? Check `container-test.md`.
- Did a new gotcha get discovered (a timeout that needs a longer
  `testTimeout`, a mock that needs a reset hook)? Encode it in the relevant
  `testing` skill resource so the next person doesn't rediscover it by trial
  and error.

## Why this matters here specifically

This repo has already hit real gotchas that only got documented once (a
throttle needing a test-only reset hook, a `testTimeout` bump for a
throttled-NVD-call test suite). Those facts are cheap to write down and
expensive to rediscover under time pressure. A forked or stale testing doc is
worse than no doc, since it actively misleads instead of just being silent.
