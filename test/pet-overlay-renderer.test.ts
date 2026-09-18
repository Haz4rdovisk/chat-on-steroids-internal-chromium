import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PetLibraryState, PetOverlayBounds, PetOverlayPointer, PetOverlaySnapshot } from '../src/shared/pets.js';
import authoredManifest from '../src/renderer/pet-assets/animations.json';

let dom: JSDOM;
const ok = <T>(data: T) => Promise.resolve({ ok: true as const, data });

const overlayBody = `
  <div id="petStage"></div>
  <section class="pet-tray" id="petTray" hidden>
    <div class="pet-tray-head"><strong>Tasks</strong><span id="petTrayCount"></span><button id="petTrayClose">×</button></div>
    <div id="petCards"></div>
  </section>`;

beforeEach(() => {
  dom = new JSDOM(`<body>${overlayBody}</body>`, { url: 'https://pet-overlay.test', pretendToBeVisual: true });
  const w = dom.window, capture = new Set<number>();
  const media = { matches: false, addEventListener: vi.fn() };
  Object.defineProperty(w, 'matchMedia', { configurable: true, value: () => media });
  w.HTMLElement.prototype.setPointerCapture = id => { capture.add(id); };
  w.HTMLElement.prototype.hasPointerCapture = id => capture.has(id);
  w.HTMLElement.prototype.releasePointerCapture = id => { capture.delete(id); };
  for (const [key, value] of Object.entries({
    window: w, document: w.document, localStorage: w.localStorage, innerWidth: 1000, innerHeight: 800,
    devicePixelRatio: 1, AbortController: w.AbortController,
    matchMedia: () => media,
    requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn()
  })) vi.stubGlobal(key, value);
});

