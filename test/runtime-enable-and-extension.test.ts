import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = process.cwd();

describe('runtime multi-agent enable regression', () => {
  it('wires persistence before unconditional restore and preserves history while disabled', async () => {
    const source = await readFile(path.join(repo, 'src/main/index.ts'), 'utf8');
    const persistSink = source.indexOf('onSwarmPersistNow((snapshot) => writeDurableNow(SWARM_STATE, snapshot))');
    const restoreRead = source.indexOf('const savedSwarm = await readDurable<SwarmSnapshot>(SWARM_STATE)');
    const shutdownFence = source.indexOf('if (windowActivation.isDisabled()) return;', restoreRead);
    const restore = source.indexOf('restoreSwarm(savedSwarm)', restoreRead);
    const disabledPause = source.indexOf("pauseSwarmForDisable('multi-agent mode is disabled')");

    expect(persistSink).toBeGreaterThanOrEqual(0);
    expect(restoreRead).toBeGreaterThanOrEqual(0);
    expect(shutdownFence).toBeGreaterThanOrEqual(0);
    expect(restore).toBeGreaterThanOrEqual(0);
    expect(disabledPause).toBeGreaterThanOrEqual(0);
    expect(persistSink).toBeLessThan(restoreRead);
    expect(restoreRead).toBeLessThan(shutdownFence);
    expect(shutdownFence).toBeLessThan(restore);
    expect(restore).toBeLessThan(disabledPause);
    expect(source).not.toContain('await writeDurableNow(SWARM_STATE, null)');
  });
});

describe('bundled companion setup contract', () => {
  it('keeps the internal-browser setup visible without asking for an external extension install', async () => {
    const [html, renderer, preload, ipc] = await Promise.all([
      readFile(path.join(repo, 'src/renderer/index.html'), 'utf8'),
      readFile(path.join(repo, 'src/renderer/main.ts'), 'utf8'),
      readFile(path.join(repo, 'src/preload/index.ts'), 'utf8'),
      readFile(path.join(repo, 'src/main/ipc.ts'), 'utf8')
    ]);

    expect(html).toMatch(/Sign in to the built-in ChatGPT browser/i);
    expect(html).toMatch(/Required for sub-agents/i);
    expect(html).toMatch(/companion is bundled and loads automatically/i);
    expect(html).not.toMatch(/Requires the Chrome extension to be loaded and connected/i);
    expect(html).not.toMatch(/id="chatBrowser"/i);
    expect(html).not.toMatch(/id="bridgeDownload"/i);
    expect(renderer).not.toContain("$('bridgeDownload')");
    expect(html).not.toContain('/releases/latest/');
    expect(ipc).not.toContain('/releases/latest/');
    // Recovery IPC remains a bounded developer/support surface, but setup no longer exposes it.
    expect(preload).toContain("call<boolean>('bridge:downloadExtension')");
    expect(ipc).toContain("handle('bridge:downloadExtension'");
  });
});
