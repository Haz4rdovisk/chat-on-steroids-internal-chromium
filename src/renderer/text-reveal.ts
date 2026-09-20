/**
 * Bounded presentation-only reveal for canonical streaming text.
 *
 * The recorder still owns the complete assistant revision. This helper merely bridges the
 * roughly 400 ms gaps between those revisions so the renderer does not expose each snapshot
 * as a visual jump. It never delays publication, invents text, or stores a second durable copy.
 */

const FRAME_INTERVAL_MS = 20;
const MAX_REVEAL_MS = 460;
const MAX_FINAL_REVEAL_MS = 220;
const MAX_ANIMATED_TEXT = 32 * 1024;
const MAX_ANIMATED_DELTA = 4 * 1024;

export interface TextReveal {
  update: (target: string, options: { animate: boolean; final: boolean }) => void;
  value: () => string;
  dispose: () => void;
}

function safeEnd(value: string, end: number): number {
  if (end <= 0 || end >= value.length) return end;
  const before = value.charCodeAt(end - 1), after = value.charCodeAt(end);
  return before >= 0xD800 && before <= 0xDBFF && after >= 0xDC00 && after <= 0xDFFF ? end + 1 : end;
}

function duration(chars: number, final: boolean): number {
  const ceiling = final ? MAX_FINAL_REVEAL_MS : MAX_REVEAL_MS;
  return Math.max(96, Math.min(ceiling, chars * 8));
}

/** Paints at a steady browser-frame cadence while keeping every revision bounded. */
export function createTextReveal(
  render: (visible: string, settled: boolean) => void,
  reduceMotion: () => boolean = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
): TextReveal {
  let target = '';
  let visible = 0;
  let frame: number | undefined;
  let startedAt = 0;
  let startedFrom = 0;
  let revealMs = 0;
  let lastPaintAt = 0;

  const cancel = () => {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
  };
  const settle = (next: string) => {
    cancel();
    target = next;
    visible = target.length;
    render(target, true);
  };
  const tick = (now: number) => {
    frame = undefined;
    if (now - lastPaintAt < FRAME_INTERVAL_MS) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    lastPaintAt = now;
    const progress = revealMs <= 0 ? 1 : Math.min(1, (now - startedAt) / revealMs);
    const wanted = safeEnd(target, Math.min(target.length, startedFrom + Math.ceil((target.length - startedFrom) * progress)));
    if (wanted > visible) {
      visible = wanted;
      render(target.slice(0, visible), visible === target.length);
    }
    if (visible < target.length) frame = window.requestAnimationFrame(tick);
  };

  return {
    update(next, options) {
      if (next === target && visible === target.length) {
        // Final/captured markup can become available without changing canonical text.
        render(target, true);
        return;
      }
      const appended = next.startsWith(target);
      const delta = Math.max(0, next.length - visible);
      if (!options.animate || reduceMotion() || document.visibilityState === 'hidden' || !appended ||
          next.length > MAX_ANIMATED_TEXT || delta > MAX_ANIMATED_DELTA) {
        settle(next);
        return;
      }
      cancel();
      target = next;
      startedFrom = visible;
      startedAt = window.performance.now();
      lastPaintAt = 0;
      revealMs = duration(target.length - startedFrom, options.final);
      frame = window.requestAnimationFrame(tick);
    },
    value: () => target,
    dispose: cancel
  };
}
