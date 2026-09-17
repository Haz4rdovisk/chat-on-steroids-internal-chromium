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
  open = false;
  if (menuView && !menuView.webContents.isDestroyed()) menuView.setVisible(false);
  announceOpen(false);
  return { open: false };
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
  view.webContents.on('blur', () => { if (open) hideViewMenu(); });
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
  announceOpen(true);
  view.webContents.focus();
  return { open: true };
}

export function attachViewMenuWindow(win: BrowserWindow): void {
  registerMenuIpc();
  if (owner === win) return;
  hideViewMenu();
  if (owner && menuView && !owner.isDestroyed()) {
    try { owner.contentView.removeChildView(menuView); } catch { /* owner teardown */ }
  }
  if (menuView && !menuView.webContents.isDestroyed()) menuView.webContents.close();
  menuView = null;
  loadPromise = null;
  owner = win;
  win.once('closed', () => {
    if (owner !== win) return;
    open = false;
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
  owner = null;
}
