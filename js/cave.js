// 隐藏洞穴：坑底左侧崖壁里的一个小房间（一屏大小，镜头不动），和坑底一样走、跳（同一套 Hero 物理，只是没有平台和树）
// 美术来自 js/cave_art.js（tools/build_cave.py 把 AI 生成的原图缩成像素图）：洞穴底图、枯树、炼药锅
// 没人住过，也没有火：右边洞口斜照进来一道光，落在锅上；锅左边的暗处有一棵朝着光伸过去的枯树（光照不到，所以枯死了）。光照：每个像素一个亮度（LMAP，由底图的明暗 + 光束算出），
// 小禾和锅每帧画在单独一层上，按这张亮度图压暗后再贴上去，所以走进光里会被照亮。世界坐标：地面 y = 0，x 从 0（洞底）到 CAVE.W
(function () {
  const { PX } = G.GEO;
  const { W: CW, POT } = G.CAVE;
  const { ring, bayer } = G.Px;
  const { hash, clamp01 } = G.U;
  const A = G.CAVE_ART;
  const VW = 480, VH = 270, INK = '#3e2731';
  const FLOOR = 190;                 // 地面在屏幕上的行（底图已经对齐到这一行）
  const MX0 = 434, MOUTH_Y = 114;    // 光从洞口哪里进来：左沿 x、顶的高度（像素）
  const POT_X = POT * PX;            // 锅中心（像素）
  const POT_R = 18;                  // 站在锅边炼药时离锅中心多远（世界单位）
  const DK = [10, 9, 13];            // 最暗处的颜色
  const st = { t: 0, bubbles: [], sparks: [], boom: 0, mix: [] };
  const img = {};
  let ready = 0, bgCv = null, LMAP = null;
  const load = (k, src) => { const im = new Image(); im.onload = () => ready++; im.src = src; img[k] = im; };
  load('bg', A.bg); load('tree', A.tree); load('pot', A.pot); load('potMask', A.potMask);
  const NIMG = 4;
  const [PW, PH] = A.size.pot, POT_Y = FLOOR - PH + 1; // 锅图左上角的行
  const objCv = G.mkCanvas(VW, VH), oc = objCv.getContext('2d', { willReadFrequently: true });
  const tintCv = G.mkCanvas(PW, PH), tc = tintCv.getContext('2d');

  // ---------- 光：整个洞口都透光。平行的斜光，上沿从洞口顶斜下来、在锅左边落地，下沿就是地面 ----------
  // 所以被照到的是上沿以下的一整片（从洞口一直铺到锅那边），越靠近洞口越亮，上沿有一窄条柔和过渡
  const LAND = POT_X - 60;          // 上沿落地的 x
  const yU = x => MOUTH_Y + (MX0 - x) / (MX0 - LAND) * (FLOOR - MOUTH_Y);
  function beamAt(x, y) {
    if (x > MX0 || x < LAND) return 0;
    const a = yU(x);
    if (y < a || y > FLOOR + 1) return 0;
    return clamp01((y - a) / 10) * (0.45 + 0.55 * clamp01((x - LAND) / (MX0 - LAND)));
  }
  const poolAt = (x, y) => Math.max(0, 1 - Math.hypot((x - POT_X - 3) / 50, (y - FLOOR + 6) / 22));

  // ---------- 合成静态背景：底图 + 光束（叠加暖光）+ 枯树（按亮度压暗）；同时算出亮度图 ----------
  function build() {
    const cv = G.mkCanvas(VW, VH), c = cv.getContext('2d');
    c.drawImage(img.bg, 0, 0);
    // 亮度图：底图的亮度模糊一下当作环境光，再叠上光束和锅边的光斑
    const d = c.getImageData(0, 0, VW, VH).data, lum = new Float32Array(VW * VH);
    for (let i = 0; i < VW * VH; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15) / 255;
    const blur = (src, r) => { // 横竖两遍盒式模糊
      const tmp = new Float32Array(VW * VH), out = new Float32Array(VW * VH);
      for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < VW) { s += src[y * VW + xx]; n++; } } tmp[y * VW + x] = s / n; }
      for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < VH) { s += tmp[yy * VW + x]; n++; } } out[y * VW + x] = s / n; }
      return out;
    };
    const amb = blur(lum, 10);
    LMAP = new Float32Array(VW * VH);
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const v = Math.min(1, Math.max(0.2 + amb[y * VW + x] * 1.6, beamAt(x, y) * 0.95, poolAt(x, y)));
      LMAP[y * VW + x] = Math.min(1, Math.floor(v * 9 + bayer(x, y) * 0.999) / 9);
    }
    // 光束本身：在底图上叠一层暖光（越靠近洞口越亮），落地处一圈光斑
    const lit = c.getImageData(0, 0, VW, VH), ld = lit.data;
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      // 本来就亮的地方（洞口外的天光）少叠甚至不叠，免得洞口一半被光束提亮、一半没有
      const i = (y * VW + x) * 4, l = lum[y * VW + x];
      // 洞口外的天光：整片统一提亮成暖白
      if (l > 0.5 && x > MX0 - 60) { const k = Math.min(1, (l - 0.5) / 0.3) * 0.75; ld[i] += (255 - ld[i]) * k; ld[i + 1] += (246 - ld[i + 1]) * k; ld[i + 2] += (214 - ld[i + 2]) * k; continue; }
      const b = (beamAt(x, y) * 0.28 + poolAt(x, y) * (y >= FLOOR - 1 && y <= FLOOR + 3 ? 0.5 : 0.12)) * Math.max(0, 1 - l * 1.4);
      if (b <= 0) continue;
      ld[i] = Math.min(255, ld[i] + 255 * b); ld[i + 1] = Math.min(255, ld[i + 1] + 222 * b); ld[i + 2] = Math.min(255, ld[i + 2] + 170 * b);
    }
    c.putImageData(lit, 0, 0);
    // 枯树：在锅左边的暗处，枝梢刚伸到光的边上；先画在单独一层上压暗，再贴到背景
    const lay = G.mkCanvas(VW, VH), lc = lay.getContext('2d');
    const [TW, TH] = A.size.tree;
    lc.drawImage(img.tree, LAND - TW + 8, FLOOR - TH + 2);
    const li = lc.getImageData(0, 0, VW, VH);
    lightUp(li.data, 0, 0, VW);
    lc.putImageData(li, 0, 0);
    c.drawImage(lay, 0, 0);
    bgCv = cv;
  }
  // 按亮度图压暗一块像素（只处理不透明的）；x0 / y0 是这块在屏幕上的左上角，w 是它的宽
  function lightUp(d, x0, y0, w) {
    for (let i = 0, n = d.length / 4; i < n; i++) {
      if (!d[i * 4 + 3]) continue;
      const x = x0 + (i % w), y = y0 + Math.floor(i / w), Lv = x >= 0 && x < VW && y >= 0 && y < VH ? LMAP[y * VW + x] : 0.2;
      for (let k = 0; k < 3; k++) d[i * 4 + k] = DK[k] + (d[i * 4 + k] - DK[k]) * Lv;
    }
  }

  // ---------- 炼药锅：液面按放进去的材料换色，放了材料会慢慢冒泡 ----------
  function drawPot(c, dt) {
    const x = POT_X - (PW >> 1);
    c.drawImage(img.pot, x, POT_Y);
    // 液面：没放材料时是青绿色，放了材料就轮流显示材料的颜色
    const col = st.mix.length ? st.mix[Math.floor(st.t * 1.5) % st.mix.length] : '#4fb88a';
    tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, PW, PH); tc.drawImage(img.potMask, 0, 0);
    tc.globalCompositeOperation = 'source-in'; tc.fillStyle = col; tc.fillRect(0, 0, PW, PH);
    c.drawImage(tintCv, x, POT_Y);
    if (st.mix.length && Math.random() < 0.08) st.bubbles.push({ x: POT_X - 8 + Math.random() * 16, y: POT_Y + 1, life: 1, col });
    for (const b of st.bubbles) { b.y -= dt * 6; b.life -= dt * 1.2; if (b.life > 0.15) { c.fillStyle = G.shade(b.col, 50); c.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); } }
    st.bubbles = st.bubbles.filter(b => b.life > 0);
  }
  // ---------- 前人留下的东西（G.state.kit）：躺在地上，隔一会儿闪一下 ----------
  const kitCv = {};
  function kitSprite(id) {
    if (kitCv[id]) return kitCv[id];
    let cv;
    if (id === 'book') {
      // 合着的旧笔记本：深红封皮、露出一条书页边
      cv = G.mkCanvas(12, 5); const c = cv.getContext('2d');
      c.fillStyle = INK; c.fillRect(0, 0, 12, 5);
      c.fillStyle = '#8a3a3a'; c.fillRect(1, 1, 10, 2);
      c.fillStyle = '#b55945'; c.fillRect(1, 1, 9, 1);
      c.fillStyle = '#f0e2c0'; c.fillRect(1, 3, 10, 1);
      c.fillStyle = '#c8a878'; c.fillRect(10, 3, 1, 1);
    } else {
      const src = id === 'seed' ? G.seedPixel('camelThorn', 20) : G.bottlePixel(G.Alc.brew([id]));
      const w = id === 'seed' ? 10 : 9, h = id === 'seed' ? 10 : 12;
      cv = G.mkCanvas(w, h); const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(src, 0, 0, w, h);
    }
    return (kitCv[id] = cv);
  }
  function drawKit(c, T) {
    for (const [i, k] of G.state.kit.entries()) {
      const sp = kitSprite(k.id), x = Math.round(k.x * PX - sp.width / 2), y = FLOOR - sp.height + 1;
      c.fillStyle = 'rgba(30,18,22,0.4)'; c.fillRect(x, FLOOR + 1, sp.width, 1);
      c.drawImage(sp, x, y);
      // 闪光：每样东西错开时间，十字星闪两下
      const ph = (T * 0.7 + i * 0.37) % 1.6;
      if (ph < 0.25) {
        const sx = x + sp.width - 2, sy = y - 1, r = ph < 0.12 ? 1 : 2;
        c.fillStyle = '#fff6d8';
        c.fillRect(sx, sy, 1, 1); c.fillRect(sx - r, sy, r * 2 + 1, 1); c.fillRect(sx, sy - r, 1, r * 2 + 1);
      }
    }
  }

  // 光束里慢慢飘的灰尘
  function drawMotes(c, T) {
    const span = MX0 - LAND - 20;
    for (let i = 0; i < 30; i++) {
      const x = LAND + 20 + ((hash(i * 5.3) * span + T * (2 + hash(i) * 3)) % span);
      const a = yU(x) + 4, b = FLOOR - 2;
      if (a >= b) continue;
      const y = a + (b - a) * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(T * 0.4 + i * 1.7)));
      c.fillStyle = hash(i * 2.2) < 0.5 ? 'rgba(255,246,220,0.85)' : 'rgba(255,236,196,0.5)';
      c.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  G.Cave = {
    particles: [],
    ox: 0, oy: -FLOOR, // 世界 → 屏幕：X = x·PX − ox，Y = y·PX − oy（界面定位标签用）
    setMix(cols) { st.mix = cols || []; },
    boom(colors) {
      st.boom = 1;
      for (let i = 0; i < 30; i++) st.sparks.push({ x: POT_X, y: POT_Y + 4, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 80, life: 0.5 + Math.random() * 0.5, col: colors[i % colors.length] });
    },
    // 捡起地上的东西：一圈亮点往上蹦
    pickFx(x) {
      for (let i = 0; i < 12; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 4, y: -2, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.4 + Math.random() * 0.3, col: i % 3 ? '#fee761' : '#fff6d8', size: 1 });
    },
    // 只有地面；左边走到洞底，右边走进洞口就回到坑底
    geo() { return { plats: [], climbs: [], x0: 10, x1: CW - 14 }; },
    atExit(hero) { return hero.x > CW - 18; },
    entry: CW - 40,                 // 从坑底进来时站的位置（洞口里边一点）
    nearPot(hero) { return hero.onGround && Math.abs(hero.x - POT) < POT_R + 8; },
    onPot(wx, wy) { return Math.abs(wx - POT) < PW / 2 / PX + 2 && wy > -(PH + 6) / PX && wy < 2; },
    // 炼药时站到锅的哪一边
    potSpot(hero) { return POT + (hero.x < POT ? -POT_R : POT_R); },
    pot: POT,
    snap() {},                      // 一屏大小，镜头不动
    toWorld(lx, ly) { return [lx / (PX * 2), (ly / 2 - FLOOR) / PX]; },
    update(dt) {
      for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; p.life -= dt; }
      this.particles = this.particles.filter(p => p.life > 0);
    },
    render(c, dt, T, hero) {
      st.t += dt;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      if (ready < NIMG) { c.fillStyle = '#0a090d'; c.fillRect(0, 0, VW, VH); return; }
      if (!bgCv) build();
      c.drawImage(bgCv, 0, 0);
      drawKit(c, T);
      // 锅、小禾、脚下扬起的沙画在单独一层，按亮度图压暗后再贴上来（只处理它们所在的那块）
      const hx = Math.round(hero.x * PX), hy = FLOOR + Math.round(hero.y * PX);
      const x0 = Math.max(0, Math.min(POT_X - PW, hx - 24)), x1 = Math.min(VW, Math.max(POT_X + PW, hx + 24));
      const y0 = Math.max(0, Math.min(POT_Y - 14, hy - 36)), y1 = Math.min(VH, Math.max(FLOOR + 3, hy + 4));
      oc.clearRect(x0, y0, x1 - x0, y1 - y0);
      drawPot(oc, dt);
      if (!this.hideHero) hero.draw(oc, hx, hy, T, FLOOR); // 炼金工坊打开时大锅挡在前面，不画小禾
      for (const p of this.particles) { oc.fillStyle = p.col; oc.fillRect(Math.round(p.x * PX), FLOOR + Math.round(p.y * PX), p.size, p.size); }
      const id = oc.getImageData(x0, y0, x1 - x0, y1 - y0);
      lightUp(id.data, x0, y0, x1 - x0);
      oc.putImageData(id, x0, y0);
      c.drawImage(objCv, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      drawMotes(c, T);
      // 炼成时的火花与光圈（自己发光，不压暗）
      for (const s of st.sparks) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; s.vy += 160 * dt;
        c.fillStyle = INK; c.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 3, 3);
        c.fillStyle = s.col; c.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      st.sparks = st.sparks.filter(s => s.life > 0);
      if (st.boom > 0) { st.boom -= dt * 1.8; ring(c, POT_X, POT_Y + 4, (1 - st.boom) * 40, '#fee761'); }
    },
  };
})();
