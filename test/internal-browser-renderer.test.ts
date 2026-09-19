import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { initInternalBrowserDock } from '../src/renderer/internal-browser.js';

let dom: JSDOM;
afterEach(() => { dom?.window.close(); vi.unstubAllGlobals(); });

it('parks the native browser before contracting its left track', async () => {
  dom = new JSDOM(readFileSync(new URL('../src/renderer/index.html', import.meta.url), 'utf8'), {
    url: 'https://local.test', pretendToBeVisual: true
  });
  const view = dom.window;
  vi.stubGlobal('window', view); vi.stubGlobal('document', view.document); vi.stubGlobal('localStorage', view.localStorage);
  vi.stubGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
  vi.stubGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
  vi.stubGlobal('ResizeObserver', class { observe() {} });
  view.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
  view.document.getElementById('browserDockSlot')!.getBoundingClientRect = () => ({ x: 0, y: 28, width: 420, height: 700 }) as DOMRect;
  const calls: string[] = [];
  let releaseHide!: () => void;
  const hideGate = new Promise<void>(resolve => { releaseHide = resolve; });
  const api = {
    internalBrowser: vi.fn(async (request: { action: string }) => {
      calls.push(request.action);
      if (request.action === 'hide') await hideGate;
      return { ok: true, data: request.action === 'query' ? { open: false, tabs: [] } : { open: request.action === 'show', tabs: [] } };
    }),
    onInternalBrowserShowRequested: vi.fn(), onInternalBrowserStateChanged: vi.fn()
  };
  Object.defineProperty(view, 'api', { value: api });
  const controller = initInternalBrowserDock();
  await new Promise(resolve => setTimeout(resolve, 20));

  await controller.toggle();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(view.document.querySelector('.app')!.classList.contains('browser-dock-open')).toBe(true);
  expect(calls).toContain('show');

  const closing = controller.toggle();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(calls.at(-1)).toBe('hide');
  expect(view.document.querySelector('.app')!.classList.contains('browser-dock-open')).toBe(true);
  releaseHide(); await closing;
  expect(view.document.querySelector('.app')!.classList.contains('browser-dock-open')).toBe(false);
  expect(view.document.getElementById('browserDock')!.hidden).toBe(true);
});
