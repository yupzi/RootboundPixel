// 峭壁场景的绘制：每层不同的远景（峡谷岩层 / 红砂岩石柱 / 雪峰 / 云海）、两侧崖壁（坑底用 AI 画的崖壁）、崖台与绳梯、下山口、换层转场
// 远景每层预先画成 960 像素宽、可以首尾相接的长条，按视差平移贴上去
(function () {
  const { GEO } = G;
  const { W, H, PX, TILE, WORLD_W } = GEO;
  const { mix, hash, hex, clamp01 } = G.U;
  const { disc, bayer, outline } = G.Px;
  const VW = W * PX + 1, VH = H * PX + 1, PER = 960, TAU = Math.PI * 2;
  const INK = '#3e2731';
  const P = G.Field.prototype;
  const u32 = h => { const [r, g, b] = hex(h); return (255 << 24) | (b << 16) | (g << 8) | r; };

  // ================= 天空 =================
  const skyCache = new Map();
  function skyCanvas(L, O) {
    const k = L.id + O;
    if (skyCache.has(k)) return skyCache.get(k);
    const cv = G.mkCanvas(VW, VH), c = cv.getContext('2d'), img = c.createImageData(VW, VH), d = new Uint32Array(img.data.buffer);
    const cols = L.sky.map((a, i) => u32(mix(a, L.skyGreen[i], O))), n = cols.length;
    for (let y = 0; y < VH; y++) {
      const f = (y / VH) * (n - 1), i0 = Math.floor(f), fr = f - i0;
      for (let x = 0; x < VW; x++) d[y * VW + x] = fr > bayer(x, y) ? cols[Math.min(n - 1, i0 + 1)] : cols[i0];
    }
    c.putImageData(img, 0, 0);
    skyCache.set(k, cv);
    return cv;
  }

  // ================= 远景长条 =================
  // 每种地形 3 层（远 → 近）：p 横向视差、py 纵向视差、h(x) 高度函数、paint 上色
  const BACKS = {
    // 坑底：四周是一层层的峡谷岩壁，越往上爬看到的天空越多
    canyon: [
      { p: 0.14, py: 0.35, hb: 112, amp: 52, kind: 'bands', band: 11, jag: 3 },
      { p: 0.32, py: 0.6, hb: 70, amp: 44, kind: 'bands', band: 9, jag: 2 },
      { p: 0.58, py: 0.88, hb: 34, amp: 22, kind: 'rubble', jag: 1 },
    ],
    // 风蚀崖台：远处的方山，中间一根根红砂岩石柱
    hoodoo: [
      { p: 0.12, py: 0.3, hb: 60, amp: 30, kind: 'mesa' },
      { p: 0.3, py: 0.55, hb: 70, amp: 60, kind: 'spires' },
      { p: 0.6, py: 0.88, hb: 24, amp: 16, kind: 'rubble', jag: 2 },
    ],
    // 高山草甸：雪峰、更近的山、绿色草坡
    peaks: [
      { p: 0.1, py: 0.25, hb: 90, amp: 110, kind: 'peaks', snow: 0.45 },
      { p: 0.26, py: 0.5, hb: 50, amp: 70, kind: 'peaks', snow: 0.2 },
      { p: 0.55, py: 0.85, hb: 22, amp: 18, kind: 'hills' },
    ],
    // 云雾林：脚下是云海，远处有大树的剪影
    clouds: [
      { p: 0.1, py: 0.3, hb: 30, amp: 26, kind: 'cloudbank' },
      { p: 0.28, py: 0.55, hb: 40, amp: 70, kind: 'trees' },
      { p: 0.5, py: 0.85, hb: 16, amp: 22, kind: 'cloudbank' },
    ],
  };
  const BOT = 220; // 长条在「基线」以下还要画多高（被前景挡住的部分）

  function heights(spec, seed) {
    const r = G.rng(seed), h = new Float32Array(PER);
    const per = (f, ph) => x => Math.sin(x / PER * TAU * f + ph);
    if (spec.kind === 'bands' || spec.kind === 'rubble' || spec.kind === 'hills' || spec.kind === 'cloudbank') {
      const a = per(2 + r.int(2), r() * 6), b = per(5 + r.int(3), r() * 6), c = per(13 + r.int(5), r() * 6);
      for (let x = 0; x < PER; x++) h[x] = spec.hb + spec.amp * (0.5 + 0.35 * a(x) + 0.2 * b(x) + 0.08 * c(x)) + (spec.jag && spec.kind === 'bands' ? (hash(Math.floor(x / 4) + seed) - 0.5) * spec.jag * 2 : 0);
    } else if (spec.kind === 'mesa') {
      // 平顶方山：台阶状的平台
      let x = 0;
      while (x < PER) { const w = 40 + r.int(120), top = spec.hb + r() * spec.amp; for (let i = 0; i < w && x < PER; i++, x++) h[x] = top - (i < 6 ? (6 - i) * 3 : i > w - 6 ? (i - w + 6) * 3 : 0); }
      for (let i = 0; i < 3; i++) for (let x = 0; x < PER; x++) h[x] = (h[x] + h[(x + 1) % PER] + h[(x + PER - 1) % PER]) / 3;
    } else if (spec.kind === 'spires') {
      for (let x = 0; x < PER; x++) h[x] = spec.hb * 0.4;
      for (let k = 0; k < 14; k++) {
        const cx = r() * PER, w = 6 + r() * 10, top = spec.hb + r() * spec.amp;
        for (let dx = -w * 1.6; dx <= w * 1.6; dx++) {
          const x = Math.floor((cx + dx + PER) % PER), cap = Math.abs(dx) < w * 1.3;
          const body = Math.abs(dx) < w * (0.6 + 0.4 * Math.sin(dx));
          if (body || (cap && Math.abs(dx) < w)) h[x] = Math.max(h[x], top - (body ? 0 : 4) - Math.abs(dx) * 0.3);
        }
      }
    } else if (spec.kind === 'peaks') {
      for (let x = 0; x < PER; x++) h[x] = spec.hb * 0.5;
      for (let k = 0; k < 7; k++) {
        const cx = r() * PER, top = spec.hb + spec.amp * (0.5 + 0.5 * r()), sl = 0.55 + r() * 0.5;
        for (let x = 0; x < PER; x++) { let dx = Math.abs(x - cx); dx = Math.min(dx, PER - dx); h[x] = Math.max(h[x], top - dx * sl * (1 + 0.15 * Math.sin(x * 0.3))); }
      }
    } else if (spec.kind === 'trees') {
      for (let x = 0; x < PER; x++) h[x] = spec.hb * 0.3;
      spec.crowns = [];
      for (let k = 0; k < 6; k++) {
        const cx = r() * PER, top = spec.hb + spec.amp * (0.5 + 0.5 * r()), tw = 3 + r() * 3;
        for (let dx = -tw; dx <= tw; dx++) { const x = Math.floor((cx + dx + PER) % PER); h[x] = Math.max(h[x], top - 20); }
        spec.crowns.push([cx, top, 16 + r() * 16]);
      }
    }
    return h;
  }

  const backCache = new Map();
  function backStrip(L, i, O) {
    const ob = Math.round(O * 4) / 4, k = L.id + i + ob;
    if (backCache.has(k)) return backCache.get(k);
    const spec = Object.assign({}, BACKS[L.back.kind][i]);
    const h = heights(spec, 1000 + i * 77 + L.id.length * 13);
    let maxH = 0;
    for (const v of h) maxH = Math.max(maxH, v);
    if (spec.crowns) for (const [, t, r] of spec.crowns) maxH = Math.max(maxH, t + r);
    const top = Math.ceil(maxH) + 2, HH = top + BOT;
    const cv = G.mkCanvas(PER, HH), c = cv.getContext('2d'), img = c.createImageData(PER, HH), d = new Uint32Array(img.data.buffer);
    // 空气透视：层越远越淡、越偏天空色，和前景的地面拉开距离
    const haze = [0.58, 0.36, 0.16][i], skyCol = mix(L.sky[2], L.skyGreen[2], O);
    const base = mix(mix(L.back.cols[i], L.back.green[i], O * 0.7), skyCol, haze);
    const C = { base: u32(base), dark: u32(G.shade(base, -14)), dark2: u32(G.shade(base, -26)), lite: u32(G.shade(base, 16)), rim: u32(G.shade(base, 30)), snow: u32(mix('#f4f8ff', skyCol, haze * 0.6)), snowSh: u32(mix('#c8d8ec', skyCol, haze * 0.6)) };
    for (let x = 0; x < PER; x++) {
      const y0 = Math.round(top - h[x]), slope = h[(x + 1) % PER] - h[x];
      for (let y = Math.max(0, y0); y < HH; y++) {
        const dd = y - y0; // 离顶边的距离
        let col = C.base;
        if (spec.kind === 'bands') {
          const band = Math.floor((HH - y) / spec.band);
          col = band % 2 ? C.base : C.dark;
          if ((HH - y) % spec.band === 0) col = C.dark2;
          if (dd < 3 && dd > 0) col = C.lite;
        } else if (spec.kind === 'peaks') {
          const snowD = spec.snow * (h[x] - spec.hb * 0.5) * (0.8 + 0.4 * hash(Math.floor(x / 7)));
          col = slope > 0 ? C.dark : C.base;
          if (dd < snowD) col = slope > 0 ? C.snowSh : C.snow;
        } else if (spec.kind === 'spires') {
          col = slope > 0.5 ? C.dark : C.base;
          if ((HH - y) % 9 === 0) col = C.dark2;
        } else if (spec.kind === 'cloudbank') {
          col = dd < 3 ? C.rim : dd < 10 ? C.lite : C.base;
          if (slope > 0.6 && dd > 2) col = C.dark;
        } else if (spec.kind === 'mesa') {
          col = dd < 2 ? C.lite : slope > 0.4 ? C.dark : (HH - y) % 14 === 0 ? C.dark2 : C.base;
        } else {
          // 碎石坡 / 草坡：纯色坡体，顶上一条均匀的亮边（不按坡向分明暗，否则会有一截截的暗块）
          if (dd > 0 && dd < 3) col = C.lite;
        }
        if (dd === 0 && spec.kind !== 'cloudbank') col = C.rim;
        d[y * PER + x] = col;
      }
    }
    c.putImageData(img, 0, 0);
    // 云雾林的大树：圆圆的树冠
    if (spec.crowns) for (const [cx, t, r] of spec.crowns) for (const off of [-PER, 0, PER]) {
      disc(c, cx + off, top - t, r, G.shade(base, -10)); disc(c, cx + off - r * 0.3, top - t - r * 0.3, r * 0.6, base);
    }
    const res = { cv, top };
    backCache.set(k, res);
    return res;
  }

  // 远景：天空 → 太阳 / 云 → 三层视差长条
  P.drawSky = function (c, cx, cy, T) {
    const L = this.L, O = Math.round(this.oasis() * 10) / 10, Y0 = this.Y(0);
    c.drawImage(skyCanvas(L, O), 0, 0);
    if (!this.sunCv) this.sunCv = makeSun();
    c.drawImage(this.sunCv, VW - 120, Math.round(clamp01((Y0 - 120) / 400) * 40) + 6);
    for (let i = 0; i < 3; i++) {
      const cl = this.clouds[i % 3], span = VW + cl.width;
      const x = ((((i * 173 + T * (2 + i * 1.3) - this.ox * 0.08) % span) + span) % span) - cl.width;
      c.drawImage(cl, Math.round(x), 18 + i * 26 + Math.round((Y0 - 184) * 0.12));
    }
    for (let i = 0; i < 3; i++) {
      const spec = BACKS[L.back.kind][i], strip = backStrip(L, i, O);
      const base = Math.round(VH * 0.82 + (Y0 - VH * 0.82) * spec.py);
      const y = base - strip.top;
      if (y > VH) continue;
      let x = -(((this.ox * spec.p) % PER) + PER) % PER;
      for (; x < VW; x += PER) c.drawImage(strip.cv, Math.round(x), y);
    }
  };
  function makeSun() {
    const cv = G.mkCanvas(64, 64), c = cv.getContext('2d');
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 32, y - 32);
      if (d < 9) { c.fillStyle = d < 7 ? '#fffbe6' : '#fff1b8'; c.fillRect(x, y, 1, 1); }
      else if (d < 22 && (22 - d) / 13 * 0.6 > bayer(x, y)) { c.fillStyle = '#fff4cc'; c.fillRect(x, y, 1, 1); }
    }
    return cv;
  }

  // ================= 崖壁 =================
  // 64×64 可平铺的石块纹理：一层层错开的石块，左上亮、右下暗
  const wallTex = new Map();
  function wallTile(L) {
    if (wallTex.has(L.id)) return wallTex.get(L.id);
    const S = 64, cv = G.mkCanvas(S, S), c = cv.getContext('2d'), r = G.rng(L.id.length * 101 + 7);
    const [base, mid, dark, lite] = L.wall;
    c.fillStyle = dark; c.fillRect(0, 0, S, S);
    const rows = [0, 14, 30, 44, 64];
    for (let k = 0; k < rows.length - 1; k++) {
      const y0 = rows[k], y1 = rows[k + 1] - 2;
      let x = -Math.floor(r() * 20);
      while (x < S) {
        const w = 14 + r.int(16), col = r() < 0.3 ? mid : base;
        for (const off of [0, S]) {
          const X = x - off;
          c.fillStyle = col; c.fillRect(X + 1, y0 + 1, w - 2, y1 - y0 - 1);
          c.fillStyle = lite; c.fillRect(X + 1, y0 + 1, w - 3, 1); c.fillRect(X + 1, y0 + 1, 1, y1 - y0 - 2);
          c.fillStyle = mid; c.fillRect(X + 2, y1 - 1, w - 3, 1); c.fillRect(X + w - 2, y0 + 2, 1, y1 - y0 - 2);
          if (r() < 0.35) { c.fillStyle = dark; c.fillRect(X + 3 + r.int(Math.max(1, w - 6)), y0 + 3 + r.int(Math.max(1, y1 - y0 - 6)), 2, 1); }
        }
        x += w;
      }
    }
    const pat = { cv, pat: null };
    wallTex.set(L.id, pat);
    return pat;
  }
  P.drawWalls = function (c, T) {
    if (this.L.wallR) { this.drawArtWalls(c, false); return; }
    const L = this.L, wt = wallTile(L);
    if (!wt.pat) wt.pat = c.createPattern(wt.cv, 'repeat');
    const xl = this.X(0), xr = this.X(WORLD_W), Y0 = this.Y(0);
    const ox = ((-this.ox) % 64 + 64) % 64, oy = ((-this.oy) % 64 + 64) % 64;
    c.save();
    c.translate(ox, oy); c.fillStyle = wt.pat;
    if (xl > 0) c.fillRect(-ox, -oy, xl, VH);
    if (xr < VW) c.fillRect(xr - ox, -oy, VW - xr, VH);
    c.restore();
    // 崖壁内侧的轮廓：一条深色描边 + 亮边，上面挂点藤蔓 / 苔藓
    const edge = (x, side) => {
      if (x < -4 || x > VW + 4) return;
      for (let y = 0; y < VH; y++) {
        const wy = y + this.oy, j = Math.round((hash(Math.floor(wy / 6) * 3.7 + side) - 0.5) * 3);
        c.fillStyle = INK; c.fillRect(x + j * side - (side > 0 ? 0 : 2), y, 2, 1);
        c.fillStyle = L.wall[3]; c.fillRect(x + j * side - (side > 0 ? -2 : 3), y, 1, 1);
      }
      // 藤蔓（绿化越好越多）
      const O = this.oasis();
      for (let k = 0; k < 6; k++) {
        const wy0 = -300 + k * 47, y = Math.round(wy0 * PX) - this.oy;
        if (hash(k * 9.1 + side) > 0.35 + O || y < -60 || y > VH) continue;
        const len = 14 + Math.floor(hash(k * 3.3 + side) * 30);
        for (let i = 0; i < len; i++) {
          const sw = Math.round(Math.sin(T * 1.3 + i * 0.25 + k) * (i / len) * 2);
          c.fillStyle = i % 4 === 0 ? '#86b257' : '#3e8948';
          c.fillRect(x - side * 2 + sw, y + i, 1, 1);
          if (i % 5 === 2) c.fillRect(x - side * 3 + sw, y + i, 2, 1);
        }
      }
    };
    edge(xl, -1); edge(xr, 1);
    // 崖底的阴影：贴着崖壁的一条暗带
    c.fillStyle = 'rgba(40,20,24,0.18)';
    if (xl > -10) c.fillRect(xl, Y0 - 60, 6, 60);
    if (xr < VW + 10) c.fillRect(xr - 6, Y0 - 60, 6, 60);
  };

  // ---- 坑底：AI 画的崖壁（js/cliff_art.js，tools/build_cliff.py 生成） ----
  // 地上：左崖贴地那张带洞口，往上用它最上面一截一正一反接着铺；右崖是矮崖一整张，崖顶对齐 rightTop()
  // 地下：是剖面，不画光影。崖壁底下的地和坑里的土层是同一片（render.js 的 outerChunk），这里只把它统一压暗一点、画出崖壁的边
  // 地下这一截在 drawGround 之前画，地表那条土带横穿过崖脚，压住地上地下的接缝
  const ART = G.CLIFF_ART, artImg = {};
  for (const k of ['left', 'right']) { const im = new Image(); im.src = ART[k]; artImg[k] = im; }
  const artReady = () => Object.values(artImg).every(im => im.complete && im.naturalWidth);
  // 从 im 的第 sy 行起取 sh 行，贴到 (x, y)；flip 上下翻转
  function band(c, im, sy, sh, x, y, flip) {
    if (y + sh <= 0 || y >= VH) return;
    if (!flip) { c.drawImage(im, 0, sy, im.width, sh, x, y, im.width, sh); return; }
    c.save(); c.translate(0, y + sh); c.scale(1, -1); c.drawImage(im, 0, sy, im.width, sh, x, 0, im.width, sh); c.restore();
  }
  const UNDER_TINT = 'rgba(62,39,49,0.28)'; // 崖壁底下的地压暗多少（看得出根过不去）
  P.drawArtWalls = function (c, under) {
    const A = ART, xl = this.X(0), xr = this.X(WORLD_W), Y0 = this.Y(0), TH = A.ltile;
    const showL = xl > -10, showR = xr < VW + 10;
    if (!showL && !showR) return;
    if (under) {
      const y = Math.max(0, Y0);
      if (y >= VH) return;
      c.fillStyle = UNDER_TINT;
      if (showL) c.fillRect(0, y, xl, VH - y);
      if (showR) c.fillRect(xr, y, VW - xr, VH - y);
      c.fillStyle = INK;
      if (showL) c.fillRect(xl - 1, y, 1, VH - y);
      if (showR) c.fillRect(xr, y, 1, VH - y);
      return;
    }
    if (!artReady()) return;
    c.save();
    c.beginPath(); c.rect(0, 0, VW, Y0); c.clip();
    if (showL) {
      const x = xl - A.lface, top = Y0 - A.lh;
      c.drawImage(artImg.left, x, top);
      for (let y = top, k = 1; y > 0; k++) { y -= TH; band(c, artImg.left, 0, TH, x, y, k % 2 === 1); }
    }
    if (showR) this.drawRightSlot(c, xr);
    c.restore();
  };
  // ---- 右侧矮崖 + 崖顶上压着的高岩体，中间是通往营地岩洞的大洞口：都画在右崖那一张图里（崖顶对齐 rightTop）----
  // 图的上边以上：拿图最上面 rband 行（纯岩层）一正一反往上铺到画面顶，高岩体就一直高上去
  P.drawRightSlot = function (c, xr) {
    const A = ART, im = artImg.right, ax = xr - A.rface, top = this.Y(this.rightTop()) - A.rtop, B = A.rband;
    c.drawImage(im, ax, top);
    for (let y = top - B, k = 0; y + B > 0; y -= B, k++) {
      if (k % 2 === 1) { c.drawImage(im, 0, 0, im.width, B, ax, y, im.width, B); continue; }
      c.save(); c.translate(0, y + B); c.scale(1, -1); c.drawImage(im, 0, 0, im.width, B, ax, 0, im.width, B); c.restore();
    }
  };
  P.drawWallsUnder = function (c) { if (this.L.wallR) this.drawArtWalls(c, true); };

  // ================= 崖台、绳梯、下山口 =================
  P.drawLip = function (c, T) {
    const lp = this.lip();
    if (!lp) return;
    const L = this.L, x0 = this.X(lp.x0), x1 = this.X(lp.x1), y = this.Y(lp.y);
    if (y < -40 || y > VH + 40) return;
    // 岩台：顶面平，底下收窄成楔形贴在崖壁上
    const th = 22;
    for (let k = 0; k < th; k++) {
      const shrink = Math.round(k * k / th * 1.6);
      const a = lp.side > 0 ? x0 + shrink : x0, b = lp.side > 0 ? x1 : x1 - shrink;
      c.fillStyle = k === 0 ? L.wall[3] : k < 3 ? L.wall[0] : k % 7 === 0 ? L.wall[2] : L.wall[1];
      c.fillRect(a, y + k, b - a, 1);
      c.fillStyle = INK; c.fillRect(lp.side > 0 ? a - 1 : b, y + k, 1, 1);
    }
    c.fillStyle = INK; c.fillRect(x0 - 1, y - 1, x1 - x0 + 2, 1);
    // 台面上的草
    const O = this.oasis();
    for (let x = x0; x < x1; x++) if (hash(x * 1.7 + this.lv) < 0.3 + O * 0.5) { c.fillStyle = hash(x) < 0.5 ? '#86b257' : '#5f8a3e'; c.fillRect(x, y - 1 - Math.floor(hash(x * 3.1) * 3), 1, 1 + Math.floor(hash(x * 3.1) * 3)); }
    // 绳梯：两根绳子 + 木横档，微微晃
    const ld = this.ladder();
    if (ld) {
      const lx = this.X(ld.x), yb = this.Y(0);
      for (let yy = y; yy < yb; yy++) {
        const k = (yy - y) / Math.max(1, yb - y), sw = Math.round(Math.sin(T * 1.6 + yy * 0.02) * k * 2);
        c.fillStyle = '#8a5a3a'; c.fillRect(lx - 4 + sw, yy, 1, 1); c.fillRect(lx + 4 + sw, yy, 1, 1);
        if ((yy - y) % 7 === 3) { c.fillStyle = INK; c.fillRect(lx - 4 + sw, yy + 1, 9, 1); c.fillStyle = '#c28569'; c.fillRect(lx - 4 + sw, yy, 9, 1); }
      }
      // 崖台上的木桩
      c.fillStyle = INK; c.fillRect(lx - 6, y - 7, 4, 8); c.fillRect(lx + 3, y - 7, 4, 8);
      c.fillStyle = '#8a5a3a'; c.fillRect(lx - 5, y - 6, 2, 6); c.fillRect(lx + 4, y - 6, 2, 6);
    } else if (Math.floor(T * 2) % 2) {
      // 还没上去过：台边闪一个小箭头，提示「爬上来」
      const ax = Math.round((x0 + x1) / 2);
      c.fillStyle = '#fee761';
      for (let i = 0; i < 4; i++) c.fillRect(ax - i, y - 10 + i, i * 2 + 1, 1);
    }
  };
  // 上面各层：靠崖壁的地上有个往下的绳梯口
  P.drawDownExit = function (c, T) {
    const dx = this.downExit();
    if (!dx) return;
    const x = this.X(dx.x), y = this.Y(0);
    if (x < -30 || x > VW + 30) return;
    // 地上的缺口
    c.fillStyle = INK; c.fillRect(x - 10, y, 20, 3);
    c.fillStyle = '#1b1218'; c.fillRect(x - 9, y + 1, 18, 8);
    // 木桩与盘起的绳子
    c.fillStyle = INK; c.fillRect(x - 13, y - 9, 4, 10); c.fillRect(x + 10, y - 9, 4, 10);
    c.fillStyle = '#8a5a3a'; c.fillRect(x - 12, y - 8, 2, 8); c.fillRect(x + 11, y - 8, 2, 8);
    c.fillStyle = '#c28569';
    for (let i = 0; i < 3; i++) c.fillRect(x - 5 + i * 3, y + 2 + (i % 2), 2, 6);
    // 小旗：下面那层的颜色
    const below = G.LEVELS[this.lv - 1], wave = Math.floor(T * 4) % 2;
    c.fillStyle = '#5c3a26'; c.fillRect(x + 12, y - 22, 1, 14);
    c.fillStyle = below.back.cols[1]; c.fillRect(x + 13, y - 22 + wave, 6, 4); c.fillRect(x + 13, y - 21 + wave, 8, 2);
  };

  // ================= 换层转场：像素网点从下往上盖住，再从上往下揭开 =================
  const wipePat = {};
  function wipeFor(c, lv) {
    if (wipePat[lv]) return wipePat[lv];
    const cv = G.mkCanvas(4, 4), g = cv.getContext('2d');
    g.fillStyle = '#181425';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (bayer(x, y) < lv / 16) g.fillRect(x, y, 1, 1);
    return (wipePat[lv] = c.createPattern(cv, 'repeat'));
  }
  // k：0 → 1 盖上，1 → 2 揭开；dir：1 往上爬（网点从下往上推），-1 往下
  P.drawWipe = function (c, k, dir) {
    const cover = k < 1 ? k : 2 - k;
    for (let band = 0; band < 18; band++) {
      const by = dir > 0 ? VH - (band + 1) * 15 : band * 15;
      const lv = Math.max(0, Math.min(16, Math.round((cover * 2.2 - band / 18) * 16)));
      if (!lv) continue;
      c.fillStyle = wipeFor(c, lv); c.fillRect(0, by, VW, 15);
    }
  };
})();
