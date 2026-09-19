# Internal Chromium project synchronization

The `dev/internal-chromium` project was fast-forwarded to the validated `dev/mainstream` line at `c6a4fff`, then received the six original internal-browser/menu commits in their original order. The conflict resolution preserves the mainstream Pets overlay and its deadline-based scheduler, Skills, settings/UI work, icon system and shell panel motion. Internal Chromium remains the only divergent browser owner.

The combined shell uses stable tracks in the order `[internal browser] [sidebar] [workspace]`. Closing the browser parks its native `WebContentsView` before animating the renderer track. Startup establishes the browser session and bridge before enabling the window, but prewarming the hidden ChatGPT document is non-blocking. Extension tests now inject the same `browserTabs` boundary used by the Electron host instead of silently exercising obsolete `chrome.tabs` ownership.

## 2026-09-19 lab provenance repair

A comparison with frozen ref `archive/port-fork-delta-2026-09-18` found that the split retained
the pre-Phosphor View renderer. The later common Pets/icon commit had changed Internal-only
`view-menu.html`, `view-menu.css`, `view-menu.ts` and the plural menu label, but those hunks were
not present when the common stack was replayed into mainstream. The three View renderer files
and the missing `test/internal-browser-renderer.test.ts` are now byte-for-byte equal to their
approved lab blobs. The plural Desktop pets label and translations were restored, and the View
test now pins the shared Phosphor classes while allowing only the bespoke ChatGPT brand SVG.

Final parity validation passed 56/56 focused View, renderer-state and Internal-browser renderer
tests, `npm run typecheck`, `npm run build`, and the real-Electron View, Agents & automation,
compact Connection and four-direction panel-motion verifiers.

The subsequently required whole-delta audit found another loss beyond View. Commit `d47d1e8`
correctly removed Internal-browser diagnostics from mainstream, but that cleanup was later merged
into this project without restoring the Internal adapter. `connection-popover.ts` again queries
the hosted-tab state alongside companion diagnostics, scopes recorder data to the matching tab
and projects the live-host/pending-recorder state. The original renderer-state regression and
five translations were restored. The full 16-commit/path/test matrix lives in
`docs/worklog-lab-port-integrity-audit-2026-09-19.md`.

Validation completed for the original 2026-09-18 synchronization block:

- `npm run typecheck`
- `npm run build`
- 437 focused internal-browser, view-menu, extension, sidebar, renderer and Pets tests
- 417 input/IPC/plugin-refresh/project/layout/lifecycle integration tests after adapting their browser-host fixtures
- the four originally load-sensitive exact cases passed in isolation: output budget, PowerShell cut pipeline, terminal custody and content-stream grouping
- six automatic-Continue timing cases passed in isolation
- `npx electron scripts/verify-panel-motion.cjs` measured intermediate Chromium geometry in all four panel directions

The first full `npm run verify` was intentionally retained as evidence rather than treated as success: it exposed obsolete external-Chrome fixtures and load-sensitive timing failures. The fixtures were repaired at their browser ownership boundary. The repeated full suite then passed 5,335 tests with 44 intentional skips; its only two failures were load-sensitive cases that both passed immediately in isolation (the real PowerShell `Select-Object -First` process probe and a fake-clock silence-window test). The separately gated `test/mcp-shutdown.test.ts` passed all 6 tests.

The later whole-delta audit supersedes those run totals for the repaired tree; its current counts,
isolated reruns and evidence limits are recorded in the integrity worklog linked above.
