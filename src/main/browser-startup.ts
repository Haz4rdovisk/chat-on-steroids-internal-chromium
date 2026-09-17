/** One cold-start owner for the app's embedded ChatGPT Chromium. */
import { browserWakeConnected } from './bridge.js';
import { ensureInternalBrowserReady, openInternalBrowserUrl } from './internal-browser.js';

let waking: Promise<void> | null = null;

/**
 * Make the bundled companion available for an already-authorized ChatGPT operation.
 *
 * Normal work is elected by the companion over the wake/status protocol. Only the cold case
 * creates a marked WebContents directly; that document wakes the same MV3 worker. There is no
 * OS process probe and no external Chrome/Edge/Brave launch in this path.
 */
export async function wakeBrowserUrl(
  url: string,
  _retry = false,
  backgroundStartup = false,
  authority?: { current(): boolean | Promise<boolean> }
): Promise<void> {
  if (authority && !await authority.current()) return;
  await ensureInternalBrowserReady();
  if (authority && !await authority.current()) return;
  if (browserWakeConnected()) return;
  if (waking) return waking;

  const work = (async () => {
    if (authority && !await authority.current()) return;
    if (browserWakeConnected()) return;
    await openInternalBrowserUrl(url, { active: !backgroundStartup, reveal: !backgroundStartup });
  })();
  waking = work;
  try { await work; }
  finally { if (waking === work) waking = null; }
}

export function resetBrowserStartupForTests(): void { waking = null; }
