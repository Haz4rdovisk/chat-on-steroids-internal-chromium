# Usage Settings UI — 2026-09-18

## Outcome

Usage now uses the same centered 940px reading canvas, heading hierarchy and restrained
surfaces as Workspace and the Skills/Pets libraries. It remains one vertical task path:
recorded summary, daily token activity, editable cost comparison, then balances independently
reported by ChatGPT. Estimated costs remain explicitly a comparison, not a bill.

## Change

- Reused semantic Settings page, section and surface classes from Workspace, without changing
  existing Usage control IDs or the calculation/observation owners.
- The 52-week grid and wide data tables scroll within their own surfaces at narrow widths;
  the containing page does not scroll sideways. The summary reflows instead of squeezing
  five numbers into narrow columns.
- The formula remains a native keyboard-accessible disclosure. Focus, neutral empty days,
  and missing-balance wording retain the existing product semantics.
- Added `scripts/verify-usage-ui.cjs` to inspect actual markup/CSS in isolated Chromium with
  representative long activity, tables and model rows; no real profile or history is read.
- Updated the layout allowlist for the two intentionally local Usage scrollers and the
  existing browser-tab scroller; no browser UI implementation changed.

## Validation

- `node scripts/verify-usage-ui.cjs` — passed at 1400px and 900px.
- `node scripts/verify-workspace-ui.cjs` — passed; shared Settings classes preserve Workspace.
- `npm run typecheck` — passed.
- `npm test -- --run test/renderer-usage.test.ts test/renderer-layout.test.ts` — 44 passed.
- `npm run build` — passed (main, preload and renderer).
- Live Electron dev with the canonical `chat-on-steroids` profile — verified the top summary,
  long daily table and reported balances after the window finished restoring 91 sessions.
- `npm run verify` — privacy, notices and typecheck passed; the broad Vitest run reported
  failures in existing browser/startup/window/pet suites outside this change and was stopped
  after those failures. It is not a passing full-suite claim.
