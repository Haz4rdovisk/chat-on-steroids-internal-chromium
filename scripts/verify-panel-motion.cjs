// Isolated Chromium layout probe. No provider or project data.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/panel-motion');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'runtime'));

app.whenReady().then(async () => {
  const { createServer } = await import('vite');
  const fixture = `
    const {showSlidingPanel,hideSlidingPanel}=await import('/panel-motion.ts');
    const app=document.querySelector('.app'), chat=document.querySelector('[data-panel="chat"]');
    const file=document.createElement('aside'); file.className='file-panel'; file.hidden=true; chat.append(file);
    const terminal=document.createElement('section'); terminal.className='workspace-terminal'; terminal.hidden=true; app.append(terminal);
    window.motion={
      sidebar(open){app.classList.toggle('is-sidebar-collapsed',!open)},
      files(open){if(open){showSlidingPanel(file,'right');chat.classList.add('has-file-panel')}
        else{hideSlidingPanel(file,'right');chat.classList.remove('has-file-panel')}},
      terminal(open){if(open){showSlidingPanel(terminal,'up');app.classList.add('has-terminal')}
        else{hideSlidingPanel(terminal,'up');app.classList.remove('has-terminal')}}
    };
    window.motionReady=true;
  `;
  const server = await createServer({ configFile: false, root: path.join(root, 'src/renderer'),
    server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'panel-motion-fixture', configureServer(vite) {
      vite.middlewares.use('/fixture.html', async (_, response) => {
        const source = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8')
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace('</head>', '<link rel="stylesheet" href="/icons.css"></head>')
          .replace('</body>', '<script type="module">' + fixture + '</script></body>');
        response.setHeader('Content-Type', 'text/html');
        response.end(await vite.transformIndexHtml('/fixture.html', source));
      });
    } }] });
  let win;
  try {
    await server.listen();
    win = new BrowserWindow({ show: true, width: 1100, height: 800, webPreferences: { sandbox: true, backgroundThrottling: false } });
    await win.loadURL(server.resolvedUrls.local[0] + 'fixture.html');
    win.webContents.setZoomFactor(1);
    const js = code => win.webContents.executeJavaScript(code);
    for (let i = 0; i < 100 && !(await js('window.motionReady === true')); i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(await js('window.motionReady'), true);
    assert.equal(await js('document.fonts.ready.then(() => true)'), true);
    const measure = () => js(`(() => {
      const app=document.querySelector('.app');
      const cols=getComputedStyle(app).gridTemplateColumns.split(' ').map(parseFloat);
      const rows=getComputedStyle(app).gridTemplateRows.split(' ').map(parseFloat);
      const work=getComputedStyle(document.querySelector('[data-panel="chat"]')).gridTemplateColumns.split(' ').map(parseFloat);
      return { sidebar: cols[0], files: work[1], terminal: rows[4] };
    })()`);
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const refreshMetrics = await js(`(() => {
      const button = document.querySelector('#chatRefresh');
      const icon = button.querySelector('.ico');
      const buttonBounds = button.getBoundingClientRect();
      const iconBounds = icon.getBoundingClientRect();
      return {
        button: [buttonBounds.width, buttonBounds.height],
        icon: [iconBounds.width, iconBounds.height],
        translate: getComputedStyle(icon, '::before').translate
      };
    })()`);
    assert.ok(refreshMetrics.button.every(value => Math.abs(value - 26) < 0.1), JSON.stringify(refreshMetrics));
    assert.ok(refreshMetrics.icon.every(value => Math.abs(value - 16) < 0.1), JSON.stringify(refreshMetrics));
    assert.equal(refreshMetrics.translate, '-1px 2px');
    const phases = [
      ['sidebar', 'sidebar', 180], ['files', 'files', 280], ['terminal', 'terminal', 130]
    ];
    await js('window.motion.sidebar(false)');
    await wait(260);
    for (const [action, key, minimum] of phases) {
      await js(`window.motion.${action}(true)`);
      await wait(65);
      const enteringGeometry = await measure();
      const entering = enteringGeometry[key];
      await wait(220);
      const openedGeometry = await measure();
      const opened = openedGeometry[key];
      assert.ok(opened >= minimum, `${action} did not open: ${JSON.stringify({ enteringGeometry, openedGeometry })}`);
      assert.ok(entering > 1 && entering < opened - 1, `${action} did not interpolate open: ${JSON.stringify({ entering, opened })}`);
      if (action === 'sidebar') {
        const exposure = await js(`(() => {
          const sidebar = document.querySelector('.sidebar');
          return {
            clipPath: getComputedStyle(sidebar).clipPath,
            cornerWidth: parseFloat(getComputedStyle(sidebar, '::before').width)
          };
        })()`);
        assert.ok(Math.abs(exposure.cornerWidth - 18) < 0.1, `unexpected workspace corner width: ${exposure.cornerWidth}`);
        const rightClip = Number(exposure.clipPath.split(' ')[1]?.replace('px', ''));
        assert.ok(Number.isFinite(rightClip) && rightClip <= -(exposure.cornerWidth + 1),
          `the expanded sidebar clipped its rounded workspace corner: ${JSON.stringify(exposure)}`);
      }
      await js(`window.motion.${action}(false)`);
      await wait(65);
      const exiting = (await measure())[key];
      await wait(220);
      const closed = (await measure())[key];
      assert.ok(closed < 2, `${action} did not close: ${JSON.stringify({ exiting, closed })}`);
      assert.ok(exiting > closed + 1 && exiting < opened - 1, `${action} did not interpolate closed: ${JSON.stringify({ exiting, closed })}`);
      if (action === 'sidebar') {
        const closedSidebar = await js(`(() => {
          const style = getComputedStyle(document.querySelector('.sidebar'));
          return { visibility: style.visibility, pointerEvents: style.pointerEvents };
        })()`);
        assert.deepEqual(closedSidebar, { visibility: 'hidden', pointerEvents: 'none' });
      }
    }
    await js('window.motion.sidebar(true);window.motion.files(true);window.motion.terminal(true)');
    await wait(260);
    const refreshPoint = await js(`(() => { const rect = document.querySelector('#chatRefresh').getBoundingClientRect(); return [rect.x + rect.width / 2, rect.y + rect.height / 2]; })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: refreshPoint[0], y: refreshPoint[1] });
    await wait(50);
    fs.writeFileSync(path.join(output, 'open.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
    console.log('Panel motion: three directions opened and closed with intermediate Chromium geometry.');
  } finally {
    win?.destroy();
    await server.close();
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
