// 地下分层编辑器（editor.html）：铺方块、框选区域做随机生成、管理分层；保存时直接写回 js/strata.js
// 画面用游戏自己的 Field 渲染（分块底图 + 动态地块），缩小到每格 8 像素以下时改用纯色概览
// 右键地图可以从任意位置开试验场（index.html?test），地图经 localStorage 交过去，不必先保存
(function () {
  const $ = id => document.getElementById(id);
  const { COLS, ROWS, CS, TILE, PX } = G.GEO;
  const { clamp, hash3, hex } = G.U;
  const S = G.Strata, N = COLS * ROWS;
  const LV = G.LEVELS[0], ID = LV.id; // 先只做坑底沙地
  const CPX = CS * TILE, TP = TILE * PX, NCY = ROWS / CS, NCX = COLS / CS;
  const ZOOMS = [2, 4, 8, 12, 16, 24, 32];
  const RULER = 76, TOP = 28;
  const TCOL = Object.fromEntries(S.TILES.map(([c, , col]) => [c, col]));
  const TNAME = Object.fromEntries(S.TILES.map(([c, n]) => [c, n]));
  TNAME['-'] = '透明';
  const RES_ID = { w: 'water', o: 'ironOre', n: 'fern', a: 'ashMoss', p: 'page' };
  const REG_COLS = ['#fee761', '#7af0d0', '#f6757a', '#8fd0ff', '#c8a0f0', '#a8e070', '#feae34'];
  const VIEW_KEY = 'rootbound-editor-view', DRAFTS_KEY = 'rootbound-editor-drafts';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 存不下就算了 */ } },
  };

  // ================= 设计数据 =================
  G.STRATA = G.STRATA || {};
  const D = G.STRATA[ID] = G.STRATA[ID] || { layers: [{ name: '表土', top: 0, color: LV.strata[0] }], regions: [], paint: '' };
  let paint = S.decode(D.paint);
  let regionGrid = S.genRegions(D);
  const base = S.composeBase(D, regionGrid, paint); // 手绘 + 区域（还没长空洞植物）
  const eff = base.map((_, i) => S.floraAt(D, base, i)); // 当前看到的地图（Field 直接读它）
  const fileSnap = JSON.stringify({ layers: D.layers, regions: D.regions, paint: S.encode(paint) });

  // 游戏的 Field：只用来画分块
  const F = new G.Field(G.mkCanvas(4, 4));
  F.design = eff; F.chunks = new Map(); F._bands = null;

  const ED = { zoom: 16, sx: 0, sy: 0, tool: 'brush', tile: 'r', brush: 3, sel: -1, grid: true, showReg: true, sp: 'camelThorn', push: true };
  Object.assign(ED, store.get(VIEW_KEY) || {});
  ED.sel = -1;

  // ================= 改动 → 分块重画 =================
  const comps = new Map(); // 'cx,cy' → { cv, ok }：分块合成图（底图 + 动态地块）
  let miniDirty = true, need = false, regenPending = false;
  const chunkKey = (c, r) => ((c / CS) | 0) + ',' + ((r / CS) | 0);
  function touch(list) {
    const keys = new Set();
    for (const i of list) {
      const c = i % COLS, r = (i - c) / COLS, ch = F.chunks.get(chunkKey(c, r));
      if (ch) ch.tiles[(r % CS) * CS + (c % CS)] = S.tileOf(eff[i], hash3(c, r, 5) % 600 / 100);
      // 地块的轮廓看邻居、岩石底下垫的地看周围两圈，所以离边 3 格以内的格子也要让隔壁分块重画
      for (const dc of [-3, 0, 3]) for (const dr of [-3, 0, 3]) {
        const C = c + dc, R = r + dr;
        if (C >= 0 && C < COLS && R >= 0 && R < ROWS) keys.add(chunkKey(C, R));
      }
    }
    for (const k of keys) { const ch = F.chunks.get(k); if (ch) ch.dirty = true; const o = comps.get(k); if (o) o.ok = false; }
    if (list.length) { miniDirty = true; redraw(); }
  }
  const cellVal = i => paint[i] !== '-' ? paint[i] : regionGrid[i] !== '-' ? regionGrid[i] : '.';
  function refresh() {
    const ch = [];
    for (let i = 0; i < N; i++) base[i] = cellVal(i);
    for (let i = 0; i < N; i++) { const v = S.floraAt(D, base, i); if (eff[i] !== v) { eff[i] = v; ch.push(i); } }
    touch(ch);
  }
  function regen() { regionGrid = S.genRegions(D); refresh(); }
  function layersChanged() {
    D.layers.sort((a, b) => a.top - b.top);
    D.layers[0].top = 0;
    F._bands = null;
    for (const ch of F.chunks.values()) ch.dirty = true;
    for (const o of comps.values()) o.ok = false;
    miniDirty = true; refresh(); redraw();
  }

  // ================= 草稿：每次打开编辑器各记一份，留最近 20 份，「导出 ▾ → 找回草稿」随时能拿回来 =================
  const MAX_DRAFTS = 20, SESSION = Date.now();
  function saveDraft(s) {
    const list = (store.get(DRAFTS_KEY) || []).filter(d => d.id !== SESSION);
    list.unshift({ id: SESSION, t: Date.now(), base: fileSnap, s });
    store.set(DRAFTS_KEY, list.slice(0, MAX_DRAFTS));
  }

  // ================= 撤销 / 未保存 =================
  const snap = () => JSON.stringify({ layers: D.layers, regions: D.regions, paint: S.encode(paint) });
  let undo = [], redoStack = [], last = snap(), saved = fileSnap;
  function commit() {
    const s = snap();
    if (s === last) return;
    undo.push(last); if (undo.length > 200) undo.shift();
    redoStack = []; last = s;
    saveDraft(s);
    updateSaveState();
  }
  function restore(s) {
    const o = JSON.parse(s);
    D.layers = o.layers; D.regions = o.regions; paint = S.decode(o.paint);
    last = s;
    if (ED.sel >= D.regions.length) ED.sel = -1;
    layersChanged(); regen();
    renderLayers(); renderRegions(); updateSaveState();
    saveDraft(s);
  }
  function doUndo() { if (!undo.length) return; redoStack.push(last); restore(undo.pop()); }
  function doRedo() { if (!redoStack.length) return; undo.push(last); restore(redoStack.pop()); }
  function updateSaveState() {
    const dirty = last !== saved, el = $('saveState');
    el.textContent = dirty ? '有未保存的修改' : '已保存';
    el.classList.toggle('dirty', dirty);
    $('btnUndo').disabled = !undo.length; $('btnRedo').disabled = !redoStack.length;
  }
  addEventListener('beforeunload', e => { if (last !== saved) { e.preventDefault(); e.returnValue = ''; } });

  // ================= 写回 js/strata.js =================
  // 第一次保存时选一下文件（选项目里的 js/strata.js），之后记住这个文件，直接覆盖
  const idb = (mode, fn) => new Promise((ok, bad) => {
    const rq = indexedDB.open('rootbound-editor', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('h');
    rq.onerror = () => bad(rq.error);
    rq.onsuccess = () => { const tx = rq.result.transaction('h', mode), r = fn(tx.objectStore('h')); tx.oncomplete = () => ok(r && r.result); tx.onerror = () => bad(tx.error); };
  });
  async function fileHandle(pick) {
    let h = null;
    if (!pick) try { h = await idb('readonly', s => s.get('strata')); } catch (e) { h = null; }
    if (h) {
      const opt = { mode: 'readwrite' };
      if (await h.queryPermission(opt) === 'granted' || await h.requestPermission(opt) === 'granted') return h;
    }
    if (!window.showSaveFilePicker) return null;
    toast('第一次保存：请选择项目里的 js/strata.js');
    h = await showSaveFilePicker({ suggestedName: 'strata.js', types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }] });
    try { await idb('readwrite', s => s.put(h, 'strata')); } catch (e) { /* 记不住就下次再选 */ }
    return h;
  }
  async function save(pick) {
    const s = snap(), all = { ...G.STRATA, [ID]: { layers: D.layers, regions: D.regions, paint: S.encode(paint) } };
    const text = S.fileText(all);
    try {
      const h = await fileHandle(pick);
      if (!h) {
        // 浏览器不支持直接写文件：下载下来手动替换
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
        a.download = 'strata.js'; a.click();
        toast('浏览器不支持直接写文件，已下载 strata.js，请替换 js/strata.js');
      } else {
        const w = await h.createWritable();
        await w.write(text); await w.close();
        toast(`已写回 ${h.name}`);
      }
      saved = s;
      updateSaveState();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast('保存失败：' + (e && e.message || e), true);
    }
  }

  // ================= 导出 / 导入 =================
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('已导出 ' + name);
  }
  const timeTag = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
  function exportJson() {
    const o = { format: 'rootbound-strata', id: ID, layers: D.layers, regions: D.regions, paint: S.encode(paint) };
    download(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }), `strata-${ID}-${timeTag()}.json`);
  }
  // 整张地图按游戏画面渲染（每格 TILE*PX 像素），一个分块一个分块拼起来
  function exportPng() {
    toast('正在渲染整张地图…');
    setTimeout(() => {
      const out = G.mkCanvas(COLS * TP, ROWS * TP), c = out.getContext('2d');
      for (let cy = 0; cy < NCY; cy++) for (let cx = 0; cx < NCX; cx++) {
        const k = cx + ',' + cy, o = comps.get(k);
        c.drawImage(o && o.ok ? o.cv : buildComp(cx, cy).cv, cx * CS * TP, cy * CS * TP);
      }
      out.toBlob(b => download(b, `strata-${ID}-${timeTag()}.png`), 'image/png');
    }, 30);
  }
  // 概览图：每格 4 像素的纯色，左边标出分层
  function exportMini() {
    if (miniDirty) buildMini();
    const z = 4, out = G.mkCanvas(COLS * z, ROWS * z), c = out.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(mini, 0, 0, out.width, out.height);
    c.font = '12px sans-serif'; c.textBaseline = 'top';
    for (const l of D.layers) {
      c.fillStyle = '#fee761'; c.fillRect(0, l.top * z, out.width, 1);
      c.fillStyle = '#000a'; c.fillRect(0, l.top * z + 1, c.measureText(l.name).width + 6, 15);
      c.fillStyle = '#fee761'; c.fillText(l.name, 3, l.top * z + 3);
    }
    out.toBlob(b => download(b, `strata-${ID}-overview-${timeTag()}.png`), 'image/png');
  }
  function loadDesign(s, msg) { undo.push(last); redoStack = []; restore(s); toast(msg + '（可撤销，记得保存）'); }
  function pickDraft() {
    const list = (store.get(DRAFTS_KEY) || []).filter(d => d.s !== last);
    if (!list.length) { toast('没有别的草稿'); return; }
    const f = t => new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    showMenu([['选一份草稿载入（按最后修改时间）', null], ...list.map(d => {
      const o = JSON.parse(d.s);
      return [`${f(d.t)} · ${o.layers.length} 层 ${o.regions.length} 区域${d.id === SESSION ? ' · 本次' : ''}`, () => loadDesign(d.s, '已载入 ' + f(d.t) + ' 的草稿')];
    })], innerWidth / 2 - 110, 60);
  }
  function importJson() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        if (!Array.isArray(o.layers) || !o.layers.length || !Array.isArray(o.regions) || typeof o.paint !== 'string') throw new Error('不是编辑器导出的地图文件');
        loadDesign(JSON.stringify({ layers: o.layers, regions: o.regions, paint: o.paint }), '已导入 ' + f.name);
      } catch (e) { toast('导入失败：' + (e && e.message || e), true); }
    };
    inp.click();
  }

  // ================= 试验场 =================
  function play(start) {
    store.set(S.TEST_KEY, { id: ID, design: { layers: D.layers, regions: D.regions, paint: S.encode(paint) }, start, sp: ED.sp });
    const w = window.open('index.html?test', 'rootbound-test');
    if (w) w.focus();
    toast(start ? `试验场：从第 ${start.row} 行第 ${start.col} 列开始` : '试验场：从地表开始');
  }

  // ================= 视图坐标 =================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const mapW = () => COLS * ED.zoom;
  const mapX0 = () => RULER + Math.max(16, (cv.width - RULER - mapW()) / 2) - ED.sx;
  const mapY0 = () => TOP - ED.sy;
  function cellAt(mx, my) { return { c: Math.floor((mx - mapX0()) / ED.zoom), r: Math.floor((my - mapY0()) / ED.zoom) }; }
  const inMap = ({ c, r }) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  function clampScroll() {
    ED.sy = clamp(ED.sy, 0, Math.max(0, ROWS * ED.zoom + TOP + 60 - cv.height));
    ED.sx = clamp(ED.sx, 0, Math.max(0, RULER + mapW() + 32 - cv.width));
  }
  function setZoom(z, my = cv.height / 2) {
    const r = (my - mapY0()) / ED.zoom;
    ED.zoom = z;
    ED.sy = TOP + r * z - my;
    clampScroll(); saveView();
    $('zoomTxt').textContent = z + 'px';
    redraw();
  }
  const zoomStep = (d, my) => setZoom(ZOOMS[clamp(ZOOMS.indexOf(ED.zoom) + d, 0, ZOOMS.length - 1)], my);
  function goRow(r) { ED.sy = TOP + r * ED.zoom - cv.height / 3; clampScroll(); saveView(); redraw(); }
  let viewT = 0;
  function saveView() { clearTimeout(viewT); viewT = setTimeout(() => store.set(VIEW_KEY, { zoom: ED.zoom, sx: ED.sx, sy: ED.sy, tool: ED.tool, tile: ED.tile, brush: ED.brush, grid: ED.grid, showReg: ED.showReg, sp: ED.sp, push: ED.push }), 300); }

  // ================= 绘制 =================
  const mini = G.mkCanvas(COLS, ROWS), mctx = mini.getContext('2d'), mimg = mctx.createImageData(COLS, ROWS);
  const u32 = h => { const [r, g, b] = hex(h); return (255 << 24) | (b << 16) | (g << 8) | r; };
  function layerOfRow(r) { let k = 0; for (let i = 0; i < D.layers.length; i++) if (D.layers[i].top <= r) k = i; return k; }
  function buildMini() {
    miniDirty = false;
    const d = new Uint32Array(mimg.data.buffer), tc = {};
    for (const k in TCOL) tc[k] = u32(TCOL[k]);
    const lc = D.layers.map(l => [u32(G.shade(l.color, 6)), u32(G.shade(l.color, -6))]);
    for (let r = 0, k = 0; r < ROWS; r++) {
      while (k + 1 < D.layers.length && D.layers[k + 1].top <= r) k++;
      for (let c = 0; c < COLS; c++) { const v = eff[r * COLS + c]; d[r * COLS + c] = v === '.' ? lc[k][(r >> 3) & 1] : tc[v]; }
    }
    mctx.putImageData(mimg, 0, 0);
  }
  function buildComp(cx, cy) {
    const k = cx + ',' + cy;
    let o = comps.get(k);
    if (!o) comps.set(k, o = { cv: G.mkCanvas(CS * TP, CS * TP), ok: false });
    const ch = F.chunk(cx, cy);
    if (!ch.bg || ch.dirty) F.paintChunk(ch);
    const c = o.cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, o.cv.width, o.cv.height);
    c.drawImage(ch.bg, 0, 0);
    F.ox = cx * CPX * PX; F.oy = cy * CPX * PX;
    F.drawTiles(c, cx * CPX, cy * CPX, 0);
    o.ok = true;
    return o;
  }
  function redraw() { if (!need) { need = true; requestAnimationFrame(draw); } }

  let hover = null, drag = null, spaceHeld = false;
  function draw() {
    need = false;
    if (regenPending) { regenPending = false; regen(); }
    if (miniDirty) buildMini();
    const W = cv.width, H = cv.height, z = ED.zoom, x0 = mapX0(), y0 = mapY0(), mw = mapW();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#15101a'; ctx.fillRect(0, 0, W, H);
    // 地表以上：一条天空
    if (y0 > 0) { ctx.fillStyle = LV.sky[2]; ctx.fillRect(x0, Math.max(0, y0 - TOP), mw, Math.min(TOP, y0)); ctx.fillStyle = LV.sand[1]; ctx.fillRect(x0, y0 - 3, mw, 3); }
    const rA = clamp(Math.floor(-y0 / z), 0, ROWS), rB = clamp(Math.ceil((H - y0) / z), 0, ROWS);
    if (rB > rA) ctx.drawImage(mini, 0, rA, COLS, rB - rA, x0, y0 + rA * z, mw, (rB - rA) * z);
    // 放大时画游戏里的样子；每帧最多新合成几块，没合成好的先用纯色顶着
    let pending = false;
    if (z >= 8) {
      let budget = 8;
      const cy0 = Math.floor(rA / CS), cy1 = Math.min(NCY - 1, Math.floor((rB - 1) / CS));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = 0; cx < NCX; cx++) {
        let o = comps.get(cx + ',' + cy);
        if (!o || !o.ok) { if (budget-- <= 0) { pending = true; continue; } o = buildComp(cx, cy); }
        ctx.drawImage(o.cv, x0 + cx * CS * z, y0 + cy * CS * z, CS * z, CS * z);
      }
    }
    // 网格
    if (ED.grid && z >= 12) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let c = 1; c < COLS; c++) ctx.fillRect(x0 + c * z, y0 + rA * z, 1, (rB - rA) * z);
      for (let r = rA; r < rB; r++) ctx.fillRect(x0, y0 + r * z, mw, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let c = CS; c < COLS; c += CS) ctx.fillRect(x0 + c * z, y0 + rA * z, 1, (rB - rA) * z);
    }
    // 区域框
    if (ED.showReg || ED.tool === 'region') D.regions.forEach((g, i) => {
      const col = REG_COLS[i % REG_COLS.length], on = i === ED.sel;
      const x = x0 + g.x * z, y = y0 + g.y * z, w = g.w * z, h = g.h * z;
      if (y > H || y + h < 0) return;
      ctx.strokeStyle = col; ctx.lineWidth = on ? 2 : 1;
      ctx.setLineDash(on ? [] : [6, 4]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
      if (on) { ctx.fillStyle = col + '22'; ctx.fillRect(x, y, w, h); }
      const label = `#${i + 1} ${g.name || ''}`;
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(label).width + 8, ly = clamp(y, 0, Math.max(0, y + h - 16));
      ctx.fillStyle = '#000a'; ctx.fillRect(x + 1, ly + 1, tw, 16);
      ctx.fillStyle = col; ctx.fillText(label, x + 5, ly + 13);
      if (on) for (const [hx, hy] of corners(g)) { ctx.fillStyle = '#000'; ctx.fillRect(hx - 5, hy - 5, 10, 10); ctx.fillStyle = col; ctx.fillRect(hx - 4, hy - 4, 8, 8); }
    });
    // 分层分界线
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    D.layers.forEach((l, i) => {
      if (!i) return;
      const y = y0 + l.top * z;
      if (y < -2 || y > H + 2) return;
      ctx.fillStyle = '#fee761'; ctx.globalAlpha = 0.85;
      for (let x = x0; x < x0 + mw; x += 8) ctx.fillRect(x, y - 1, 5, 2);
      ctx.globalAlpha = 1;
    });
    // 预览：矩形 / 新区域 / 画笔落点
    if (drag && (drag.kind === 'rect' || (drag.kind === 'newReg' && (drag.a.c !== drag.b.c || drag.a.r !== drag.b.r)))) {
      const r = rectOf(drag.a, drag.b);
      ctx.fillStyle = drag.erase ? '#e43b4466' : drag.kind === 'rect' ? (TCOL[ED.tile] || '#ffffff') + '99' : '#fee76133';
      ctx.fillRect(x0 + r.x * z, y0 + r.y * z, r.w * z, r.h * z);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x0 + r.x * z + 0.5, y0 + r.y * z + 0.5, r.w * z - 1, r.h * z - 1);
      ctx.fillStyle = '#fff'; ctx.fillText(`${r.w}×${r.h}`, x0 + (r.x + r.w) * z + 4, y0 + (r.y + r.h) * z);
    } else if (hover && inMap(hover) && (ED.tool === 'brush' || ED.tool === 'rect' || ED.tool === 'fill' || ED.tool === 'pick') && !drag?.pan) {
      const n = ED.tool === 'brush' ? ED.brush : 1, o = Math.floor((n - 1) / 2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.strokeRect(x0 + (hover.c - o) * z + 0.5, y0 + (hover.r - o) * z + 0.5, n * z - 1, n * z - 1);
    }
    drawRuler(y0, z, H);
    if (pending) redraw();
  }
  // 左边的标尺：分层色带 + 名字 + 行号
  function drawRuler(y0, z, H) {
    ctx.fillStyle = '#1b1520'; ctx.fillRect(0, 0, RULER, H);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    D.layers.forEach((l, i) => {
      const yA = y0 + l.top * z, yB = y0 + (i + 1 < D.layers.length ? D.layers[i + 1].top : ROWS) * z;
      if (yB < 0 || yA > H) return;
      ctx.fillStyle = l.color; ctx.fillRect(0, yA, 10, yB - yA);
      ctx.fillStyle = '#fee761'; ctx.fillRect(0, yA, RULER, 1);
    });
    const step = z >= 16 ? 4 : z >= 8 ? 8 : z >= 4 ? 16 : 32;
    ctx.fillStyle = '#9a8ea4'; ctx.textAlign = 'right';
    for (let r = Math.max(0, Math.floor(-y0 / z / step) * step); r <= ROWS; r += step) {
      const y = y0 + r * z;
      if (y > H) break;
      ctx.fillRect(RULER - 6, y, 6, 1);
      if (y > 26) ctx.fillText(r, RULER - 8, y + 4);
    }
    ctx.textAlign = 'left';
    // 层名压在行号上面（带底色）
    D.layers.forEach((l, i) => {
      const yA = y0 + l.top * z, yB = y0 + (i + 1 < D.layers.length ? D.layers[i + 1].top : ROWS) * z;
      if (yB < 0 || yA > H) return;
      const ty = clamp(yA + 14, 14, Math.max(14, yB - 4)), name = l.name || `第${i + 1}层`;
      ctx.fillStyle = '#1b1520'; ctx.fillRect(12, ty - 12, ctx.measureText(name).width + 6, 16);
      ctx.fillStyle = '#e8ddd0'; ctx.fillText(name, 14, ty);
    });
  }
  function corners(g) {
    const x0 = mapX0(), y0 = mapY0(), z = ED.zoom;
    return [[x0 + g.x * z, y0 + g.y * z], [x0 + (g.x + g.w) * z, y0 + g.y * z], [x0 + g.x * z, y0 + (g.y + g.h) * z], [x0 + (g.x + g.w) * z, y0 + (g.y + g.h) * z]];
  }
  const rectOf = (a, b) => {
    const x = clamp(Math.min(a.c, b.c), 0, COLS - 1), y = clamp(Math.min(a.r, b.r), 0, ROWS - 1);
    const x1 = clamp(Math.max(a.c, b.c), 0, COLS - 1), y1 = clamp(Math.max(a.r, b.r), 0, ROWS - 1);
    return { x, y, w: x1 - x + 1, h: y1 - y + 1 };
  };

  // ================= 画 =================
  function setPaint(i, v, out) {
    paint[i] = v;
    base[i] = cellVal(i);
    // 这一格和它上面那格（是不是空洞底部看下面一格）的空洞植物都可能变
    for (const j of [i, i - COLS]) {
      if (j < 0) continue;
      const nv = S.floraAt(D, base, j);
      if (eff[j] !== nv) { eff[j] = nv; out.push(j); }
    }
  }
  function stamp(cell, out) {
    const n = ED.brush, o = Math.floor((n - 1) / 2);
    for (let r = cell.r - o; r < cell.r - o + n; r++) for (let c = cell.c - o; c < cell.c - o + n; c++) {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) setPaint(r * COLS + c, ED.tile, out);
    }
  }
  // 拖得快时两点之间补齐
  function strokeTo(a, b) {
    const out = [], n = Math.max(Math.abs(b.c - a.c), Math.abs(b.r - a.r), 1);
    for (let k = 1; k <= n; k++) stamp({ c: Math.round(a.c + (b.c - a.c) * k / n), r: Math.round(a.r + (b.r - a.r) * k / n) }, out);
    touch(out);
  }
  function fillRect(r, v = ED.tile) {
    const out = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setPaint(y * COLS + x, v, out);
    touch(out);
  }
  // 油漆桶：和点到的格子相连、看起来一样的格子
  function flood(cell) {
    const i0 = cell.r * COLS + cell.c, from = eff[i0], out = [];
    if (ED.tile !== '-' && from === ED.tile) return;
    const seen = new Uint8Array(N), st = [i0];
    seen[i0] = 1;
    while (st.length) {
      const i = st.pop(), c = i % COLS;
      setPaint(i, ED.tile, out);
      for (const j of [c > 0 ? i - 1 : -1, c < COLS - 1 ? i + 1 : -1, i - COLS, i + COLS]) {
        if (j < 0 || j >= N || seen[j] || eff[j] !== from) continue;
        seen[j] = 1; st.push(j);
      }
    }
    touch(out);
  }
  function pick(cell) { setTile(eff[cell.r * COLS + cell.c]); }

  // ================= 区域 =================
  function regionHit(mx, my) {
    if (ED.sel >= 0) {
      const g = D.regions[ED.sel], cs = corners(g);
      for (let k = 0; k < 4; k++) if (Math.abs(mx - cs[k][0]) <= 7 && Math.abs(my - cs[k][1]) <= 7) return { i: ED.sel, corner: k };
    }
    const { c, r } = cellAt(mx, my), g0 = D.regions[ED.sel];
    if (g0 && c >= g0.x && c < g0.x + g0.w && r >= g0.y && r < g0.y + g0.h) return { i: ED.sel, corner: -1 };
    for (let i = D.regions.length - 1; i >= 0; i--) {
      const g = D.regions[i];
      if (c >= g.x && c < g.x + g.w && r >= g.y && r < g.y + g.h) return { i, corner: -1 };
    }
    return null;
  }
  function selectRegion(i, scroll) {
    ED.sel = i;
    renderRegions();
    if (scroll && i >= 0) { const g = D.regions[i], y = mapY0() + g.y * ED.zoom; if (y < 0 || y > cv.height - 40) goRow(g.y); }
    redraw();
  }
  const newSeed = () => (Math.random() * 1e6) | 0;
  // 改区域高度时，原来底边以下的东西整体跟着移动：区域、手绘的行、分层分界。
  // 开始改的时候记下原状（pushBase），每次都从原状重新推，拖来拖去不会累积误差
  let pushBase = null;
  function beginPush(i) {
    if (!ED.push || pushBase) return;
    const g = D.regions[i];
    pushBase = { i, bottom: g.y + g.h, regions: D.regions.map(r => ({ y: r.y, h: r.h })), layers: D.layers.map(l => l.top), paint: paint.slice() };
  }
  function applyPush() {
    const B = pushBase;
    if (!B) return;
    const g = D.regions[B.i], nb = g.y + g.h, d = nb - B.bottom;
    D.regions.forEach((r, j) => {
      if (j === B.i) return;
      const o = B.regions[j];
      r.y = o.y >= B.bottom ? clamp(o.y + d, 0, ROWS - 1) : o.y;
      r.h = clamp(o.h, 1, ROWS - r.y);
    });
    let lc = false;
    D.layers.forEach((l, k) => {
      // 变矮时落在被删掉那几行里的分界收到新底边上，保证分层的先后顺序不变
      const o = B.layers[k], t = !k ? o : o >= B.bottom ? clamp(o + d, 1, ROWS - 1) : o >= nb ? nb : o;
      if (l.top !== t) { l.top = t; lc = true; }
    });
    // 手绘按整行搬：变高时在原底边插入空行，变矮时删掉区域底部的几行；挤出地图底部的丢掉
    const keep = Math.min(nb, B.bottom);
    for (let r = 0; r < ROWS; r++) {
      const src = r < keep ? r : r < nb ? -1 : r - d;
      for (let c = 0; c < COLS; c++) paint[r * COLS + c] = src >= 0 && src < ROWS ? B.paint[src * COLS + c] : '-';
    }
    if (lc) { layersChanged(); renderLayers(); }
    regenPending = true;
    renderRegionsList();
  }
  const endPush = () => { pushBase = null; };

  // ================= 鼠标 =================
  const local = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener('pointerdown', e => {
    hideMenu();
    const [mx, my] = local(e), cell = cellAt(mx, my);
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      drag = { kind: 'pan', pan: true, x: mx, y: my, sx: ED.sx, sy: ED.sy };
      cv.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const tool = e.altKey ? 'pick' : e.shiftKey ? 'erase' : ED.tool;
    if (tool !== 'region' && !inMap(cell)) return;
    cv.setPointerCapture(e.pointerId);
    if (tool === 'erase') drag = { kind: 'rect', a: cell, b: cell, erase: true }; // Shift+拖动：矩形擦掉手绘（变回透明，露出区域随机生成的内容）
    else if (tool === 'brush') { const out = []; stamp(cell, out); touch(out); drag = { kind: 'brush', last: cell }; }
    else if (tool === 'rect') drag = { kind: 'rect', a: cell, b: cell };
    else if (tool === 'fill') { flood(cell); commit(); }
    else if (tool === 'pick') pick(cell);
    else if (tool === 'region') {
      const hit = regionHit(mx, my);
      if (hit && hit.corner >= 0) {
        const g = D.regions[hit.i], cs = [[g.x + g.w - 1, g.y + g.h - 1], [g.x, g.y + g.h - 1], [g.x + g.w - 1, g.y], [g.x, g.y]][hit.corner];
        drag = { kind: 'resize', i: hit.i, fixed: { c: cs[0], r: cs[1] } };
        if (hit.corner >= 2) beginPush(hit.i); // 拖的是下边的角：改的是底边
      } else if (hit && hit.i === ED.sel) {
        // 只有选中的区域能拖动；在别处拖总是新建区域，单击则选中点到的区域
        const g = D.regions[hit.i];
        drag = { kind: 'move', i: hit.i, from: cell, ox: g.x, oy: g.y };
      } else drag = { kind: 'newReg', a: { c: clamp(cell.c, 0, COLS - 1), r: clamp(cell.r, 0, ROWS - 1) }, b: cell, click: hit ? hit.i : -1 };
    }
    redraw();
  });
  cv.addEventListener('pointermove', e => {
    const [mx, my] = local(e), cell = cellAt(mx, my);
    hover = cell;
    status(cell);
    if (!drag) { redraw(); return; }
    if (drag.kind === 'pan') { ED.sx = drag.sx - (mx - drag.x); ED.sy = drag.sy - (my - drag.y); clampScroll(); }
    else if (drag.kind === 'brush') { if (cell.c !== drag.last.c || cell.r !== drag.last.r) { strokeTo(drag.last, cell); drag.last = cell; } }
    else if (drag.kind === 'rect' || drag.kind === 'newReg') drag.b = cell;
    else if (drag.kind === 'move') {
      const g = D.regions[drag.i];
      g.x = clamp(drag.ox + cell.c - drag.from.c, 0, COLS - g.w); g.y = clamp(drag.oy + cell.r - drag.from.r, 0, ROWS - g.h);
      regenPending = true; renderRegEditNums();
    } else if (drag.kind === 'resize') {
      Object.assign(D.regions[drag.i], rectOf(drag.fixed, cell));
      applyPush();
      regenPending = true; renderRegEditNums();
    }
    redraw();
  });
  const endDrag = e => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === 'brush') commit();
    else if (d.kind === 'rect') { fillRect(rectOf(d.a, d.b), d.erase ? '-' : ED.tile); commit(); }
    else if (d.kind === 'move' || d.kind === 'resize') { endPush(); regen(); commit(); renderRegions(); }
    else if (d.kind === 'newReg') {
      const r = rectOf(d.a, d.b);
      if (r.w >= 2 && r.h >= 2) {
        D.regions.push({ name: `区域${D.regions.length + 1}`, ...r, seed: newSeed(), items: [] });
        commit();
        selectRegion(D.regions.length - 1);
      } else selectRegion(d.click);
    }
    if (d.kind === 'pan') saveView();
    redraw();
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', () => { hover = null; redraw(); });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const [, my] = local(e);
    if (e.ctrlKey) { zoomStep(e.deltaY < 0 ? 1 : -1, my); return; }
    if (e.shiftKey) ED.sx += e.deltaY; else { ED.sy += e.deltaY; ED.sx += e.deltaX; }
    clampScroll(); saveView(); redraw();
  }, { passive: false });

  // 右键菜单：从这里试玩
  const menu = $('menu');
  function hideMenu() { menu.classList.add('hidden'); }
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const [mx, my] = local(e), cell = cellAt(mx, my);
    if (!inMap(cell)) return;
    const { c, r } = cell, hit = regionHit(mx, my);
    const items = [
      [`第 ${r} 行 · 第 ${c} 列 · ${TNAME[eff[r * COLS + c]]}`, null],
      ['▶ 从这里试玩', () => play({ col: c, row: Math.max(1, r) })],
      ['▶ 从这一列的地表试玩', () => play({ col: c, row: 0 })],
      ['吸取这个方块', () => pick(cell)],
    ];
    if (hit) items.push([`选中区域 #${hit.i + 1}`, () => { setTool('region'); selectRegion(hit.i); }]);
    showMenu(items, e.clientX, e.clientY);
  });
  function showMenu(items, x, y) {
    menu.innerHTML = '';
    for (const [t, fn] of items) {
      const d = document.createElement('div');
      d.textContent = t;
      if (fn) d.onclick = () => { hideMenu(); fn(); }; else d.className = 'cap';
      menu.appendChild(d);
    }
    menu.style.left = Math.min(x, innerWidth - 220) + 'px';
    menu.style.top = Math.min(y, innerHeight - 30 * items.length - 10) + 'px';
    menu.classList.remove('hidden');
  }
  addEventListener('pointerdown', e => { if (!menu.contains(e.target)) hideMenu(); });

  function status(cell) {
    const ok = inMap(cell);
    $('stRow').textContent = ok ? cell.r : '-';
    $('stCol').textContent = ok ? cell.c : '-';
    $('stTile').textContent = ok ? TNAME[eff[cell.r * COLS + cell.c]] + (paint[cell.r * COLS + cell.c] !== '-' ? '（手绘）' : '') : '-';
    $('stLayer').textContent = ok ? (D.layers[layerOfRow(cell.r)].name || '-') : '-';
    const regs = ok ? D.regions.map((g, i) => cell.c >= g.x && cell.c < g.x + g.w && cell.r >= g.y && cell.r < g.y + g.h ? `#${i + 1}` : '').filter(Boolean) : [];
    $('stReg').textContent = regs.join(' ') || '-';
  }

  // ================= 键盘 =================
  const TOOLS = [['brush', '画笔', 'B'], ['rect', '矩形', 'R'], ['fill', '油漆桶', 'G'], ['pick', '吸管', 'I'], ['region', '区域', 'S']];
  addEventListener('keydown', e => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(e.shiftKey); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); return; }
    if (e.ctrlKey || e.metaKey) return;
    if (k === ' ') { e.preventDefault(); spaceHeld = true; cv.style.cursor = 'grab'; return; }
    const t = TOOLS.find(t => t[2].toLowerCase() === k);
    if (t) { setTool(t[0]); return; }
    if (k === '[' || k === ']') { setBrush(ED.brush + (k === ']' ? 1 : -1)); return; }
    if (k === 'p') { play(null); return; }
    if (k === 'Escape') { hideMenu(); selectRegion(-1); return; }
    if ((k === 'Delete' || k === 'Backspace') && ED.sel >= 0) { deleteRegion(); return; }
    if (k === '=' || k === '+') zoomStep(1);
    if (k === '-') zoomStep(-1);
  });
  addEventListener('keyup', e => { if (e.key === ' ') { spaceHeld = false; cv.style.cursor = 'crosshair'; } });

  // ================= 左侧：工具与方块 =================
  function setTool(t) {
    ED.tool = t; saveView();
    for (const b of $('tools').children) b.classList.toggle('on', b.dataset.t === t);
    redraw();
  }
  function setBrush(n) { ED.brush = clamp(n, 1, 24); $('brush').value = ED.brush; $('brushTxt').textContent = ED.brush; saveView(); redraw(); }
  function setTile(v) {
    ED.tile = v; saveView();
    for (const p of $('palette').children) p.classList.toggle('on', p.dataset.v === v);
  }
  function swatch(v) {
    const c = G.mkCanvas(20, 20), g = c.getContext('2d');
    if (v === '-') { for (let y = 0; y < 20; y += 5) for (let x = 0; x < 20; x += 5) { g.fillStyle = (x + y) % 10 ? '#5a5060' : '#8a8090'; g.fillRect(x, y, 5, 5); } return c; }
    g.fillStyle = v === '.' ? D.layers[0].color : TCOL[v]; g.fillRect(0, 0, 20, 20);
    if (RES_ID[v]) { if ('nap'.includes(v)) { g.fillStyle = TCOL.c; g.fillRect(0, 0, 20, 20); } g.drawImage(G.iconCanvas(RES_ID[v]), 0, 0); }
    return c;
  }
  function buildLeft() {
    const tb = $('tools');
    for (const [t, name, key] of TOOLS) {
      const b = document.createElement('button');
      b.dataset.t = t; b.innerHTML = `${name} <kbd>${key}</kbd>`;
      b.onclick = () => setTool(t);
      tb.appendChild(b);
    }
    const pal = $('palette');
    const list = [['-', '透明（露出随机生成）'], ...S.TILES.map(([c, n]) => [c, n])];
    for (const [v, name] of list) {
      const d = document.createElement('div');
      d.className = 'pal'; d.dataset.v = v;
      d.appendChild(swatch(v));
      d.insertAdjacentHTML('beforeend', `<span>${name}</span><span class="k">${v === '-' ? '' : v}</span>`);
      d.onclick = () => setTile(v);
      pal.appendChild(d);
    }
    $('brush').oninput = e => setBrush(+e.target.value);
    setTool(ED.tool); setBrush(ED.brush); setTile(ED.tile);
  }

  // ================= 右侧：分层 =================
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function renderLayers() {
    const box = $('layers');
    box.innerHTML = '';
    D.layers.forEach((l, i) => {
      const wrap = document.createElement('div'), row = document.createElement('div');
      wrap.className = 'layer';
      row.className = 'row';
      row.innerHTML = `<input type="color" value="${l.color}"><input type="text" value="${esc(l.name)}"><span class="hint">起始行</span><input type="number" min="0" max="${ROWS - 1}" value="${l.top}" ${i ? '' : 'disabled'}><button title="跳到这一层">→</button><button class="danger" title="删除这一层" ${D.layers.length > 1 ? '' : 'disabled'}>×</button>`;
      const [col, name, top, go, del] = row.querySelectorAll('input, button');
      col.oninput = () => { l.color = col.value; layersChanged(); };
      col.onchange = () => { commit(); refreshPalette(); };
      name.oninput = () => { l.name = name.value; redraw(); };
      name.onchange = () => commit();
      top.onchange = () => { l.top = clamp(Math.round(+top.value || 0), 1, ROWS - 1); layersChanged(); commit(); renderLayers(); };
      go.onclick = () => goRow(l.top);
      del.onclick = () => { D.layers.splice(i, 1); layersChanged(); commit(); renderLayers(); };
      wrap.append(row, floraRow(l));
      box.appendChild(wrap);
    });
  }
  // 这一层空洞底部长什么：密度 + 各品种的比例
  const FLORA_NAME = { n: '蕨', g: '荧', a: '灰', k: '晶' };
  function floraRow(l) {
    const f = JSON.parse(JSON.stringify(l.flora || S.defFlora(l.top)));
    const row = document.createElement('div');
    row.className = 'flora';
    row.innerHTML = `<div class="row"><span class="hint" title="这一层所有空洞的底部（手绘的、区域生成的都算）按这里的设置长植物">空洞植物 · 底部每格</span><input type="number" min="0" max="100" data-d style="width:52px" value="${Math.round(f.d * 100)}" title="每格空洞底部长植物的概率"><span class="hint">%</span><button data-roll title="换一批（换个种子）">🎲 换一批</button></div>` +
      `<div class="row">${S.FLORA.map(k => `<span class="sw" style="background:${TCOL[k]}"></span><span class="hint">${FLORA_NAME[k]}</span><input type="number" min="0" data-k="${k}" value="${f.w[k] || 0}" title="${TNAME[k]} 的比例">`).join('')}</div>`;
    const apply = () => {
      f.d = clamp(+row.querySelector('[data-d]').value || 0, 0, 100) / 100;
      for (const k of S.FLORA) f.w[k] = Math.max(0, +row.querySelector(`[data-k="${k}"]`).value || 0);
      l.flora = JSON.parse(JSON.stringify(f));
      refresh();
    };
    for (const inp of row.querySelectorAll('input')) { inp.oninput = apply; inp.onchange = () => { apply(); commit(); }; }
    row.querySelector('[data-roll]').onclick = () => { f.seed = newSeed(); apply(); commit(); };
    return row;
  }
  function refreshPalette() { const p = $('palette').querySelector('[data-v="."] canvas'); if (p) p.replaceWith(swatch('.')); }
  $('btnAddLayer').onclick = () => {
    const r = clamp(Math.round((cv.height / 2 - mapY0()) / ED.zoom), 1, ROWS - 1);
    if (D.layers.some(l => l.top === r)) return;
    const src = D.layers[layerOfRow(r)];
    D.layers.push({ name: '新分层', top: r, color: G.shade(src.color, -16), ...(src.flora ? { flora: JSON.parse(JSON.stringify(src.flora)) } : {}) });
    layersChanged(); commit(); renderLayers();
  };

  // ================= 右侧：区域 =================
  function renderRegions() { renderRegionsList(); renderRegEdit(); }
  // 只重画列表（正在编辑的输入框不受影响）
  function renderRegionsList() {
    const box = $('regions');
    box.innerHTML = D.regions.length ? '' : '<div class="hint">还没有区域。选「区域」工具（S），在地图上拖一个矩形。</div>';
    D.regions.forEach((g, i) => {
      const d = document.createElement('div');
      d.className = 'it' + (i === ED.sel ? ' on' : '');
      d.innerHTML = `<span class="sw" style="background:${REG_COLS[i % REG_COLS.length]}"></span><span>#${i + 1} ${esc(g.name || '')}</span><span class="meta">行 ${g.y}–${g.y + g.h - 1} · ${(g.items || []).length} 项</span>`;
      d.onclick = () => { setTool('region'); selectRegion(i === ED.sel ? -1 : i, true); };
      box.appendChild(d);
    });
  }
  function tileOptions(sel) { return S.TILES.map(([c, n]) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${n}</option>`).join(''); }
  function renderRegEdit() {
    const box = $('regEdit'), g = D.regions[ED.sel];
    box.classList.toggle('hidden', !g);
    if (!g) return;
    g.items = g.items || [];
    box.innerHTML = `
      <div class="row"><span class="hint">名称</span><input type="text" data-f="name" value="${esc(g.name || '')}"></div>
      <div class="row"><span class="hint">列</span><input type="number" data-f="x"><span class="hint">行</span><input type="number" data-f="y"></div>
      <div class="row"><span class="hint">宽</span><input type="number" data-f="w"><span class="hint">高</span><input type="number" data-f="h"></div>
      <label class="row hint"><input type="checkbox" data-push ${ED.push ? 'checked' : ''}>改高度时，下面的区域、手绘、分层整体跟着移动</label>
      <div class="row"><span class="hint">种子</span><input type="number" data-f="seed" style="width:90px"><button data-a="reroll" title="换一个种子，重新随机">🎲 换一批</button></div>
      <h3>内容 <span class="hint">按顺序生成，先生成的不会被盖掉</span></h3>
      <div id="items"></div>
      <div class="row" style="margin-top:6px"><select data-a="addShape">${Object.entries(S.SHAPES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('')}</select><button data-a="add">+ 添加内容</button></div>
      <div class="btns">
        <button data-a="up">上移</button><button data-a="down">下移</button>
        <button data-a="bake" title="把区域里现在看到的内容固定成手绘方块，并删掉这个区域">烘焙为手绘</button>
        <button data-a="del" class="danger">删除区域</button>
      </div>`;
    renderRegEditNums();
    for (const inp of box.querySelectorAll('[data-f]')) {
      const f = inp.dataset.f;
      inp.oninput = () => {
        if (f === 'name') { g.name = inp.value; redraw(); return; }
        const v = Math.round(+inp.value || 0);
        if (f === 'seed') g.seed = v;
        else if (f === 'x') g.x = clamp(v, 0, COLS - 1);
        else if (f === 'y') g.y = clamp(v, 0, ROWS - 1);
        else if (f === 'w') g.w = clamp(v, 1, COLS - g.x);
        else if (f === 'h') { beginPush(ED.sel); g.h = clamp(v, 1, ROWS - g.y); applyPush(); }
        regenPending = true; redraw();
      };
      inp.onchange = () => { if (f === 'h') { endPush(); regen(); } renderRegEditNums(); commit(); renderRegionsList(); };
    }
    box.querySelector('[data-push]').onchange = e => { ED.push = e.target.checked; saveView(); };
    const act = a => box.querySelector(`[data-a="${a}"]`);
    act('reroll').onclick = () => { g.seed = newSeed(); renderRegEditNums(); regen(); commit(); };
    act('add').onclick = () => { const sh = act('addShape').value; g.items.push({ shape: sh, ...S.SHAPES[sh].def }); regen(); commit(); renderRegEdit(); renderRegionsList(); };
    act('up').onclick = () => moveRegion(-1);
    act('down').onclick = () => moveRegion(1);
    act('bake').onclick = () => {
      const out = [];
      for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) { const i = y * COLS + x; if (paint[i] === '-') setPaint(i, base[i], out); }
      D.regions.splice(ED.sel, 1); ED.sel = -1;
      regen(); commit(); renderRegions();
      toast('已烘焙为手绘方块');
    };
    act('del').onclick = deleteRegion;
    renderItems(g);
  }
  function renderRegEditNums() {
    const g = D.regions[ED.sel], box = $('regEdit');
    if (!g) return;
    for (const f of ['x', 'y', 'w', 'h', 'seed']) { const el = box.querySelector(`[data-f="${f}"]`); if (el && document.activeElement !== el) el.value = g[f]; }
  }
  function renderItems(g) {
    const box = $('items');
    box.innerHTML = g.items.length ? '' : '<div class="hint">空的。下面选一种形状添加内容。</div>';
    g.items.forEach((it, j) => {
      const sh = S.SHAPES[it.shape], d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = `
        <div class="row"><select data-k="shape">${Object.entries(S.SHAPES).map(([k, s]) => `<option value="${k}" ${k === it.shape ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
          <select data-k="tile">${tileOptions(it.tile)}</select><button class="danger" data-k="del" title="删掉这一项">×</button></div>
        <div class="row"><span class="hint">${it.shape === 'wall' ? '缺口数' : '数量'}</span><input type="number" min="0" data-k="n" value="${it.n}">
          ${sh.size ? `<span class="hint">${sh.size}</span><input type="number" step="0.5" min="1" data-k="min" value="${it.min}"><span class="hint">~</span><input type="number" step="0.5" min="1" data-k="max" value="${it.max}">` : ''}
          ${it.shape === 'scatter' ? `<select data-k="where">${Object.entries(S.WHERE).map(([k, n]) => `<option value="${k}" ${k === (it.where || 'any') ? 'selected' : ''}>${n}</option>`).join('')}</select>` : ''}</div>`;
      for (const el of d.querySelectorAll('[data-k]')) {
        const k = el.dataset.k;
        if (k === 'del') { el.onclick = () => { g.items.splice(j, 1); regen(); commit(); renderItems(g); renderRegionsList(); }; continue; }
        const apply = () => {
          if (k === 'shape') { Object.assign(it, { ...S.SHAPES[el.value].def, tile: it.tile, shape: el.value }); if (el.value !== 'scatter') delete it.where; }
          else if (k === 'tile' || k === 'where') it[k] = el.value;
          else it[k] = Math.max(0, +el.value || 0);
          regenPending = true; redraw();
        };
        el.oninput = apply;
        el.onchange = () => { apply(); commit(); if (k === 'shape') renderItems(g); };
      }
      box.appendChild(d);
    });
  }
  function moveRegion(d) {
    const i = ED.sel, j = i + d;
    if (i < 0 || j < 0 || j >= D.regions.length) return;
    [D.regions[i], D.regions[j]] = [D.regions[j], D.regions[i]];
    ED.sel = j; regen(); commit(); renderRegions();
  }
  function deleteRegion() {
    if (ED.sel < 0) return;
    D.regions.splice(ED.sel, 1); ED.sel = -1;
    regen(); commit(); renderRegions();
  }

  // ================= 杂项 =================
  let toastT = 0;
  function toast(msg, err) {
    const t = $('toast');
    t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 2600);
  }
  function resize() {
    const v = $('view');
    cv.width = v.clientWidth; cv.height = v.clientHeight;
    clampScroll(); redraw();
  }

  function init() {
    $('lvName').textContent = `· ${LV.name}`;
    buildLeft();
    renderLayers();
    renderRegions();
    const sel = $('selSp');
    sel.innerHTML = G.TREE_ORDER.map(sp => `<option value="${sp}" ${sp === ED.sp ? 'selected' : ''}>${G.TREES[sp].name}</option>`).join('');
    sel.onchange = () => { ED.sp = sel.value; saveView(); };
    $('btnSave').onclick = () => save(false);
    $('btnExport').onclick = e => {
      const r = e.currentTarget.getBoundingClientRect();
      showMenu([
        ['导出设计数据（.json，可再导入）', exportJson],
        ['导出地图图片（游戏画面，.png）', exportPng],
        ['导出概览图（纯色 + 分层，.png）', exportMini],
        ['导入设计数据（.json）…', importJson],
        ['找回草稿…', pickDraft],
      ], r.left, r.bottom + 4);
    };
    $('btnUndo').onclick = doUndo;
    $('btnRedo').onclick = doRedo;
    $('btnZoomIn').onclick = () => zoomStep(1);
    $('btnZoomOut').onclick = () => zoomStep(-1);
    $('btnPlay').onclick = () => play(null);
    const grid = $('chkGrid'), reg = $('chkRegions');
    grid.checked = ED.grid; reg.checked = ED.showReg;
    grid.onchange = () => { ED.grid = grid.checked; saveView(); redraw(); };
    reg.onchange = () => { ED.showReg = reg.checked; saveView(); redraw(); };
    $('zoomTxt').textContent = ED.zoom + 'px';
    $('stHint').textContent = 'Shift+拖动 擦掉手绘（露出随机生成） · B 画笔 · R 矩形 · G 油漆桶 · I 吸管 · S 区域 · P 试玩 · Ctrl+S 保存（Ctrl+Shift+S 重新选择文件）';
    addEventListener('resize', resize);
    resize();
    updateSaveState();
    // 上次没保存就关掉了：问一下要不要接着改
    const dr = (store.get(DRAFTS_KEY) || [])[0];
    if (dr && dr.base === fileSnap && dr.s !== fileSnap && confirm('上次有没保存的修改，要恢复吗？（选「取消」也不会丢，可以在「导出 ▾ → 找回草稿」里再拿回来）')) { undo.push(last); restore(dr.s); }
  }
  init();
})();
