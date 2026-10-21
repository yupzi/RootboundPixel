// 电脑上模拟手机试玩：起一个本地服务器，开一个独立的 Chrome 窗口，模拟横屏手机（鼠标点击当触摸）
// 用法：双击项目根目录的「手机模拟.bat」，或 node tools/mobile_preview.mjs
// 控制台里按键：P 横 / 竖屏切换　R 刷新　T 正式 / 试验场切换　Q 退出
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8766, DEBUG = 9334;
const PHONE = { w: 915, h: 412, dpr: 3 }; // 常见的 20:9 手机横屏（CSS 像素）
const CHROMES = [
  process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe',
  process.env['PROGRAMFILES(X86)'] + '/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 静态文件服务器（不缓存，改了代码刷新就生效） ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise((ok, fail) => server.once('error', fail).listen(PORT, '127.0.0.1', ok)).catch(e => {
  console.log(`端口 ${PORT} 被占用了（是不是已经开着一个模拟窗口？）`, e.message);
  process.exit(1);
});

// ---------- 开 Chrome（独立的用户目录，不影响平时用的 Chrome） ----------
const exe = CHROMES.find(f => f && fs.existsSync(f));
if (!exe) { console.log('找不到 Chrome，请先安装 Google Chrome'); process.exit(1); }
const chrome = spawn(exe, [
  `--remote-debugging-port=${DEBUG}`, '--user-data-dir=' + path.join(os.tmpdir(), 'rootbound-mobile-preview'),
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--window-size=${PHONE.w + 40},${PHONE.h + 120}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 75 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find(t => t.type === 'page'); } catch {}
  if (!page) await sleep(200);
}
if (!page) { console.log('Chrome 没有启动起来'); quit(); }

// ---------- DevTools 协议：设成手机、鼠标当触摸 ----------
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let seq = 0;
const pend = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
ws.onclose = () => quit(); // 窗口关了就退出
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

let portrait = false, test = false;
async function applyPhone() {
  const w = portrait ? PHONE.h : PHONE.w, h = portrait ? PHONE.w : PHONE.h;
  const { windowId } = await send('Browser.getWindowForTarget');
  await send('Browser.setWindowBounds', { windowId, bounds: { width: w + 40, height: h + 120 } });
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: PHONE.dpr, mobile: true, screenOrientation: portrait ? { type: 'portraitPrimary', angle: 0 } : { type: 'landscapePrimary', angle: 90 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
}
const load = () => send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${test ? '?test' : ''}` });
await applyPhone();
await load();

console.log(`
  手机模拟已启动：${PHONE.w}×${PHONE.h} 横屏，鼠标点击 = 手指触摸
  先在画面上点一下，触屏按键就会出来（按电脑键盘会收起，再点一下画面就回来）

  在这个窗口里按：
    P  横屏 / 竖屏切换
    R  刷新页面（改了代码以后）
    T  正式游戏 / 试验场（直接有铲子、药剂、种子，不存档）切换
    Q  退出
`);

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.on('data', async b => {
  const k = b.toString().toLowerCase();
  if (k === 'q' || k === '\u0003') quit();
  else if (k === 'p') { portrait = !portrait; await applyPhone(); console.log(portrait ? '  → 竖屏' : '  → 横屏'); }
  else if (k === 'r') { await load(); console.log('  → 已刷新'); }
  else if (k === 't') { test = !test; await load(); console.log(test ? '  → 试验场' : '  → 正式游戏'); }
});

function quit() {
  try { chrome.kill(); } catch {}
  server.close();
  process.exit(0);
}
