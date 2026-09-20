# Assistant response streaming — 2026-09-19

## Scope

Smoothed the visible delivery of canonical assistant-message revisions and added a response
copy action. This is renderer presentation only: the recorder, session store and extension
remain the owners of message content and publication timing.

## Implementation

- Live append-only revisions now reveal their newly recorded characters over a bounded series
  of animation frames instead of appearing as roughly 400 ms blocks.
- The reveal cadence now paints near 50 fps and spans at most 460 ms for an interim revision,
  slightly slower than before so adjacent recorder bursts visually overlap instead of reading
  as separate pulses. Final catch-up remains independently bounded at 220 ms.
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
- The thinking row now reserves its final layout space while delivery is pending. Confirmation
  reveals that same node without changing message, indicator or viewport geometry; message and
  indicator entrances use opacity only, so crossing a fast receipt cannot produce opposing
  vertical jumps. The pending clock and cancel action share a 22 px slot and 15 px glyph size.
- Queue refreshes retain the reader's real live-tail policy when they repaint retired automatic
  input projections. They no longer force a non-following viewport for the roughly 400 ms before
  the coalesced canonical history reload, which was visibly moving the transcript down and back.

## Validation

- Mainstream and Internal Chromium: 272 timeline/layout/model/composer tests passed in each
  repository. Coverage includes the authored message, live-reply follow, explicit upward-scroll
  release and return-to-bottom contract.
- Focused streaming tests prove an intermediate partial reveal, exact final text, reduced-motion
  bypass, stable row identity, complete clipboard content, thinking dismissal on response/error,
  the check-before-thinking sequence, and the bounded fallback timeout.
- Typecheck and `git diff --check` passed in both repositories.
- The real Electron input-queue harness passed 16 checks in both repositories, including
  sub-pixel-stable message/thinking positions, unchanged scroll position and matching pending
  status/cancel dimensions across the delivery transition.
- The harness now uses the recorded 1028×546 viewport, an overflowing prior answer and a retained
  scroll reserve, then stages queued → sent → canonical history separately. It requires the prior
  answer, user bubble, thinking row and scroll position to remain stable within one CSS pixel.
- Frame analysis of the reported 30 fps recording measured the defect as an instantaneous 28 px
  viewport shift lasting 13 frames (about 0.43 s), matching the session reload debounce.
- Impeccable detector reported only the pre-existing `side-tab` warning outside this change.
- Internal Chromium Windows x64 packaging and packaged-runtime smoke passed. The unsigned NSIS
  installer was produced as `release/Chat-On-Steroids-Setup-x64.exe`.
