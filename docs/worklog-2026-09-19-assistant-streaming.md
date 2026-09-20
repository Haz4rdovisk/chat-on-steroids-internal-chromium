# Assistant response streaming — 2026-09-19

## Scope

Smoothed the visible delivery of canonical assistant-message revisions and added a response
copy action. This is renderer presentation only: the recorder, session store and extension
remain the owners of message content and publication timing.

## Implementation

- Live append-only revisions now reveal their newly recorded characters over a bounded series
  of animation frames instead of appearing as roughly 400 ms blocks.
- The reveal catches up within 360 ms, accelerates final text, preserves surrogate pairs and
  bypasses animation for corrections, large revisions, hidden windows and reduced motion.
- Historical messages render immediately. Each live assistant row keeps its canonical DOM
  identity while revisions arrive.
- Sending elects the live tail before the asynchronous outbox refresh, so the pending user
  message is visible above the composer immediately. Live assistant revisions keep following
  that tail until an explicit upward reader gesture; returning to the bottom resumes following.
- The final assistant message of a turn ends with a quiet Phosphor copy action; partial messages
  keep it hidden so controls never interrupt the response/tool sequence. It uses the existing
  fixed preload clipboard bridge and copies the complete canonical Markdown.
- Immediate sends arm a small three-dot thinking indicator beneath the authored message, but
  it becomes visible only when that message's existing confirmation check is rendered. It is
  renderer-only, disappears on the first visible model activity or reported chat error, and
  self-retires after two minutes without adding polling or execution authority.

## Validation

- Mainstream and Internal Chromium: 272 timeline/layout/model/composer tests passed in each
  repository. Coverage includes the authored message, live-reply follow, explicit upward-scroll
  release and return-to-bottom contract.
- Focused streaming tests prove an intermediate partial reveal, exact final text, reduced-motion
  bypass, stable row identity, complete clipboard content, thinking dismissal on response/error,
  the check-before-thinking sequence, and the bounded fallback timeout.
- Typecheck and `git diff --check` passed in both repositories.
- Impeccable detector reported only the pre-existing `side-tab` warning outside this change.
- Internal Chromium Windows x64 packaging and packaged-runtime smoke passed. The unsigned NSIS
  installer was produced as `release/Chat-On-Steroids-Setup-x64.exe`.
