// Maker 原型用：在无头 Chrome 里跑网页版，把坑底一带导出成图片，Maker 端只贴图、不再现画
//   world.png      坑底一带的世界图（不含小禾，天空部分透明），按镜头分块渲染再拼起来
//   sky.png        天空渐变（屏幕固定）　sun.png 太阳　cloud0~2.png 云
//   strip0~2.png   三层远景岩壁（横向循环，按视差平移）
//   pit.json       拼图范围、远景的视差参数（Maker 端按网页版 cliff.js 的 drawSky 公式摆）
// 用法：node tools/bake_pit.mjs [输出目录]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'tools', 'out', 'pit'));
const PORT = 8767, DEBUG = 9335;
// 拼图范围（世界单位）：左右各带一点崖壁，上面是选种时的镜头高度，往下两屏
const X0 = -120, X1 = 504, Y0 = -92, Y1 = 313;
const CHROMES = [
  process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe',
  process.env['PROGRAMFILES(X86)'] + '/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// cliff.js 的远景函数在闭包里：发给浏览器时在文件末尾挂到 G._sky 上（只影响导出，不改源码）
const EXPOSE = { 'js/cliff.js': 'G._sky = { skyCanvas, backStrip, BACKS, makeSun, PER };\n' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const add = EXPOSE[p.replace(/^\//, '')];
    if (add) { const s = data.toString(), i = s.lastIndexOf('})();'); data = s.slice(0, i) + add + s.slice(i); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(ok => server.listen(PORT, '127.0.0.1', ok));

const exe = CHROMES.find(f => f && fs.existsSync(f));
if (!exe) { console.log('找不到 Chrome'); process.exit(1); }
const chrome = spawn(exe, [
  '--headless=new', `--remote-debugging-port=${DEBUG}`, '--user-data-dir=' + path.join(os.tmpdir(), 'rootbound-bake'),
  '--no-first-run', '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
const quit = code => { try { chrome.kill(); } catch {} server.close(); process.exit(code); };

let page;
for (let i = 0; i < 75 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find(t => t.type === 'page'); } catch {}
  if (!page) await sleep(200);
}
if (!page) { console.log('Chrome 没有启动起来'); quit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0;
const pend = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => {
  const d = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (d.error || d.result.exceptionDetails) throw new Error(JSON.stringify(d.error || d.result.exceptionDetails));
  return d.result.result.value;
};

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
for (let i = 0; i < 100; i++) { if (await evaluate('!!(window.G && G.field && G.field.ctx && G._sky)').catch(() => false)) break; await sleep(100); }
await sleep(1500); // 图片、字体、分块都就绪

// 在页面里一次做完（同步执行，主循环插不进来）
const res = await evaluate(`(() => {
  const f = G.field, PX = G.GEO.PX, W = G.GEO.W, H = G.GEO.H, S = G._sky;
  const X0 = ${X0}, X1 = ${X1}, Y0 = ${Y0}, Y1 = ${Y1};
  const png = cv => cv.toDataURL('image/png');
  // 世界图：天空不画（清成透明），其余照常
  const out = document.createElement('canvas');
  out.width = (X1 - X0) * PX; out.height = (Y1 - Y0) * PX;
  const o = out.getContext('2d');
  const hero = G.hero, save = { camX: f.camX, camY: f.camY, shake: f.shake, flash: f.flash, fx: f.fx, drawSky: f.drawSky };
  G.hero = null; f.shake = 0; f.flash = 0; f.fx = [];
  f.drawSky = function (c) { c.clearRect(0, 0, c.canvas.width, c.canvas.height); };
  const xs = [], ys = [];
  for (let x = X0; x < X1; x += W) xs.push(Math.min(x, X1 - W));
  for (let y = Y0; y < Y1; y += H) ys.push(Math.min(y, Y1 - H));
  for (const y of ys) for (const x of xs) {
    f.camX = x; f.camY = y;
    f.render();
    o.clearRect((x - X0) * PX, (y - Y0) * PX, W * PX, H * PX);
    o.drawImage(f.cv, 0, 0, W * PX, H * PX, (x - X0) * PX, (y - Y0) * PX, W * PX, H * PX);
  }
  G.hero = hero; Object.assign(f, save);
  // 远景
  const L = f.L, O = Math.round(f.oasis() * 10) / 10;
  const strips = [0, 1, 2].map(i => { const st = S.backStrip(L, i, O), sp = S.BACKS[L.back.kind][i]; return { png: png(st.cv), top: st.top, p: sp.p, py: sp.py }; });
  return {
    world: png(out), w: out.width, h: out.height,
    sky: png(S.skyCanvas(L, O)), sun: png(S.makeSun()),
    clouds: f.clouds.map(png), strips, per: S.PER,
  };
})()`);

fs.mkdirSync(OUT, { recursive: true });
const put = (name, url) => fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
put('world.png', res.world);
put('sky.png', res.sky);
put('sun.png', res.sun);
res.clouds.forEach((u, i) => put(`cloud${i}.png`, u));
res.strips.forEach((s, i) => put(`strip${i}.png`, s.png));
fs.writeFileSync(path.join(OUT, 'pit.json'), JSON.stringify({
  x0: X0, y0: Y0, w: res.w, h: res.h, per: res.per,
  strips: res.strips.map(s => ({ top: s.top, p: s.p, py: s.py })),
}, null, 1));
console.log(`已输出到 ${OUT}（世界图 ${res.w}×${res.h}）`);
quit(0);
