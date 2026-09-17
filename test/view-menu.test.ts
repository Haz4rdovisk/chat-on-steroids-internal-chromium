import { afterEach, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  type Listener = (...args: any[]) => void;
  let nextId = 700;
  const views: any[] = [];
  const ipcOn = new Map<string, Listener>();

  class FakeWebContents {
    id = nextId++;
    destroyed = false;
    listeners = new Map<string, Set<Listener>>();
    send = vi.fn();
    setZoomFactor = vi.fn();
    focus = vi.fn();
    setWindowOpenHandler = vi.fn();
    loadFile = vi.fn(async () => undefined);
    loadURL = vi.fn(async () => undefined);
    on(name: string, listener: Listener): this {
      const bucket = this.listeners.get(name) ?? new Set<Listener>();
      bucket.add(listener);
      this.listeners.set(name, bucket);
      return this;
    }
    once(name: string, listener: Listener): this {
      const wrapped: Listener = (...args) => {
        this.listeners.get(name)?.delete(wrapped);
        listener(...args);
      };
      return this.on(name, wrapped);
    }
    emit(name: string, ...args: any[]): void {
      for (const listener of [...(this.listeners.get(name) ?? [])]) listener(...args);
    }
    isDestroyed(): boolean { return this.destroyed; }
    close(): void {
      if (this.destroyed) return;
      this.destroyed = true;
      this.emit('destroyed');
    }
  }

  class FakeWebContentsView {
    webContents = new FakeWebContents();
    setBackgroundColor = vi.fn();
    setBounds = vi.fn();
    setVisible = vi.fn();
    constructor(_options?: unknown) { views.push(this); }
  }

  class FakeBrowserWindow {
    destroyed = false;
    closed: (() => void) | null = null;
    webContents = {
      send: vi.fn(),
      getZoomFactor: vi.fn(() => 0.975)
    };
    contentView = {
      children: [] as any[],
      addChildView: vi.fn((view: any) => { if (!this.contentView.children.includes(view)) this.contentView.children.push(view); }),
      removeChildView: vi.fn((view: any) => { this.contentView.children = this.contentView.children.filter(child => child !== view); })
    };
    getContentBounds = vi.fn(() => ({ x: 0, y: 0, width: 640, height: 480 }));
    isDestroyed(): boolean { return this.destroyed; }
    once(name: string, listener: () => void): void { if (name === 'closed') this.closed = listener; }
  }

  return {
    views,
    ipcOn,
    FakeWebContentsView,
    FakeBrowserWindow,
    reset(): void { views.length = 0; }
  };
});

vi.mock('electron', () => ({
  BrowserWindow: fake.FakeBrowserWindow,
  WebContentsView: fake.FakeWebContentsView,
  ipcMain: { on: vi.fn((channel: string, listener: (...args: any[]) => void) => fake.ipcOn.set(channel, listener)) }
}));

const menu = await import('../src/main/view-menu.js');

function snapshot() {
  return {
    browserOpen: true,
    petVisible: false,
    petReady: true,
    sidebarCollapsed: false,
    zoomPercent: 100,
    theme: 'dark' as const,
    language: 'en' as const,
    appearance: {
      light: { background: '#f4f4f5', sidebar: '#e9edf2', accent: '#486f9d', contrast: 45 },
      dark: { background: '#181818', sidebar: '#1a2129', accent: '#b0cbed', contrast: 60 },
      font: 'system' as const,
      fontSize: 14,
      translucentSidebar: true
    },
    labels: {
      browser: 'ChatGPT browser',
      pet: 'Desktop pet',
      sidebar: 'Toggle Sidebar',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      actualSize: 'Actual Size'
    }
  };
}

afterEach(async () => {
  await menu.shutdownViewMenu();
  fake.reset();
});

it('renders above native browser views and remains inside the owner window', async () => {
  const owner = new fake.FakeBrowserWindow() as any;
  menu.attachViewMenuWindow(owner);
  const state = await menu.toggleViewMenu({
    anchor: { x: 630, y: 470, width: 30, height: 28 },
    snapshot: snapshot()
  });
  expect(state.open).toBe(true);
  const view = fake.views.at(-1)!;
  expect(owner.contentView.addChildView).toHaveBeenCalledWith(view);
  expect(view.webContents.setZoomFactor).toHaveBeenCalledWith(0.975);
  const bounds = view.setBounds.mock.calls.at(-1)![0];
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(632);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(472);
  expect(view.webContents.send).toHaveBeenCalledWith('viewMenu:snapshot', snapshot());
  expect(view.setVisible).toHaveBeenLastCalledWith(true);
});

it('closes on a second toggle instead of reopening or reattaching the native menu', async () => {
  const owner = new fake.FakeBrowserWindow() as any;
  menu.attachViewMenuWindow(owner);
  const request = { anchor: { x: 40, y: 0, width: 30, height: 28 }, snapshot: snapshot() };

  expect(await menu.toggleViewMenu(request)).toEqual({ open: true });
  const view = fake.views.at(-1)!;
  expect(await menu.toggleViewMenu(request)).toEqual({ open: false });
  expect(menu.viewMenuState()).toEqual({ open: false });
  expect(owner.contentView.addChildView).toHaveBeenCalledTimes(1);
  expect(view.setVisible).toHaveBeenLastCalledWith(false);
});

it('accepts commands only from its own narrow preload and forwards them to the shell', async () => {
  const owner = new fake.FakeBrowserWindow() as any;
  menu.attachViewMenuWindow(owner);
  await menu.toggleViewMenu({ anchor: { x: 40, y: 0, width: 30, height: 28 }, snapshot: snapshot() });
  const view = fake.views.at(-1)!;
  const command = fake.ipcOn.get('viewMenu:command')!;

  command({ sender: { id: view.webContents.id + 1 } }, 'browser');
  expect(owner.webContents.send).not.toHaveBeenCalledWith('viewMenu:command', 'browser');

  command({ sender: { id: view.webContents.id } }, 'browser');
  expect(owner.webContents.send).toHaveBeenCalledWith('viewMenu:command', 'browser');
  expect(view.setVisible).toHaveBeenLastCalledWith(false);
});

it('closes when focus moves to another native surface', async () => {
  const owner = new fake.FakeBrowserWindow() as any;
  menu.attachViewMenuWindow(owner);
  await menu.toggleViewMenu({ anchor: { x: 40, y: 0, width: 30, height: 28 }, snapshot: snapshot() });
  const view = fake.views.at(-1)!;
  view.webContents.emit('blur');
  expect(menu.viewMenuState()).toEqual({ open: false });
  expect(view.setVisible).toHaveBeenLastCalledWith(false);
  expect(owner.webContents.send).toHaveBeenCalledWith('viewMenu:openChanged', false);
});
