// 树的像素画法。几何（枝条、叶团、果实位置）来自 tree.js，这里只管长什么样
// 流程：分三层画矢量（树皮 / 叶子 / 果实与花）→ 每层只在自己的色阶里收色 → 像素后处理：
//   清理孤立像素、光从左上来（边缘提亮 / 压暗、树冠下的树干压暗、叶团压在枝干上的深色分界）、
//   在地面那一行裁掉（根扎进土里）、同色系描边（受光的上 / 左边用本色最深一档，背光的下 / 右边用深色）
// 每个物种的画法见 ART；没有专门画法的植物用 PLAIN（沿用原来的叶团造型）
(function () {
  const { lerp, clamp, clamp01, eOutBack, hex, hash3 } = G.U;
  const { nearest } = G.Px;
  const TR = G.Tree, TAU = Math.PI * 2, shade = G.shade;
  const K = TR.TS * G.GEO.PX;

  // 一层的调色板：几条色阶（暗→亮）。step 沿色阶升降一档，darkest 取本色阶最深一档
  function LayerPal(ramps) {
    const cols = [], ri = [], ii = [], off = [];
    ramps.forEach((r, a) => { off.push(cols.length); r.forEach((h, b) => { cols.push(hex(h)); ri.push(a); ii.push(b); }); });
    const memo = new Map();
    return {
      cols, ri, ii, off, ramps,
      // 最近色，按颜色缓存（叶团小图里的颜色大多重复）
      near: (r, g, b) => { const k = (r << 16) | (g << 8) | b; let i = memo.get(k); if (i === undefined) { if (memo.size > 50000) memo.clear(); memo.set(k, i = nearest(r, g, b, cols)); } return i; },
      step: (ci, d) => off[ri[ci]] + clamp(ii[ci] + d, 0, ramps[ri[ci]].length - 1),
      darkest: ci => off[ri[ci]],
      lightest: ci => off[ri[ci]] + ramps[ri[ci]].length - 1,
    };
  }
  const STEM = ['#2c4429', '#5a7a36', '#7fb052'];
  const matRamp = col => [shade(col, -62), col, shade(col, 48)];

  function seg(g, a, b, w, col) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  function ell(c, x, y, rx, ry, rot, col) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); c.fill(); }

  // ================= 各物种的画法 =================
  // bark 树皮色阶，tex 树皮纹理（lines / furrow / burl / twist / lenticel），leaf 叶色阶
  // canopy 叶团质感：blob 圆盘叠加 / speckle 碎叶点 / needle 窄叶 / spray 披针叶向外散 / dome 圆顶 + 鼓起的边 / wisp 下垂的羽状细丝
  // flowers 叶团上的花（画在果实层），base 专门的根部，particles 飘落物，flicker 叶子翻面闪光的比例
  const ART = {
    camelThorn: { bark: ['#3a2418', '#6a3e26', '#9a6440', '#c69064'], thorn: ['#b89a6a', '#f4e2bd'],
      leaf: ['#26401f', '#3d5a2c', '#5f8a3e', '#93bc5a', '#c4dc84'], canopy: 'speckle', leafSz: [1.5, 1.1], dens: 1.4,
      flowers: { ramp: ['#6a1e48', '#c0457e', '#f08ab8'], kind: 'dots', n: 2 } },
    cistanche: { custom: 'cistanche', fleshy: ['#5a3418', '#946234', '#c48e4c', '#ecc985'], flower: ['#2e1a40', '#5a3080', '#8a5cb8', '#c4a0e4'] },
    tamarisk: { bark: ['#3a1a1e', '#6a2a2c', '#9a4234', '#c46a4a'],
      leaf: ['#33402e', '#55663e', '#7d8a5a', '#a8b07a'], canopy: 'wisp',
      flowers: { ramp: ['#7a2f54', '#c45a8e', '#f0a0c8', '#fde0ee'], kind: 'spike' } },
    seaBuckthorn: { bark: ['#2e2622', '#4e403a', '#726058', '#968478'],
      leaf: ['#26322a', '#435844', '#6a8468', '#9fb89c', '#c8d8c0'], canopy: 'needle', dens: 1.7, leafLen: 5.5 },
    oleaster: { bark: ['#2a1c18', '#4a3026', '#6e4a38', '#93705a'], tex: 'twist',
      leaf: ['#36443c', '#5f7268', '#93a89c', '#c8d6c4', '#eef4e8'], canopy: 'spray', leafLen: 6.5, dens: 1.25,
      flowers: { ramp: ['#a07a20', '#e8c040', '#fbec90'], kind: 'dots', n: 3 },
      // 几条扭成绳状的老根，顺着树干倾斜的方向伸得更远
      base: { reach: 0.9, reachAdd: 8, wig: 1.4, twist: true, knot: true, flare: 0.5, rise: 1.1,
        roots: (rnd, tw, mw, lean) => [
          [lean, tw * 1.1 + 8, tw * 0.24, tw * 0.46, rnd() * 6],
          [-lean, tw * 0.7 + 5, tw * 0.18, tw * 0.38, rnd() * 6],
          [lean, tw * 0.45 + 3, tw * 0.05, tw * 0.26, rnd() * 6],
          [-lean, mw * 1.4 + 6, 2.5, tw * 0.18, rnd() * 6],
        ] } },
    elm: { bark: ['#2e2824', '#4e4540', '#726660', '#988a80'], tex: 'furrow',
      leaf: ['#24391c', '#3f6230', '#5f8a46', '#8fb862', '#c8e08a'], canopy: 'dome' },
    populus: { bark: ['#2a1c14', '#4c3220', '#76503a', '#a07a58'], tex: 'burl',
      leaf: ['#5a3e10', '#9a6c1a', '#d09a2a', '#f0c850', '#fae890'], canopy: 'speckle', dens: 1.1, leafSz: [2, 1.3],
      particles: { cols: ['#f0c850', '#d09a2a'], kind: 'fall', rate: 0.9 },
      // 带瘤的老根从地里拱出来又扎回去，其中一条被风蚀露出、爬得更远
      base: { reach: 0.95, reachAdd: 12, wig: 0.9, fissure: true, knot: true, flare: 0.4, rise: 0.9, veins: true,
        roots: (rnd, tw, mw, lean) => {
          const sd0 = rnd() < 0.5 ? -1 : 1;
          return [
            [sd0, tw * 0.85 + 8, tw * 0.1, tw * 0.46, rnd() * 6],
            [-sd0, tw * 0.7 + 6, tw * 0.07, tw * 0.4, rnd() * 6],
            [sd0, mw * 1.8 + 8, 4, tw * 0.24, rnd() * 6],
            [-sd0, tw * 0.6 + 4, tw * 0.08, tw * 0.28, rnd() * 6],
          ];
        } } },
    whitePoplar: { bark: ['#4a4a48', '#8e908a', '#cfd0c8', '#f2f2ea'], tex: 'lenticel',
      leaf: ['#22302a', '#3e4c46', '#5e7268', '#8ea69a', '#e8f0ea'], canopy: 'speckle', dens: 1.25, leafSz: [1.8, 1.2], flicker: 0.06,
      particles: { cols: ['#ffffff', '#e8e4d8'], kind: 'float', rate: 0.7 },
      // 下段树皮深灰、纵裂，往上参差地过渡成白皮；根颈短而饱满
      baseBark: ['#262624', '#3e3e3a', '#5a5a54', '#7a7a72'], baseH: 0.16,
      base: { reach: 0.8, reachAdd: 7, wig: 0.3, ramp: ['#262624', '#3e3e3a', '#5a5a54', '#7a7a72'],
        roots: (rnd, tw) => [
          [-1, tw * (0.4 + rnd() * 0.15) + 3, tw * 0.1, tw * 0.36, rnd() * 6],
          [1, tw * (0.35 + rnd() * 0.15) + 3, tw * 0.08, tw * 0.32, rnd() * 6],
        ] } },
  };
  const PLAIN_BARK = ['#4a2c1c', '#6c4329', '#8c5b3a', '#b98a5f'];

  function fruitPal(extra) {
    const ramps = Object.values(G.MAT_COLOR).map(matRamp);
    ramps.push(['#ffffff'], ['#fff4ec'], STEM, ['#5a3a26'], ['#fee761']);
    if (extra) ramps.push(extra);
    return LayerPal(ramps);
  }
  // 按 form 缓存每个物种的完整画法（含三层调色板）
  const styles = new Map();
  function styleOf(form) {
    let S = styles.get(form);
    if (S) return S;
    const sp = Object.keys(G.TREES).find(k => G.TREES[k].form === form);
    if (ART[sp]) {
      S = Object.assign({}, ART[sp]);
      if (S.custom) {
        S.pals = [LayerPal([S.fleshy]), LayerPal([['#000000']]), fruitPal(S.flower)];
        S.outDark = ['#2e1a0e', '#000000', '#1e1028'];
      } else {
        S.pals = [LayerPal([S.bark, ...(S.baseBark ? [S.baseBark] : [])]), LayerPal([S.leaf, ...(S.thorn ? [S.thorn] : [])]), fruitPal(S.flowers && S.flowers.ramp)];
        S.outDark = [shade(S.bark[0], -16), shade(S.leaf[0], -16), '#2a1810'];
      }
    } else {
      const leaf = [shade(form.leaf[0], -18), form.leaf[0], form.leaf[1], form.leaf[2]];
      S = { bark: PLAIN_BARK, leaf, canopy: 'blob', tex: 'lines', plain: true,
        pals: [LayerPal([PLAIN_BARK]), LayerPal([leaf]), fruitPal()], outDark: ['#2a1810', shade(leaf[0], -20), '#2a1810'] };
    }
    styles.set(form, S);
    return S;
  }

  // ================= 树皮 =================
  function drawBark(c, tr, S) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const segs = [];
    for (const b of tr.B) {
      if (b.g <= 0) continue;
      const n = Math.max(3, Math.ceil(b.len * b.g / 7)), pts = [];
      for (let i = 0; i <= n; i++) pts.push(TR.bez(b, i / n * b.g));
      segs.push({ b, pts });
    }
    const R = S.bark;
    const run = fn => { for (const s of segs) for (let i = 1; i < s.pts.length; i++) fn(s.pts[i - 1], s.pts[i], lerp(s.b.w0, s.b.w1, i / (s.pts.length - 1))); };
    run((a, q, w) => seg(c, a, q, w, R[2]));
    // 背光侧（右）压暗、受光侧（左）提亮
    run((a, q, w) => {
      if (w < 2.6) return;
      const l = Math.hypot(q[0] - a[0], q[1] - a[1]) || 1, nx = -(q[1] - a[1]) / l * w, ny = (q[0] - a[0]) / l * w;
      seg(c, [a[0] + nx * 0.3, a[1] + ny * 0.3], [q[0] + nx * 0.3, q[1] + ny * 0.3], w * 0.32, R[1]);
      seg(c, [a[0] - nx * 0.27, a[1] - ny * 0.27], [q[0] - nx * 0.27, q[1] - ny * 0.27], w * 0.2, R[3]);
    });
    // 树皮纹理：只画主干和一级枝
    const tex = S.tex;
    for (const { b } of segs) {
      if (b.depth > 1) continue;
      const W = u => lerp(b.w0, b.w1, u);
      const side = (u, f) => { const p = TR.bez(b, u), q = TR.bez(b, Math.min(1, u + 0.02)), l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [p[0] - (q[1] - p[1]) / l * W(u) * f, p[1] + (q[0] - p[0]) / l * W(u) * f]; };
      c.lineWidth = 1.25; c.strokeStyle = R[0];
      if (tex === 'lines') {
        for (let k = 0; k < 5; k++) { const u = 0.12 + k * 0.17; if (u > b.g || W(u) < 4) continue; const p = side(u, k % 2 ? 0.2 : -0.15), q = side(u + 0.07, k % 2 ? 0.12 : -0.09); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke(); }
      } else if (tex === 'furrow' || tex === 'burl') {
        for (const f of [-0.22, 0.04, 0.26]) { c.beginPath(); for (let u = 0.02; u <= Math.min(0.88, b.g); u += 0.04) { if (W(u) < 4) break; const p = side(u, f + Math.sin(u * 23 + f * 9 + b.ph) * 0.06); u < 0.03 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]); } c.stroke(); }
        if (tex === 'burl' && b.depth === 0) for (const [u, f] of [[0.28, 0.12], [0.55, -0.18]]) { if (u > b.g) continue; const p = side(u, f); ell(c, p[0], p[1], W(u) * 0.24, W(u) * 0.2, 0, R[1]); ell(c, p[0] + 0.6, p[1] + 0.6, W(u) * 0.1, W(u) * 0.09, 0, R[0]); }
      } else if (tex === 'twist') {
        for (let u = 0.06; u < Math.min(0.9, b.g); u += 0.11) { if (W(u) < 4) continue; const p = side(u, -0.32), q = side(u + 0.06, 0.32); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke(); }
      } else if (tex === 'lenticel') {
        for (let u = 0.1; u < Math.min(0.92, b.g); u += 0.09) { if (W(u) < 3.5) continue; const q = side(u, Math.sin(u * 37 + b.ph * 3) * 0.25), L = W(u) * 0.18; seg(c, [q[0] - L, q[1]], [q[0] + L, q[1]], 1, R[1]); }
      }
    }
    if (S.baseBark) drawBaseBark(c, tr, S);
    const trunks = tr.B.filter(b => !b.parent && b.g > 0);
    if (!trunks.length) return;
    const tw = Math.max(...trunks.map(b => b.w0));
    if (S.base) drawBase(c, tr, S, tw);
    else drawPlainRoots(c, S.bark, tw);
    if (S.thorn) drawThorns(c, segs, S);
  }

  // 银白杨：树干下段一整块深灰老皮，上沿参差，几道纵向裂纹伸进白皮
  function drawBaseBark(c, tr, S) {
    const b = tr.B[0], BB = S.baseBark, rnd = G.rng(hash3(tr.seed, 3, 9)), W0 = b.w0;
    const side = (u, f) => { const p = TR.bez(b, u), q = TR.bez(b, Math.min(1, u + 0.02)), l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, w = lerp(b.w0, b.w1, u); return [p[0] - (q[1] - p[1]) / l * w * f, p[1] + (q[0] - p[0]) / l * w * f]; };
    const H = Math.min(S.baseH, b.g), tops = [];
    if (H < 0.01) return; // 树干还没长出来（下面的裂纹按 H 分段，H 为 0 会死循环）
    for (let f = -0.52; f <= 0.53; f += 0.13) tops.push([f, H * (0.7 + rnd() * 0.6)]);
    c.fillStyle = BB[2]; c.beginPath();
    let p = side(0, -0.52); c.moveTo(p[0], p[1]);
    tops.forEach(([f, hu], i) => { p = side(hu, f); c.lineTo(p[0], p[1]); if (i < tops.length - 1) { const q = side(Math.min(hu, tops[i + 1][1]) * 0.8, f + 0.065); c.lineTo(q[0], q[1]); } });
    p = side(0, 0.53); c.lineTo(p[0], p[1]); c.closePath(); c.fill();
    c.lineCap = 'butt';
    const strip = (f, hk, w, col) => { const a = side(0, f), q = side(H * hk, f); seg(c, a, q, w, col); };
    strip(-0.36, 0.7, W0 * 0.16, BB[3]);
    strip(0.36, 0.75, W0 * 0.2, BB[1]);
    for (const f of [-0.18, 0.06, 0.24]) {
      const hk = 0.6 + rnd() * 0.7; c.lineWidth = 1.1; c.strokeStyle = BB[0]; c.beginPath();
      for (let u = 0; u <= H * hk; u += H * 0.1) { const q = side(u, f + Math.sin(u * 60 + f * 20) * 0.03); u ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }
      c.stroke();
    }
    c.lineCap = 'round';
  }

  // 专门的根部：根大半埋在地里，只拱出背脊，末端扎回土中（地面以下在后处理里裁掉）
  function drawBase(c, tr, S, tw) {
    const B = S.base, R0 = B.ramp || S.bark, rnd = G.rng(hash3(tr.seed, 5, 5));
    const gk = tr.B[0].g, mw = tw * B.reach + B.reachAdd;
    if (B.flare) {
      const fh = tw * B.flare, fw = tw * 0.5 + B.flare * tw * 0.5;
      c.fillStyle = R0[2]; c.beginPath(); c.moveTo(-tw * 0.48, -fh);
      c.quadraticCurveTo(-tw * 0.5, -1, -fw, 1); c.lineTo(fw, 1);
      c.quadraticCurveTo(tw * 0.5, -1, tw * 0.48, -fh); c.closePath(); c.fill();
      seg(c, [-tw * 0.36, -fh], [-fw * 0.8, 0], tw * 0.12, R0[3]);
      seg(c, [tw * 0.36, -fh], [fw * 0.8, 0], tw * 0.16, R0[1]);
      // 树干的裂纹顺着根基分开，伸向两侧的根
      if (B.veins) {
        c.lineWidth = 1.1; c.strokeStyle = R0[0];
        for (const [x0, x1] of [[-0.22, -0.75], [-0.04, -0.3], [0.08, 0.35], [0.24, 0.8]]) { c.beginPath(); c.moveTo(tw * x0, -fh - 6); c.quadraticCurveTo(tw * x0, -3, fw * x1 * 1.1, 1); c.stroke(); }
      }
    }
    const root = (sd, D, amp, w0, ph) => {
      D *= gk; w0 *= gk;
      const xs = sd * tw * 0.3, N = 16, pts = [];
      const W = i => lerp(w0, 1.6, Math.pow(i / N, 0.8));
      for (let i = 0; i <= N; i++) {
        const u = i / N, x = xs + sd * D * u;
        const rise = (B.rise || 0) * w0 * Math.pow(1 - u, 2.2);
        const dive = u > 0.8 ? Math.pow((u - 0.8) / 0.2, 2) * (W(i) + 3) : 0;
        pts.push([x + Math.sin(u * 7 + ph) * B.wig, W(i) * 0.22 - rise - amp * gk * Math.sin(Math.PI * Math.min(1, u * 1.08)) + dive + Math.sin(u * 11 + ph * 2) * B.wig * 0.6]);
      }
      for (let i = 1; i <= N; i++) seg(c, pts[i - 1], pts[i], W(i), R0[2]);
      for (let i = 1; i <= N; i++) { const w = W(i), a = pts[i - 1], q = pts[i]; seg(c, [a[0], a[1] - w * 0.3], [q[0], q[1] - w * 0.3], w * 0.28, R0[3]); seg(c, [a[0], a[1] + w * 0.28], [q[0], q[1] + w * 0.28], w * 0.34, R0[1]); }
      if (B.fissure) { c.lineWidth = 1.1; c.strokeStyle = R0[0]; c.beginPath(); for (let i = 0; i <= N * 0.6; i++) { const p = pts[i]; i ? c.lineTo(p[0], p[1] + Math.sin(i * 1.7 + ph) * 0.5) : c.moveTo(p[0], p[1]); } c.stroke(); }
      if (B.twist) for (let i = 1; i < N * 0.75; i += 1.5) { const k = Math.floor(i), p = pts[k], w = W(k); seg(c, [p[0] - sd * w * 0.3, p[1] - w * 0.45], [p[0] + sd * w * 0.3, p[1] + w * 0.4], 1.4, R0[0]); seg(c, [p[0] - sd * w * 0.3 - sd, p[1] - w * 0.45], [p[0] + sd * w * 0.3 - sd, p[1] + w * 0.4], 0.9, R0[3]); }
      if (B.knot && w0 > 6) { const p = pts[Math.round(N * (0.3 + rnd() * 0.15))]; ell(c, p[0], p[1] - w0 * 0.2, w0 * 0.2, w0 * 0.11, 0, R0[1]); ell(c, p[0] + 0.4, p[1] - w0 * 0.16, w0 * 0.09, w0 * 0.05, 0, R0[0]); }
    };
    const top = TR.bez(tr.B[0], 1), lean = top[0] < tr.B[0].p0[0] ? -1 : 1;
    // 先画细根，粗根压在上面
    B.roots(rnd, tw, mw, lean).sort((a, b) => a[3] - b[3]).forEach(r => root(...r));
  }

  // 没有专门根部的植物：左右各几条短根扎进土里
  function drawPlainRoots(c, R, tw) {
    const nr = tw > 9 ? 3 : tw > 5 ? 2 : 1;
    for (const sd of [-1, 1]) for (let k = 0; k < nr; k++) {
      const L = tw * 0.7 + 5 + k * 6, p0 = [sd * tw * (0.2 + k * 0.08), -tw * (0.9 - k * 0.25)], p1 = [sd * (tw * 0.5 + k * 2), -1 - k * 0.5], p2 = [sd * (tw * 0.45 + L), 4];
      const N = 7, P = i => { const u = i / N, a = (1 - u) * (1 - u), m = 2 * (1 - u) * u, cc = u * u; return [a * p0[0] + m * p1[0] + cc * p2[0], a * p0[1] + m * p1[1] + cc * p2[1]]; };
      for (let i = 1; i <= N; i++) seg(c, P(i - 1), P(i), lerp(tw * (0.5 - k * 0.08), 1.4, i / N), R[2]);
      for (let i = 2; i <= N; i++) { const w = lerp(tw * (0.5 - k * 0.08), 1.4, i / N), a = P(i - 1), q = P(i); seg(c, [a[0], a[1] - w * 0.3], [q[0], q[1] - w * 0.3], w * 0.25, R[3]); seg(c, [a[0], a[1] + w * 0.3], [q[0], q[1] + w * 0.3], w * 0.3, R[1]); }
    }
  }

  // 骆驼刺：枝上的小刺
  function drawThorns(c, segs, S) {
    c.lineCap = 'butt';
    for (const { b } of segs) for (let u = 0.25; u < b.g; u += 0.16) {
      const p = TR.bez(b, u), q = TR.bez(b, Math.min(1, u + 0.03)), a = Math.atan2(q[1] - p[1], q[0] - p[0]) + (Math.floor(u * 50) % 2 ? 1 : -1);
      seg(c, p, [p[0] + Math.cos(a) * 4.5, p[1] + Math.sin(a) * 4.5], 1.1, S.thorn[1]);
    }
    c.lineCap = 'round';
  }

  // ================= 叶团 =================
  // 原来的叶团造型（圆盘叠加 + 边缘单片叶），去掉外圈深色环和描边，交给后处理
  function canopyBlob(c, tr, t, S) {
    const [, dark, mid, light] = S.leaf;
    const live = [];
    for (const cl of tr.clusters) { const st = TR.clusterState(cl, t); if (st.s > 0.01) live.push([cl, st]); }
    const layer = fn => { for (const [cl, st] of live) for (const [dx, dy, rr] of cl.subs) fn(cl, st, dx, dy, rr * cl.r * st.s); };
    layer((cl, st, dx, dy, r) => ell(c, st.x + dx * cl.r * st.s + 1.5, st.y + dy * cl.r * st.s + 2.5, r, r, 0, dark));
    layer((cl, st, dx, dy, r) => ell(c, st.x + dx * cl.r * st.s, st.y + dy * cl.r * st.s, r * 0.9, r * 0.9, 0, mid));
    for (const [cl, st] of live) for (const lf of cl.leaves) {
      const R = cl.r * st.s * lf.d, x = st.x + Math.cos(lf.a) * R, y = st.y + Math.sin(lf.a) * R * 0.85;
      c.save(); c.translate(x, y); c.rotate(lf.a); c.scale(st.s * lf.s, st.s * lf.s);
      c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(1, -5, 7, 0); c.quadraticCurveTo(1, 5, -5, 0);
      c.fillStyle = Math.sin(lf.a) > 0.2 ? dark : mid; c.fill(); c.restore();
    }
    layer((cl, st, dx, dy, r) => ell(c, st.x + (dx - 0.22) * cl.r * st.s, st.y + (dy - 0.28) * cl.r * st.s, r * 0.5, r * 0.5, 0, light));
  }

  // 亮度按叶片在叶团里的位置算：左上亮、右下暗
  function lightIdx(px, py, rx, ry, noise) {
    const L = -px / rx * 0.55 - py / ry * 0.85 + noise;
    return L > 0.6 ? 3 : L > 0.05 ? 2 : L > -0.55 ? 1 : 0;
  }
  // 一个叶团（含花）画在 (g.x, g.y)。叶团内部是刚性的：摆动时整团平移，所以画一次就能缓存
  function drawCluster(cL, cF, g, S) {
    const Lf = S.leaf, kind = S.canopy;
    // 叶团的底色：几个子圆，保证轮廓饱满
    const body = k => { for (const [dx, dy, rr] of g.cl.subs) ell(cL, g.x + dx * g.rx * 0.9 + 1, g.y + dy * g.ry * 0.9 + 1.5, rr * g.rx * k, rr * g.ry * k, 0, kind === 'dome' ? Lf[1] : Lf[0]); };
    const sample = () => { const s = g.cl.subs[Math.floor(g.rnd() * g.cl.subs.length)], a = g.rnd() * TAU, d = Math.sqrt(g.rnd()); return [s[0] * g.rx * 0.9 + Math.cos(a) * d * s[2] * g.rx, s[1] * g.ry * 0.9 + Math.sin(a) * d * s[2] * g.ry]; };
    if (kind === 'speckle' || kind === 'needle') {
      body(0.92);
      // 叶片数按长成后的大小定，生长时只是挤得更密
      const R = g.cl.r, n = Math.round(R * R * g.cl.ax * g.cl.ay * 0.42 * (S.dens || 1));
      for (let k = 0; k < n; k++) {
        const [px, py] = sample(), li = lightIdx(px, py, g.rx, g.ry, (g.rnd() - 0.5) * 0.5);
        if (kind === 'needle') ell(cL, g.x + px, g.y + py, (S.leafLen || 5) * 0.5, 0.75, lerp(Math.atan2(py, px), -Math.PI / 2, 0.45) + (g.rnd() - 0.5) * 0.6, Lf[li]);
        else { const [a, b] = S.leafSz || [1.8, 1.3]; ell(cL, g.x + px, g.y + py, a * (0.8 + g.rnd() * 0.5), b, g.rnd() * TAU, Lf[li]); }
      }
    } else if (kind === 'dome') {
      body(0.95);
      // 边缘鼓起的小叶簇，受光的一侧更亮
      for (let k = 0; k < 11; k++) {
        const a = k / 11 * TAU + g.rnd() * 0.4, px = Math.cos(a) * g.rx * 0.82, py = Math.sin(a) * g.ry * 0.82, rr = g.r * (0.32 + g.rnd() * 0.12), li = lightIdx(px, py, g.rx, g.ry, 0);
        ell(cL, g.x + px, g.y + py, rr, rr * 0.85, 0, Lf[Math.max(1, li)]);
        ell(cL, g.x + px - rr * 0.25, g.y + py - rr * 0.3, rr * 0.45, rr * 0.38, 0, Lf[Math.min(4, li + 1)]);
      }
      for (let k = 0; k < 5; k++) { const [px, py] = sample(); ell(cL, g.x + px, g.y + py, g.r * 0.22, g.r * 0.18, 0, Lf[lightIdx(px, py, g.rx, g.ry, 0.2)]); }
    } else if (kind === 'wisp') {
      body(0.55);
      cL.lineCap = 'round'; cL.lineWidth = 1.7;
      const n = Math.round(g.cl.r * 1.5);
      for (let k = 0; k < n; k++) {
        const a = -Math.PI * (0.05 + g.rnd() * 0.9), sx = g.x + Math.cos(a) * g.rx * 0.45, sy = g.y + Math.sin(a) * g.ry * 0.45;
        const out = g.r * (0.5 + g.rnd() * 0.35), ex = sx + Math.cos(a) * out * 0.9, ey = sy + g.r * (0.5 + g.rnd() * 0.5);
        cL.strokeStyle = Lf[lightIdx(Math.cos(a) * g.rx * 0.6, Math.sin(a) * g.ry * 0.6 + 2, g.rx, g.ry, (g.rnd() - 0.3) * 0.6)];
        cL.beginPath(); cL.moveTo(sx, sy); cL.quadraticCurveTo(sx + Math.cos(a) * out, sy + Math.sin(a) * out * 0.7, ex, ey); cL.stroke();
      }
    } else if (kind === 'spray') {
      body(0.5);
      const n = Math.round(g.cl.r * 2.2 * (S.dens || 1));
      for (let k = 0; k < n; k++) {
        const a = g.rnd() * TAU, d = 0.25 + g.rnd() * 0.85, px = Math.cos(a) * d * g.rx, py = Math.sin(a) * d * g.ry;
        ell(cL, g.x + px, g.y + py, (S.leafLen || 6) * 0.5 * Math.min(1, g.r / g.cl.r + 0.3), 1.0, a + (g.rnd() - 0.5) * 0.5, Lf[lightIdx(px, py, g.rx, g.ry, (g.rnd() - 0.5) * 0.5)]);
      }
    }
    // 花：红柳的花穗、骆驼刺的小花、沙枣的小黄花（画在果实层）
    const F = S.flowers;
    if (!F) return;
    const n = F.kind === 'spike' ? 2 + Math.floor(g.rnd() * 2) : F.n;
    for (let k = 0; k < n; k++) {
      if (F.kind === 'spike') {
        const x = g.x + (g.rnd() - 0.5) * g.rx * 1.1, y = g.y - g.ry * (0.35 + g.rnd() * 0.3), lean = (x - g.x) / g.rx * 0.35, s = g.r / g.cl.r;
        ell(cF, x, y - 4 * s, 2.1 * s, 5.6 * s, lean, F.ramp[1]);
        ell(cF, x - 0.6 * s, y - 5.5 * s, 1 * s, 3.2 * s, lean, F.ramp[2]);
        ell(cF, x + 1 * s, y - 1 * s, 1.3 * s, 2.4 * s, lean, F.ramp[0]);
      } else {
        const [px, py] = sample();
        if (py > g.ry * 0.4) continue;
        ell(cF, g.x + px, g.y + py, 1.6, 1.6, 0, F.ramp[1]);
        ell(cF, g.x + px - 0.5, g.y + py - 0.5, 0.8, 0.8, 0, F.ramp[2]);
      }
    }
  }
  // 叶团缓存：按叶团对象、生长缩放（分 20 档）记住画好的小图（像素坐标，中心在 cx, cy）
  const clusterCache = new WeakMap();
  function clusterArt(tr, cl, i, s, S) {
    let m = clusterCache.get(cl);
    if (!m) clusterCache.set(cl, m = new Map());
    const sq = Math.round(s * 20) / 20;
    let e = m.get(sq);
    if (e) return e;
    const r = cl.r * sq, c = Math.ceil((r * Math.max(cl.ax, cl.ay) * 1.3 + 12) * K) + 2;
    const mk = () => { const cv = G.mkCanvas(c * 2, c * 2), g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, c, c); return [cv, g]; };
    const [leaf, gl] = mk(), [flower, gf] = S.flowers ? mk() : [null, null];
    drawCluster(gl, gf, { cl, i, x: 0, y: 0, r, rx: r * cl.ax, ry: r * cl.ay, rnd: G.rng(hash3(tr.seed, i, 77)) }, S);
    m.set(sq, e = { leaf, flower, c });
    return e;
  }
  function canopySpecies(cL, cF, tr, t, S, ax, ay) {
    tr.clusters.forEach((cl, i) => {
      const st = TR.clusterState(cl, t);
      if (st.s <= 0.01) return;
      const e = clusterArt(tr, cl, i, st.s, S), X = Math.round(ax + st.x * K) - e.c, Y = Math.round(ay + st.y * K) - e.c;
      for (const [g, cv] of [[cL, e.leaf], [cF, e.flower]]) {
        if (!cv) continue;
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cv, X, Y); g.restore();
      }
    });
  }

  // ================= 果实 =================
  // 先开花，花瓣落下后结出果实；果实造型按材料区分，颜色即材料颜色
  const FRUIT_ART = {
    flower(c, R) { for (let k = 0; k < 5; k++) { c.save(); c.rotate(k / 5 * TAU); ell(c, 0, -3, 1.9, 2.7, 0, R[1]); c.restore(); } ell(c, -0.8, -0.8, 1.6, 1.6, 0, R[2]); ell(c, 0, 0, 1.4, 1.4, 0, '#fee761'); },
    drop(c, R) { c.fillStyle = R[1]; c.beginPath(); c.moveTo(0, -5.5); c.quadraticCurveTo(3.8, -1, 3.4, 1.2); c.arc(0, 1.2, 3.4, 0, Math.PI); c.quadraticCurveTo(-3.8, -1, 0, -5.5); c.fill(); ell(c, 1.2, 2.2, 1.6, 1.4, 0, R[0]); ell(c, -1.2, 0, 1, 1.6, 0, R[2]); ell(c, -1.3, -0.6, 0.6, 0.6, 0, '#ffffff'); },
    wing(c, R) { ell(c, -4, -1.5, 4.6, 2, -0.5, R[2]); ell(c, 4, -1.5, 4.6, 2, 0.5, R[2]); ell(c, 4.5, -0.8, 3, 1, 0.5, R[1]); ell(c, 0, 0.5, 2.6, 2.2, 0, R[1]); ell(c, 0.8, 1.2, 1.2, 1, 0, R[0]); },
    catkin(c, R) { seg(c, [0, -4], [0, 0], 1, STEM[1]); ell(c, 0, 4.5, 2.3, 5.6, 0, R[1]); for (let y = 1.5; y < 9; y += 2.5) seg(c, [-2, y], [2, y + 0.6], 0.9, R[0]); ell(c, -0.9, 3.5, 0.7, 3.2, 0, R[2]); },
    berries(c, R) { for (const [x, y] of [[-2.6, 0.6], [2.6, 0.8], [0, -2.3], [0.3, 2.9]]) { ell(c, x + 0.6, y + 0.6, 2.4, 2.4, 0, R[0]); ell(c, x - 0.2, y - 0.2, 2, 2, 0, R[1]); ell(c, x - 0.9, y - 0.9, 0.75, 0.75, 0, R[2]); } },
    bells(c, R) { seg(c, [-4, -3], [4, -2], 1, STEM[1]); for (const [x, y] of [[-3, 0], [0.5, 1], [3.6, 0.4]]) { ell(c, x, y, 1.9, 2, 0, R[1]); ell(c, x - 0.6, y - 0.6, 0.8, 0.8, 0, R[2]); } },
    tassel(c, R) { for (let k = 0; k < 5; k++) { const x = (k - 2) * 1.3; seg(c, [x * 0.4, 0], [x, 8 + (k % 2) * 2], 1, k % 2 ? R[1] : R[2]); } ell(c, 0, 0, 2, 1.8, 0, R[0]); },
    coins(c, R) { for (const [x, y] of [[-3.4, 3], [3.2, 3.6], [0, 0]]) { ell(c, x, y, 3.8, 3.6, 0, R[1]); ell(c, x - 0.6, y - 0.6, 2.8, 2.6, 0, R[2]); ell(c, x + 0.3, y + 0.3, 1.3, 1.3, 0, R[0]); } },
    tear(c, R) { seg(c, [0, -9], [0, -4], 1.6, R[2]); FRUIT_ART.drop(c, R); },
    fluff(c, R) { for (const [x, y, r] of [[-2.4, 1, 2.6], [2.3, 1.2, 2.6], [0, 1.6, 2.6]]) ell(c, x, y, r, r, 0, R[0]); for (const [x, y, r] of [[-2.2, 0.2, 2.4], [2, 0.4, 2.3], [0, -1.6, 2.7]]) ell(c, x, y, r, r, 0, R[2]); ell(c, -0.8, -2.2, 1.2, 1, 0, '#ffffff'); },
    // 没有专门造型的材料：一颗带叶的小圆果
    round(c, R) { seg(c, [0, -4], [0.6, -7], 1.4, '#5a3a26'); ell(c, 0.5, 0.5, 4, 4, 0, R[0]); ell(c, -0.2, -0.2, 3.4, 3.4, 0, R[1]); ell(c, -1.3, -1.4, 1.1, 0.8, -0.6, R[2]); ell(c, 2.6, -6.4, 2.2, 1, 0.4, STEM[2]); },
  };
  const FRUIT_LOOK = {
    leftFlower: 'flower', rightFlower: 'flower', thornSugar: 'drop', windFruit: 'wing', tamariskSprout: 'catkin', thornSpike: 'berries',
    oleasterBloom: 'bells', stoneWhisker: 'tassel', elmCoin: 'coins', poplarTear: 'tear', poplarFluff: 'fluff',
  };
  const FRUIT_K = 1.6; // 游戏视角下树较小，果实单独放大
  function drawFruits(c, tr, t) {
    for (const f of tr.fruits) {
      if (t < f.bloomT) continue;
      const [x, y] = TR.fruitPos(f, t), col = G.MAT_COLOR[f.id];
      const fs = t >= f.fruitT ? eOutBack(clamp01((t - f.fruitT) / 0.4)) : 0;
      const bs = eOutBack(clamp01((t - f.bloomT) / 0.45)) * (1 - clamp01((t - f.fruitT) / 0.2));
      c.save(); c.translate(x, y); c.scale(FRUIT_K, FRUIT_K);
      if (bs > 0.02) {
        c.save(); c.scale(bs, bs); c.rotate(f.ang);
        for (let k = 0; k < 5; k++) { c.rotate(TAU / 5); ell(c, 0, -3.4, 2.2, 3, 0, '#fff4ec'); }
        ell(c, 0, 0, 1.8, 1.8, 0, col);
        c.restore();
      }
      if (fs > 0.01) { c.save(); c.scale(fs, fs); FRUIT_ART[FRUIT_LOOK[f.id] || 'round'](c, matRamp(col)); c.restore(); }
      // 花瓣飘落
      const dt = t - f.fruitT;
      if (dt > 0 && dt < 1.2) for (let k = 0; k < 3; k++) {
        const px = Math.sin(dt * 3 + k * 1.7) * 6 + (k - 1) * 3 + dt * 6, py = dt * 14 + dt * dt * 20;
        ell(c, px, py, 2, 1.3, dt * 4 + k, '#fff4ec');
      }
      c.restore();
    }
  }

  // ================= 肉苁蓉：从沙里钻出的肉质穗柱，上半截开满紫色小花 =================
  const cistH = v => 64 * (0.8 + 0.5 * v);
  function drawCistanche(cB, cF, tr, S, now) {
    const R = S.fleshy, Fl = S.flower, rnd = G.rng(tr.seed), gk = tr.B[0].g, H0 = cistH(tr.v) * gk;
    if (gk <= 0) return;
    for (const [x, hk, wd0] of [[-12, 0.72, 12], [13, 0.58, 11], [0.5, 1, 15]]) {
      const h = H0 * hk, wd = wd0 * (0.5 + 0.5 * gk), dx = Math.sin(now * 1.1 + x) * 0.5;
      const path = g => { g.beginPath(); g.moveTo(x - wd / 2, 5); g.quadraticCurveTo(x - wd * 0.55, -h * 0.5, x - wd * 0.32 + dx, -h + wd * 0.3); g.quadraticCurveTo(x + dx, -h - wd * 0.15, x + wd * 0.32 + dx, -h + wd * 0.3); g.quadraticCurveTo(x + wd * 0.55, -h * 0.5, x + wd / 2, 5); g.closePath(); };
      path(cB); cB.fillStyle = R[2]; cB.fill();
      cB.save(); path(cB); cB.clip();
      ell(cB, x + wd * 0.45, -h * 0.4, wd * 0.3, h * 0.7, 0, R[1]);
      ell(cB, x - wd * 0.42, -h * 0.4, wd * 0.14, h * 0.6, 0, R[3]);
      cB.strokeStyle = R[0]; cB.lineWidth = 1.1;
      for (let y = 2, row = 0; y > -h * 0.5; y -= 4.6, row++) for (let xs = -0.3 + (row % 2) * 0.22; xs < 0.4; xs += 0.42) { cB.beginPath(); cB.arc(x + xs * wd, y - 2.2, 2.3, 0.2 * Math.PI, 0.8 * Math.PI); cB.stroke(); }
      cB.restore();
      // 一排排管状小花，越往上越密
      for (let y = -h * 0.42, row = 0; y > -h - 1; y -= 3.1, row++) {
        const half = wd * 0.55 * (y < -h * 0.88 ? 0.6 : 1);
        for (let xs = -half + (row % 2) * 1.6; xs <= half; xs += 3.2) {
          const li = (xs < -half * 0.3 ? 2 : xs > half * 0.4 ? 0 : 1) + (rnd() < 0.2 ? 1 : 0);
          ell(cF, x + xs + dx, y, 1.9, 1.7, 0, Fl[li]);
          if (rnd() < 0.35) ell(cF, x + xs + dx - 0.4, y - 0.4, 0.6, 0.6, 0, Fl[3]);
        }
      }
    }
  }

  // ================= 合成：画三层 → 收色 → 像素后处理 =================
  const scratch = [0, 1, 2].map(() => G.mkCanvas(4, 4));
  function sprite(tr, t, now, fruit, prev, tick = 0) {
    const S = styleOf(tr.form);
    TR.layoutTree(tr, t, now);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const ext = (x, y, m) => { x0 = Math.min(x0, x - m); x1 = Math.max(x1, x + m); y0 = Math.min(y0, y - m); y1 = Math.max(y1, y + m); };
    const tw = tr.B[0].w0 || 4;
    if (S.custom) { ext(0, -cistH(tr.v) / 2, cistH(tr.v) / 2 + 12); ext(-26, 0, 0); ext(26, 0, 0); }
    else {
      for (const b of tr.B) { if (b.g <= 0) continue; ext(b.p0[0], b.p0[1], b.w0 + 6); ext(b.p2[0], b.p2[1], b.w0 + 6); ext(b.p1[0], b.p1[1], b.w0 + 6); }
      for (const cl of tr.clusters) { const st = TR.clusterState(cl, t); if (st.s > 0.01) ext(st.x, st.y, cl.r * Math.max(cl.ax, cl.ay) * 1.6 * st.s + 12); }
      if (fruit) for (const f of tr.fruits) if (t >= f.bloomT) { const [x, y] = TR.fruitPos(f, t); ext(x, y, 16); }
      ext(0, 0, tw * (S.base ? 2.6 : 1) + 30);
    }
    y1 = Math.min(y1, 4);
    const w = Math.max(4, Math.ceil((x1 - x0) * K) + 4), h = Math.max(4, Math.ceil((y1 - y0) * K) + 4);
    const ax = Math.round(-x0 * K + 2), ay = Math.round(-y0 * K + 2);
    const cs = scratch.map(cv => {
      if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); c.setTransform(K, 0, 0, K, ax, ay);
      return c;
    });
    if (S.custom) drawCistanche(cs[0], cs[2], tr, S, now);
    else {
      drawBark(cs[0], tr, S);
      if (S.canopy === 'blob') canopyBlob(cs[1], tr, t, S); else canopySpecies(cs[1], cs[2], tr, t, S, ax, ay);
      if (fruit) drawFruits(cs[2], tr, t);
    }

    // 收色：每层只在自己的色阶里找色；后画的层盖住先画的层。地面那一行（ay）往下全部裁掉：根扎进土里
    const N = w * h, L = new Int8Array(N).fill(-1), C = new Int16Array(N), P = S.pals;
    for (let li = 0; li < 3; li++) {
      const d = cs[li].getImageData(0, 0, w, h).data, pal = P[li];
      for (let i = 0; i < ay * w; i++) if (d[i * 4 + 3] >= 110) { L[i] = li; C[i] = pal.near(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); }
    }
    // 1. 清理：补上四面都被围住的空洞，去掉孤零零的单点，四邻里三个同色的杂色跟随邻居
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, l = L[i], a = i - 1, b = i + 1, u = i - w, d = i + w;
      if (l < 0) { if (L[a] >= 0 && L[b] >= 0 && L[u] >= 0 && L[d] >= 0) { L[i] = L[u]; C[i] = C[u]; } continue; }
      if (L[a] < 0 && L[b] < 0 && L[u] < 0 && L[d] < 0) { L[i] = -1; continue; }
      const c = C[i], same = j => L[j] === l && C[j] === c;
      if (same(a) || same(b) || same(u) || same(d)) continue;
      for (const j of [a, b, u]) {
        if (L[j] !== l) continue;
        let n = 0; for (const k of [a, b, u, d]) if (L[k] === l && C[k] === C[j]) n++;
        if (n >= 3) { C[i] = C[j]; break; }
      }
    }
    // 2. 光照：在清理后的结果上算，写进新数组
    const L0 = L, C0 = C.slice(), op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && L0[y * w + x] >= 0;
    for (let y = 0; y < ay; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, li = L0[i];
      if (li < 0) continue;
      const pal = P[li]; let c = C0[i];
      if (li === 0) {
        // 树皮：贴地的一行是接触阴影；树冠下 3 像素内压暗；左缘提亮、右缘压暗
        let shaded = y === ay - 1;
        for (let k = 1; k <= 3 && !shaded; k++) if (y - k >= 0 && L0[i - k * w] === 1) shaded = true;
        if (y === ay - 1) c = pal.darkest(c);
        else if (shaded) c = pal.step(c, -1);
        else if (!op(x - 1, y)) c = pal.step(c, 1);
        else if (!op(x + 1, y)) c = pal.step(c, -1);
      } else if (li === 1) {
        // 叶子：压在树皮上的那一行用最深一档做分界；上 / 左边缘提亮，下 / 右边缘压暗；翻面的叶子闪一下
        if (y + 1 < ay && L0[i + w] === 0) c = pal.darkest(c);
        else if (!op(x, y - 1) || (!op(x - 1, y) && !op(x - 1, y - 1))) c = pal.step(c, 1);
        else if (!op(x, y + 1) || !op(x + 1, y)) c = pal.step(c, -1);
        if (S.flicker && pal.ii[c] >= 1 && (hash3(x, y, tick) % 1000) / 1000 < S.flicker) c = pal.lightest(c);
      }
      C[i] = c;
    }
    // 3. 输出 + 同色系描边：物体在上方或左边 → 这是背光的下 / 右边缘，用深色；否则用本色阶最深一档
    let cv = prev && prev.cv;
    if (!cv || cv.width < w || cv.height < h || cv.width > w * 2 || cv.height > h * 2) cv = G.mkCanvas(w, h);
    const oc = cv.getContext('2d');
    oc.clearRect(0, 0, cv.width, cv.height);
    const img = oc.createImageData(w, h), D = img.data;
    const put = (i, rgb) => { D[i * 4] = rgb[0]; D[i * 4 + 1] = rgb[1]; D[i * 4 + 2] = rgb[2]; D[i * 4 + 3] = 255; };
    const outDark = S.outDark.map(hex);
    let cx0 = w, cx1 = -1;
    for (let y = 0; y < ay; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (L[i] >= 0) { put(i, P[L[i]].cols[C[i]]); if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; continue; }
      let j = -1, dark = false;
      if (y > 0 && L[i - w] >= 0) { j = i - w; dark = true; }
      else if (x > 0 && L[i - 1] >= 0) { j = i - 1; dark = true; }
      else if (y + 1 < ay && L[i + w] >= 0) j = i + w;
      else if (x + 1 < w && L[i + 1] >= 0) j = i + 1;
      if (j < 0) continue;
      put(i, dark ? outDark[L[j]] : P[L[j]].cols[P[L[j]].darkest(C[j])]);
    }
    oc.putImageData(img, 0, 0);
    return { cv, ax, ay, sz: (w - 4) * (h - 4), cw: Math.max(8, cx1 - cx0), ccx: (cx0 + cx1) / 2 - ax };
  }

  // ================= 树下的土地格与飘落物（画在屏幕像素上） =================
  // 树下一块压暗的土：用正片叠底压暗原来的地皮（纹理保留），中间深一档、外圈浅一档，边缘干净；
  // 宽度随树冠，但不超出自己的地块（地块宽 PLOT_W 格，两边留出界石的位置）
  const BED = [[-1, 0.55], [0, 0.85], [1, 1], [2, 0.9], [3, 0.6]]; // 每行（相对地面）的宽度比例
  function shadow(c, X, Y0, s) {
    const half = Math.round(clamp(s.cw * 0.3, 8, G.CFG.PLOT_W * G.GEO.TILE * G.GEO.PX / 2 - 4)), cx = Math.round(X);
    c.save(); c.globalCompositeOperation = 'multiply';
    for (const [dy, k] of BED) {
      const w = Math.round(half * k), wi = Math.round(w * 0.6);
      c.fillStyle = '#d6c4b6'; c.fillRect(cx - w, Y0 + dy, w * 2 + 1, 1);
      c.fillStyle = '#c4ac9c'; c.fillRect(cx - wi, Y0 + dy, wi * 2 + 1, 1);
    }
    c.restore();
  }
  // 胡杨的落叶、银白杨的杨絮。状态按植物对象记，不进存档
  const drifts = new WeakMap();
  function drift(c, key, form, s, X, Y0, clock) {
    const S = styleOf(form), P = S.particles;
    if (!P) return;
    let st = drifts.get(key);
    if (!st) drifts.set(key, st = { t: clock, parts: [] });
    const dt = clamp(clock - st.t, 0, 0.1); st.t = clock;
    const top = Y0 - s.ay, hh = s.ay;
    if (Math.random() < P.rate * dt) st.parts.push({ x: X + s.ccx + (Math.random() - 0.5) * s.cw * 0.8, y: top + hh * (0.15 + Math.random() * 0.35), t: 0, ph: Math.random() * TAU, col: P.cols[Math.floor(Math.random() * P.cols.length)] });
    for (const p of st.parts) {
      p.t += dt;
      if (P.kind === 'fall') { p.y += 7 * dt; p.x += Math.sin(p.t * 2.4 + p.ph) * 9 * dt + 2 * dt; }
      else { p.y -= 3.2 * dt; p.x += (Math.sin(p.t * 1.3 + p.ph) * 6 + 5) * dt; }
    }
    st.parts = st.parts.filter(p => p.t < 7 && p.y < Y0 - 1);
    for (const p of st.parts) {
      const x = Math.round(p.x), y = Math.round(p.y);
      c.fillStyle = p.col;
      if (P.kind === 'fall') { const f = Math.floor(p.t * 4 + p.ph) % 2; c.fillRect(x, y, f ? 2 : 1, f ? 1 : 2); }
      else { c.fillRect(x, y, 1, 1); c.globalAlpha = 0.6; c.fillRect(x - 1, y, 1, 1); c.fillRect(x + 1, y, 1, 1); c.fillRect(x, y - 1, 1, 1); c.globalAlpha = 1; }
    }
  }

  G.TreeArt = { sprite, shadow, drift };
})();
