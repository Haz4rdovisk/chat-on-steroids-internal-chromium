/**
 * Native View-menu surface.
 *
 * The embedded ChatGPT dock is a WebContentsView, so renderer DOM cannot reliably paint above it.
 * Keep the menu in a second narrow WebContentsView, attach it after the browser views, and only
 * expose six fixed commands through its preload. The shell renderer remains the authority for
 * sidebar/browser/pet/zoom state.
 */
import path from 'node:path';
import { BrowserWindow, ipcMain, WebContentsView } from 'electron';
import type { Event as ElectronEvent, MouseInputEvent } from 'electron';
import type { ViewMenuCommand, ViewMenuToggleRequest, ViewMenuToggleState } from '../shared/view-menu.js';

const MENU_WIDTH = 272;
const MENU_HEIGHT = 272;
const MENU_GAP = 5;
const MENU_MARGIN = 8;
const COMMANDS = new Set<ViewMenuCommand>(['browser', 'pet', 'sidebar', 'zoom-in', 'zoom-out', 'zoom-reset']);

let owner: BrowserWindow | null = null;
let menuView: WebContentsView | null = null;
let loadPromise: Promise<void> | null = null;
let open = false;
let ipcRegistered = false;
let blurCloseTimer: ReturnType<typeof setTimeout> | null = null;
let ownerMouseListener: ((event: ElectronEvent, mouse: MouseInputEvent) => void) | null = null;
let triggerBounds: { x: number; y: number; width: number; height: number } | null = null;
let suppressTriggerMouseUp = false;

function currentOwner(): BrowserWindow | null {
  return owner && !owner.isDestroyed() ? owner : null;
}

function validMenuSender(id: number): boolean {
  return menuView !== null && !menuView.webContents.isDestroyed() && menuView.webContents.id === id;
}

function announceOpen(next: boolean): void {
  const win = currentOwner();
  if (win) win.webContents.send('viewMenu:openChanged', next);
}

export function hideViewMenu(): ViewMenuToggleState {
  if (blurCloseTimer) {
    clearTimeout(blurCloseTimer);
    blurCloseTimer = null;
  }
  open = false;
  triggerBounds = null;
  if (menuView && !menuView.webContents.isDestroyed()) menuView.setVisible(false);
  announceOpen(false);
  return { open: false };
}

function scheduleBlurClose(): void {
  if (blurCloseTimer) clearTimeout(blurCloseTimer);
  // Focus moves from the native menu to the shell before Chromium dispatches the shell's mouse
  // event. Defer the generic blur close by one event-loop turn so the owner can recognize a
  // press on the same three-dots trigger and consume that gesture natively. Clicks anywhere else
  // still close the menu immediately after the current native input dispatch completes.
  blurCloseTimer = setTimeout(() => {
    blurCloseTimer = null;
    if (open) hideViewMenu();
  }, 0);
}

function pointInside(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number }
): boolean {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width
    && point.y >= bounds.y && point.y < bounds.y + bounds.height;
}

function screenTriggerBounds(win: BrowserWindow, request: ViewMenuToggleRequest): { x: number; y: number; width: number; height: number } {
  const zoom = win.webContents.getZoomFactor();
  const content = win.getContentBounds();
  return {
    x: content.x + Math.round(request.anchor.x * zoom),
    y: content.y + Math.round(request.anchor.y * zoom),
    width: Math.max(1, Math.round(request.anchor.width * zoom)),
    height: Math.max(1, Math.round(request.anchor.height * zoom))
  };
}

function detachOwnerMouseListener(): void {
  if (!owner || owner.isDestroyed() || !ownerMouseListener) {
    ownerMouseListener = null;
    return;
  }
  owner.webContents.off('before-mouse-event', ownerMouseListener);
  ownerMouseListener = null;
}

function attachOwnerMouseListener(win: BrowserWindow): void {
  const listener = (event: ElectronEvent, mouse: MouseInputEvent): void => {
    if (suppressTriggerMouseUp && mouse.type === 'mouseUp' && mouse.button === 'left') {
      event.preventDefault();
      suppressTriggerMouseUp = false;
      return;
    }
    // If Chromium never delivered the matching mouse-up (for example because the window lost
    // capture mid-gesture), never let that stale suppression leak into a later click.
    if (suppressTriggerMouseUp && mouse.type === 'mouseDown') suppressTriggerMouseUp = false;
    if (!open || mouse.type !== 'mouseDown' || mouse.button !== 'left' || !triggerBounds) return;
    const content = win.getContentBounds();
    const point = mouse.globalX !== undefined && mouse.globalY !== undefined
      ? { x: mouse.globalX, y: mouse.globalY }
      : { x: content.x + mouse.x, y: content.y + mouse.y };
    if (!pointInside(point, triggerBounds)) return;

    // This is the same native gesture that moved focus away from the menu. Consume it before it
    // reaches the shell renderer, close the menu here, and consume the matching mouse-up too. If
    // the renderer saw this click it would call toggle after blur had already closed the menu and
    // would therefore reopen it.
    event.preventDefault();
    suppressTriggerMouseUp = true;
    hideViewMenu();
  };
  ownerMouseListener = listener;
  win.webContents.on('before-mouse-event', listener);
}

