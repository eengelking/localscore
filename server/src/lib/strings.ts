const QUOTE_PAIRS: [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
];

// Repeatedly strips one matched pair of wrapping quotes (straight or curly,
// double or single) and re-trims, so nested pairs like `"'My Lab'"` fully
// unwrap. Interior/unmatched quotes (`Bob's Lab`, `say "hi"`) are untouched.
export function stripWrappingQuotes(value: string): string {
  let result = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [open, close] of QUOTE_PAIRS) {
      if (result.length >= 2 && result.startsWith(open) && result.endsWith(close)) {
        result = result.slice(open.length, result.length - close.length).trim();
        changed = true;
        break;
      }
    }
  }
  return result;
}
