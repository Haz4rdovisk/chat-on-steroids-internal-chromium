import type { InternalBrowserDockState } from '../shared/internal-browser.js';

/** Renderer-owned split layout; the remote ChatGPT page itself is a native WebContentsView. */
export interface InternalBrowserDockController {
  toggle(): Promise<void>;
  isOpen(): boolean;
}

export function initInternalBrowserDock(): InternalBrowserDockController {
  const app = document.querySelector<HTMLElement>('.app')!;
  const sidebar = document.getElementById('sidebar')!;
  const dock = document.getElementById('browserDock')!;
  const slot = document.getElementById('browserDockSlot')!;
  const tabs = document.getElementById('browserDockTabs')!;
  const handle = document.getElementById('browserDockResize')!;
  const storageKey = 'chat-on-steroids.browser-dock-width';
  const minimum = 320;
  const minimumWorkspace = 360;
  let preferred: number | null = null;
  let open = false;
  let drag: { id: number; x: number; width: number } | null = null;
  let frame = 0;

  const availableWidth = (): number => {
    const sidebarWidth = app.classList.contains('is-sidebar-collapsed') ? 0 : sidebar.getBoundingClientRect().width;
    return Math.max(minimum, window.innerWidth - sidebarWidth - minimumWorkspace);
  };
  const maximum = (): number => Math.max(minimum, Math.min(760, availableWidth()));

  function tabLabel(title: string, url: string): string {
    const trimmed = title.trim().replace(/\s*[|·-]\s*ChatGPT\s*$/i, '');
    if (trimmed && trimmed.toLowerCase() !== 'chatgpt') return trimmed;
    try {
      const parsed = new URL(url);
      if (/^\/c\//.test(parsed.pathname)) return 'Chat';
      if (parsed.searchParams.has('clf')) return 'Worker';
    } catch { /* A newly-created WebContents can have no URL for one event. */ }
    return 'New chat';
  }

  function renderTabs(state: InternalBrowserDockState | null | undefined): void {
    if (!state || !Array.isArray(state.tabs)) return;
    const fragment = document.createDocumentFragment();
    for (const tab of state.tabs) {
      const row = document.createElement('div');
      row.className = `browser-tab${tab.status === 'loading' ? ' is-loading' : ''}`;
      row.dataset.tabId = String(tab.id);
      row.setAttribute('role', 'tab');
      row.tabIndex = 0;
      row.setAttribute('aria-selected', String(tab.active));
      row.title = tab.title || tab.url || 'ChatGPT';

      const title = document.createElement('span');
      title.className = 'browser-tab-title';
      title.textContent = tabLabel(tab.title, tab.url);

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'browser-tab-close';
      close.dataset.closeTabId = String(tab.id);
      close.setAttribute('aria-label', `Close ${title.textContent}`);
      close.textContent = '×';
      row.append(title, close);
      fragment.append(row);
    }
    tabs.replaceChildren(fragment);
    tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  try {
    const saved = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= minimum) preferred = Math.min(760, saved);
  } catch { /* Layout persistence is optional. */ }

  function bounds() {
    const rect = slot.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  function paint(): void {
    app.classList.toggle('browser-dock-open', open);
    dock.hidden = !open;
    dock.inert = !open;
    if (preferred === null) app.style.removeProperty('--browser-dock-width');
    else app.style.setProperty('--browser-dock-width', `${Math.min(maximum(), preferred)}px`);
    handle.setAttribute('aria-valuemin', String(minimum));
    handle.setAttribute('aria-valuemax', String(Math.round(maximum())));
    if (open) handle.setAttribute('aria-valuenow', String(Math.round(dock.getBoundingClientRect().width)));
  }

  function syncLayout(show = false): void {
    if (!open) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      const rect = bounds();
      if (rect.width < 1 || rect.height < 1) return;
      void window.api.internalBrowser({ action: show ? 'show' : 'layout', bounds: rect });
    });
  }

  async function setOpen(next: boolean): Promise<void> {
    if (open === next) { if (next) syncLayout(); return; }
    if (!next) {
      // Park the native view before collapsing its renderer slot, so it can never cover shell UI.
      await window.api.internalBrowser({ action: 'hide' });
      open = false;
      paint();
      return;
    }
    open = true;
    paint();
    syncLayout(true);
  }

  function setWidth(width: number): void {
    preferred = Math.round(Math.max(minimum, Math.min(maximum(), width)));
    paint();
    syncLayout();
  }

  tabs.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const close = target.closest<HTMLElement>('[data-close-tab-id]');
    if (close) {
      event.stopPropagation();
      const tabId = Number(close.dataset.closeTabId);
      if (Number.isInteger(tabId)) void window.api.internalBrowser({ action: 'close', tabId }).then(reply => {
        if (reply.ok) renderTabs(reply.data);
      });
      return;
    }
    const tab = target.closest<HTMLElement>('[data-tab-id]');
    const tabId = Number(tab?.dataset.tabId);
    if (Number.isInteger(tabId)) void window.api.internalBrowser({ action: 'select', tabId }).then(reply => {
      if (reply.ok) renderTabs(reply.data);
    });
  });
  tabs.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab-id]');
    const tabId = Number(tab?.dataset.tabId);
    if (!Number.isInteger(tabId)) return;
    event.preventDefault();
    void window.api.internalBrowser({ action: 'select', tabId }).then(reply => {
      if (reply.ok) renderTabs(reply.data);
    });
  });

  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    handle.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, width: dock.getBoundingClientRect().width };
    app.classList.add('is-resizing-browser-dock');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    // The separator is the panel's right edge; dragging right makes the left browser wider.
    if (drag?.id === event.pointerId) setWidth(drag.width + event.clientX - drag.x);
  });
  function finish(event: PointerEvent): void {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    app.classList.remove('is-resizing-browser-dock');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    try {
      if (preferred === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(preferred));
    } catch { /* optional */ }
  }
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('dblclick', () => {
    preferred = null;
    app.style.removeProperty('--browser-dock-width');
    try { localStorage.removeItem(storageKey); } catch { /* optional */ }
    paint();
    syncLayout();
  });
  handle.addEventListener('keydown', event => {
    const width = dock.getBoundingClientRect().width;
    if (event.key === 'ArrowLeft') setWidth(width - 10);
    else if (event.key === 'ArrowRight') setWidth(width + 10);
    else if (event.key === 'Home') setWidth(minimum);
    else if (event.key === 'End') setWidth(maximum());
    else return;
    event.preventDefault();
  });

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => syncLayout()).observe(slot);
  window.addEventListener('resize', () => { paint(); syncLayout(); });
  window.api.onInternalBrowserShowRequested(() => { void setOpen(true); });
  window.api.onInternalBrowserStateChanged(state => {
    renderTabs(state);
    if (state.open && !open) void setOpen(true);
  });
  paint();
  void window.api.internalBrowser({ action: 'query' }).then(reply => {
    if (!reply.ok || !reply.data) return;
    renderTabs(reply.data);
    if (reply.data.open) void setOpen(true);
  });

  return {
    toggle: () => setOpen(!open),
    isOpen: () => open
  };
}
