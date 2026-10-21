// 像素渲染：480×270 低分辨率画布，整数倍放大显示。参考 Shelldiver 的视觉：
// 色相偏移的深色描边、分层视差剪影、越深越暗 + 点光源、地块轮廓、大量像素粒子、震屏
(function () {
  const { GEO, CFG } = G;
  const { W, H, PX, TILE, CS, SKY, COLS, CPX, WORLD_W, SHOW, NPLOT } = GEO;
  const { clamp01, clamp, lerp, ease, eOutBack, hash, hash3, cumOf, pointAlong, mix, hex } = G.U;
  const { crisp, disc, bayer, pixelize, outline } = G.Px;
  const TR = G.Tree, TS = TR.TS;
  // 画布比屏幕多一行一列：镜头按整像素画，剩下的亚像素偏移由画布整体平移补上（蔚蓝的做法），平移后露出的边缘要有画面
  const VW = W * PX + 1, VH = H * PX + 1, TP = TILE * PX, CP = CPX * PX;
  const TAU = Math.PI * 2;
  const INK = '#3e2731';
  const MAXD = 0.58;             // 地下最暗处的遮罩浓度（太暗会看不清障碍）
  const FG_DIM = 0.3;            // 前景（地块、根、根尖）只吃这么多的暗：可交互的东西永远看得清

  // 土层：每 48 单位一层，越深越暗。颜色由当前所在层决定
  const DEEP = ['#3f2b2a', '#45302c', '#3a2829', '#433128', '#382629', '#40302a'];
  const stratum = (L, k) => k < L.strata.length ? L.strata[k] : G.shade(DEEP[(k - L.strata.length) % DEEP.length], 0);
  const u32 = h => { const [r, g, b] = hex(h); return (255 << 24) | (b << 16) | (g << 8) | r; };
  const shadeU = (h, a) => u32(G.shade(h, a));

  // 静态地层（画进分块缓存）与动态地块（每帧画）
  const staticKind = t => !t ? '' : t.cave || t.type === 'cave' ? 'cave' : t.type === 'clay' || t.type === 'salt' || t.type === 'ice' || t.type === 'humus' ? t.type : '';
  const isWater = t => !!t && t.type === 'res' && t.id === 'water';
  // 岩石底下的地：周围多数是黏土/盐碱/冻土/营养土，就垫一块同样的地（岩石看起来是嵌在里面的），否则是普通土
  const UNDER = { clay: 1, salt: 1, ice: 1, humus: 1 };
  function rockGround(F, C, R) {
    for (const rad of [1, 2]) {
      const n = {};
      let all = 0;
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        if (!dc && !dr) continue;
        const t = F.tileAt(C + dc, R + dr);
        if (!t || t.type === 'edge' || t.type === 'rock') continue;
        const k = staticKind(t);
        all++;
        if (UNDER[k]) n[k] = (n[k] || 0) + 1;
      }
      if (!all) continue; // 四周全是岩石：再看远一圈
      let best = '', m = 0;
      for (const k in n) if (n[k] > m) { best = k; m = n[k]; }
      return m * 2 > all ? best : '';
    }
    return '';
  }
  const isFire = t => !!t && t.type === 'fire';

  const P = G.Field.prototype;

  // 画进分块缓存的地：静态地块本身，或岩石底下垫的地
  P.groundKind = function (C, R) {
    const t = this.tileAt(C, R);
    return t && t.type === 'rock' ? rockGround(this, C, R) : staticKind(t);
  };

  P.initRender = function (cv) {
    this.cv = cv; cv.width = VW; cv.height = VH;
    this.ctx = cv.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    // 暗层比屏幕多一格，格子对齐世界坐标（见 buildLighting）
    this.lightCv = G.mkCanvas(W + 1, H + 1);
    this.lightImg = this.lightCv.getContext('2d').createImageData(W + 1, H + 1);
    this.maskCv = G.mkCanvas(W + 1, H + 1);
    this.mg = this.maskCv.getContext('2d', { willReadFrequently: true });
    this.fx = [];
    this.hitStop = 0;
    this.clouds = [0, 1, 2].map(i => makeCloud(G.rng(31 + i)));
  };

  // 屏幕坐标（整数像素，镜头取整后不会抖）
  P.X = function (x) { return Math.round(x * PX) - this.ox; };
  P.Y = function (y) { return Math.round(y * PX) - this.oy; };

  // 画布的亚像素平移（单位：游戏像素，0~1）。舞台上一个游戏像素 = 2px，再对齐到真实屏幕像素，保证放大后的像素边缘依然锐利
  P.setSub = function (dx, dy) {
    const n = G.view ? G.view.k * (devicePixelRatio || 1) : 1; // 每个舞台像素占多少屏幕像素
    const tx = Math.round(dx * 2 * n) / n, ty = Math.round(dy * 2 * n) / n;
    if (tx === this.subX && ty === this.subY) return;
    this.subX = tx; this.subY = ty;
    this.cv.style.transform = tx || ty ? `translate(${-tx}px, ${-ty}px)` : '';
  };

  // ================= 主渲染 =================
  P.render = function () {
    const c = this.ctx, T = this.clock;
    const k = this.shake > 0 ? Math.min(1, this.shake * 4) : 0;
    const sx = k ? Math.round((Math.random() - 0.5) * 6 * k) : 0, sy = k ? Math.round((Math.random() - 0.5) * 5 * k) : 0;
    const cx = this.camX, cy = this.camY;
    // 镜头（蔚蓝的做法）：世界按镜头的整像素位置画，人物、地面都落在同一套像素格上，相对位置永远不抖；
    // 镜头剩下的不足一像素的部分交给画布整体平移，所以镜头慢慢移动时也是平滑的，不会一格一格地跳
    const px = cx * PX, py = cy * PX, fx = Math.floor(px), fy = Math.floor(py);
    this.ox = fx + sx; this.oy = fy + sy;
    this.setSub(px - fx, py - fy);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#241820'; c.fillRect(0, 0, VW, VH);
    if (cy < 0) this.drawSky(c, cx, cy, T);

    // 可见分块：土层缓存 → 老根（描边层、填充层）
    const vx0 = Math.floor(cx / CPX), vx1 = Math.floor((cx + W + 1) / CPX);
    const vy0 = Math.max(0, Math.floor(cy / CPX)), vy1 = Math.floor((cy + H + 1) / CPX);
    const vis = [];
    for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) { const ch = this.chunk(x, y) || this.outerChunk(x, y); if (ch) vis.push(ch); }
    for (const ch of vis) {
      if (!ch.bg || ch.dirty) this.paintChunk(ch);
      c.drawImage(ch.bg, this.X(ch.cx * CPX), this.Y(ch.cy * CPX));
    }
    // 定型的老根始终淡化显示，退到背景
    c.globalAlpha = ROOT_FADE;
    for (const ch of vis) if (ch.ro) c.drawImage(ch.ro, this.X(ch.cx * CPX), this.Y(ch.cy * CPX));
    for (const ch of vis) if (ch.rf) c.drawImage(ch.rf, this.X(ch.cx * CPX), this.Y(ch.cy * CPX));
    c.globalAlpha = 1;
    const dark = this.buildLighting(cx, cy);
    const drawDark = () => c.drawImage(this.lightCv, this.X(this.lgx), this.Y(this.lgy), (W + 1) * PX, (H + 1) * PX);
    if (dark) drawDark();
    if (this.mode === 'round' && this.tips.length) this.drawLiveRoots(c);

    this.drawTiles(c, cx, cy, T);
    this.drawWallsUnder(c);
    if (cy < 8) {
      this.drawGround(c, cx, T);
      this.drawDownExit(c, T);
      this.drawPlants(c, cx);
      if (this.mode === 'round' || this.show) this.drawTree(c, T);
      if (this.mode === 'select') this.drawSelect(c, T);
      this.drawGroundSeeds(c, T);
      if (this.bird) this.drawBird(c, T);
    }
    this.drawWalls(c, T);
    this.drawLip(c, T);
    this.drawCamp(c, T);
    if (G.hero && cy < 8) G.hero.draw(c, this.X(G.hero.x), this.Y(G.hero.y), T, this.Y(0));
    this.drawTips(c, T);
    this.drawParticles(c);
    if (this.show) this.drawFlows(c, this.show.t);
    if (dark) { c.globalAlpha = FG_DIM; drawDark(); c.globalAlpha = 1; }
    if (G.trans) this.drawWipe(c, G.trans.k, G.trans.dir);

    // 屏幕空间
    if (this.show) this.drawOreFlights(c);
    else this.drawOffscreen(c, T);
    if (this.flash > 0) { c.fillStyle = `rgba(228,59,68,${Math.min(0.5, this.flash * 1.6)})`; c.fillRect(0, 0, VW, VH); }
    if (this.running && this.timeLeft < 8 && Math.floor(T * 4) % 2 === 0) {
      c.fillStyle = '#e43b44';
      c.fillRect(0, 0, VW, 2); c.fillRect(0, VH - 2, VW, 2); c.fillRect(0, 0, 2, VH); c.fillRect(VW - 2, 0, 2, VH);
    }
  };

  // 像素云（天空由 cliff.js 按所在层绘制）
  function makeCloud(r) {
    const cv = G.mkCanvas(72, 24), c = cv.getContext('2d');
    const blobs = [];
    for (let i = 0; i < 7; i++) blobs.push([10 + r() * 52, 12 + (r() - 0.4) * 6, 4 + r() * 6]);
    for (const [x, y, rr] of blobs) disc(c, x, y + 1, rr, '#e8dcc8');
    for (const [x, y, rr] of blobs) disc(c, x, y - 1, rr - 1, '#fffaf0');
    c.clearRect(0, 18, 72, 6);
    c.fillStyle = '#e8dcc8'; c.fillRect(6, 17, 60, 1);
    return cv;
  }

  // ================= 地层：每个分块一张 256×256 的像素图 =================
  // 不再逐像素撒噪点（那样很「糊」）：每一层土分成上亮 / 中 / 下暗三段，段与段之间只在窄窄一条里用网点过渡；
  // 再稀疏地放一些成形的东西——沉积纹（短横线）、卵石堆——让土看起来有地质感而不是一片噪声
  // 土层带：{ top 世界 y, col 颜色, line 顶上画分界线, amp 分界起伏 }。
  // 没有设计的层每 48 单位一层（L.strata）；设计好的层按编辑器里的分层，每层再按 48 单位分几段、越往下越暗，段之间不画线
  P.bands = function () {
    if (this._bands && this._bandsLv === this.lv) return this._bands;
    const B = [], L = this.L, d = G.STRATA && G.STRATA[L.id], END = G.GEO.ROWS * TILE + 96;
    if (this.design && d && d.layers && d.layers.length) {
      const ls = d.layers.slice().sort((a, b) => a.top - b.top);
      ls.forEach((ly, i) => {
        const y0 = i ? ly.top * TILE : 0, y1 = i + 1 < ls.length ? ls[i + 1].top * TILE : END;
        for (let y = y0, j = 0; y < y1; y += 48, j++) B.push({ top: y, col: G.shade(ly.color, -Math.min(24, j * 3)), line: j === 0 && i > 0, amp: j ? 1 : 0.25 });
      });
    } else for (let k = 0; k * 48 < END; k++) B.push({ top: k * 48, col: stratum(L, k), line: k > 0, amp: 1 });
    B.push({ top: END + 48, col: B[B.length - 1].col, line: false, amp: 0 });
    this._bandsLv = this.lv;
    return (this._bands = B);
  };
  // 两侧崖壁底下（地图左右之外）的地：没有地块和根，只按土层画，和坑里的地连成一片（cliff.js 再压暗、画出崖壁的边）
  // 土层一变（换层、换地下地图）就整个重画
  P.outerChunk = function (cx, cy) {
    if (cy < 0 || cy >= GEO.ROWS / CS || (cx >= 0 && cx < COLS / CS)) return null;
    const B = this.bands();
    if (this._outerB !== B) { this._outerB = B; this._outer = new Map(); }
    const k = cx + ',' + cy;
    let ch = this._outer.get(k);
    if (!ch) this._outer.set(k, ch = { cx, cy, dirty: true });
    return ch;
  };
  P.paintChunk = function (ch) {
    ch.dirty = false;
    const cv = ch.bg || (ch.bg = G.mkCanvas(CP, CP)), c = cv.getContext('2d');
    const img = c.createImageData(CP, CP), d = new Uint32Array(img.data.buffer);
    const x0 = ch.cx * CPX, y0 = ch.cy * CPX, B = this.bands();
    const bandAt = y => { let k = 0; while (k + 1 < B.length && B[k + 1].top <= y) k++; return k; };
    const k0 = Math.max(0, bandAt(y0 - 12)), k1 = Math.min(B.length - 2, bandAt(y0 + CPX + 12));
    // 每列各层分界的起伏：两条缓慢的正弦，以 1 像素为单位
    const waves = {};
    for (let k = k0; k <= k1 + 1; k++) {
      const a = waves[k] = new Float32Array(CP), A = B[k].amp;
      for (let px = 0; px < CP; px++) { const wx = x0 + (px + 0.5) / PX; a[px] = B[k].top + Math.round((Math.sin(wx * 0.031 + k * 1.7) * 3 + Math.sin(wx * 0.009 + k * 2.3) * 5) * A * 2) / 2; }
    }
    const pal = {};
    for (let k = k0; k <= k1; k++) {
      const s = B[k].col;
      pal[k] = { t: [shadeU(s, 10), u32(s), shadeU(s, -12)], line: shadeU(s, -30), hi: shadeU(s, 18) };
    }
    for (let py = 0; py < CP; py++) {
      const wy = y0 + (py + 0.5) / PX;
      for (let px = 0; px < CP; px++) {
        let k = k0;
        while (k < k1 && wy >= waves[k + 1][px]) k++;
        const q = pal[k], top = k ? waves[k][px] : Math.min(0, waves[0][px]), dd = Math.max(0, wy - top), ln = B[k].line;
        let col;
        if (ln && dd < 0.5) col = q.line;             // 分界线：一像素暗线
        else if (ln && dd < 1) col = q.hi;            // 下面一像素亮边
        else {
          const f = dd / Math.max(8, waves[k + 1][px] - top) * 3, i = Math.min(2, Math.floor(f)), fr = f - i;
          // 只在每段的最后 18% 用网点过渡到下一段
          col = q.t[i < 2 && fr > 0.82 && (fr - 0.82) / 0.18 > bayer(px, py) ? i + 1 : i];
        }
        d[py * CP + px] = col;
      }
    }
    c.putImageData(img, 0, 0);
    // 沉积纹：短短的横线，同一条纹在相邻格子里接得上
    for (let gy = 0; gy < CP / 6; gy++) for (let gx = 0; gx < CP / 12; gx++) {
      const h = hash3(ch.cx * 64 + gx, ch.cy * 64 + gy, 29);
      if (h % 100 >= 9) continue;
      const x = gx * 12 + (h >> 8) % 8, y = gy * 6 + (h >> 12) % 4, len = 3 + (h >> 16) % 6;
      if (y0 * PX + y < 16) continue;
      const q = pal[Math.max(k0, Math.min(k1, bandAt(y0 + y / PX)))];
      c.fillStyle = hexOf(q.t[2]); c.fillRect(x, y, len, 1);
      c.fillStyle = hexOf(q.hi); c.fillRect(x + 1, y - 1, len - 2, 1);
    }
    // 卵石堆：两三颗带轮廓的小石子挨在一起
    for (let gy = 0; gy < CP / 16; gy++) for (let gx = 0; gx < CP / 16; gx++) {
      const h = hash3(ch.cx * 32 + gx, ch.cy * 32 + gy, 11);
      if (h % 100 >= 7) continue;
      const x = gx * 16 + (h >> 8) % 10, y = gy * 16 + (h >> 12) % 10;
      if (y0 * PX + y < 18) continue;
      pebble(c, x, y, h);
      if (h & 1) pebble(c, x + 4, y + 1, h >>> 3);
      if (h & 2) pebble(c, x + 2, y - 2, h >>> 5);
    }
    // 静态地块：空洞、黏土、盐碱、冻土、营养土（带轮廓的整块）；岩石底下垫的地也一起画，和周围连成一片
    for (let r = 0; r < CS; r++) for (let col = 0; col < CS; col++) {
      const C = ch.cx * CS + col, R = ch.cy * CS + r, kind = this.groundKind(C, R);
      if (!kind) continue;
      const same = (dc, dr) => this.groundKind(C + dc, R + dr) === kind;
      const mask = (same(0, -1) ? 1 : 0) | (same(1, 0) ? 2 : 0) | (same(0, 1) ? 4 : 0) | (same(-1, 0) ? 8 : 0);
      c.drawImage(tileSprite(kind, mask), col * TP, r * TP);
      decorateStatic(c, kind, mask, col * TP, r * TP, hash3(C, R, 23));
    }
  };
  const hexOf = v => '#' + ((v & 255) << 16 | (v >> 8 & 255) << 8 | (v >> 16 & 255)).toString(16).padStart(6, '0');
  function pebble(c, x, y, h) {
    const w = 3 + (h & 1), cols = [['#8a7a6a', '#b9a891', '#e0d4c0'], ['#6e5f55', '#9c8b7a', '#cdbfae'], ['#7a6a5a', '#a89880', '#d8ccb8']][(h >>> 0) % 3];
    c.fillStyle = '#3e2731'; c.fillRect(x, y + 1, w + 2, 2); c.fillRect(x + 1, y, w, 4);
    c.fillStyle = cols[0]; c.fillRect(x + 1, y + 1, w, 2);
    c.fillStyle = cols[1]; c.fillRect(x + 1, y + 1, w - 1, 1);
    c.fillStyle = cols[2]; c.fillRect(x + 1, y + 1, 1, 1);
  }

  // 根尖钻过的土：只记下来（不再画暗斑，地下更干净）
  P.digTile = function (col, row) {
    const cx = Math.floor(col / CS), cy = Math.floor(row / CS), ch = this.chunk(cx, cy);
    if (!ch) return;
    (ch.dug = ch.dug || new Set()).add((row - cy * CS) * CS + (col - cx * CS));
  };

  // 地块精灵 16×16：mask 表示上右下左是否同类。两边都敞开的角削成半径 5 的圆角，敞开的边描 1 像素深色边
  const tileCache = new Map();
  function tileSprite(type, mask) {
    const key = type + mask;
    if (tileCache.has(key)) return tileCache.get(key);
    if (type === 'humus') { const cv = humusSprite(mask); tileCache.set(key, cv); return cv; }
    const S = TP, cv = G.mkCanvas(S, S), c = cv.getContext('2d');
    const up = mask & 1, rt = mask & 2, dn = mask & 4, lf = mask & 8;
    const inside = (u, v) => {
      if (u < 0) return v >= 0 && v < S && !!lf;
      if (u >= S) return v >= 0 && v < S && !!rt;
      if (v < 0) return !!up;
      if (v >= S) return !!dn;
      const Rr = 5, out = (a, b) => a < Rr && b < Rr && (Rr - a - 0.5) ** 2 + (Rr - b - 0.5) ** 2 > Rr * Rr;
      if (!up && !lf && out(u, v)) return false;
      if (!up && !rt && out(S - 1 - u, v)) return false;
      if (!dn && !lf && out(u, S - 1 - v)) return false;
      if (!dn && !rt && out(S - 1 - u, S - 1 - v)) return false;
      return true;
    };
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      if (!inside(u, v)) continue;
      const edge = !inside(u - 1, v) || !inside(u + 1, v) || !inside(u, v - 1) || !inside(u, v + 1);
      c.fillStyle = tileColor(type, u, v, edge, up, dn);
      c.fillRect(u, v, 1, 1);
    }
    tileCache.set(key, cv);
    return cv;
  }
  // 营养土：不描边，在原来的土色上叠一层半透明的暗褐（哪一层土都比周围深一档），
  // 敞开的边用抖动慢慢淡出到普通土，零星几粒深褐、墨绿的小颗粒
  function humusSprite(mask) {
    const S = TP, cv = G.mkCanvas(S, S), c = cv.getContext('2d');
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const d = Math.min(mask & 8 ? 9 : u, mask & 2 ? 9 : S - 1 - u, mask & 1 ? 9 : v, mask & 4 ? 9 : S - 1 - v), chk = (u + v) % 2 === 0;
      const a = d >= 3 ? 0.26 : d === 2 ? (chk ? 0.26 : 0.16) : d === 1 ? (chk ? 0.16 : 0.08) : (chk && (u + 3 * v) % 4 === 0 ? 0.1 : 0);
      if (!a) continue;
      c.fillStyle = `rgba(58,32,18,${a})`; c.fillRect(u, v, 1, 1);
      if (d < 2) continue;
      if ((u * 7 + v * 5) % 23 === 0) { c.fillStyle = 'rgba(46,26,16,0.55)'; c.fillRect(u, v, 1, 1); }
      else if ((u * 3 + v * 11) % 31 === 0) { c.fillStyle = 'rgba(96,122,58,0.5)'; c.fillRect(u, v, 1, 1); }
    }
    return cv;
  }
  function tileColor(type, u, v, edge, up, dn) {
    const S = TP;
    switch (type) {
      case 'cave':
        if (edge) return '#1b1218';
        if (!dn && v >= S - 4) return v === S - 4 ? '#8a5a3a' : '#5c3a26';
        if (!up && v <= 2) return '#1f151b';
        return '#2e2028';
      case 'clay':
        if (edge) return '#5c3226';
        if (!up && v === 1) return '#c07858';
        return (v + Math.floor(u / 5)) % 5 === 0 ? '#86503e' : '#a0604a';
      case 'salt':
        if (edge) return '#9c8f78';
        if ((u * 7 + v * 13) % 11 === 0) return '#ffffff';
        if ((u * 5 + v * 3) % 13 === 0) return '#c9bfa8';
        return '#e6dfcf';
      case 'ice':
        if (edge) return '#5a7a96';
        if (!up && v === 1) return '#ffffff';
        if ((u + v * 2) % 9 === 0) return '#ffffff';
        return (v + (u >> 2)) % 6 === 0 ? '#a8cce0' : '#cfe8f4';
      case 'water':
        if (edge) return '#1d3c58';
        if (!up && v <= 1) return '#a8d8ea';
        return v > 9 ? '#356fa3' : '#3f86bf';
      case 'bedrock':
        // 基岩：暗紫灰的整块，带斜向裂纹和零星亮点，和普通岩石一眼分开
        if (edge) return '#16131a';
        if (!up && v === 1) return '#6a6474';
        if ((u * 3 + v * 7) % 17 === 0) return '#7a7484';
        if ((u + v) % 7 === 0 && (u >> 2) % 2 === 0) return '#24202a';
        return (v + (u >> 3)) % 4 === 0 ? '#3a3542' : '#34303a';
      case 'fire':
        if (edge) return '#3e1a22';
        if (!up && v <= 2) return v === 0 ? '#fee761' : '#feae34';
        return v > 9 ? '#be3a24' : '#e04a2c';
    }
    return '#f0f';
  }
  // 静态地块上的小细节：洞顶垂下的钟乳、洞底的小草、盐晶
  function decorateStatic(c, kind, mask, x, y, h) {
    if (kind === 'cave') {
      if (!(mask & 1) && h % 3 === 0) { const sx = x + 3 + h % 9; c.fillStyle = '#4a352a'; c.fillRect(sx, y + 1, 2, 3); c.fillRect(sx, y + 4, 1, 2); }
      if (!(mask & 4) && h % 4 === 1) { const sx = x + 2 + (h >> 4) % 10; c.fillStyle = '#3e8948'; c.fillRect(sx, y + TP - 6, 1, 2); c.fillRect(sx + 2, y + TP - 5, 1, 1); }
    } else if (kind === 'ice' && h % 4 === 0) {
      const sx = x + 3 + h % 9, sy = y + 3 + (h >> 3) % 8;
      c.fillStyle = '#8ab0c8'; c.fillRect(sx, sy, 3, 1); c.fillRect(sx + 1, sy + 1, 2, 1);
    } else if (kind === 'humus' && h % 3 === 0) {
      const sx = x + 3 + h % 9, sy = y + 4 + (h >> 3) % 7;
      c.fillStyle = 'rgba(46,26,16,0.5)'; c.fillRect(sx, sy, 2, 1); c.fillRect(sx + 2, sy + 1, 1, 1);
    } else if (kind === 'salt' && h % 5 === 0) {
      const sx = x + 4 + h % 7, sy = y + 4 + (h >> 3) % 6;
      c.fillStyle = '#ffffff'; c.fillRect(sx, sy - 1, 1, 3); c.fillRect(sx - 1, sy, 3, 1);
    }
  }

  // 岩石：4 种形状的像素石块，挨在一起像石堆
  const rockCache = [];
  function rockSprite(i) {
    if (rockCache[i]) return rockCache[i];
    const cv = G.mkCanvas(TP + 2, TP + 2), c = cv.getContext('2d');
    const pts = [];
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, rr = 6.6 + hash(i * 17.3 + k * 2.7) * 1.4; pts.push([9 + Math.cos(a) * rr * 1.05, 9 + Math.sin(a) * rr * 0.9]); }
    const poly = (g, ox, oy, s = 1) => { g.beginPath(); pts.forEach(([x, y], k) => { const X = 9 + (x - 9) * s + ox, Y = 9 + (y - 9) * s + oy; k ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); };
    crisp(c, g => { poly(g, 0, 0); g.fillStyle = '#6e5f55'; g.fill(); }, 0, 0, cv.width, cv.height);
    crisp(c, g => { poly(g, -0.8, -1, 0.86); g.fillStyle = '#9c8b7a'; g.fill(); }, 0, 0, cv.width, cv.height);
    crisp(c, g => { g.beginPath(); g.ellipse(6.5, 6, 2.6, 1.6, -0.5, 0, TAU); g.fillStyle = '#cdbfae'; g.fill(); }, 0, 0, cv.width, cv.height);
    if (i % 2) { c.fillStyle = '#4d3f3a'; c.fillRect(10, 6, 1, 2); c.fillRect(11, 8, 1, 2); c.fillRect(10, 10, 1, 1); }
    outline(cv, INK);
    return (rockCache[i] = cv);
  }

  // ================= 动态地块：熔岩、露水、岩石、矿物 =================
  P.drawTiles = function (c, cx, cy, T) {
    const c0 = Math.floor(cx / TILE) - 1, c1 = Math.floor((cx + W) / TILE) + 1;
    const r0 = Math.max(0, Math.floor(cy / TILE) - 1), r1 = Math.floor((cy + H) / TILE) + 1;
    const res = [];
    for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) {
      const cell = this.tileAt(col, r);
      if (!cell || cell.type === 'edge') continue;
      const x = this.X(col * TILE), y = this.Y(r * TILE), h = hash3(col, r, 3);
      if (cell.type === 'rock') c.drawImage(rockSprite(h % 4), x - 1, y - 1);
      else if (cell.type === 'bedrock') {
        const same = (dc, dr) => { const t = this.tileAt(col + dc, r + dr); return !!t && (t.type === 'bedrock' || t.type === 'edge'); };
        c.drawImage(tileSprite('bedrock', (same(0, -1) ? 1 : 0) | (same(1, 0) ? 2 : 0) | (same(0, 1) ? 4 : 0) | (same(-1, 0) ? 8 : 0)), x, y);
      }
      else if (isFire(cell) || isWater(cell)) {
        const pred = isFire(cell) ? isFire : isWater, same = (dc, dr) => pred(this.tileAt(col + dc, r + dr));
        const mask = (same(0, -1) ? 1 : 0) | (same(1, 0) ? 2 : 0) | (same(0, 1) ? 4 : 0) | (same(-1, 0) ? 8 : 0);
        c.drawImage(tileSprite(isFire(cell) ? 'fire' : 'water', mask), x, y);
        if (isFire(cell)) {
          // 冒泡：鼓起、破裂
          const p = (T * 0.8 + (h & 255) / 255) % 1;
          if (p < 0.7) { const bx = x + 3 + h % 9, by = y + 12 - Math.floor(p * 9); c.fillStyle = p > 0.55 ? '#fee761' : '#feae34'; c.fillRect(bx, by, p > 0.4 ? 2 : 1, p > 0.4 ? 2 : 1); }
          if (!(mask & 1) && Math.sin(T * 3 + h) > 0.6) { c.fillStyle = '#fee761'; c.fillRect(x + (h >> 5) % 12 + 2, y - 1, 1, 1); }
        } else {
          const o = Math.floor((T * 6 + h % 16) % 16);
          c.fillStyle = '#a8d8ea'; c.fillRect(x + o % 12 + 2, y + 5 + (h >> 4) % 6, 3, 1);
          if (Math.sin(T * 2.3 + h) > 0.93) { c.fillStyle = '#ffffff'; c.fillRect(x + 11, y + 9, 1, 1); }
        }
      } else if (cell.type === 'res') res.push([col, r, cell]);
    }
    for (const [col, r, cell] of res) {
      const x = col * TILE + 4, y = r * TILE + 4, bob = Math.round(Math.sin(T * 2 + cell.ph));
      const ic = G.iconCanvas(cell.id);
      const sx = this.X(x) - 10, sy = this.Y(y) - 10 + (cell.cave ? 1 : bob);
      // 闪光：偶尔有一颗十字星
      if (Math.sin(T * 1.7 + cell.ph * 3) > 0.94) sparkle(c, sx + 16, sy + 2, '#ffffff');
      c.drawImage(ic, sx, sy);
    }
  };

  function sparkle(c, x, y, col) {
    c.fillStyle = col;
    c.fillRect(x, y - 2, 1, 5); c.fillRect(x - 2, y, 5, 1);
  }

  // ================= 地表：一块一块的地 =================
  // 地表每 PLOT_W 列一块，整块同一种土：流沙 / 固定沙地 / 沙壤 / 绿洲土，地皮、表土、点缀各不相同。
  // 相邻两块土不同时，交界处 BLEND 像素内两种土犬牙交错地咬在一起（自然）；好土的地皮高一像素、压在差的土上并带一道暗边（明显）。
  // 每两块地之间埋一块界石，给出分寸
  const PP = CFG.PLOT_W * TP, BLEND = 9;
  const TUFTS = [
    [[0, -1, 1], [1, -2, 0], [1, -1, 1], [2, -1, 2]],
    [[0, -1, 2], [1, -1, 1], [1, -2, 1], [1, -3, 0], [2, -1, 1], [2, -2, 0], [3, -1, 2]],
    [[0, -1, 1], [0, -2, 0], [1, -1, 2], [2, -1, 1], [2, -2, 1], [2, -3, 0], [3, -2, 0], [3, -1, 1], [4, -1, 2]],
  ];
  const DRY = ['#e0c890', '#bca064', '#8a7448'];
  const soilPals = new Map();
  function soilPal(L) {
    let p = soilPals.get(L);
    if (p) return p;
    const S = L.sand, Gr = L.grass, soil = stratum(L, 0);
    const tS = G.shade(soil, 8), tG = mix(G.shade(soil, -18), '#5c4a2e', 0.35);
    // depth：表土有几行（土越好越厚、越深色），top2：表土里的深色（夯实层、腐殖层），fleck：表土里的浅色颗粒
    p = [
      { crust: S, top: tS, depth: 5, rise: 0 },                                                  // 流沙：浅色松沙，起伏的沙纹
      { crust: S.map(c => mix(c, '#8a6a48', 0.4)), top: mix(tS, tG, 0.3), depth: 7, rise: 0 },    // 固定沙地：结了皮的深色沙，龟裂
      { crust: S.map((c, i) => mix(c, Gr[i], 0.6)), top: mix(tS, tG, 0.65), depth: 10, rise: 1 }, // 沙壤：草一簇簇，露出土
      { crust: Gr, top: tG, depth: 13, rise: 1 },                                                // 绿洲土：厚草皮，黑褐的腐殖层
    ];
    for (const q of p) { q.edge = G.shade(q.crust[2], -22); q.top2 = G.shade(q.top, -16); q.fleck = mix(q.top, S[0], 0.55); }
    p[3].fiber = mix(tG, '#c8a070', 0.45);
    soilPals.set(L, p);
    return p;
  }
  P.drawGround = function (c, cx, T) {
    const Y0 = this.Y(0), L = this.L, lv = this.lv;
    if (Y0 < -20 || Y0 > VH + 10) return;
    const pal = soilPal(L), GRASS = L.grass, memo = new Map();
    const soil = p => { p = clamp(p, 0, NPLOT - 1); let k = memo.get(p); if (k === undefined) memo.set(p, k = this.plotSoil(p)); return k; };
    // 某个像素是哪种土：离交界 BLEND 像素以内按距离掺进邻块的土；给出 row 时（表土）每行再加一点随机，两种土碎碎地咬在一起
    const kindAt = (ix, row) => {
      const p = Math.floor(ix / PP), B = ix - p * PP < PP / 2 ? p : p + 1;
      const s = ix + 0.5 - B * PP;
      if (Math.abs(s) >= BLEND) return soil(p);
      const a = soil(B - 1), b = soil(B);
      if (a === b) return a;
      const n = hash(Math.floor(ix / 2) * 1.93 + lv * 5.1);
      return (row === undefined ? n : n * 0.5 + hash(ix * 3.7 + row * 1.9 + lv) * 0.5) < 0.5 + 0.5 * s / BLEND ? b : a;
    };
    const sway = Math.floor(T * 2) % 2;
    let prev = kindAt(this.ox - 1);
    const px = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
    for (let x = 0; x < VW; x++) {
      const ix = x + this.ox, k = kindAt(ix), q = pal[k], h = hash(ix * 0.731 + lv * 3.1);
      // 表土：每行单独取土，厚度看土质，底边高低不平；各种土有自己的纹理
      const root = k === 3 && hash(ix * 1.37 + lv) < 0.07 ? 4 + Math.floor(hash(ix * 2.9) * 6) : 0;
      for (let r = 3; r < 16; r++) {
        const kr = kindAt(ix, r), qr = pal[kr];
        if (r >= qr.depth + Math.floor(Math.sin(ix * 0.31 + kr * 2 + lv) * 1.3 + hash(ix * 0.57 + kr) * 1.8)) continue;
        const n = hash(ix * 12.9898 + r * 78.233 + lv);
        let col = qr.top;
        if (kr === 0) { if (n < 0.05) col = qr.fleck; }                                              // 松沙的亮沙粒
        else if (kr === 1) { if (r === 5 && hash(Math.floor(ix / 5) + lv) < 0.7) col = qr.top2; else if (n < 0.04) col = '#a89880'; } // 夯实层、小石子
        else if (kr === 2) { if (n < 0.05) col = qr.fleck; else if (n > 0.95) col = qr.top2; }       // 土里夹着沙
        else { if (r > 7) col = qr.top2; if (root && r >= 4 && r < root) col = qr.fiber; else if (n < 0.04) col = qr.fleck; } // 腐殖层、细根
        px(x, Y0 + r, col);
      }
      // 地皮
      const [c0, c1, c2] = q.crust;
      if (k === 0) {
        // 流沙：表面一起一伏，沙纹是一段亮、一点暗
        const u = Math.round(Math.sin(ix * 0.19 + lv) * 0.55 + Math.sin(ix * 0.053 + 1) * 0.6);
        if (u > 0) { px(x, Y0 - 2, c0); px(x, Y0 - 1, c1); } else if (u === 0) px(x, Y0 - 1, c0);
        c.fillStyle = c1; c.fillRect(x, Y0, 1, 2); px(x, Y0 + 2, c2);
        const m = (ix + Math.floor(hash(Math.floor(ix / 9) + lv) * 3)) % 9;
        if (m >= 2 && m <= 4) px(x, Y0, c0); else if (m === 5) px(x, Y0, c2);
      } else if (k === 1) {
        // 固定沙地：平的结皮，一道道裂纹往下伸
        const crack = h < 0.11;
        px(x, Y0 - 1, crack ? c2 : c0);
        c.fillStyle = c1; c.fillRect(x, Y0, 1, 2); px(x, Y0 + 2, c2);
        if (crack) { c.fillStyle = q.edge; c.fillRect(x, Y0, 1, h < 0.05 ? 3 : 2); if (h < 0.07) px(x + 1, Y0 + 1, q.edge); }
      } else if (k === 2) {
        // 沙壤：草皮里露出一块块土，草一簇簇冒出来
        const bv = Math.sin(ix * 0.43 + lv * 3) + Math.sin(ix * 0.17 + 2) + hash(ix * 0.9) * 0.4, bare = bv > 1.15;
        if (bare) { px(x, Y0 - 2, bv > 1.45 ? q.top : q.fleck); px(x, Y0 - 1, bv > 1.45 ? q.top2 : q.top); px(x, Y0, q.top2); px(x, Y0 + 1, c2); }
        else {
          px(x, Y0 - 2, c0); c.fillStyle = c1; c.fillRect(x, Y0 - 1, 1, 2); px(x, Y0 + 1, c2);
          if (h < 0.35) px(x, Y0 - 3, GRASS[1]);
          if (h < 0.1) px(x, Y0 - 4, GRASS[0]);
        }
        px(x, Y0 + 2, c2);
      } else {
        // 绿洲土：厚草皮，草叶密，下沿垂着草须
        px(x, Y0 - 2, c0); px(x, Y0 - 1, c1); c.fillStyle = c2; c.fillRect(x, Y0, 1, 2); px(x, Y0 + 2, G.shade(c2, -20));
        if (h < 0.6) px(x, Y0 - 3, h < 0.3 ? GRASS[0] : GRASS[1]);
        if (h < 0.22) px(x, Y0 - 4, GRASS[0]);
        if (h > 0.7) { c.fillStyle = c2; c.fillRect(x, Y0 + 3, 1, h > 0.9 ? 2 : 1); }
      }
      // 两种土的交界：高的一边压一道暗边
      if (k !== prev) { const e = pal[Math.max(k, prev)]; c.fillStyle = e.edge; c.fillRect(x, Y0 - 1 - e.rise, 1, 3 + e.rise); }
      prev = k;
    }
    // 点缀：按 7 像素一格放，种类看那里的土；界石两侧留空（不放小石子，免得和界石混在一起）
    for (let gx = Math.floor(this.ox / 7) - 1; gx <= Math.floor((this.ox + VW) / 7) + 1; gx++) {
      const ix = gx * 7 + Math.floor(hash(gx * 4.7 + lv) * 4), x = ix - this.ox, h = hash(gx * 9.13 + lv);
      const u = ((ix % PP) + PP) % PP;
      if (u < 4 || u > PP - 7) continue;
      const k = kindAt(ix), y = Y0 - pal[k].rise;
      if (k === 3 && h < 0.55 || k === 2 && h < 0.3) {
        const tf = TUFTS[k === 3 ? Math.floor(h * 5.4) % 3 : Math.floor(h * 6.6) % 2], s = sway && h < 0.3 ? 1 : 0;
        for (const [dx, dy, ci] of tf) { c.fillStyle = GRASS[ci]; c.fillRect(x + dx + (dy < -1 ? s : 0), y + dy, 1, 1); }
      } else if (k === 3 && h < 0.72) {
        // 小花：一根茎，一点颜色
        const fc = ['#fee761', '#f6757a', '#ffffff', '#b48ad8'][Math.floor(h * 97) % 4];
        c.fillStyle = GRASS[2]; c.fillRect(x + 1, y - 3, 1, 3);
        c.fillStyle = fc; c.fillRect(x, y - 4, 3, 1); c.fillRect(x + 1, y - 5, 1, 1);
        c.fillStyle = '#feae34'; c.fillRect(x + 1, y - 4, 1, 1);
      } else if (k === 1 && h < 0.2) {
        // 干草丛
        for (const [dx, dy, ci] of TUFTS[0]) { c.fillStyle = DRY[ci]; c.fillRect(x + dx, y + dy, 1, 1); }
      } else if (k === 1 && h < 0.3 || k === 0 && h < 0.04) {
        // 干枝
        c.fillStyle = '#a07a4e'; c.fillRect(x + 1, y - 3, 1, 3); c.fillRect(x, y - 4, 1, 1); c.fillRect(x + 2, y - 5, 1, 2);
        c.fillStyle = '#c9a46a'; c.fillRect(x + 3, y - 3, 1, 1);
      }
    }
    // 界石：每两块地之间一块，表土里一道竖缝往下收
    for (let p = Math.max(1, Math.floor(this.ox / PP)); p <= Math.min(NPLOT - 1, Math.ceil((this.ox + VW) / PP)); p++) {
      const x = p * PP - this.ox, y = Y0 - Math.max(pal[soil(p - 1)].rise, pal[soil(p)].rise);
      if (x < -4 || x > VW + 4) continue;
      for (let r = 3; r < 9; r++) if (r < 6 || bayer(x, Y0 + r) < 0.5) { c.fillStyle = G.shade(pal[kindAt(x, r)].top, -26); c.fillRect(x, Y0 + r, 1, 1); }
      c.fillStyle = INK; c.fillRect(x - 2, y - 2, 5, 3); c.fillRect(x - 1, y - 3, 3, 1);
      c.fillStyle = '#c8bba4'; c.fillRect(x - 1, y - 2, 3, 1);
      c.fillStyle = '#968670'; c.fillRect(x - 1, y - 1, 3, 1);
      c.fillStyle = '#e8dcc4'; c.fillRect(x - 1, y - 2, 1, 1);
    }
  };

  // ================= 植物（像素化的程序树，画法见 tree_art.js） =================
  // 摆动动画每 0.2 秒更新一帧（像素游戏常见的低帧动画）
  // 越大的树画得越早（在后层）；大小只在第一次画时记下，避免摆动导致前后顺序闪烁。影子先于所有树画
  P.drawPlants = function (c, cx) {
    const vis = [];
    for (const p of this.world.plants) {
      if (this.show && p === this.showPlant) continue;
      const x = p.col * TILE + TILE / 2;
      if (x < cx - 90 || x > cx + W + 90) continue;
      const bucket = Math.floor((this.clock + p.col * 0.37) * 5), tr = this.treeOf(p);
      // 被摇的树：0.6 秒内每帧重画，枝叶左右甩动、慢慢停下
      const sk = this.shakes && this.shakes.has(p) ? this.clock - this.shakes.get(p) : 1;
      tr.gust = sk < 0.6 ? Math.sin(sk * 34) * 5 * (1 - sk / 0.6) : 0;
      if (tr.gust || p._sprB !== bucket || !p._spr || p._sprK !== p._fk) {
        p._spr = G.TreeArt.sprite(tr, 1e9, bucket / 5 + p.col * 0.7, tr.fruits.length > 0, p._spr, bucket);
        p._sprB = bucket; p._sprK = p._fk;
      }
      if (p._sz === undefined) p._sz = p._spr.sz;
      vis.push(p);
    }
    vis.sort((a, b) => b._sz - a._sz || a.col - b.col);
    const Y0 = this.Y(0), px = p => this.X(p.col * TILE + TILE / 2);
    for (const p of vis) G.TreeArt.shadow(c, px(p), Y0, p._spr);
    for (const p of vis) {
      const s = p._spr;
      c.drawImage(s.cv, px(p) - s.ax, Y0 - s.ay);
    }
    for (const p of vis) G.TreeArt.drift(c, p, G.TREES[p.sp].form, p._spr, px(p), Y0, this.clock);
  };

  // 本局的植物：种植时是幼苗，收获时长成结果的大树
  P.drawTree = function (c, T) {
    const s = this.show, tr = this.treeObj, t = s ? s.t : 0;
    const X = this.X(this.spawnX), Y0 = this.Y(0);
    if (!tr || t < SHOW.TREE0 + 0.15) {
      const spr = sproutSprite(T, s ? t : -1);
      c.drawImage(spr.cv, X - spr.ax, Y0 - spr.ay);
    }
    if (tr) {
      const done = s && s.done;
      const bucket = done ? Math.floor(this.clock * 5) : -1;
      if (!done || this._treeB !== bucket) {
        this._treeSpr = G.TreeArt.sprite(tr, done ? 1e9 : t, done ? bucket / 5 : this.clock, true, this._treeSpr, bucket);
        this._treeB = bucket;
      }
      const sp = this._treeSpr;
      G.TreeArt.shadow(c, X, Y0, sp);
      c.drawImage(sp.cv, X - sp.ax, Y0 - sp.ay);
      if (done) G.TreeArt.drift(c, tr, tr.form, sp, X, Y0, this.clock);
      if (!done) this.drawSaps(c, tr, t);
    }
  };

  let sproutPal = null;
  const sproutCvs = [];
  function sproutSprite(T, t) {
    const shiver = t > SHOW.TREE0 - 0.6;
    const T2 = shiver ? T : Math.floor(T * 6) / 6, key = shiver ? -1 : Math.floor(T * 6) % 24;
    if (key >= 0 && sproutCvs[key]) return sproutCvs[key];
    const K = TR.SPROUT_TS * PX, cv = G.mkCanvas(28, 26), c = cv.getContext('2d', { willReadFrequently: true });
    c.setTransform(K, 0, 0, K, 14, 22);
    TR.drawSprout(c, T2, t);
    c.setTransform(1, 0, 0, 1, 0, 0);
    sproutPal = sproutPal || [G.INK, '#6a9e46', '#7fb052', '#2c4429', '#b8d67c'].map(hex);
    pixelize(cv, sproutPal, 100);
    const s = { cv, ax: 14, ay: 22 };
    if (key >= 0) sproutCvs[key] = s;
    return s;
  }

  // 树液光点：从树干流向正在生长的枝梢
  P.drawSaps = function (c, tr, t) {
    for (const s of tr.saps) {
      const p = (t - s.t0) / s.dur;
      if (p < 0 || p > 1) continue;
      const ch = s.chain, k = ch.length, f = (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) * k;
      const i = Math.min(k - 1, Math.floor(f)), b = ch[i];
      if (b.g <= 0) continue;
      const u = Math.min(b.g, (f - i) * (i < k - 1 ? ch[i + 1].s : b.g));
      const [x, y] = TR.bez(b, u);
      const X = this.X(this.spawnX + x * TS), Y = this.Y(y * TS);
      c.fillStyle = '#fee761'; c.fillRect(X - 1, Y - 1, 2, 2);
      c.fillStyle = '#ffffff'; c.fillRect(X - 1, Y - 1, 1, 1);
    }
  };

  // 养分光点：从各根尖沿根系加速流回树干
  P.drawFlows = function (c, t) {
    for (const f of this.show.flows) {
      const p = (t - f.t0) / f.dur;
      if (p < 0 || p > 1) continue;
      const L = f.p.cum[f.p.cum.length - 1];
      for (let k = 0; k < 4; k++) {
        const pk = p - k * 0.03;
        if (pk < 0) break;
        const [x, y] = pointAlong(f.p, pk * pk * L);
        const X = this.X(x), Y = this.Y(y);
        if (!k) { c.fillStyle = '#fee761'; c.fillRect(X - 1, Y - 1, 3, 3); c.fillStyle = '#ffffff'; c.fillRect(X, Y, 1, 1); }
        else { c.fillStyle = k === 1 ? '#feae34' : '#f77622'; c.fillRect(X, Y, 1, 1); }
      }
    }
    const ga = clamp01((t - 0.9) / 0.8) * (1 - clamp01((t - SHOW.TREE0 - 0.3) / 0.8));
    if (ga > 0) {
      const X = this.X(this.spawnX), Y = this.Y(1);
      for (let y = -14; y <= 14; y++) for (let x = -14; x <= 14; x++) {
        const d = Math.hypot(x, y) / 14;
        if (d < 1 && (1 - d) * ga * 0.9 > bayer(X + x, Y + y)) { c.fillStyle = d < 0.35 ? '#ffffff' : '#fee761'; c.fillRect(X + x, Y + y, 1, 1); }
      }
    }
  };

  // ================= 地块光标：始终框住小禾所在的那块地 =================
  // 整块地皮提亮 + 四个角的括号，颜色表示合适程度；在地块之间滑动。现在种不了（小禾不在地上、正在做动作）时变淡
  const LV_COL = G.LV_COL = ['#63c74d', '#fee761', '#feae34', '#e43b44']; // 种子菜单里也用
  P.drawSelect = function (c, T) {
    const p = this.pickPlot, hero = G.hero;
    if (p < 0 || this.curX === null || !hero) return;
    const col = this.plotMid(p), sp = this.pickSp || 'camelThorn', bad = this.plantBlock(sp, col);
    const cl = LV_COL[bad ? 3 : this.suitInfo(sp, col).level];
    const ready = hero.onFloor() && !hero.act, A0 = ready ? 1 : 0.45;
    const x0 = this.X(this.curX), x1 = x0 + PP - 1, Y0 = this.Y(0), top = Y0 - 7, bot = Y0 + 10;
    c.globalAlpha = A0 * (0.14 + 0.06 * Math.sin(T * 4));
    c.fillStyle = '#ffffff'; c.fillRect(x0, Y0 - 2, PP, 9);
    c.globalAlpha = A0;
    const b = ready ? Math.floor(T * 2.5) % 2 : 0, A = 6;
    const corner = (x, y, dx, dy) => {
      const hx = dx > 0 ? x : x - A + 1, vy = dy > 0 ? y : y - A + 1;
      c.fillStyle = INK; c.fillRect(hx - 1, y - 1, A + 2, 3); c.fillRect(x - 1, vy - 1, 3, A + 2);
      c.fillStyle = cl; c.fillRect(hx, y, A, 1); c.fillRect(x, vy, 1, A);
    };
    corner(x0 - b, top - b, 1, 1); corner(x1 + b, top - b, -1, 1);
    corner(x0 - b, bot + b, 1, -1); corner(x1 + b, bot + b, -1, -1);
    // 种下后会被改良的地块：上方一个跳动的小箭头，颜色是改良后的土
    if (!bad) for (const r of this.reformPlan(sp, col)) {
      const X = this.X((this.plotMid(r.p) + 0.5) * TILE), Y = top - 5 - (Math.floor(T * 3 + r.p) % 2);
      c.fillStyle = INK; c.fillRect(X - 3, Y - 1, 7, 3); c.fillRect(X - 2, Y - 2, 5, 1); c.fillRect(X - 1, Y - 3, 3, 1); c.fillRect(X - 1, Y + 2, 3, 3);
      c.fillStyle = G.SOIL_COLS[r.to]; c.fillRect(X - 2, Y, 5, 1); c.fillRect(X - 1, Y - 1, 3, 1); c.fillRect(X, Y - 2, 1, 1); c.fillRect(X, Y + 1, 1, 3);
    }
    // 种下后会照顾到的地块：地皮下方一个闪烁的小十字
    if (!bad) for (const q of this.buffPlots(sp, col)) {
      if (Math.floor(T * 2 + q) % 3 === 0) continue;
      const X = this.X((this.plotMid(q) + 0.5) * TILE), Y = bot + 4;
      c.fillStyle = INK; c.fillRect(X - 3, Y - 1, 7, 3); c.fillRect(X - 1, Y - 3, 3, 7);
      c.fillStyle = '#a8e070'; c.fillRect(X - 2, Y, 5, 1); c.fillRect(X, Y - 2, 1, 5);
    }
    c.globalAlpha = 1;
  };

  // ================= 鸟儿留下的种子与清晨飞过的鸟 =================
  P.drawGroundSeeds = function (c, T) {
    for (const s of this.world.seeds) {
      if (s._fy === null) continue; // 还在鸟爪里
      const X = this.X(s.x), fy = s._fy || 0;
      const bob = s._fy === undefined ? (Math.floor(T * 2 + s.x * 0.1) % 2) : 0;
      const Y = this.Y(fy) - 14 - bob;
      if (s._fy === undefined) { c.fillStyle = 'rgba(62,39,49,0.35)'; c.fillRect(X - 4, this.Y(0) - 1, 8, 2); }
      c.drawImage(G.seedPixel(s.sp, 14), X - 7, Y);
      if (s._fy === undefined && Math.floor(T * 1.5 + s.x) % 5 === 0) sparkle(c, X + 5, Y + 1, '#ffffff');
    }
    // 鸟儿捎来的信、包裹：落地后一闪一闪
    for (const m of this.world.mail) {
      if (m._fy === null) continue;
      const X = this.X(m.x), fy = m._fy || 0, bob = m._fy === undefined ? (Math.floor(T * 2) % 2) : 0;
      if (m._fy === undefined) { c.fillStyle = 'rgba(62,39,49,0.35)'; c.fillRect(X - 6, this.Y(0) - 1, 12, 2); }
      G.Mail.draw(c, m.id, X, this.Y(fy) - 2 - bob);
      if (m._fy === undefined && Math.floor(T * 2) % 3 === 0) sparkle(c, X + 7, this.Y(0) - 12 - bob, '#fee761');
    }
    // 地上的果子：铲除植物时掉下的、熟透落下的
    for (const d of this.world.drops) {
      const X = this.X(d.x), fy = d._fy || 0;
      const bob = d._fy === undefined ? (Math.floor(T * 2 + d.x * 0.1) % 2) : 0;
      const Y = this.Y(fy) - 18 - bob;
      if (d._fy === undefined) { c.fillStyle = 'rgba(62,39,49,0.35)'; c.fillRect(X - 5, this.Y(0) - 1, 10, 2); }
      c.drawImage(G.iconCanvas(d.id), X - 10, Y);
    }
  };
  // 小鸟：深色剪影，翅膀两帧扑动
  P.drawBird = function (c, T) {
    const b = this.bird, X = this.X(b.x), Y = this.Y(b.y), d = b.dir, up = Math.floor(T * 8) % 2;
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(d > 0 ? X + x : X - x - w + 1, Y + y, w, h); };
    px(-5, -1, 9, 4, INK);                 // 描边身体
    px(-4, 0, 7, 2, '#8a6a52');            // 身体
    px(3, -2, 3, 3, INK); px(4, -1, 1, 1, '#ffffff'); // 头和眼
    px(6, 0, 2, 1, '#feae34');             // 喙
    px(-7, -1, 3, 2, INK);                 // 尾巴
    if (up) { px(-2, -5, 5, 4, INK); px(-1, -4, 3, 3, '#b48a68'); }
    else { px(-2, 2, 5, 4, INK); px(-1, 2, 3, 3, '#b48a68'); }
  };

  // ================= 根系 =================
  // 根的外形沿用绘本版的算法（每点粗细由管道模型决定、沿法线轻微起伏），但每一层都硬边绘制
  function rootGeom(R) {
    const { pts, st } = R, n = pts.length, cum = cumOf(pts), L = cum[n - 1], d = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let nx = a[1] - b[1], ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const fade = Math.max(0, Math.min(1, cum[i] / 6, (L - cum[i]) / 6));
      const o = st.wig * fade * (Math.sin(cum[i] * st.wf + R.seed) * 0.7 + Math.sin(cum[i] * st.wf * 2.7 + R.seed * 1.7) * 0.3);
      d[i] = [pts[i][0] + nx * o, pts[i][1] + ny * o, nx, ny];
    }
    return d;
  }
  const ONE = 1 / PX; // 1 像素对应的世界长度
  // 根的粗细系数与上下限（世界单位，1 单位 = 2 像素）：末梢 4 像素，最粗 8 像素。
  // 下限够宽，整条根（含末梢、侧根）都画得出描边/本色/背光/高光四层，风格从头到尾一致
  const RW = 0.8, RMIN = 2, RMAX = 4;
  // 死根：原来的颜色褪成灰褐
  const dull = (hex, k) => { const n = parseInt(hex.slice(1), 16), m = 0x6e6258, mix = s => Math.round(((n >> s) & 255) * (1 - k) + ((m >> s) & 255) * k); return '#' + ((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0'); };
  function rootColors(R) {
    let col = G.shade(R.st.col, 26);
    if (R.old) col = G.shade(col, -30);
    if (R.dead) col = dull(col, 0.7);
    return { col, shade: G.shade(col, -42), hi: G.shade(col, 48) };
  }
  const TL = 24, TIP = 3; // 根尖：最后 TL 单位逐渐收窄，末端再往前伸出 TIP 单位的尖
  // 每点粗细：先按管道模型夹在上下限之间，再在末端收尖
  function widths(R) {
    if (R.wp) return R.wp;
    const d = R.d || (R.d = rootGeom(R)), cum = cumOf(d), L = cum[cum.length - 1];
    return (R.wp = R.w.map((v, i) => Math.min(RMAX, Math.max(RMIN, v * RW)) * Math.max(0.25, Math.min(1, Math.pow((L - cum[i]) / TL, 0.75)))));
  }
  // 尖端位置：沿最后一段的方向往前伸
  function rootApex(d, ext) {
    const n = d.length, p = d[n - 1], q = d[Math.max(0, n - 3)];
    const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    return [p[0] + (p[0] - q[0]) / l * ext, p[1] + (p[1] - q[1]) / l * ext];
  }
  // layer：ink 描边 / fill 本色 / shade 背光 / hi 高光
  function rootLayer(g, R, layer) {
    const n = R.pts.length;
    if (n < 2) return;
    const d = R.d || (R.d = rootGeom(R)), w = widths(R), C = rootColors(R);
    let a, b, fill;
    if (layer === 'ink') { a = i => w[i] / 2 + ONE; b = i => -w[i] / 2 - ONE; fill = INK; }
    else if (layer === 'fill') { a = i => w[i] / 2; b = i => -w[i] / 2; fill = C.col; }
    else if (layer === 'shade') { a = i => w[i] / 2; b = i => w[i] / 2 - Math.min(w[i] * 0.6, Math.max(ONE, w[i] * 0.28)); fill = C.shade; }
    else { a = i => w[i] * PX >= 3 ? -w[i] * 0.12 : 0; b = i => w[i] * PX >= 3 ? -w[i] * 0.12 - ONE : 0; fill = C.hi; } // 收尖处太窄就不画高光
    g.beginPath();
    for (let i = 0; i < n; i++) { const p = d[i], o = a(i); i ? g.lineTo(p[0] + p[2] * o, p[1] + p[3] * o) : g.moveTo(p[0] + p[2] * o, p[1] + p[3] * o); }
    if (layer === 'ink' || layer === 'fill') { const t = rootApex(d, TIP + (layer === 'ink' ? ONE * 1.5 : 0)); g.lineTo(t[0], t[1]); }
    for (let i = n - 1; i >= 0; i--) { const p = d[i], o = b(i); g.lineTo(p[0] + p[2] * o, p[1] + p[3] * o); }
    g.closePath(); g.fillStyle = fill; g.fill();
  }
  // 根毛与品种特征：直接按像素画（不需要硬边处理）
  function rootDeco(g, R, X, Y) {
    const d = R.d || (R.d = rootGeom(R)), w = widths(R), st = R.st, C = rootColors(R), deco = R.dead ? null : st.deco; // 死根上的根瘤、新芽都没了
    for (let i = 0; i < d.length - 1; i += 1) {
      const [ax, ay, nx, ny] = d[i], wm = w[i];
      const h = hash(R.seed * 5.7 + i * 1.37), h2 = hash(R.seed * 2.3 + i * 3.17);
      if (h < st.hair * 0.25) {
        const sd = h2 < 0.5 ? 1 : -1, l = wm / 2 + 1 + h2 * 2;
        g.fillStyle = '#5c3a26';
        g.fillRect(X(ax + nx * sd * (wm / 2 + 0.6)), Y(ay + ny * sd * (wm / 2 + 0.6)), 1, 1);
        g.fillRect(X(ax + nx * sd * l), Y(ay + ny * sd * l), 1, 1);
      }
      if (deco === 'nodule' && h < 0.1 && wm > 1) {
        const sd = h2 < 0.5 ? 1 : -1, x = X(ax + nx * sd * (wm * 0.5 + 0.7)), y = Y(ay + ny * sd * (wm * 0.5 + 0.7));
        g.fillStyle = INK; g.fillRect(x - 1, y - 1, 4, 4); g.fillStyle = '#f0a040'; g.fillRect(x, y, 2, 2); g.fillStyle = '#ffe0a0'; g.fillRect(x, y, 1, 1);
      } else if (deco === 'node' && i % 5 === 0 && wm > 1.3) {
        g.fillStyle = C.shade; g.fillRect(X(ax), Y(ay), 1, 1); g.fillRect(X(ax + nx * wm * 0.3), Y(ay + ny * wm * 0.3), 1, 1); g.fillRect(X(ax - nx * wm * 0.3), Y(ay - ny * wm * 0.3), 1, 1);
      } else if (deco === 'knot' && h < 0.07 && wm > 2) {
        g.fillStyle = G.shade(C.col, -60); g.fillRect(X(ax) - 1, Y(ay), 3, 1);
      }
    }
  }

  // 本局还在生长的根：每帧分四层硬边绘制
  P.drawLiveRoots = function (c) {
    const shapes = this.rootShapes(), ox = this.ox, oy = this.oy;
    for (const layer of ['ink', 'fill', 'shade', 'hi']) crisp(c, g => { g.setTransform(PX, 0, 0, PX, -ox, -oy); for (const R of shapes) rootLayer(g, R, layer); });
    for (const R of shapes) rootDeco(c, R, x => this.X(x), y => this.Y(y));
  };

  // 老根（分块缓存里的根）的不透明度
  const ROOT_FADE = 0.6;

  // 定型的根写入所在分块的缓存（描边层 ro、填充层 rf 分开，交叠的根不会互相盖住描边）。攒一批再画
  P.bakeRoot = function (R) {
    (this.bakeQ || (this.bakeQ = [])).push(R);
    if (!this.bakePending) { this.bakePending = true; queueMicrotask(() => this.flushBake()); }
  };
  // only：只画进这些分块（局部重画时用）
  P.flushBake = function (only) {
    this.bakePending = false;
    const list = this.bakeQ || [];
    this.bakeQ = [];
    const by = new Map();
    for (const R of list) {
      const d = R.d || (R.d = rootGeom(R));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of d) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const m = 12;
      this.eachChunk(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m, ch => { if (only && !only.has(ch)) return; if (!by.has(ch)) by.set(ch, []); by.get(ch).push(R); });
    }
    for (const [ch, rs] of by) {
      if (!ch.ro) { ch.ro = G.mkCanvas(CP, CP); ch.rf = G.mkCanvas(CP, CP); }
      const ox = ch.cx * CP, oy = ch.cy * CP;
      const ro = ch.ro.getContext('2d'), rf = ch.rf.getContext('2d');
      crisp(ro, g => { g.setTransform(PX, 0, 0, PX, -ox, -oy); for (const R of rs) rootLayer(g, R, 'ink'); }, 0, 0, CP, CP);
      for (const layer of ['fill', 'shade', 'hi']) crisp(rf, g => { g.setTransform(PX, 0, 0, PX, -ox, -oy); for (const R of rs) rootLayer(g, R, layer); }, 0, 0, CP, CP);
      for (const R of rs) rootDeco(rf, R, x => Math.round(x * PX) - ox, y => Math.round(y * PX) - oy);
    }
  };

  // ================= 根尖 =================
  const BANG = G.Px.sprite(['.ooo.', 'orwro', 'orwro', 'orrro', 'orwro', '.ooo.'], { o: INK, r: '#e43b44', w: '#ffffff' });
  P.drawTips = function (c, T) {
    const blink = Math.floor(T * 6) % 2 === 0;
    // 持续效果快结束（剩不到 1 秒）时快速闪烁；倒入中的余韵不算
    const on = v => v > 0 && !(v > CFG.POUR_HOLD && v < 1 && Math.floor(T * 12) % 2), lead = this.leadTip();
    const many = this.aliveTips().length > 1;
    for (const t of this.tips) {
      if (!t.alive) continue;
      const X = this.X(t.x), Y = this.Y(t.y), dx = Math.cos(t.ang), dy = Math.sin(t.ang);
      const r = RMIN * PX / 2; // 与根身末端同宽
      const px = (x, y, s = 1) => c.fillRect(Math.round(x), Math.round(y), s, s);
      // 主根：有分支时根尖两侧各一颗金色亮点，标出药剂操控的是哪条
      if (many && t.main) { c.fillStyle = blink ? '#fee761' : '#feae34'; for (const o of [-1, 1]) px(X - dy * o * (r + 3) - 1, Y + dx * o * (r + 3) - 1, 2); }
      // 防火：橙色圆环护罩，一点亮光绕着转
      if (on(t.fireT)) { G.Px.ring(c, X, Y, r + 4, Math.floor(T * 8) % 2 ? '#feae34' : '#f77622'); c.fillStyle = '#fee761'; px(X + Math.cos(T * 6) * (r + 4) - 0.5, Y + Math.sin(T * 6) * (r + 4) - 0.5, 2); }
      // 穿行：身后拖着渐淡的绿色残影
      if (on(t.pierceT)) ['#63c74d', '#3e8948', '#265c42'].forEach((col, i) => { if ((i + Math.floor(T * 8)) % 3 === 2) return; c.fillStyle = col; const k = r + 3 + i * 3; px(X - dx * k - 1, Y - dy * k - 1, 2); });
      if (t.speedT > 0) { c.fillStyle = '#b8d67c'; for (const o of [-3, 3]) for (let k = 3; k < 8; k++) c.fillRect(Math.round(X - dx * (r + k) - dy * o), Math.round(Y - dy * (r + k) + dx * o), 1, 1); }
      if (t.slowT > 0 && blink) { c.fillStyle = '#d8cfbc'; c.fillRect(X - r - 3, Y - r - 3, 1, 1); c.fillRect(X + r + 2, Y + r + 2, 1, 1); }
      // 避障：前方一道扇形雷达，亮点来回扫
      if (on(t.avoidT)) {
        c.fillStyle = '#8796ad';
        for (let a = -0.6; a <= 0.61; a += 0.3) px(X + Math.cos(t.ang + a) * (r + 9), Y + Math.sin(t.ang + a) * (r + 9));
        const s = t.ang + Math.sin(T * 5) * 0.6; c.fillStyle = '#c0cbdc'; px(X + Math.cos(s) * (r + 9) - 0.5, Y + Math.sin(s) * (r + 9) - 0.5, 2);
      }
      // 寻宝：锁定目标时一串流向目标的光点，否则向外一圈圈探
      if (on(t.seekT)) {
        c.fillStyle = '#4fb79c';
        if (t.seekTgt) {
          const ex = t.seekTgt[0] - t.x, ey = t.seekTgt[1] - t.y, d = Math.hypot(ex, ey) * PX;
          for (let s = r + 3 + (T * 20) % 5; s < Math.min(d, 40); s += 5) px(X + ex / d * PX * s - 0.5, Y + ey / d * PX * s - 0.5, 2);
        } else if (blink) G.Px.ring(c, X, Y, r + 2 + (T * 10) % 8, '#4fb79c');
      }
      // 缓时：主根尖外一圈金色刻度，指针慢慢转
      if (on(this.stallT) && t === lead) {
        c.fillStyle = '#c9a64a';
        for (let i = 0; i < 8; i++) px(X + Math.cos(i * TAU / 8) * (r + 8), Y + Math.sin(i * TAU / 8) * (r + 8));
        c.fillStyle = '#fee761'; for (let k = 3; k <= r + 6; k += 2) px(X + Math.cos(T * 1.5) * k, Y + Math.sin(T * 1.5) * k);
      }
      // 根尖不另画：根身末端自带同色的尖。破障时尖端前面多出一个闪亮的钻头
      if (on(t.breakT)) { c.fillStyle = blink ? '#ffffff' : '#c0cbdc'; for (let k = 0; k <= 5; k++) { const w = k < 2 ? 2 : k < 4 ? 1 : 0; for (let o = -w; o <= w; o++) px(X + dx * (r + k) - dy * o, Y + dy * (r + k) + dx * o); } }
      if (this.running && !t.auto && this.dangerAhead(t) && Math.floor(T * 10) % 2 === 0) c.drawImage(BANG, X - r - 9, Y - r - 10);
      if (this.running && t.armed.length) for (let i = 0; i < 2; i++) { const a = T * 4 + i * Math.PI; c.fillStyle = blink ? '#e43b44' : '#f6757a'; c.fillRect(Math.round(X + Math.cos(a) * (r + 5)), Math.round(Y + Math.sin(a) * (r + 5)), 2, 2); }
    }
  };

  P.dangerAhead = function (t) {
    const dx = Math.cos(t.ang), dy = Math.sin(t.ang);
    for (let d = 4; d <= 24; d += 4) {
      const cell = this.cellAt(t.x + dx * d, t.y + dy * d);
      if (cell && this.blocks(t, cell)) return true;
    }
    return false;
  };

  // ================= 粒子与特效 =================
  P.addFx = function (kind, x, y, o = {}) {
    if (kind === 'ring') this.fx.push({ kind, x, y, t: 0, dur: o.dur || 0.35, r0: o.r0 || 2, r1: o.r1 || 14, col: o.col || '#ffffff' });
    else if (kind === 'stars') for (let i = 0; i < (o.n || 5); i++) { const a = Math.random() * TAU, v = 8 + Math.random() * 18; this.fx.push({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 8, t: 0, dur: 0.5 + Math.random() * 0.4, col: o.col || '#fee761' }); }
    else if (kind === 'debris') for (let i = 0; i < (o.n || 7); i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 20 + Math.random() * 30; this.fx.push({ kind: 'chunk', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, dur: 0.6 + Math.random() * 0.4, col: o.cols ? o.cols[i % o.cols.length] : '#9c8b7a', s: Math.random() < 0.4 ? 3 : 2 }); }
    else if (kind === 'puff') for (let i = 0; i < (o.n || 6); i++) { const a = Math.random() * TAU, v = 4 + Math.random() * 8; this.fx.push({ kind: 'smoke', x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, t: 0, dur: 0.6 + Math.random() * 0.5, col: o.col || '#d8cfbc' }); }
  };
  P.updateFx = function (dt) {
    for (const f of this.fx) {
      f.t += dt;
      if (f.kind === 'chunk') { f.vy += 160 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
      else if (f.kind === 'star') { f.vx *= 1 - 3 * dt; f.vy *= 1 - 3 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
      else if (f.kind === 'smoke') { f.x += ((f.vx || 0) + Math.sin(f.t * 2 + f.y) * 2 + 3) * dt; f.y += ((f.vy || 0) - 6) * dt; }
    }
    this.fx = this.fx.filter(f => f.t < f.dur);
  };
  P.drawParticles = function (c) {
    for (const p of this.particles) {
      if (p.life < 0.12 && Math.floor(p.life * 40) % 2) continue; // 消失前闪烁
      const s = p.size === 2 ? 3 : 2;
      c.fillStyle = p.col; c.fillRect(this.X(p.x) - 1, this.Y(p.y) - 1, s, s);
    }
    for (const f of this.fx) {
      const k = f.t / f.dur, X = this.X(f.x), Y = this.Y(f.y);
      if (f.kind === 'ring') G.Px.ring(c, X, Y, f.r0 + (f.r1 - f.r0) * ease(k), k > 0.6 && Math.floor(f.t * 30) % 2 ? G.shade(f.col, -40) : f.col);
      else if (f.kind === 'star') { if (k < 0.5) sparkle(c, X, Y, f.col); else { c.fillStyle = f.col; c.fillRect(X, Y, 1, 1); } }
      else if (f.kind === 'chunk') { c.fillStyle = INK; c.fillRect(X - 1, Y - 1, f.s + 2, f.s + 2); c.fillStyle = f.col; c.fillRect(X, Y, f.s, f.s); }
      else if (f.kind === 'smoke') { const r = 1 + k * 3; if (k < 0.85 || Math.floor(f.t * 20) % 2) disc(c, X, Y, r, f.col); }
    }
  };

  // ================= 光照 =================
  // 只有一层安静的「越深越暗」，加上少数几种真正会发光的东西各自照出一片光：
  //   根尖——玩家的灯，略朝生长方向前探，缓缓呼吸；熔岩——一圈若有若无、慢慢起伏的暖光。
  // 水、矿、水晶都不发光（它们靠本身的颜色就看得清）。光斑之间取最大值合并，不会叠出一圈圈的等高线。
  // 亮度按距离连续衰减（smoothstep），光源用浮点坐标——根尖挪零点几个单位，亮度也只挪一点点，边缘不会抽动；
  // 不分档、不抖动，一路平滑地暗下去。半明半暗处的阴影微微偏向光源的暖色。
  // 暗层画两遍：土和老根吃满，前景（地块、根、根尖）只吃 FG_DIM，可交互的东西永远看得清
  const LIGHTS = [
    { R: 54, core: 0.3, k: 1, tint: [58, 34, 18] },   // 根尖：琥珀色的灯
    { R: 22, core: 0, k: 0.62, tint: [96, 30, 14] },  // 熔岩：只照到半亮，影子透着红
  ];
  const TINT = 0.3;        // 半影染色的浓度
  // 根尖的灯：朝生长方向前探一点、平滑跟随（转弯时光不跳），新生时点亮、枯死时慢慢熄灭
  P.updateLamps = function (dt) {
    const k = Math.min(1, dt * 6), f = dt / 0.3;
    for (const t of this.tips) {
      const ax = t.x + Math.cos(t.ang) * 4, ay = t.y + Math.sin(t.ang) * 4;
      if (t.lk === undefined) { t.lk = 0; t.lx = ax; t.ly = ay; }
      t.lx += (ax - t.lx) * k; t.ly += (ay - t.ly) * k;
      t.lk = t.alive ? Math.min(1, t.lk + f) : Math.max(0, t.lk - f);
    }
  };
  // (gx, gy)：暗层左上角对应的世界整数坐标。光源坐标都相对它。每项 [x, y, 半径, 亮心半径, 种类, 强度]
  P.gatherLights = function (gx, gy) {
    const out = [], T = this.clock, push = (x, y, kind, rMul, k) => {
      const L = LIGHTS[kind], R = L.R * rMul;
      if (k > 0.01 && x - gx > -R && x - gx < W + 1 + R && y - gy > -R && y - gy < H + 1 + R) out.push([x - gx, y - gy, R, R * L.core, kind, L.k * k]);
    };
    if (this.mode === 'round') this.tips.forEach((t, i) => {
      if (t.lk === undefined) return;
      const e = ease(t.lk); // 点亮时半径从小撑开，熄灭时缩回去
      push(t.lx, t.ly, 0, (0.55 + 0.45 * e) * (1 + 0.025 * Math.sin(T * 2.4 + i * 1.9)), e);
    });
    const c0 = Math.floor((gx - 24) / TILE), c1 = Math.floor((gx + W + 24) / TILE);
    const r0 = Math.max(0, Math.floor((gy - 24) / TILE)), r1 = Math.floor((gy + H + 24) / TILE);
    for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) {
      const cell = this.tileAt(col, r);
      if (!cell) continue;
      // 熔岩成片：隔一格放一盏，各自错开相位慢慢起伏，合并后是一圈缓缓流动的暖光
      else if (isFire(cell) && (col + r) % 2 === 0) {
        const ph = col * 1.7 + r * 2.9, w = Math.sin(T * 1.3 + ph) * 0.6 + Math.sin(T * 0.7 + ph * 0.5) * 0.4;
        push(col * TILE + 4, r * TILE + 4, 1, 1 + 0.06 * w, 1 + 0.1 * w);
      }
    }
    return out;
  };
  // 生成本帧的暗层。每个格子是一个世界单位，左上角取镜头所在的整数世界坐标——
  // 格子钉在世界上，镜头怎么平移暗层都跟着地面走，不会在格子之间抖动。地表附近完全不暗时返回 false
  P.buildLighting = function (cx, cy) {
    if (cy + H < 6) return false;
    const gx = this.lgx = Math.floor(cx), gy = this.lgy = Math.floor(cy), LW = W + 1, LH = H + 1;
    const lights = this.gatherLights(gx, gy);
    if (!this.lightLv) { this.lightLv = new Float32Array(LW * LH); this.lightKd = new Uint8Array(LW * LH); }
    const lv = this.lightLv, kd = this.lightKd;
    // 光照强度：每片光只扫自己的包围盒，取最大值并记下是谁照亮的（用来给半影染色）
    if (lights.length) {
      lv.fill(0);
      for (const [x, y, R, c, kind, k] of lights) {
        const i0 = Math.max(0, Math.floor(x - R)), i1 = Math.min(LW - 1, Math.ceil(x + R));
        const j0 = Math.max(0, Math.floor(y - R)), j1 = Math.min(LH - 1, Math.ceil(y + R)), R2 = R * R;
        for (let j = j0; j <= j1; j++) {
          const dy = j + 0.5 - y, row = j * LW;
          for (let i = i0; i <= i1; i++) {
            const dx = i + 0.5 - x, d2 = dx * dx + dy * dy;
            if (d2 >= R2) continue;
            const d = Math.sqrt(d2), s = d <= c ? 0 : (d - c) / (R - c), v = k * (1 - s) * (1 - s) * (1 + 2 * s);
            if (v > lv[row + i]) { lv[row + i] = v; kd[row + i] = kind; }
          }
        }
      }
    }
    const out = new Uint32Array(this.lightImg.data.buffer);
    for (let j = 0; j < LH; j++) {
      const wy = gy + j + 0.5, amb = wy < 4 ? 0 : Math.min(MAXD, (wy - 4) / 150 * MAXD);
      const a0 = Math.round(amb * 255), row = j * LW;
      const dark = ((a0 << 24) | (24 << 16) | (10 << 8) | 16) >>> 0; // rgb(16,10,24)
      if (!lights.length || !a0) { out.fill(a0 ? dark : 0, row, row + LW); continue; }
      for (let i = 0; i < LW; i++) {
        const L = lv[row + i];
        if (L <= 0) { out[row + i] = dark; continue; }
        const q = Math.min(1, L);
        if (q >= 1) { out[row + i] = 0; continue; }
        const tc = LIGHTS[kd[row + i]].tint, w = q * (1 - q) * 4 * TINT;
        const r = 16 + (tc[0] - 16) * w, g = 10 + (tc[1] - 10) * w, b = 24 + (tc[2] - 24) * w;
        out[row + i] = ((Math.round(amb * (1 - q) * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0;
      }
    }
    this.lightCv.getContext('2d').putImageData(this.lightImg, 0, 0);
    return true;
  };

  // ================= 屏幕空间 =================
  // 矿物从挖到的位置沿弧线飞向左上角的收获栏
  P.drawOreFlights = function (c) {
    const s = this.show;
    for (const o of s.ores) {
      const p = (s.t - o.at) / SHOW.ORE_FLY;
      if (p < 0 || p >= 1) continue;
      const x0 = clamp(this.X(o.x), 12, VW - 12), y0 = clamp(this.Y(o.y), 12, VH - 12), e = ease(p);
      const x = x0 + (16 - x0) * e, y = y0 + (18 - y0) * e - Math.sin(p * Math.PI) * 50;
      c.drawImage(G.iconCanvas(o.id), Math.round(x) - 10, Math.round(y) - 10);
    }
  };
  // 屏幕外的根尖在边缘显示指向它的小标记
  P.drawOffscreen = function (c, T) {
    const m = 8;
    for (const t of this.tips) {
      if (!t.alive) continue;
      const x = this.X(t.x), y = this.Y(t.y);
      if (x >= 0 && x < VW && y >= 0 && y < VH) continue;
      const ex = clamp(x, m, VW - m), ey = clamp(y, m, VH - m), a = Math.atan2(y - ey, x - ex);
      disc(c, ex, ey, 5, INK); disc(c, ex, ey, 4, '#ead4aa');
      c.fillStyle = INK;
      for (let k = 6; k <= 9; k++) c.fillRect(Math.round(ex + Math.cos(a) * k) - (k < 8 ? 1 : 0), Math.round(ey + Math.sin(a) * k) - (k < 8 ? 1 : 0), k < 8 ? 3 : 1, k < 8 ? 3 : 1);
    }
  };

  // ================= 给逻辑事件加上像素特效 =================
  const wrap = (name, after) => { const f = P[name]; P[name] = function (...a) { const r = f.apply(this, a); after.call(this, r, ...a); return r; }; };
  wrap('collect', function (_, t, cell, col, row) {
    const x = col * TILE + 4, y = row * TILE + 4, col_ = cell.id === 'water' ? '#a8d8ea' : G.MAT_COLOR[cell.id] || '#fee761';
    this.addFx('ring', x, y, { col: col_, r1: 16 });
    this.addFx('stars', x, y, { col: cell.id === 'water' ? '#ffffff' : '#fee761', n: 5 });
  });
  wrap('obstacle', function (ok, t, cell, col, row) {
    const x = col * TILE + 4, y = row * TILE + 4;
    // 破障碎岩：白色冲击环 + 火星，轻震一下；和硬撞（红环、扣时间）一眼分开
    if (cell.type === 'rock') {
      this.addFx('debris', x, y, { cols: ['#9c8b7a', '#cdbfae', '#6e5f55'], n: ok ? 9 : 10 });
      this.addFx('ring', x, y, { col: ok ? '#ffffff' : '#e43b44', r1: ok ? 14 : 20 });
      if (ok) { this.addFx('stars', x, y, { col: '#ffffff', n: 4 }); this.shake = Math.max(this.shake, 0.12); }
      else { this.hitStop = 0.07; this.shake = Math.max(this.shake, 0.35); }
    } else if (cell.type === 'bedrock') {
      this.addFx('debris', x, y, { cols: ['#3a3542', '#6a6474', '#24202a'], n: ok ? 12 : 4 });
      this.addFx('ring', x, y, { col: ok ? '#ffffff' : '#e43b44', r1: ok ? 18 : 20 });
      if (ok) { this.addFx('ring', x, y, { col: '#c0cbdc', r1: 28, dur: 0.5 }); this.addFx('stars', x, y, { col: '#ffffff', n: 6 }); this.hitStop = 0.05; this.shake = Math.max(this.shake, 0.25); }
      else this.hitStop = 0.07;
    } else if (cell.type === 'fire') {
      // 防火过熔岩：护罩把热挡开，冒蒸汽、溅火星
      if (ok) { this.addFx('puff', t.x, t.y, { col: '#e8e0d8', n: 4 }); this.addFx('stars', t.x, t.y, { col: '#feae34', n: 3 }); }
      else this.addFx('puff', t.x, t.y, { col: '#5a4a4a', n: 8 });
    }
  });
  // 生效瞬间放一圈药剂色的环。转向、加速、分枝这类一眼就看得出的动作不放
  const FX_ACTS = new Set(['slow', 'break', 'fire', 'pierce', 'avoid', 'seek', 'stall']);
  P.actRing = function (t, a) {
    this.addFx('ring', t.x, t.y, { col: G.ACTIONS[a].color, r1: 18 });
    this.addFx('stars', t.x, t.y, { col: '#ffffff', n: 2 });
  };
  // 倒入 / 回响开始时：根群共享的效果只在主根尖放一圈
  P.insRing = function (ins) {
    if (!FX_ACTS.has(ins.action)) return;
    const ts = G.GROUP_ACTS.has(ins.action) ? [this.leadTip()].filter(Boolean) : this.aliveTips();
    for (const t of ts) this.actRing(t, ins.action);
  };
  wrap('applyAction', function (_, t, a) { if (t.alive && FX_ACTS.has(a)) this.actRing(t, a); });
  wrap('pourStart', function (_, potion) { for (const ins of potion.instructions) if (!(ins.delay > 0)) this.insRing(ins); });
  wrap('echoStart', function (_, sg) { this.insRing(sg.ins); });
  wrap('branch', function (_, t) { this.addFx('ring', t.x, t.y, { col: '#fee761', r1: 10, dur: 0.3 }); });
  wrap('newRound', function () { this.addFx('ring', this.spawnX, 0, { col: '#f0cf8e', r1: 22, dur: 0.5 }); this.addFx('debris', this.spawnX, 0, { cols: ['#e4a672', '#f0cf8e', '#b8875a'], n: 10 }); });
  wrap('end', function () { const m = this.leadTip() || this.tips[0]; if (m) this.addFx('ring', m.x, m.y, { col: '#fee761', r1: 30, dur: 0.6 }); });
  const upd = P.update;
  P.update = function (dt) {
    this.updateFx(dt);
    this.updateLamps(dt);
    if (this.hitStop > 0) { this.hitStop -= dt; this.clock += dt; return; } // 撞石时顿一下
    upd.call(this, dt);
    // 收获动画：果实冒出时加一圈闪光
    if (this.show && this.treeObj && this._shownFx !== this.shown) {
      for (let i = this._shownFx || 0; i < this.shown; i++) {
        const f = this.treeObj.fruits[i];
        if (!f) continue;
        const [x, y] = TR.fruitPos(f, this.show.t);
        this.addFx('stars', this.spawnX + x * TS, y * TS, { col: '#ffffff', n: 3 });
      }
      this._shownFx = this.shown;
    }
    if (!this.show) this._shownFx = 0;
  };
})();
