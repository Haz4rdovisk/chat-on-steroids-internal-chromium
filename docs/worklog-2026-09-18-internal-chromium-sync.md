# Internal Chromium project synchronization

The `dev/internal-chromium` project was fast-forwarded to the validated `dev/mainstream` line at `c6a4fff`, then received the six original internal-browser/menu commits in their original order. The conflict resolution preserves the mainstream Pets overlay and its deadline-based scheduler, Skills, settings/UI work, icon system and shell panel motion. Internal Chromium remains the only divergent browser owner.

The combined shell uses stable tracks in the order `[internal browser] [sidebar] [workspace]`. Closing the browser parks its native `WebContentsView` before animating the renderer track. Startup establishes the browser session and bridge before enabling the window, but prewarming the hidden ChatGPT document is non-blocking. Extension tests now inject the same `browserTabs` boundary used by the Electron host instead of silently exercising obsolete `chrome.tabs` ownership.

Validation completed for this synchronization block:

- `npm run typecheck`
- `npm run build`
- 437 focused internal-browser, view-menu, extension, sidebar, renderer and Pets tests
- 417 input/IPC/plugin-refresh/project/layout/lifecycle integration tests after adapting their browser-host fixtures
- the four originally load-sensitive exact cases passed in isolation: output budget, PowerShell cut pipeline, terminal custody and content-stream grouping
- six automatic-Continue timing cases passed in isolation
- `npx electron scripts/verify-panel-motion.cjs` measured intermediate Chromium geometry in all four panel directions

The first full `npm run verify` was intentionally retained as evidence rather than treated as success: it exposed obsolete external-Chrome fixtures and load-sensitive timing failures. The fixtures were repaired at their browser ownership boundary; a final full gate follows this worklog update.
