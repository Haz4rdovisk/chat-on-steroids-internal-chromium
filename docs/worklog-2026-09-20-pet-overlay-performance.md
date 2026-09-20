# Desktop Pets overlay performance — 2026-09-20

## Root cause

The deadline scheduler from `d398318` was still working: hidden and reduced-motion
pets had no animation frame loop. The remaining host cost came from a separate
boundary. On Windows, main sampled the native cursor every 50 ms even though
Electron can forward mouse movement through an ignored transparent window. A
stationary cursor still produced four IPC messages per second. Each message made
the renderer read pet geometry. During movement, pet position changed `left/top`,
and every pet also owned a transparent props element covering the entire desktop.

The former performance fixture loaded only the renderer in an 1100×850 window, so
it could not measure the native poll, fullscreen transparent host, always-on-top
composition, IPC, or an underlying owner window.

## Repair

- Windows and macOS now use Electron's forwarded mouse-move path. Main seeds the
  current cursor once when showing Pets and creates no recurring cursor timer.
  Linux retains the existing bounded poll as the platform fallback.
- The renderer calculates ordinary pet proximity from `PetMachine.position`
  instead of forcing a layout read. Tray and menu geometry are read only while
  those surfaces are open.
- Pet travel uses `translate3d`; each 160×160 pet is layout-contained without
  paint clipping. Prop roots are zero-sized coordinate origins instead of
  fullscreen transparent layout boxes.
- Main suppresses unchanged overlay snapshots and control-state IPC. With no
  active pet it clears task expiry work and does not recompute activity snapshots.
- The performance verifier gained `--full-host`, primary-work-area sizing,
  always-on-top/click-through behavior, an underlying owner renderer, pointer
  rates, and per-renderer process labels.

No atlas, authored frame duration, autonomous decision, task reaction, drag,
click, context-menu, visibility, favorite, imported-pet, or library contract was
changed.

## Measured evidence

Both runs used Electron 44.3.0 on the same Windows machine with 12 logical
processors. CPU is total measured app-process CPU time normalized across those
processors. It is fixture evidence, not installed-payload or whole-system proof.

| Phase | Before CPU | After CPU | Before layouts/s | After layouts/s |
| --- | ---: | ---: | ---: | ---: |
| Idle | 0.393% | 0.232% | 0 | 0 |
| Autonomous | 0.664% | 0.564% | 4.88 | 0 |
| OpenAI action | 1.052% | 0.894% | 7.63 | 1.18 |
| Anthropic action | 2.004% | 1.833% | 15.53 | 0.23 |
| Static reduced motion | 0.240% | 0.028% | 0 | 0 |

The final Windows run recorded zero cursor samples/messages per second after the
one initial seed. Static visible cost matched the hidden sample within measurement
noise (0.028% versus 0.029%). The underlying owner renderer used effectively zero
CPU during sustained pet actions in this fixture.

## Validation

- Five focused Pet suites passed: 15/15 tests.
- Typecheck and production build passed.
- `scripts/verify-pet-performance.cjs optimized-full-host --full-host --check`
  passed, including the no-polling and zero-static-RAF assertions.
- The built Electron overlay smoke passed. It measured a native 160×160 body and
  visible atlas pixels, exercised forwarded proximity and click-through state,
  dragged and persisted the pet, opened the task tray and context menu, temporarily
  hid/restored the active pet, minimized the owner, and restored the same owner
  screen on click.
- The Impeccable diff detector completed without findings.

Packaging, installer behavior, unrelated desktop applications, and a long-running
real provider task remain separate evidence levels.
