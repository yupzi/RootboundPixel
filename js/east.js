// 营地岩洞：坑底右崖崖顶的洞口走进来的一个小房间（一屏大小，镜头不动），和炼药的洞穴一样走、跳（上面的东西见 camp.js）
// 底图来自 js/camp_art.js（tools/build_camp.py 把 AI 生成的原图缩成像素图）：洞口在左边（外面就是坑底），洞顶偏右有个天窗漏下一束光
// 光照和 cave.js 一样：每个像素一个亮度（LMAP，由底图的明暗模糊一下当环境光，再叠上天窗的光柱和篝火的光），
// 道具压暗后烤进背景（搭了新东西就重烤），小禾和扬起的沙每帧画在单独一层上压暗后再贴上去，所以走到洞口、光柱下、火边会被照亮
// 世界坐标：地面 y = 0，x 从 0（洞口）到洞底
(function () {
  const { PX, W } = G.GEO;
  const { bayer } = G.Px;
  const { hash, clamp01 } = G.U;
  const ART = G.CAMP_ART;
  const VW = 480, VH = 270;
  const FLOOR = ART.floor;           // 地面在屏幕上的行（底图已经对齐到这一行）
  const DK = [12, 8, 10];            // 最暗处的颜色
  const END = 428;                   // 洞底岩壁在屏幕上的列（再往右走不过去）
  // 天窗漏下来的光柱：中线从天窗（284, 60）斜着落到地上（208, 190），宽 BEAM_W
  const SKY = [284, 60], LAND = [208, FLOOR], BEAM_W = 26;
  const beamX = y => SKY[0] + (LAND[0] - SKY[0]) * (y - SKY[1]) / (LAND[1] - SKY[1]);
  const beamAt = (x, y) => y < SKY[1] || y > FLOOR + 1 ? 0 : clamp01(1 - Math.abs(x - beamX(y)) / (BEAM_W / 2));
  const img = new Image();
  img.src = ART.bg;
  let bgCv = null, LMAP = null, sig = '';
  const objCv = G.mkCanvas(VW, VH), oc = objCv.getContext('2d', { willReadFrequently: true });

  // ---------- 亮度图：底图的亮度模糊一下当作环境光，叠上光柱，生了火再叠上火光 ----------
  function buildLight() {
    const cv = G.mkCanvas(VW, VH), c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, VW, VH).data, lum = new Float32Array(VW * VH);
    for (let i = 0; i < VW * VH; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15) / 255;
    const blur = (src, r) => { // 横竖两遍盒式模糊
      const tmp = new Float32Array(VW * VH), out = new Float32Array(VW * VH);
      for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < VW) { s += src[y * VW + xx]; n++; } } tmp[y * VW + x] = s / n; }
      for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < VH) { s += tmp[yy * VW + x]; n++; } } out[y * VW + x] = s / n; }
      return out;
    };
    const amb = blur(lum, 10), fire = G.Camp.fireAt();
    LMAP = new Float32Array(VW * VH);
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const pool = fire ? Math.max(0, 1 - Math.hypot((x - fire[0]) / 80, (y - FLOOR - fire[1]) / 46)) * 1.1 : 0;
      const v = Math.min(1, Math.max(0.22 + amb[y * VW + x] * 1.5, beamAt(x, y) * 0.85, pool));
      LMAP[y * VW + x] = Math.min(1, Math.floor(v * 9 + bayer(x, y) * 0.999) / 9);
    }
  }
  // 按亮度图压暗一块像素（只处理不透明的）；x0 / y0 是这块在屏幕上的左上角，w 是它的宽
  function lightUp(d, x0, y0, w) {
    for (let i = 0, n = d.length / 4; i < n; i++) {
      if (!d[i * 4 + 3]) continue;
      const x = x0 + (i % w), y = y0 + Math.floor(i / w), Lv = x >= 0 && x < VW && y >= 0 && y < VH ? LMAP[y * VW + x] : 0.2;
      for (let k = 0; k < 3; k++) d[i * 4 + k] = DK[k] + (d[i * 4 + k] - DK[k]) * Lv;
    }
  }
  const lv = (x, y) => (x >= 0 && x < VW && y >= 0 && y < VH ? LMAP[(y | 0) * VW + (x | 0)] : 0.2);
  // 小东西（小鸟）的颜色按那一点的亮度压暗
  function dim(col, x, y) {
    const [r, g, b] = G.U.hex(col), L = lv(x, y);
    return `rgb(${Math.round(DK[0] + (r - DK[0]) * L)},${Math.round(DK[1] + (g - DK[1]) * L)},${Math.round(DK[2] + (b - DK[2]) * L)})`;
  }
  // ---------- 烤背景：底图 + 压暗过的道具。搭了新东西（Camp.sig 变了）就重来 ----------
  function build() {
    buildLight();
    const cv = G.mkCanvas(VW, VH), c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    const lay = G.mkCanvas(VW, VH), lc = lay.getContext('2d', { willReadFrequently: true });
    G.Camp.drawProps(lc, FLOOR);
    const li = lc.getImageData(0, 0, VW, VH);
    lightUp(li.data, 0, 0, VW);
    lc.putImageData(li, 0, 0);
    c.drawImage(lay, 0, 0);
    bgCv = cv;
  }

  // 光柱里慢慢飘的灰尘
  function drawMotes(c, T) {
    for (let i = 0; i < 26; i++) {
      const y = SKY[1] + 10 + ((hash(i * 5.3) * (FLOOR - SKY[1] - 14) + T * (2 + hash(i) * 3)) % (FLOOR - SKY[1] - 14));
      const x = beamX(y) + (hash(i * 3.1) - 0.5) * BEAM_W * 0.8 + Math.sin(T * 0.4 + i * 1.7) * 3;
      c.fillStyle = hash(i * 2.2) < 0.5 ? 'rgba(255,246,220,0.8)' : 'rgba(255,236,196,0.45)';
      c.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  G.East = {
    particles: [],
    ox: 0, oy: -FLOOR, // 世界 → 屏幕：X = x·PX − ox，Y = y·PX − oy（界面定位标签用）
    // 只有地面；左边走出洞口回到坑底右崖崖顶的洞口里，右边到洞底为止
    geo() { return { plats: [], climbs: [], x0: 0, x1: END / PX }; },
    atExit(hero) { return hero.x < 2; },
    entry: 10,                      // 从洞口走进来时站的位置（洞口里边一点）
    snap() {},
    toWorld(lx, ly) { return [lx / (PX * 2), (ly / 2 - FLOOR) / PX]; },
    update(dt) {
      for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; p.life -= dt; }
      this.particles = this.particles.filter(p => p.life > 0);
      G.Camp.update(dt);
    },
    render(c, dt, T, hero) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      if (!img.complete || !img.naturalWidth || !G.Camp.ready()) { c.fillStyle = '#0c080a'; c.fillRect(0, 0, VW, VH); return; }
      if (G.Camp.sig() !== sig || !bgCv) { sig = G.Camp.sig(); build(); }
      c.drawImage(bgCv, 0, 0);
      G.Camp.draw(c, T, FLOOR, dim);
      // 小禾、脚下扬起的沙画在单独一层，按亮度图压暗后再贴上来（只处理她所在的那块）
      const hx = Math.round(hero.x * PX), hy = FLOOR + Math.round(hero.y * PX);
      const x0 = Math.max(0, hx - 30), x1 = Math.min(VW, hx + 30), y0 = Math.max(0, hy - 40), y1 = Math.min(VH, hy + 4);
      oc.clearRect(x0, y0, x1 - x0, y1 - y0);
      hero.draw(oc, hx, hy, T, FLOOR);
      for (const p of this.particles) { oc.fillStyle = p.col; oc.fillRect(Math.round(p.x * PX), FLOOR + Math.round(p.y * PX), p.size, p.size); }
      const id = oc.getImageData(x0, y0, x1 - x0, y1 - y0);
      lightUp(id.data, x0, y0, x1 - x0);
      oc.putImageData(id, x0, y0);
      c.drawImage(objCv, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      // 搭东西时冒的金星离小禾远，单独画（自己发光，不压暗）
      for (const p of this.particles) { const px = Math.round(p.x * PX), py = FLOOR + Math.round(p.y * PX); if (px < x0 || px >= x1 || py < y0 || py >= y1) { c.fillStyle = p.col; c.fillRect(px, py, p.size, p.size); } }
      G.Camp.drawFront(c, T, FLOOR);
      drawMotes(c, T);
    },
  };
})();
