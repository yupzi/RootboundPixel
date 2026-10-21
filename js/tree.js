// 树的骨架：生成、生长时间线、每帧布局、果实位置（原型坐标：基部在 (0,0)，地面 y = 0）。怎么画见 tree_art.js
(function () {
  const { lerp, clamp01 } = G.U;
  const TAU = Math.PI * 2;
  const INK = G.INK;
  const SHOW = { TREE0: 2.1 };

  // ================= 树的生成（原型坐标：基部在 (0,0)，地面 y = 0） =================
  // form：植物的形态参数（见 data.js 里 G.TREES 上方的说明）
  function buildTree(rng, v, form) {
    const up = form.up ?? 0.1, lenK = form.lenK || 1, bendK = form.bendK || 1, spreadK = form.spreadK || 1;
    const maxDepth = form.depth + (form.depthAdd || 0) + Math.round(v * (form.trunks > 1 ? 1 : 2));
    const B = [];
    const make = (parent, s, ang, len, depth, t0, x0 = 0) => {
      const b = { parent, s, ang, len, depth, t0, x0, dur: 0.9 + len / 380, bend: (rng() - 0.5) * 0.6 * bendK, kids: [], ph: rng() * TAU };
      B.push(b);
      if (depth < maxDepth) {
        const n = depth < 2 ? 3 + (rng() < v ? 1 : 0) : 2 + (rng() < 0.4 ? 1 : 0);
        let side = rng() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) {
          const last = i === n - 1;
          const cs = last ? 1 : (depth === 0 ? 0.5 : 0.35) + (i + 0.5) / n * (depth === 0 ? 0.45 : 0.55);
          let ca = last ? ang + (rng() - 0.5) * 0.45 : ang + side * (0.6 + rng() * 0.5) * spreadK;
          side = -side;
          ca = lerp(ca, -Math.PI / 2, up);
          const cl = len * (last ? 0.66 : 0.6 + rng() * 0.16) * lenK;
          b.kids.push(make(b, cs, ca, cl, depth + 1, t0 + b.dur * cs * 0.8 + rng() * 0.12));
        }
      }
      return b;
    };
    const n = form.trunks, len0 = form.len + v * form.lenV;
    if (n === 1) make(null, 0, -Math.PI / 2 + (rng() - 0.5) * 0.06, len0, 0, 0);
    // 灌木：多根主干从根部散开
    else for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;
      make(null, 0, -Math.PI / 2 + u * 2 * form.spread * spreadK * (0.7 + rng() * 0.3), len0 * (1 - Math.abs(u) * 0.5) * (0.8 + rng() * 0.3), 0, rng() * 0.3, u * n * 1.6);
    }
    // 叶团：r 已含物种的整体放大，ax / ay 是横纵比例
    const clusters = [];
    const R0 = (0.75 + 0.45 * v) * form.leafR / 15 * (form.rK || 1);
    for (const b of B) {
      const add = (s, r) => {
        const subs = [[0, 0, 1], [-0.62, 0.22, 0.72], [0.62, 0.26, 0.7], [0.05, -0.52, 0.7]];
        for (let i = 0; i < 2; i++) { const a = rng() * TAU; subs.push([Math.cos(a) * 0.55, Math.sin(a) * 0.45, 0.5 + rng() * 0.2]); }
        const leaves = [];
        for (let i = 0; i < 6; i++) leaves.push({ a: i / 6 * TAU + rng() * 0.6, d: 0.85 + rng() * 0.25, s: 0.8 + rng() * 0.5 });
        clusters.push({ b, s, r: r * R0, ax: form.ax || 1, ay: form.ay || 1, t0: b.t0 + b.dur * s * 0.9 + 0.15, subs, leaves, lift: 0.25 + rng() * 0.2 });
      };
      if (!b.kids.length) { add(1, 15 + rng() * 9); if (rng() < 0.3) add(0.5, 11 + rng() * 5); }
      else if (b.depth >= maxDepth - 1 && rng() < 0.3) add(0.85, 12 + rng() * 5);
      else if (form.leafAlong && b.depth >= 1) add(0.55, 10 + rng() * 4);
    }
    const chains = B.filter(b => !b.kids.length).map(b => { const c = []; for (let x = b; x; x = x.parent) c.unshift(x); return c; });
    return { B, clusters, chains, fruits: [], saps: [], form, v, seed: (rng() * 4294967296) >>> 0 };
  }

  // 把树的相对时间线压缩到 [T0, T0 + dur]
  function timeTree(tr, T0, dur) {
    const E = Math.max(...tr.B.map(b => b.t0 + b.dur), ...tr.clusters.map(c => c.t0 + 0.3));
    const k = dur / E;
    for (const b of tr.B) { b.T0 = T0 + b.t0 * k; b.D = b.dur * k; }
    for (const c of tr.clusters) { c.T0 = T0 + c.t0 * k; c.D = 0.75; }
    tr.T0 = T0; tr.T1 = T0 + dur;
  }

  const bez = (b, u) => {
    const a = (1 - u) * (1 - u), m = 2 * (1 - u) * u, c = u * u;
    return [a * b.p0[0] + m * b.p1[0] + c * b.p2[0], a * b.p0[1] + m * b.p1[1] + c * b.p2[1]];
  };

  // tr.gust：额外的一阵晃动（摇树时由画面设置）
  function layoutTree(tr, t, now) {
    const { B, form } = tr;
    const mature = clamp01((t - tr.T0) / (tr.T1 - tr.T0));
    const wind = (Math.sin(now * 1.1) * 0.6 + Math.sin(now * 2.3 + 1) * 0.3) * (0.3 + 0.7 * mature) + (tr.gust || 0);
    for (const b of B) {
      b.g = 1 - Math.pow(1 - clamp01((t - b.T0) / b.D), 3);
      const p0 = b.parent ? bez(b.parent, b.s) : [b.x0, 4];
      const a = b.ang + wind * 0.012 * (b.depth + 1) + Math.sin(now * 1.7 + b.ph) * 0.006 * b.depth;
      const h = b.len * 0.5;
      const p1 = [p0[0] + Math.cos(a) * h, p0[1] + Math.sin(a) * h];
      b.p0 = p0; b.p1 = p1; b.p2 = [p1[0] + Math.cos(a + b.bend) * h, p1[1] + Math.sin(a + b.bend) * h];
    }
    // 管道模型：枝条越多，母枝越粗；再乘物种的加粗系数（主干最多，一级枝带一点）
    const tk = form.trunkK || 1, wk = form.wK || 1;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i], k = wk * (b.depth === 0 ? tk : b.depth === 1 ? 1 + (tk - 1) * 0.4 : 1);
      b.mass = b.g * b.len + b.kids.reduce((n, k) => n + k.mass, 0);
      b.w0 = (1.3 + 0.62 * Math.sqrt(b.mass)) * k;
      const last = b.kids[b.kids.length - 1];
      b.w1 = b.g < 1 ? 1.4 : last ? last.w0 * 0.95 : 1.3 * k;
    }
  }

  function clusterState(cl, t) {
    const s = G.U.eOutBack(clamp01((t - cl.T0) / cl.D));
    const p = bez(cl.b, cl.s);
    return { s, x: p[0], y: p[1] - cl.r * cl.lift * s };
  }

  // 果实挂在哪：surf 叶团表面、hang 叶团底下垂着、branch 贴着枝条、trunk 树干上渗出来
  const FRUIT_AT = { windFruit: 'hang', tamariskSprout: 'hang', stoneWhisker: 'hang', elmCoin: 'hang', thornSpike: 'branch', poplarTear: 'trunk' };
  function fruitPos(f, t) {
    const cl = f.c, st = clusterState(cl, t), rx = cl.r * cl.ax * st.s, ry = cl.r * cl.ay * st.s;
    const at = FRUIT_AT[f.id] || 'surf';
    if (at === 'hang') return [st.x + Math.cos(f.ang) * rx * 0.55, st.y + ry * 0.82];
    if (at === 'branch') { const p = bez(cl.b, 0.35 + f.rr * 0.6); return [p[0] + 2, p[1] + 1]; }
    if (at === 'trunk') {
      // 从叶团所在的枝往下到主干，挑一段够粗的枝（各颗果实的叶团不同，所以散在整棵树上），渗在枝条下侧
      const chain = [];
      for (let b = cl.b; b; b = b.parent) if (b.w0 >= 3.5 || !b.parent) chain.push(b);
      const b = chain[Math.floor(f.ang / TAU * chain.length) % chain.length], u = 0.15 + f.rr * 0.8;
      const p = bez(b, u), q = bez(b, Math.min(1, u + 0.02)), l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      let nx = -(q[1] - p[1]) / l, ny = (q[0] - p[0]) / l;
      // 平缓的枝挂在下侧；陡的枝（主干）在左右两侧，按角度定
      if (Math.abs(ny) > 0.35 ? ny < 0 : (nx < 0) !== (f.ang * 3.7 % 1 < 0.5)) { nx = -nx; ny = -ny; }
      const w = lerp(b.w0, b.w1, u) * (0.2 + (f.ang * 5.3 % 1) * 0.2);
      return [p[0] + nx * w, p[1] + ny * w];
    }
    return [st.x + Math.cos(f.ang) * f.rr * rx, st.y + Math.sin(f.ang) * f.rr * ry * 0.8];
  }

  // 种植时树下的幼苗；收获开始后，养分汇聚时它会轻轻颤动
  function drawSprout(c, T, t) {
    const shiver = t > SHOW.TREE0 - 0.6 ? Math.sin(T * 40) * 1.5 * clamp01((t - SHOW.TREE0 + 0.6) / 0.6) : 0;
    const sw = Math.sin(T * 1.6) * 2 + shiver, tx = sw, ty = -26;
    c.lineCap = 'round';
    const stem = () => { c.beginPath(); c.moveTo(0, 2); c.quadraticCurveTo(-3, -12, tx, ty); };
    stem(); c.strokeStyle = INK; c.lineWidth = 5.5; c.stroke();
    stem(); c.strokeStyle = '#6a9e46'; c.lineWidth = 2.8; c.stroke();
    for (const [ex, ey, bend] of [[-15, -33, -1], [14, -38, 1]]) {
      c.beginPath(); c.moveTo(tx, ty);
      c.quadraticCurveTo(tx + ex * 0.5 + bend * 2, ty + ey * 0.1 - 9 * (bend > 0 ? 1.2 : 1) - 4, tx + ex, ty + ey + 26);
      c.quadraticCurveTo(tx + ex * 0.5, ty + 4, tx, ty);
      c.fillStyle = '#7fb052'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = '#2c4429'; c.stroke();
    }
  }
  G.Tree = { buildTree, timeTree, bez, layoutTree, clusterState, fruitPos, drawSprout, SHOW, TS: 0.338, SPROUT_TS: 0.26 };
})();
