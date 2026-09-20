# Upstream synchronization — 2026-09-20

## Scope

Merge `totec448-spec/chat-on-steroids` `upstream/main` at `8f76ccc` into the
Mainstream fork, then carry that reviewed common result into Internal Chromium.
The incoming range starts after `4dca9aa` and contains the shell project/worker
identity, socket handoff, background input preparation, completed-final handoff,
and Japanese interface changes from PR #322.

## Mainstream integration

- Preserved the fork's Appearance/Setup section structure, Phosphor controls,
  940 px settings canvas, individual setup cards, and existing responsive rules.
- Added the upstream Japanese selector, catalog, keyboard/persistence behavior,
  CJK typography, and setup-header coverage to that structure.
- Extended the fork-owned native View menu snapshot to carry Japanese as a valid
  renderer language.
- Filled the Japanese catalog for the fork-owned Pets, Skills, Appearance,
  Usage, automation, connection, and composer copy that does not exist upstream.
- Combined the setup verifier's fork layout assertions with the upstream compact
  language-control assertions instead of discarding either suite.
- Made the generated-image grouping test assert its structural boundary rather
  than waiting for the independently animated assistant text to finish revealing.

## Validation

- `git diff --check`
- `npm run typecheck`
- 1,284 focused upstream tests before catalog completion: 1,283 passed and the
  missing Japanese catalog coverage exposed the fork-only strings.
- Japanese/View focused rerun: 14 passed.
- Real Chromium Setup verifier: 60 layout/header checks passed, including
  keyboard selection and persisted Japanese.
- Full verification prerequisites passed: privacy, notices, TypeScript, Electron
  resolution, and native resource sealing.
- The default all-suite run reached 5,621 passed / 44 skipped and exposed one
  30-second PowerShell pipeline timeout under process contention. The exact case
  passed in 1.48 seconds alone and its complete file passed 124/124.
- The complete main suite then passed with bounded concurrency: 5,622 passed /
  44 skipped. The separately owned shutdown suite passed 6/6.
- Production `npm run build` passed.
- The real Chromium active-tab/background preparation verifier passed all seven
  lease, same-document handoff, hidden scheduling, and release checks.

## Internal Chromium integration

- Merged the reviewed Mainstream integration rather than independently merging
  upstream a second time.
- Preserved `/browser-host` as the Internal tab authority and omitted the
  external-Chrome background-window reconciliation path. Internal views already
  stay mounted offscreen with `backgroundThrottling: false`, so the debugger
  rendering lease remains deliberately disabled there.
- Passed the hosted tab snapshot with each update event and applied the same
  exact-document navigation proof before retiring a document. This retains the
  upstream identity fix without inventing a second tab owner.
- Extended Japanese coverage for the Internal-only built-in browser copy.
- Internal focused validation: TypeScript, desktop input maintenance 145/145,
  and internal browser host 10/10 passed before full verification.
- Extension-focused validation passed 240/240; the combined upstream-focused
  set passed 873/873; Japanese/View coverage passed 14/14.
- The complete Internal main suite passed with bounded concurrency: 5,608
  passed / 44 skipped. The separately owned shutdown suite passed 6/6.
- Production build and the real Chromium Setup verifier passed all 60 checks.
- The Windows x64 installer was generated successfully at
  `release/Chat-On-Steroids-Setup-x64.exe`.