function registerMenuIpc(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.on('viewMenu:command', (event, value: unknown) => {
    if (!validMenuSender(event.sender.id) || typeof value !== 'string' || !COMMANDS.has(value as ViewMenuCommand)) return;
    const win = currentOwner();
    hideViewMenu();
    if (win) win.webContents.send('viewMenu:command', value as ViewMenuCommand);
  });
  ipcMain.on('viewMenu:close', event => {
    if (validMenuSender(event.sender.id)) hideViewMenu();
  });
}

async function ensureMenuView(): Promise<WebContentsView> {
  if (menuView && !menuView.webContents.isDestroyed()) {
    if (loadPromise) await loadPromise;
    return menuView;
  }

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/view-menu.js'),
      webSecurity: true
    }
  });
  menuView = view;
  view.setBackgroundColor('#00000000');
  view.setVisible(false);
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', event => event.preventDefault());
  view.webContents.on('will-redirect', event => event.preventDefault());
  view.webContents.on('blur', () => { if (open) scheduleBlurClose(); });
  view.webContents.once('destroyed', () => {
    if (menuView !== view) return;
    menuView = null;
    loadPromise = null;
    open = false;
    announceOpen(false);
  });

  loadPromise = (async () => {
    if (process.env.ELECTRON_RENDERER_URL) {
      const base = process.env.ELECTRON_RENDERER_URL.endsWith('/') ? process.env.ELECTRON_RENDERER_URL : `${process.env.ELECTRON_RENDERER_URL}/`;
      await view.webContents.loadURL(new URL('view-menu.html', base).toString());
    } else {
      await view.webContents.loadFile(path.join(__dirname, '../renderer/view-menu.html'));
    }
  })();
  await loadPromise;
  return view;
}

function menuBounds(win: BrowserWindow, request: ViewMenuToggleRequest): { x: number; y: number; width: number; height: number; zoom: number } {
  const zoom = win.webContents.getZoomFactor();
  const content = win.getContentBounds();
  const width = Math.min(content.width - MENU_MARGIN * 2, Math.max(1, Math.round(MENU_WIDTH * zoom)));
  const height = Math.min(content.height - MENU_MARGIN * 2, Math.max(1, Math.round(MENU_HEIGHT * zoom)));
  const preferredX = Math.round(request.anchor.x * zoom);
  const preferredY = Math.round((request.anchor.y + request.anchor.height + MENU_GAP) * zoom);
  const x = Math.max(MENU_MARGIN, Math.min(preferredX, content.width - width - MENU_MARGIN));
  const y = Math.max(MENU_MARGIN, Math.min(preferredY, content.height - height - MENU_MARGIN));
  return { x, y, width, height, zoom };
}

export async function toggleViewMenu(request: ViewMenuToggleRequest): Promise<ViewMenuToggleState> {
  if (open) return hideViewMenu();
  const win = currentOwner();
  if (!win) throw new Error('The app window is not available.');
  if (blurCloseTimer) {
    clearTimeout(blurCloseTimer);
    blurCloseTimer = null;
  }
  const view = await ensureMenuView();
  const bounds = menuBounds(win, request);

  // Reinsert only the transient menu, making it the last native child and therefore above the
  // ChatGPT dock without changing browser geometry or ownership.
  try { win.contentView.removeChildView(view); } catch { /* first opening: not attached yet */ }
  win.contentView.addChildView(view);
  view.webContents.setZoomFactor(bounds.zoom);
  view.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  view.webContents.send('viewMenu:snapshot', request.snapshot);
  view.setVisible(true);
  open = true;
  triggerBounds = screenTriggerBounds(win, request);
  announceOpen(true);
  view.webContents.focus();
  return { open: true };
}

export function attachViewMenuWindow(win: BrowserWindow): void {
  registerMenuIpc();
  if (owner === win) return;
  hideViewMenu();
  detachOwnerMouseListener();
  if (owner && menuView && !owner.isDestroyed()) {
    try { owner.contentView.removeChildView(menuView); } catch { /* owner teardown */ }
  }
  if (menuView && !menuView.webContents.isDestroyed()) menuView.webContents.close();
  menuView = null;
  loadPromise = null;
  owner = win;
  attachOwnerMouseListener(win);
  win.once('closed', () => {
    if (owner !== win) return;
    open = false;
    triggerBounds = null;
    suppressTriggerMouseUp = false;
    ownerMouseListener = null;
    if (menuView && !menuView.webContents.isDestroyed()) menuView.webContents.close();
    menuView = null;
    loadPromise = null;
    owner = null;
  });
}

export function viewMenuState(): ViewMenuToggleState {
  return { open };
}

export async function shutdownViewMenu(): Promise<void> {
  hideViewMenu();
  suppressTriggerMouseUp = false;
  const view = menuView;
  menuView = null;
  loadPromise = null;
  if (view && !view.webContents.isDestroyed()) {
    const win = currentOwner();
    if (win) {
      try { win.contentView.removeChildView(view); } catch { /* owner teardown */ }
    }
    view.webContents.close();
  }
  detachOwnerMouseListener();
  owner = null;
}
