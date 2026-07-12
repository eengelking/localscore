# Verifying frontend changes with Playwright

This environment has no built-in browser or screenshot tool, but a system
Chrome install is available at `/Applications/Google Chrome.app`. Use it to
actually see and click through UI changes instead of trusting the code.

## Setup

```bash
npm install --no-save playwright-core
```

`--no-save` is not optional here. This is a verification tool, not an app
dependency, and must never land in any `package.json`.

```js
const { chromium } = require("playwright-core");
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
```

Screenshot with `page.screenshot({ path, fullPage: true })`.

Drive the app against the Test 2 server (`PORT=8081 node server/dist/index.js`
after `npm run build`) so what you're screenshotting matches what actually
ships, not the Vite dev server's behavior.

## Pitfalls

- **`text=` selectors substring-match case-insensitively and can silently click
  the wrong element.** `page.click("text=Next")` can match a non-interactive
  element whose text merely *contains* "next", e.g. an option description
  that says "...wiped on the **next** automated rebuild," with no error, just
  a no-op click on the wrong thing. Use
  `page.getByRole("button", { name, exact: true })` or scope with a specific
  CSS class (e.g. `.interview-nav .button-primary`) instead of loose text
  matching.
- **Hover-state bugs need a hover screenshot or a computed-style check.** A
  static screenshot isn't enough. This repo hit a real case: a CSS
  specificity bug flipped an active tab's hover text to the same color as its
  background (invisible), but a plain non-hovered screenshot looked
  completely fine. It was only caught via Playwright plus
  `getComputedStyle()` on the hovered element. Whenever a change touches
  `:hover`, `:focus`, or other interaction-state styling, verify the
  interaction state directly (hover the element via Playwright, then either
  screenshot mid-hover or read `getComputedStyle`), not just the resting
  state.

## What to actually verify

Test the golden path and the edge cases for the feature you changed, and
watch for regressions in adjacent features you didn't mean to touch. A UI
change verified only in isolation can still break something else on the same
screen. Check both light and dark theme when the change touches anything
color-related (severity pills, action buttons, the theme toggle itself).