afterEach(() => {
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  dom.window.close();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function pointer(target: HTMLElement, type: string, x: number, y: number, id = 1): void {
  const event = new dom.window.MouseEvent(type, { button: 0, clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: id });
  target.dispatchEvent(event);
}

it('uses one spritesheet body per pet while preserving specials, multi-pet tasks, drag, and click-through', async () => {
  const library: PetLibraryState = { pets: [
    { id: 'tur-tur-sahur', displayName: 'Tur Tur Sahur', description: '', kind: 'builtin', builtin: true, enabled: true, favorite: false },
    { id: 'willow', displayName: 'Willow', description: '', kind: 'cos', enabled: true, favorite: true }
  ] };
  let snapshotListener: ((snapshot: PetOverlaySnapshot) => void) | null = null;
  let libraryListener: ((state: PetLibraryState) => void) | null = null;
  let pointerListener: ((point: PetOverlayPointer) => void) | null = null;
  let boundsListener: ((bounds: PetOverlayBounds) => void) | null = null;
  const setInteractive = vi.fn(), focusOwner = vi.fn(), openActivity = vi.fn(), openLibrary = vi.fn();
  const petApi = {
    listPets: () => ok(library),
    petAsset: (id: string) => ok({ id, kind: 'cos' as const, atlasDataUrl: 'data:image/png;base64,YXRsYXM=', manifest: authoredManifest }),
    setInteractive, focusOwner, openLibrary, openActivity,
    onSnapshot: (listener: (snapshot: PetOverlaySnapshot) => void) => { snapshotListener = listener; return vi.fn(); },
    onLibraryChanged: (listener: (state: PetLibraryState) => void) => { libraryListener = listener; return vi.fn(); },
    onPointer: (listener: (point: PetOverlayPointer) => void) => { pointerListener = listener; return vi.fn(); },
    onBounds: (listener: (bounds: PetOverlayBounds) => void) => { boundsListener = listener; return vi.fn(); }
  };
  Object.defineProperty(dom.window, 'petApi', { configurable: true, value: petApi });
  await import('../src/renderer/pet-overlay.js');
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  boundsListener!({ width: 1000, height: 800, scaleFactor: 1 });
  snapshotListener!({
    visible: true, level: 'running',
    activities: [{ id: 'task-1', title: 'Prime', body: 'Working', level: 'running', sessionId: 'session-one' }],
    theme: 'dark',
    appearance: {
      light: { background: '#f4f4f5', sidebar: '#e9edf2', accent: '#486f9d', contrast: 45 },
      dark: { background: '#181818', sidebar: '#1a2129', accent: '#b0cbed', contrast: 60 },
      font: 'system', fontSize: 14, translucentSidebar: true
    }
  });
  await Promise.resolve(); await Promise.resolve();

  const shells = [...dom.window.document.querySelectorAll<HTMLElement>('.pet-shell')];
  expect(shells).toHaveLength(2);
  expect(dom.window.document.querySelectorAll('.pet-body')).toHaveLength(2);
  expect(dom.window.document.querySelector('canvas,.pet-canvas,.pet-sprite,.pet-bat')).toBeNull();
  for (const shell of shells) {
    const body = shell.querySelector<HTMLElement>('.pet-body')!;
    const frame = Number(shell.dataset.frame);
    expect(body.style.backgroundSize).toBe('1280px 1920px');
    expect(body.style.backgroundPosition).toBe(`${-(frame % 8) * 160}px ${-Math.floor(frame / 8) * 160}px`);
  }

  const badges = shells.map(shell => shell.querySelector<HTMLButtonElement>('.pet-badge')!).filter(node => !node.hidden);
  expect(badges).toHaveLength(1);
  expect((badges[0]!.closest('.pet-shell') as HTMLElement | null)?.dataset.petId).toBe('willow');
  badges[0]!.click();
  expect((dom.window.document.getElementById('petTray') as HTMLElement).hidden).toBe(false);
  (dom.window.document.querySelector('.pet-card') as HTMLButtonElement).click();
  expect(openActivity).toHaveBeenCalledWith('session-one');

  const tur = dom.window.document.querySelector<HTMLElement>('.pet-shell[data-pet-id="tur-tur-sahur"]')!;
  tur.dispatchEvent(new dom.window.MouseEvent('contextmenu', { clientX: 220, clientY: 180, bubbles: true }));
  const menuButtons = [...dom.window.document.querySelectorAll<HTMLButtonElement>('.pet-menu button')];
  expect(menuButtons.map(button => button.textContent)).toContain('OpenAI → ClosedAI');
  menuButtons[0]!.click();
  expect(tur.dataset.action).toBe('openai');
  expect(tur.dataset.state).toBe('walk');
  expect(dom.window.document.querySelector('.pet-target')?.textContent).toBe('OpenAI');

  tur.getBoundingClientRect = () => ({ left: 100, top: 100, right: 260, bottom: 260, width: 160, height: 160, x: 100, y: 100, toJSON: () => ({}) });
  pointerListener!({ x: 120, y: 120 });
  expect(setInteractive).toHaveBeenLastCalledWith(true);
  pointer(tur, 'pointerdown', 120, 120, 7);
  pointer(tur, 'pointermove', 190, 150, 7);
  expect(tur.dataset.state).toBe('held');
  pointerListener!({ x: 700, y: 700 });
  expect(setInteractive).toHaveBeenLastCalledWith(true);
  pointer(tur, 'pointerup', 190, 150, 7);
  expect(tur.dataset.state).toBe('landing');
  expect(focusOwner).not.toHaveBeenCalled();
  pointerListener!({ x: 700, y: 700 });
  expect(setInteractive).toHaveBeenLastCalledWith(false);

  pointer(tur, 'pointerdown', 120, 120, 8);
  pointer(tur, 'pointerup', 120, 120, 8);
  expect(tur.dataset.state).toBe('poke');
  expect(focusOwner).toHaveBeenCalledOnce();

  libraryListener!({ pets: library.pets.map(pet => pet.id === 'willow' ? { ...pet, enabled: false } : pet) });
  expect(dom.window.document.querySelectorAll('.pet-shell')).toHaveLength(1);
});
