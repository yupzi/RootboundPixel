// 种植场：峭壁上一层层的坑（每层一张分块地图）、根系模拟、药剂指令执行、镜头。渲染在 render.js（像素风）
// 世界坐标：地表 y = 0，向下为正；x 从 0 到 COLS × TILE。1 世界单位 = GEO.PX 个屏幕像素
// 世界状态（地块、老根、植物、土壤）跨天保留，可以存档
(function () {
  const { CFG, GEO } = G;
  const { W, H, TILE, CS, SKY, COLS, ROWS } = GEO;
  const { clamp01, clamp, lerp, ease, wrapAng, hash, hash3, cumOf } = G.U;
  const CPX = CS * TILE;         // 每个分块的世界边长
  const NCX = COLS / CS, NCY = ROWS / CS; // 分块按需生成：只有镜头或根系到过的分块才会被创建
  const WORLD_W = COLS * TILE;
  const WORLD_SEED = 20261015;   // 地图固定
  const PLOT_W = CFG.PLOT_W, NPLOT = COLS / PLOT_W; // 地块宽度（列）与每层地块数
  const EDGE = { type: 'edge' };
  const SEL_CAMY = GEO.SEL_CAMY; // 地面行走时的镜头高度
  const CAM_DZ_X = 28, CAM_DZ_Y = 20; // 镜头死区半宽/半高
  const TAU = Math.PI * 2;
  const DOWN = Math.PI / 2, QUARTER = Math.PI / 2;
  const dirOf = t => [Math.cos(t.ang), Math.sin(t.ang)];
  // 持续状态在根尖上的字段名前缀：slowT / avoidT / seekT
  const AUTO_KEY = { slow: 'slow', avoid: 'avoid', seek: 'seek' };
  const CAM_M = 20; // 多根时根尖离屏幕边缘至少留这么多
  const TS = G.Tree.TS;          // 树（原型坐标）→ 世界坐标的缩放
  const { buildTree, timeTree, layoutTree, clusterState, fruitPos, bez } = G.Tree;
  const LEGACY_ROOT = { col: '#c18a52', A: 0.18, max: 6, tip: 0.9, wig: 0.3, wf: 0.2, hair: 0.3 }; // 旧存档里没记品种的根
  // 收获动画时间轴（秒）：收根 → 养分回流（镜头上移）→ 破土长大 → 开花 → 结果 → 矿物入账
  // 手札残页是第几张：设计地图里的残页按从浅到深、从左到右数（只有设计地图里有残页）
  const pageNo = (design, col, row) => design.slice(0, row * COLS + col).filter(ch => ch === 'p').length;
  const SHOW = { FLOW: 0.5, TREE0: 2.1, ORE_FLY: 0.7 };
  Object.assign(GEO, { CPX, WORLD_W, SHOW, NPLOT });

  class Field {
    constructor(canvas) {
      this.initRender(canvas);
      this.running = false;
      this.tips = [];
      this.particles = [];
      this.clock = 0;
      this.spawnX = WORLD_W / 2;
      this.camX = this.spawnX - W / 2;
      this.camY = SEL_CAMY;
      this.selCamX = this.camX; this.selCamY = SEL_CAMY;
      this.lookX = 0; this.lookY = 36;
      this.mode = 'idle';      // idle | select | round
      this.pickCol = -1; this.pickPlot = -1; this.curX = null; // curX：地块光标（世界 x，平滑滑动）
      this.levels = [];        // 每层一份 { world, chunks }；当前层的放在 this.world / this.chunks
      this.setLevel(0);
    }

    // ================= 峭壁的各层：每层一张独立的小地图 =================
    setLevel(i) {
      if (this.lv === i) return;
      if (this.lv !== undefined) this.levels[this.lv] = { world: this.world, chunks: this.chunks };
      this.lv = i;
      this.L = G.LEVELS[i];
      this.seed = WORLD_SEED + i * 7919;
      this.design = G.Strata.levelGrid(this.L.id); // 编辑器设计好的固定地图（没有就按 L.gen 随机生成）
      const s = this.levels[i];
      if (s) { this.world = s.world; this.chunks = s.chunks; } else this.newWorld();
      this.levels[i] = { world: this.world, chunks: this.chunks };
      if (this.onLevel) this.onLevel(i);
    }
    // 换了地下地图的生成方式：去过的每一层都按新方式重新生成地下（地表的植物、老根留着，老根重新画上去）
    regenUnderground() {
      const cur = this.lv;
      this.levels.forEach((s, i) => {
        if (!s) return;
        this.setLevel(i);
        this.design = G.Strata.levelGrid(this.L.id);
        this._bands = null;
        this.chunks = s.chunks = new Map();
        Object.assign(this.world, { pools: [], caveSpots: [], ores: [] });
        for (const rt of this.world.roots) this.replayRoot(rt);
        this.flushBake();
      });
      this.setLevel(cur);
    }
    hasCave() { return !!this.L.cave; } // 左侧崖壁上有通往隐藏洞穴的开口
    // 通往上一层的崖台：靠在 exit 一侧的崖壁上，伸进坑里 LIP 宽，顶面在 y = -reach
    lip() {
      const L = this.L;
      if (L.top || L.wallR) return null;
      const LIP = 40;
      return L.exit > 0 ? { x0: WORLD_W - LIP, x1: WORLD_W, y: -L.reach, side: 1 } : { x0: 0, x1: LIP, y: -L.reach, side: -1 };
    }
    // 右侧矮崖的崖顶高度（世界 y）；没有矮崖的层返回 null
    rightTop() { return this.L.wallR ? -this.L.wallR : null; }
    // 绳梯：从崖台边缘垂到地面（第一次爬上去之后才有）
    ladder() {
      const lp = this.lip();
      if (!lp || !this.world.ladder) return null;
      return { x: lp.side > 0 ? lp.x0 + 7 : lp.x1 - 7, y0: lp.y, y1: 0 };
    }
    // 从上一层下来的地方：在下面那层崖台的同一侧
    downExit() {
      if (this.lv === 0) return null;
      const below = G.LEVELS[this.lv - 1];
      return { x: below.exit > 0 ? WORLD_W - 14 : 14, side: below.exit };
    }

    newWorld() {
      this.chunks = new Map();
      // 开局整片都是流沙，好土全靠植物慢慢改出来
      this.world = { soil: new Array(NPLOT).fill(0), plants: [], roots: [], pools: [], caveSpots: [], ores: [], rootGrid: new Uint8Array(COLS * ROWS), deadGrid: new Uint8Array(COLS * ROWS), cells: {}, wither: [], dead: [], pid: 0, night: 0, ladder: false, seeds: [], drops: [], mail: [] };
    }

    // ---- 地块：地表每 PLOT_W 列一块，一块只种一株，土壤等级按整块算 ----
    plotOf(col) { return clamp(Math.floor(col / PLOT_W), 0, NPLOT - 1); }
    plotMid(p) { return p * PLOT_W + (PLOT_W >> 1); } // 地块中间那一列：植物种在这里
    plotSoil(p) { return this.world.soil[p]; } // 0 流沙 / 1 固定沙地 / 2 沙壤 / 3 绿洲土
    plantIn(p) { return this.world.plants.find(q => this.plotOf(q.col) === p) || null; }
    soilLevel(col) { return this.plotSoil(this.plotOf(col)); }
    // 绿洲度：整层地块土壤等级的平均（绿洲土 = 1）
    oasis() { return this.world.soil.reduce((n, k) => n + k, 0) / (NPLOT * 3); }
    // 改土：在 col 所在地块种下 sp 后，哪些地块会变成什么土（只列出会变的）
    reformPlan(sp, col) {
      const r = G.TREES[sp].reform, p0 = this.plotOf(col), out = [];
      if (!r) return out;
      const { at, up, max } = r;
      for (const d of at) {
        const p = p0 + d;
        if (p < 0 || p >= NPLOT) continue;
        const from = this.world.soil[p], to = Math.max(from, Math.min(max, from + up));
        if (to > from) out.push({ p, from, to });
      }
      return out;
    }
    // 邻居照顾：col 所在地块从周围活着的植物那里得到的加成（不算同一块地上的）
    buffsAt(col) {
      const p0 = this.plotOf(col), b = { speed: 1, time: 0, food: 0, yield: 1, ease: 0, from: [] };
      for (const q of this.world.plants) {
        const B = G.TREES[q.sp].buff, pq = this.plotOf(q.col);
        if (!B || pq === p0 || !B.at.includes(p0 - pq)) continue;
        if (B.speed) b.speed *= B.speed;
        if (B.yield) b.yield *= B.yield;
        b.time += B.time || 0; b.food += B.food || 0; b.ease += B.ease || 0;
        b.from.push(G.TREES[q.sp].name);
      }
      b.speed = Math.round(b.speed * 100) / 100; b.yield = Math.round(b.yield * 100) / 100;
      return b;
    }
    // 手里这株种下后会照顾到的地块
    buffPlots(sp, col) {
      const B = G.TREES[sp].buff, p0 = this.plotOf(col);
      return B ? B.at.map(d => p0 + d).filter(p => p >= 0 && p < NPLOT) : [];
    }

    // ---- 种植环境：崖壁、已经长着植物、土壤等级不够的地块不能种；离开老家能种，只是越恶劣越难 ----
    plantBlock(sp, col) {
      if (col < 0 || col > COLS - 1) return '那是崖壁';
      const p = this.plotOf(col), q = this.plantIn(p);
      if (q) return `这块地上长着${G.TREES[q.sp].name}`;
      const tr = G.TREES[sp], k = this.soilLevel(col);
      if (tr.tier > k) return `${tr.name}要种在「${G.SOIL_NAMES[tr.tier]}」上，这里只是「${G.SOIL_NAMES[k]}」`;
      return null;
    }
    // 恶劣度 h：离开植物的老家每差一层 +HOME_H；邻居的照顾（ease）可以抵掉一些
    harshness(sp, col, buff = this.buffsAt(col)) {
      const tr = G.TREES[sp];
      return Math.max(0, Math.abs(tr.home - this.lv) * CFG.HOME_H - buff.ease);
    }
    suitInfo(sp, col) {
      const buff = this.buffsAt(col), h = this.harshness(sp, col, buff), tr = G.TREES[sp];
      const base = (tr.time || CFG.ROUND_TIME) + (tr.traits.includes('long') ? 6 : 0) + (tr.traits.includes('tough') ? 8 : 0) + buff.time + G.campVal('canteen');
      const away = Math.abs(tr.home - this.lv);
      const why = [];
      if (away) why.push(`${tr.name}的老家在「${G.LEVELS[tr.home].name}」`);
      return {
        h, why, buff,
        level: h < 0.3 ? 0 : h < 1.3 ? 1 : h < 2.2 ? 2 : 3,
        speed: Math.round(100 * buff.speed / (1 + CFG.HARSH_SPEED * h)) / 100,
        time: Math.round(Math.max(CFG.MIN_TIME, base * (1 - CFG.HARSH_TIME * h))),
        yieldMul: Math.round(100 * buff.yield / (1 + h)) / 100,
      };
    }

    // ---- 树上的果实：位置挂在叶团上（叶团序号 ci），没摘的一直挂着 ----
    treeOf(p) {
      if (!p._tr) {
        p._tr = buildTree(G.rng(p.seed), p.v, G.TREES[p.sp].form);
        timeTree(p._tr, -100, 1);
        p._fk = null;
      }
      // 果实列表变了就重新挂到叶团上
      const fk = (p.fruits || []).length + ':' + (p.fruitGen || 0);
      if (p._fk !== fk) {
        const cl = p._tr.clusters;
        p._tr.fruits = (p.fruits || []).map(f => ({ id: f.id, c: cl[f.ci % cl.length], ang: f.a, rr: f.r, bloomT: -1e9, fruitT: -1e9, ref: f }));
        p._fk = fk;
      }
      return p._tr;
    }
    fruitCap(p) { return Math.min(36, this.treeOf(p).clusters.length * CFG.FRUIT_CAP); }
    // 老树每晚有概率结出新果：掷 FRUIT_TRIES 次，平均结果数 = 树种的 daily × 大小 v
    growFruit(p, rng) {
      const tr = G.TREES[p.sp];
      const chance = tr.daily * (0.5 + 0.5 * p.v) / CFG.FRUIT_TRIES;
      p.fruits = p.fruits || [];
      const cap = this.fruitCap(p), n = this.treeOf(p).clusters.length;
      let added = 0;
      for (let k = 0; k < CFG.FRUIT_TRIES; k++) {
        if (rng() >= chance || p.fruits.length >= cap) continue;
        const entries = Object.entries(tr.yields);
        let r = rng() * entries.reduce((s, [, w]) => s + w, 0), id = entries[0][0];
        for (const [k, w] of entries) if ((r -= w) < 0) { id = k; break; }
        p.fruits.push({ id, ci: Math.floor(rng() * n), a: rng() * TAU, r: 0.25 + rng() * 0.5, n: this.world.night });
        added++;
      }
      if (added) p.fruitGen = (p.fruitGen || 0) + 1;
      return added;
    }
    // 挂满 FRUIT_FALL 晚没摘的果子熟透了，掉在树下（n：结出的那一晚）
    dropRipe(p) {
      const w = this.world, ripe = f => w.night - f.n >= CFG.FRUIT_FALL;
      if (!(p.fruits || []).some(ripe)) return 0;
      const spots = this.fruitSpots(p), tf = this.treeOf(p).fruits;
      let fell = 0;
      spots.forEach((s, i) => { if (ripe(tf[i].ref)) { w.drops.push({ id: s.id, x: clamp(Math.round(s.x), 2, WORLD_W - 2) }); fell++; } });
      p.fruits = p.fruits.filter(f => !ripe(f));
      p.fruitGen = (p.fruitGen || 0) + 1;
      return fell;
    }

    // 新的一天：每一层的植物都长大、结果；泉水回涨，地下重新长出矿物
    // pool：鸟会带来的种子品种（已解锁的先锋植物）；mail：鸟今天捎来的信（G.Mail.dawn，只投在坑底）
    newDay(pool, mail) {
      const cur = this.lv, rep = this.nightReport = { fruit: 0, fell: 0, birdSeeds: [], mail: [] };
      for (let i = 0; i < this.levels.length; i++) if (this.levels[i]) {
        this.setLevel(i); this.dayTick(rep);
        const got = this.birdDrop(pool), letters = i === 0 ? this.mailDrop(mail) : [];
        if (i === cur) { rep.birdSeeds = got; rep.mail = letters; }
      }
      this.setLevel(cur);
    }
    // 清晨鸟儿飞过：在空着的地块上留下 BIRD_SEEDS 颗种子（避开长着植物的地块）
    birdDrop(pool) {
      const w = this.world, R = G.rng(hash3(this.seed, w.night, 37)), out = [];
      if (!pool.length) return out;
      const plots = [];
      for (let p = 1; p < NPLOT - 1; p++) if (!this.plantIn(p)) plots.push(p);
      if (!plots.length) for (let p = 1; p < NPLOT - 1; p++) plots.push(p);
      const [n0, n1] = CFG.BIRD_SEEDS, n = n0 + R.int(n1 - n0 + 1) + G.campVal('perch'); // 崖顶的鸟架多招来几颗
      for (let k = 0; k < n; k++) {
        const p = plots[R.int(plots.length)];
        let sp = pool[R.int(pool.length)];
        for (const k in CFG.BIRD_RARE) if (G.TREES[k].home === this.lv && R() < CFG.BIRD_RARE[k]) sp = k;
        const s = { sp, x: Math.round((p * PLOT_W + 0.5 + R() * (PLOT_W - 1)) * TILE) };
        w.seeds.push(s); out.push(s);
      }
      return out;
    }
    // 信 / 包裹：落在中间那几块空地上，好找
    mailDrop(ids) {
      const w = this.world, R = G.rng(hash3(this.seed, w.night, 61));
      return ids.map(id => { const m = { id, x: Math.round((NPLOT / 2 - 1 + R() * 2) * PLOT_W * TILE) }; w.mail.push(m); return m; });
    }
    // 鸟的飞行动画：从一侧飞到另一侧，飞过种子上方时种子落下（落地前捡不到）
    startBird(drops) {
      if (!drops.length) return;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.bird = { x: dir > 0 ? -30 : WORLD_W + 30, y: -66, dir, t: 0, wait: 0.8 };
      for (const s of drops) { s._fy = null; s._vy = 0; }
    }
    updateBird(dt) {
      const b = this.bird;
      if (b) {
        if (b.wait > 0) b.wait -= dt;
        else {
          b.t += dt; b.x += b.dir * 70 * dt; b.y = -66 + Math.sin(b.t * 3) * 3;
          for (const s of [...this.world.seeds, ...this.world.mail]) if (s._fy === null && (b.x - s.x) * b.dir >= 0) { s._fy = b.y + 4; G.sfx('click'); }
          if (b.x < -40 || b.x > WORLD_W + 40) this.bird = null;
        }
      }
      for (const s of [...this.world.seeds, ...this.world.mail]) if (s._fy) { s._vy += 120 * dt; s._fy = Math.min(0, s._fy + s._vy * dt); if (!s._fy) { s._fy = undefined; this.addFx('puff', s.x, 0, { n: 3 }); } }
      for (const d of this.world.drops) if (d._fy) { d._vy += 120 * dt; d._fy = Math.min(0, d._fy + d._vy * dt); if (!d._fy) { d._fy = undefined; this.addFx('puff', d.x, 0, { n: 2 }); } }
    }
    // 换层时：还没落下的种子、果子直接落地，鸟飞走
    finishBird() { for (const s of [...this.world.seeds, ...this.world.mail]) s._fy = undefined; for (const d of this.world.drops) d._fy = undefined; this.bird = null; }
    seedReady(s) { return s._fy === undefined; }
    pickGroundSeed(s) {
      const i = this.world.seeds.indexOf(s);
      if (i < 0 || !this.seedReady(s)) return false;
      this.world.seeds.splice(i, 1);
      this.addFx('ring', s.x, -3, { col: '#fee761', r1: 10 });
      this.addFx('stars', s.x, -3, { col: '#ffffff', n: 4 });
      return true;
    }
    pickMail(m) {
      const i = this.world.mail.indexOf(m);
      if (i < 0 || !this.seedReady(m)) return false;
      this.world.mail.splice(i, 1);
      this.addFx('ring', m.x, -4, { col: '#fee761', r1: 14 });
      this.addFx('stars', m.x, -4, { col: '#ffffff', n: 6 });
      return true;
    }
    // 铲除植物时掉在地上的果子：落地后走过就捡
    pickDrop(d) {
      const i = this.world.drops.indexOf(d);
      if (i < 0 || d._fy !== undefined) return false;
      this.world.drops.splice(i, 1);
      this.addFx('ring', d.x, -3, { col: G.MAT_COLOR[d.id] || '#fee761', r1: 10 });
      this.addFx('stars', d.x, -3, { col: '#ffffff', n: 4 });
      this.popup(d.x, -10, '+' + G.MATERIALS[d.id].name, '#fff2a8');
      return true;
    }

    // ---- 摇树：随机摇下 1~3 颗果子，从树上的位置落到地上（走过就捡）。没有果子也晃一下（shakes：摇的时刻，画面用） ----
    shakePlant(p) {
      (this.shakes || (this.shakes = new WeakMap())).set(p, this.clock);
      const fr = p.fruits || [], x = p.col * TILE + TILE / 2, leaf = G.TREES[p.sp].form.leaf;
      this.burst(x, -this.plantHeight(p) * TILE * 0.6, [leaf[1], leaf[2]], 6);
      if (!fr.length) return 0;
      const spots = this.fruitSpots(p); // 和 p.fruits 一一对应
      const pick = fr.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, Math.min(fr.length, 1 + Math.floor(Math.random() * 3)));
      for (const i of pick) this.world.drops.push({ id: spots[i].id, x: clamp(Math.round(spots[i].x), 2, WORLD_W - 2), _fy: Math.min(-1, spots[i].y), _vy: 0 });
      p.fruits = fr.filter((_, i) => !pick.includes(i));
      p.fruitGen = (p.fruitGen || 0) + 1;
      return pick.length;
    }

    // ---- 铲除：植物离开，果子掉在地上（drops：果子的世界坐标）。普通植物的老根当场枯成死根；肉苁蓉的根第二天烂成营养土 ----
    removePlant(p, drops) {
      const w = this.world;
      w.plants = w.plants.filter(q => q !== p);
      if (G.TREES[p.sp].parasite) w.wither.push(p.id);
      else this.deadenRoots(p.id);
      for (const d of drops) w.drops.push({ id: d.id, x: clamp(Math.round(d.x), 2, WORLD_W - 2), _fy: Math.min(-1, d.y), _vy: 0 });
      const x = p.col * TILE + TILE / 2;
      this.addFx('puff', x, 0, { n: 10 });
      this.addFx('stars', x, -4, { col: '#c8a070', n: 6 });
      this.burst(x, -2, ['#8c5b3a', '#c8a070', '#7aab4d'], 14);
    }
    // 老根枯成死根：形状不变，格子记在 w.dead 里（别的根钻过会减速，肉苁蓉能吃掉）。
    // 根上每一点所在的格子都算进去，画出来的形状和原来一模一样
    deadenRoots(id) {
      const w = this.world, cells = new Set(w.cells[id] || []), set = new Set();
      for (const rt of w.roots) if (rt.pid === id) {
        for (let k = 0; k < rt.p.length; k += 2) {
          cells.add(this.cellIndex(rt.p[k], rt.p[k + 1]));
          this.eachChunk(rt.p[k] - 12, rt.p[k + 1] - 12, 24, 24, ch => set.add(ch));
        }
      }
      cells.delete(-1);
      w.cells[id] = [...cells];
      w.dead.push(id);
      this.rebuildRootGrid();
      this.redrawChunks(set);
    }
    // 夜里：肉苁蓉漏掉的零碎死根（连在一起不超过 SCRAP_CELLS 格的小块）清掉；被吃光的死根整株拿掉；
    // 铲掉的肉苁蓉的根烂掉——不再被别的根（活根、死根）占着的空格子变成营养土
    rotRoots(rep) {
      const w = this.world;
      const scrap = this.deadScraps();
      for (const id of w.dead) w.cells[id] = w.cells[id].filter(i => !scrap.has(i));
      const eaten = w.dead.filter(id => !w.cells[id].length);
      for (const id of eaten) delete w.cells[id];
      w.dead = w.dead.filter(id => !eaten.includes(id));
      if (!w.wither.length && !scrap.size && !eaten.length) return;
      const gone = [];
      for (const id of w.wither) { if (w.cells[id]) gone.push(...w.cells[id]); delete w.cells[id]; }
      const rot = [...w.wither, ...eaten];
      w.roots = w.roots.filter(rt => !rot.includes(rt.pid));
      w.wither = [];
      this.rebuildRootGrid();
      let n = 0;
      for (const i of gone) {
        if (w.rootGrid[i] || w.deadGrid[i]) continue;
        const c = i % COLS, r = (i - c) / COLS;
        if (r < 1 || this.tileAt(c, r)) continue;
        this.setTile(c, r, { type: 'humus' });
        n++;
      }
      rep.humus = (rep.humus || 0) + n;
      for (const ch of this.chunks.values()) ch.ro = ch.rf = null;
      for (const rt of w.roots) this.replayRoot(rt);
      this.flushBake();
    }
    // 零碎死根：死根格子按八邻接连成块，不超过 SCRAP_CELLS 格的小块
    deadScraps() {
      const g = this.world.deadGrid, seen = new Set(), out = new Set();
      for (const id of this.world.dead) for (const i0 of this.world.cells[id]) {
        if (seen.has(i0) || !g[i0]) continue;
        const part = [i0];
        seen.add(i0);
        for (let k = 0; k < part.length; k++) {
          const i = part[k], c = i % COLS;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const j = i + dr * COLS + dc;
            if (c + dc < 0 || c + dc >= COLS || j < 0 || j >= g.length || seen.has(j) || !g[j]) continue;
            seen.add(j); part.push(j);
          }
        }
        if (part.length <= CFG.SCRAP_CELLS) for (const i of part) out.add(i);
      }
      return out;
    }
    cellIndex(x, y) {
      const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
      return c < 0 || c >= COLS || r < 0 || r >= ROWS ? -1 : r * COLS + c;
    }
    // 老根占据的格子 = 活着的植物根格子的并集（rootGrid）；死根的格子另记（deadGrid）
    rebuildRootGrid() {
      const w = this.world;
      w.rootGrid.fill(0); w.deadGrid.fill(0);
      for (const id in w.cells) { const g = w.dead.includes(+id) ? w.deadGrid : w.rootGrid; for (const i of w.cells[id]) g[i] = 1; }
    }
    dayTick(rep) {
      const w = this.world;
      w.night++;
      this.rotRoots(rep);
      const RF = G.rng(hash3(this.seed, w.night, 53));
      for (const p of w.plants) {
        rep.fell += this.dropRipe(p);
        rep.fruit += this.growFruit(p, RF);
      }
      // 空洞里被采走的植株慢慢长回来
      const RG = G.rng(hash3(this.seed, w.night, 91));
      for (const [c, r, id] of w.caveSpots) {
        const t = this.tileAt(c, r);
        if (t && t.type === 'cave' && RG() < CFG.CAVE_REGROW) this.setTile(c, r, { type: 'res', id, cave: true, ph: RG() * 6 });
      }
      for (const [c, r] of w.pools) if (!this.tileAt(c, r)) this.setTile(c, r, { type: 'res', id: 'water', ph: hash(c * 7 + r) * 6 });
      // 设计好的地图：矿物只在原来长矿的地方重新长出，不打乱分层
      const R = G.rng(hash3(this.seed, w.night, 77)), made = [...this.chunks.values()];
      if (this.design) {
        const empty = w.ores.filter(([c, r]) => !this.tileAt(c, r));
        for (let k = 0; k < CFG.ORE_PER_DAY && empty.length; k++) { const [c, r] = empty.splice(R.int(empty.length), 1)[0]; this.setTile(c, r, { type: 'res', id: 'ironOre', ph: R() * 6 }); }
        return;
      }
      // 矿物只在已经生成的分块里重新长出（不会为此去生成很深的地层）
      for (let k = 0, tries = 0; k < CFG.ORE_PER_DAY && tries < 300 && made.length; tries++) {
        const ch = made[R.int(made.length)], c = ch.cx * CS + R.int(CS), r = ch.cy * CS + R.int(CS);
        if (r < 3 || this.tileAt(c, r)) continue;
        this.setTile(c, r, { type: 'res', id: 'ironOre', ph: R() * 6 });
        k++;
      }
    }

    // 地表自由活动：镜头跟着小禾（由 main 每帧给出 selCamX / selCamY）
    enterSelect() {
      this.mode = 'select';
      this.running = false;
      this.show = null; this.treeObj = null;
      this.tips = []; this.particles = [];
      this.pickCol = -1; this.pickPlot = -1; this.curX = null;
    }

    // ---- 存档 ----
    // 只保存已经生成的分块（每块一串字符）；老根占据的格子保存为下标列表。每层各存一份
    serialize() {
      const cur = this.lv, levels = [];
      for (let i = 0; i < this.levels.length; i++) if (this.levels[i]) { this.setLevel(i); levels[i] = this.serializeLevel(); }
      this.setLevel(cur);
      return { cur, levels };
    }
    serializeLevel() {
      const w = this.world, chunks = {};
      for (const ch of this.chunks.values()) chunks[ch.cx + ',' + ch.cy] = ch.tiles.map(G.Strata.codeOf).join('');
      return {
        soil: w.soil, plants: w.plants.map(({ _tr, _spr, _sprB, _sprK, _fk, _sz, _szG, ...p }) => p),
        roots: w.roots, cells: w.cells, wither: w.wither, dead: w.dead, pid: w.pid, night: w.night, ladder: w.ladder, chunks,
        seeds: w.seeds.map(({ sp, x }) => ({ sp, x })), drops: w.drops.map(({ id, x }) => ({ id, x })),
        mail: w.mail.map(({ id, x }) => ({ id, x })),
      };
    }
    load(d) {
      this.levels = []; this.lv = undefined;
      d.levels.forEach((ld, i) => { if (ld) { this.setLevel(i); this.loadLevel(ld); } });
      this.setLevel(d.cur || 0);
    }
    loadLevel(d) {
      this.chunks = new Map();
      const w = this.world = { soil: d.soil, plants: d.plants, roots: d.roots, cells: d.cells, wither: d.wither, dead: d.dead, pid: d.pid, pools: [], caveSpots: [], ores: [], night: d.night, ladder: !!d.ladder, seeds: d.seeds, drops: d.drops, mail: d.mail, rootGrid: new Uint8Array(COLS * ROWS), deadGrid: new Uint8Array(COLS * ROWS) };
      this.levels[this.lv] = { world: w, chunks: this.chunks };
      for (const k in d.chunks) {
        const [cx, cy] = k.split(',').map(Number);
        const ch = this.chunk(cx, cy);
        if (ch) ch.tiles = [...d.chunks[k]].map((code, i) => G.Strata.tileOf(code, hash3(cx, cy, i) % 600 / 100));
      }
      this.rebuildRootGrid();
      for (const rt of w.roots) this.replayRoot(rt);
      this.flushBake();
    }

    // 按保存的路径与粗细重新画出老根。死根换成枯色；被肉苁蓉吃掉的格子上那一段不画，剩下的断成几截
    replayRoot(rt) {
      const p = rt.p, n = p.length / 2;
      if (n < 2) return;
      const pts = [];
      for (let i = 0; i < n; i++) pts.push([p[i * 2], p[i * 2 + 1]]);
      const st = (G.TREES[rt.sp] || {}).root || LEGACY_ROOT;
      let w = rt.w;
      if (!Array.isArray(w)) {
        const cum = cumOf(pts), L = cum[n - 1] || 1, w0 = Math.min(st.max, (rt.w || 4) * 0.8);
        w = cum.map(d => st.tip + (w0 - st.tip) * Math.pow((L - d) / L, 0.6));
      }
      const seed = hash(p[0] * 7.1 + p[1] * 13.7) * 100;
      if (!this.world.dead.includes(rt.pid)) { this.bakeRoot({ pts, w, st, branch: !!rt.b, old: true, seed }); return; }
      const dg = this.world.deadGrid, on = i => dg[this.cellIndex(pts[i][0], pts[i][1])];
      for (let i = 0; i < n;) {
        if (!on(i)) { i++; continue; }
        let j = i;
        while (j + 1 < n && on(j + 1)) j++;
        if (j > i) this.bakeRoot({ pts: pts.slice(i, j + 1), w: w.slice(i, j + 1), st, branch: !!rt.b, old: true, dead: true, seed });
        i = j + 1;
      }
    }
    // 只重画这些分块里的老根（吃掉死根后，被吃的那段从图上消失）
    redrawChunks(set) {
      for (const ch of set) if (ch.ro) for (const cv of [ch.ro, ch.rf]) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
      const hit = rt => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
        for (let k = 0; k < rt.p.length; k += 2) { x0 = Math.min(x0, rt.p[k]); x1 = Math.max(x1, rt.p[k]); y0 = Math.min(y0, rt.p[k + 1]); y1 = Math.max(y1, rt.p[k + 1]); }
        this.eachChunk(x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24, ch => { if (set.has(ch)) any = true; });
        return any;
      };
      for (const rt of this.world.roots) if (hit(rt)) this.replayRoot(rt);
      this.flushBake(set);
    }
    // 肉苁蓉的根尖钻到 (x, y)：以它为中心 EAT_SIZE×EAT_SIZE 格内的死根一起吃掉，每格时限 +EAT_DEAD_TIME 秒；被吃的那段根稍后从图上消失。
    // 每吃满 EAT_BRANCH 格，从这根根尖分出一条自己找死根的分支
    eatDead(t, x, y) {
      const w = this.world, N = CFG.EAT_SIZE;
      const c0 = Math.floor(x / TILE - (N - 1) / 2), r0 = Math.floor(y / TILE - (N - 1) / 2);
      let n = 0;
      for (let r = r0; r < r0 + N; r++) for (let c = c0; c < c0 + N; c++) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        const i = r * COLS + c;
        if (!w.deadGrid[i]) continue;
        w.deadGrid[i] = 0;
        for (const id of w.dead) { const a = w.cells[id], k = a ? a.indexOf(i) : -1; if (k >= 0) a.splice(k, 1); }
        this.burst(c * TILE + 4, r * TILE + 4, ['#6e5a48', '#9a8068', '#e0b878'], 3);
        n++;
      }
      if (!n) return;
      this.timeLeft += n * CFG.EAT_DEAD_TIME;
      this.popup(x, y, `+${n * CFG.EAT_DEAD_TIME}秒`, '#e8c890');
      if (!t.eatNoted) { t.eatNoted = true; this.popupAt(t, '吃掉死根·时限延长', '#f0d8a0'); }
      this.eachChunk(x - 40, y - 40, 80, 80, ch => this.deadDirty.add(ch));
      this.eaten += n;
      if (this.eaten >= CFG.EAT_BRANCH) {
        this.eaten -= CFG.EAT_BRANCH;
        if (this.tips.filter(o => o.alive && o.auto).length < CFG.MAX_BRANCH) {
          this.branch(t, 1);
          this.tips[this.tips.length - 1].deadSeek = true;
          this.popupAt(t, '吃饱了·分出新根', '#f0d8a0');
        }
      }
    }

    // ================= 新一局：在选定的列种下选定的植物 =================
    // row：从地下第几行开始长（试验场用；0 = 从地表）
    newRound(day, sp, col, row = 0) {
      this.mode = 'round';
      this.day = day;
      this.sp = sp;
      this.tree = G.TREES[sp];
      this.col = col;
      this.spawnX = col * TILE + TILE / 2;
      this.roundSeed = (Date.now() ^ (day * 7919)) >>> 0;
      const has = id => this.tree.traits.includes(id);
      this.rootStyle = this.tree.root;
      this.suit = this.suitInfo(sp, col);
      this.nutMul = has('fix') ? 1.2 : 1; // 根瘤：积攒的养分 +20%
      this.nutrients = this.suit.buff.food + G.campVal('manure');
      this.roundTime = this.suit.time;
      this.timeLeft = this.roundTime;
      this.stallT = 0; this.stallK = 1; // 缓时：剩余秒数与时限流逝的倍率
      this.baked = false;
      this.rockPenalty = has('tough') ? 1 : G.campVal('guard');

      this.visited = new Set();
      this.deadDirty = new Set(); this.redrawT = 0; // 吃掉死根后要重画的分块
      this.eaten = 0; // 肉苁蓉离下一次分枝已经吃了几格死根
      // 种植处清出起步空间
      for (let r = Math.max(0, row - 1); r <= row + 2; r++) for (let c = col - 1; c <= col + 1; c++) {
        const t = this.tileAt(c, r);
        if (t && (t.type === 'rock' || t.type === 'bedrock' || t.type === 'fire')) this.setTile(c, r, null);
      }
      this.elapsed = 0;
      this.pending = [];
      this.echoes = [];      // 毫升药剂的回响：倒入过程延迟重放的时间段
      this.harvest = {};
      this.terrain = {};     // 本局根系经过的特殊地层格数：{ clay, salt, fire }
      this.fruits = [];      // 树上结出的植物材料 id（收获时一次性结出）
      this.fruitRng = G.rng(this.roundSeed + 7);
      this.shown = 0;        // 树上已结出的果实数
      this.show = null;      // 收获动画状态
      this.treeObj = null;   // 收获时生成的树
      this.oreSpots = [];    // 地下挖到矿物的位置
      this.maxDepth = 0;
      this.particles = [];
      this.totalLen = 0;
      this.flash = 0;
      this.shake = 0;
      this.nextId = 1;
      this.lookX = 0; this.lookY = 36;
      const S = this.spawnX, Y = row ? row * TILE + TILE / 2 : 1;
      // 开局一条主根；分支由红柳根芽之类的分枝药剂长出
      this.branchSide = 1;
      this.tips = [Object.assign(this.makeTip(S, Y, DOWN), { main: true })];
      if (row) { this.maxDepth = Y; this.camY = Y - H / 2; this.camX = clamp(S - W / 2, -40, WORLD_W - W + 40); }
      this.running = true;
      // 破土
      this.dirt(S, 0, 18, 40);
      this.popup(S, -6, '破土!', '#ffe7a8', true);
      if (this.suit.level >= 2) this.popup(S, -18, `环境${this.suit.level >= 3 ? '极' : ''}恶劣：根速 ×${this.suit.speed} · 只有 ${this.roundTime} 秒`, '#ffb08a', true);
      else if (this.suit.level === 1) this.popup(S, -18, `环境勉强：根速 ×${this.suit.speed}`, '#f0d090');
      if (this.suit.buff.from.length) this.popup(S, -30, `${[...new Set(this.suit.buff.from)].join('、')}照顾：${G.buffText(this.suit.buff)}`, '#a8e070');
    }

    // vx/vy：平滑后的绘制位置（让 90° 转角画成圆弧）；ex/ey：已写入缓存的根段末端；path：供养分回流的路径
    makeTip(x, y, ang, parent = null) {
      return {
        id: this.nextId++, x, y, ang, alive: true, side: 1, speedT: 0, speedM: 1, breakT: 0, fireT: 0, pierceT: 0, slowT: 0, slowP: 1, avoidT: 0, avoidP: 1, seekT: 0, seekP: 1, seekCD: 0, seekTgt: null, avoidSide: 1, stun: 0, armed: [], tileKey: null,
        vx: x, vy: y, path: [[x, y]], parent, attach: parent ? parent.path.length - 1 : 0,
      };
    }

    // ================= 分块地图 =================
    chunk(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= NCX || cy >= NCY) return null;
      const k = cx + ',' + cy;
      let ch = this.chunks.get(k);
      if (!ch) { ch = this.genChunk(cx, cy); this.chunks.set(k, ch); }
      return ch;
    }

    tileAt(col, row) {
      if (row < 0) return null;
      if (col < 0 || col >= COLS || row >= ROWS) return EDGE;
      const cx = Math.floor(col / CS), cy = Math.floor(row / CS);
      return this.chunk(cx, cy).tiles[(row - cy * CS) * CS + (col - cx * CS)];
    }

    setTile(col, row, v) {
      if (row < 0 || col < 0 || col >= COLS || row >= ROWS) return;
      const cx = Math.floor(col / CS), cy = Math.floor(row / CS), ch = this.chunk(cx, cy);
      const i = (row - cy * CS) * CS + (col - cx * CS), old = ch.tiles[i];
      ch.tiles[i] = v;
      // 只有静态地层（空洞、黏土、盐碱、营养土）变了才要重画分块缓存；矿物、岩石、露水、熔岩每帧单独画
      const kind = t => !t ? '' : t.cave || t.type === 'cave' ? 'cave' : t.type === 'clay' || t.type === 'salt' || t.type === 'ice' || t.type === 'humus' ? t.type : '';
      if (kind(old) === kind(v) && !(old && old.type === 'rock') && !(v && v.type === 'rock')) return;
      // 岩石底下垫着周围的地（见 render.js 的 groundKind），岩石或静态地块变了，挨着的分块也要重画
      for (const dc of [-3, 0, 3]) for (const dr of [-3, 0, 3]) {
        const C = col + dc, R = row + dr;
        if (C < 0 || C >= COLS || R < 0 || R >= ROWS) continue;
        const n = this.chunks.get(Math.floor(C / CS) + ',' + Math.floor(R / CS));
        if (n) n.dirty = true;
      }
    }


    cellAt(x, y) { return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)); }

    genChunk(cx, cy) {
      if (this.design) return this.designChunk(cx, cy);
      const R = G.rng(hash3(this.seed, cx, cy));
      const tiles = new Array(CS * CS).fill(null);
      const row0 = cy * CS, col0 = cx * CS;
      const reserved = (c, r) => row0 + r < 3; // 地表下面三行留空：近地表干净，不挤满石头和矿
      const gen = this.L.gen; // 每层的地下各不相同：岩石、盐碱、冻土、空洞的多少
      const free = (c, r) => c >= 0 && c < CS && r >= 0 && r < CS && !tiles[r * CS + c] && !reserved(c, r);
      const adj = (c, r, type) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nc = c + dx, nr = r + dy;
        return nc >= 0 && nc < CS && nr >= 0 && nr < CS && tiles[nr * CS + nc] && tiles[nr * CS + nc].type === type;
      });
      const depth = Math.min(6, cy);
      // 空洞：从第二层分块起才有，一块 0~2 个，横向蜿蜒；不跨分块（四周留 1 格）
      const caves = [];
      if (cy >= 1) {
        const n = (R() < 0.7 * gen.caves ? 1 : 0) + (cy >= 3 && R() < 0.45 * gen.caves ? 1 : 0) + (gen.caves > 1.5 && R() < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          let x = 3 + R() * (CS - 6), y = 3 + R() * (CS - 6), a = R() * TAU;
          const cells = [];
          for (let i = 0, len = 5 + R.int(8); i < len; i++) {
            const rad = 1 + R() * 1.2;
            for (let r = Math.floor(y - rad); r <= y + rad; r++) for (let c = Math.floor(x - rad * 1.5); c <= x + rad * 1.5; c++) {
              if (c < 1 || c >= CS - 1 || r < 1 || r >= CS - 1 || tiles[r * CS + c] || reserved(c, r)) continue;
              if (((c + 0.5 - x) / 1.5) ** 2 + (r + 0.5 - y) ** 2 > rad * rad) continue;
              tiles[r * CS + c] = { type: 'cave' };
              cells.push([c, r]);
            }
            a += (R() - 0.5) * 1.3; x = clamp(x + Math.cos(a) * 1.7, 2, CS - 3); y = clamp(y + Math.sin(a) * 0.8, 2, CS - 3);
          }
          if (cells.length) caves.push(cells);
        }
      }
      // 成片地块：圆角矩形的露水池 / 熔岩池，四周留 1 格土，不与其它东西粘连
      const patch = (cell, minW, maxW, minH, maxH, minRow) => {
        for (let tries = 0; tries < 40; tries++) {
          const w = minW + R.int(maxW - minW + 1), h = minH + R.int(maxH - minH + 1);
          const c0 = R.int(CS - w + 1), r0 = minRow + R.int(CS - h - minRow + 1);
          let ok = true;
          for (let r = r0 - 1; r <= r0 + h && ok; r++) for (let c = c0 - 1; c <= c0 + w && ok; c++) {
            const inside = c >= 0 && c < CS && r >= 0 && r < CS;
            if (inside && !free(c, r)) ok = false;
          }
          if (!ok) continue;
          for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
            const corner = (c === c0 || c === c0 + w - 1) && (r === r0 || r === r0 + h - 1);
            if (corner && w > 2 && h > 2 && R() < 0.7) continue; // 削圆角
            tiles[r * CS + c] = cell();
          }
          return;
        }
      };
      // 熔岩池：地表附近没有，越深越多越大
      const pools = Math.floor((cy === 0 ? 1 : 1 + (R() < 0.5 ? 1 : 0) + (cy > 2 ? 1 : 0)) * gen.lava + R() * 0.5);
      for (let k = 0; k < pools; k++) patch(() => ({ type: 'fire' }), 3, cy > 2 ? 6 : 4, 2, cy > 2 ? 4 : 3, cy === 0 ? 8 : 0);
      // 露水池：每块 1~2 片
      for (let k = 0, n = Math.round((1 + (R() < 0.6 ? 1 : 0)) * gen.water); k < n; k++) {
        patch(() => ({ type: 'res', id: 'water', ph: R() * 6 }), 2, 4, 2, 3, cy === 0 ? 3 : 0);
      }
      // 黏土层（减速）与盐碱层（吸养分）：盐碱越往沙漠深处越多
      // 扁扁的透镜状一层：椭圆内、且没被占用的格子
      const lens = (type, rw, rh, minRow) => {
        const x = 2 + R() * (CS - 4), y = minRow + 1 + R() * (CS - minRow - 2), a = rw[0] + R() * (rw[1] - rw[0]), b = rh[0] + R() * (rh[1] - rh[0]);
        for (let r = Math.floor(y - b); r <= y + b; r++) for (let c = Math.floor(x - a); c <= x + a; c++) {
          if (r < minRow || ((c + 0.5 - x) / a) ** 2 + ((r + 0.5 - y) / b) ** 2 > 1 || !free(c, r)) continue;
          tiles[r * CS + c] = { type };
        }
      };
      for (let k = 0, n = (R() < 0.6 * gen.clay ? 1 : 0) + (cy > 1 && R() < 0.4 * gen.clay ? 1 : 0); k < n; k++) lens('clay', [2.5, 4.5], [1, 1.8], cy === 0 ? 3 : 0);
      for (let k = 0, n = (R() < 0.35 * gen.salt ? 1 : 0) + (R() < 0.2 * gen.salt ? 1 : 0); k < n; k++) lens('salt', [2, 3.5], [0.8, 1.3], cy === 0 ? 2 : 0);
      // 冻土：高山草甸的地下一层层冻住的土，和黏土一样拖慢根
      for (let k = 0, n = (R() < 0.6 * gen.ice ? 1 : 0) + (R() < 0.45 * gen.ice ? 1 : 0); k < n; k++) lens('ice', [3, 5.5], [1, 2], cy === 0 ? 2 : 0);
      // 岩石团：越深越多
      for (let k = 0, n = Math.round((4 + Math.ceil(depth * 0.6)) * gen.rock); k < n; k++) {
        let c = R.int(CS), r = (cy === 0 ? 2 : 0) + R.int(cy === 0 ? CS - 2 : CS);
        for (let i = 0, len = 2 + R.int(5); i < len; i++) {
          if (free(c, r) && !adj(c, r, 'fire') && !adj(c, r, 'res')) tiles[r * CS + c] = { type: 'rock' }; // 不贴着地块
          const [dx, dy] = R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
          c += dx; r += dy;
        }
      }
      // 资源：反应材料在深处更常见
      const place = (id, minRow, near) => {
        for (let tries = 0; tries < 200; tries++) {
          const c = R.int(CS), r = minRow + R.int(CS - minRow);
          if (!free(c, r) || (near && !adj(c, r, near))) continue;
          tiles[r * CS + c] = { type: 'res', id, ph: R() * 6 };
          return;
        }
      };
      const top = cy === 0 ? 1 : 0;
      // 地下只有矿物与露水（上面的露水池）；植物材料由树结出
      const plan = [['ironOre', 2, top, 'rock'], ['ironOre', Math.min(2, 0.5 + cy * 0.3), top]];
      for (const [id, n, minRow, near] of plan) {
        const count = Math.floor(n) + (R() < n % 1 ? 1 : 0);
        for (let i = 0; i < count; i++) place(id, minRow, near);
      }
      // 空洞地面上长着植株：浅处多羊齿蕨，越深灰烬苔越多
      const flora = row => R() < (row < 40 ? 0.7 : row < 72 ? 0.5 : 0.3) ? 'fern' : 'ashMoss';
      for (const cells of caves) {
        const floor = cells.filter(([c, r]) => { const b = tiles[(r + 1) * CS + c]; return !b || b.type !== 'cave'; });
        for (let i = 0, n = Math.min(floor.length, 1 + (cells.length > 12 ? 1 : 0) + (R() < 0.5 ? 1 : 0)); i < n; i++) {
          const [c, r] = floor.splice(R.int(floor.length), 1)[0], id = flora(row0 + r);
          tiles[r * CS + c] = { type: 'res', id, cave: true, ph: R() * 6 };
          this.world.caveSpots.push([col0 + c, row0 + r, id]);
        }
      }
      // 记下露水池的位置，每天夜里泉水会重新渗满
      tiles.forEach((t, i) => { if (t && t.id === 'water') this.world.pools.push([col0 + i % CS, row0 + Math.floor(i / CS)]); });
      return { cx, cy, tiles, bg: null, ro: null, rf: null };
    }
    // 设计好的地图：直接照抄；记下露水池、空洞植株、矿的位置，夜里在原处长回来
    designChunk(cx, cy) {
      const tiles = new Array(CS * CS), w = this.world;
      for (let r = 0; r < CS; r++) for (let c = 0; c < CS; c++) {
        const C = cx * CS + c, Rw = cy * CS + r, t = G.Strata.tileOf(this.design[Rw * COLS + C], hash3(C, Rw, 5) % 600 / 100);
        tiles[r * CS + c] = t;
        if (!t || t.type !== 'res') continue;
        if (t.id === 'page') continue; // 残页拿走就没了，不会长回来
        if (t.cave) w.caveSpots.push([C, Rw, t.id]);
        else (t.id === 'water' ? w.pools : w.ores).push([C, Rw]);
      }
      return { cx, cy, tiles, bg: null, ro: null, rf: null };
    }



    // ================= 药剂 =================
    // 一次性药剂：点一下，所有指令立即（或延迟）生效一次
    usePotion(potion) {
      if (!this.running) return false;
      const cols = potion.instructions.map(i => G.ACTIONS[i.action].color);
      for (const t of this.aliveTips()) this.burst(t.x, t.y, cols, 4);
      const kit = {};
      for (const ins of potion.instructions) if (ins.toBranch) kit[ins.action] = Math.max(kit[ins.action] || 0, ins.power || 1);
      for (const ins of potion.instructions) if (!ins.toBranch) this.schedule(ins.action === 'branch' ? { ...ins, kit } : ins, potion.name);
      return true;
    }

    schedule(ins, label) {
      if (ins.delay > 0) this.pending.push({ ins, at: this.elapsed + ins.delay, label });
      else this.activate(ins);
    }

    aliveTips() { return this.tips.filter(t => t.alive); }

    // 药剂只作用于主根，分支是自主的；遇障触发也挂在主根上。kit：分枝药剂交给新分支的避障 / 寻宝档次
    activate(ins) {
      const p = ins.power || 1, main = this.mainTip();
      if (!main) return;
      if (ins.trigger === 'hit') main.armed.push([ins.action, p, ins.kit]);
      else this.applyAction(main, ins.action, p, ins.kit);
    }

    mainTip() { return this.tips.find(t => t.alive && t.main) || null; }

    // 一次性剂量：转向 90°，加速 / 破障 / 防火 / 穿行持续 SHOT_DUR 秒（档次越高越久）
    applyAction(t, a, p = 1, kit) {
      if (!t.alive) return;
      const dur = G.durOf(p);
      switch (a) {
        case 'turnL': t.ang += QUARTER; break;
        case 'turnR': t.ang -= QUARTER; break;
        case 'speed': t.speedM = Math.max(t.speedT > 0 ? t.speedM : 1, G.speedOf(p)); t.speedT = Math.min(15, t.speedT + dur); break;
        case 'break': t.breakT = Math.min(15, t.breakT + dur); break;
        case 'fire': t.fireT = Math.min(15, t.fireT + dur); break;
        case 'pierce': t.pierceT = Math.min(15, t.pierceT + dur); break;
        case 'slow': case 'avoid': case 'seek': this.autoOn(t, a, p, Math.min(15, t[AUTO_KEY[a] + 'T'] + dur)); break;
        case 'stall': this.slowTime(p, dur); break;
        case 'branch': this.branch(t, p, kit); break;
      }
    }
    // 缓时：T 秒内时限按 stallOf(p) 的倍率流逝（同时有几份时取更慢的）
    slowTime(p, T) {
      const k = G.stallOf(p);
      this.stallK = this.stallT > 0 ? Math.min(this.stallK, k) : k;
      this.stallT = Math.max(this.stallT, T);
    }
    // 缓行 / 避障 / 寻宝：根尖上的持续状态，档次取更高的
    autoOn(t, a, p, T) {
      const k = AUTO_KEY[a];
      t[k + 'P'] = t[k + 'T'] > 0 ? Math.max(t[k + 'P'], p) : p;
      t[k + 'T'] = T;
    }
    // 积攒养分（根瘤加成）；col：零散的大笔收入在计分板上飘字
    gain(n, col) {
      const v = n * this.nutMul;
      this.nutrients += v;
      if (col) G.emit('nutPop', { v, col });
    }

    // 毫升药剂：按住期间每帧调用，效果只在倒入时持续
    pourStart(potion) {
      potion.segs = potion.instructions.filter(i => i.delay > 0)
        .map(ins => { const sg = { ins, start: this.elapsed + ins.delay, end: Infinity, started: false }; this.echoes.push(sg); return sg; });
    }

    echoStart(sg) { sg.started = true; G.sfx('trigger'); }

    pourTick(potion, dt) {
      for (const ins of potion.instructions) if (!(ins.delay > 0)) this.pourIns(ins, dt);
    }

    pourEnd(potion) {
      for (const sg of potion.segs || []) sg.end = Math.min(sg.end, this.elapsed + sg.ins.delay);
      potion.segs = null;
    }

    turnK() { return CFG.TURN_TIER[this.tree.tier]; } // 越大的树根越难弯

    // 目标同样在生效时才确定
    pourIns(ins, dt) {
      const a = ins.action, p = ins.power || 1, hold = CFG.POUR_HOLD, turn0 = CFG.TURN_RATE * G.potK(p) * this.turnK() * Math.PI / 180 * dt;
      if (a === 'stall') this.slowTime(p, hold);
      const main = this.mainTip();
      for (const t of main ? [main] : []) {
        const turn = turn0 * (t.slowT > 0 ? G.slowTurnOf(t.slowP) : 1); // 缓行时转向更急
        switch (a) {
          case 'turnL': t.ang += turn; break;
          case 'turnR': t.ang -= turn; break;
          case 'slow': case 'avoid': case 'seek': this.autoOn(t, ins.action, p, Math.max(t[AUTO_KEY[ins.action] + 'T'], hold)); break;
          case 'speed': t.speedM = Math.max(t.speedT > 0 ? t.speedM : 1, G.speedOf(p)); t.speedT = Math.max(t.speedT, hold); break;
          case 'break': t.breakT = Math.max(t.breakT, hold); break;
          case 'fire': t.fireT = Math.max(t.fireT, hold); break;
          case 'pierce': t.pierceT = Math.max(t.pierceT, hold); break;
        }
        if (Math.random() < dt * 14) this.burst(t.x, t.y - 1, [G.ACTIONS[ins.action].color, '#ffffff'], 1);
      }
    }

    // 分枝：从主根当前位置长出自主分支，朝主根偏 BRANCH_ANG（左右交替）笔直生长，不受之后的药剂影响
    // kit：终身带着的避障 / 寻宝档次（和分枝同瓶的绕石须、沙枣花）
    branch(t, k = 1, kit = {}) {
      let n = 0;
      for (; n < k && this.tips.filter(o => o.alive && o.auto).length < CFG.MAX_BRANCH; n++) {
        t.path.push([t.vx, t.vy]); // 记下分叉点，养分回流时从这里汇入主根
        const b = this.makeTip(t.x, t.y, t.ang + this.branchSide * CFG.BRANCH_ANG, t);
        this.branchSide = -this.branchSide;
        Object.assign(b, { auto: true, tileKey: t.tileKey });
        if (kit.avoid) { b.avoidT = Infinity; b.avoidP = kit.avoid; }
        if (kit.seek) { b.seekT = Infinity; b.seekP = kit.seek; }
        this.tips.push(b);
      }
      if (!n) { this.popupAt(t, '分支已满', '#ccc'); return; }
      this.dirt(t.x, t.y, 6, 25);
      G.sfx('branch');
    }

    // 飘字、特效的落点：最深的那根
    leadTip() {
      let b = null;
      for (const t of this.tips) if (t.alive && (!b || t.y > b.y)) b = t;
      return b;
    }

    // ================= 更新 =================
    update(dt) {
      this.clock += dt;
      this.updateParticles(dt);
      this.updateCamera(dt);
      this.updateBird(dt);
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
      if (this.show) { this.updateShow(dt); return; }
      if (!this.running) return;

      this.elapsed += dt;
      const before = Math.ceil(this.timeLeft);
      if (!this.infTime) this.timeLeft -= dt * (this.stallT > 0 ? this.stallK : 1); // infTime：试验场的无限时间
      if (this.stallT > 0) this.stallT = Math.max(0, this.stallT - dt); // 胡杨泪：时限流逝变慢
      if (this.timeLeft <= 5 && this.timeLeft > 0 && Math.ceil(this.timeLeft) !== before) G.sfx('tick');
      if (this.deadDirty.size && (this.redrawT -= dt) <= 0) { this.redrawT = 0.25; this.redrawChunks(this.deadDirty); this.deadDirty = new Set(); }

      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        if (this.elapsed >= p.at) {
          this.pending.splice(i, 1);
          G.sfx('trigger');
          this.activate(p.ins);
        }
      }
      // 毫升药剂的回响：在对应时间段内重放倒入效果
      for (const sg of this.echoes) {
        if (this.elapsed < sg.start) continue;
        if (!sg.started) this.echoStart(sg);
        const a = Math.max(this.elapsed - dt, sg.start), b = Math.min(this.elapsed, sg.end);
        if (b > a) this.pourIns(sg.ins, b - a);
      }
      this.echoes = this.echoes.filter(sg => this.elapsed < sg.end);

      for (const t of this.tips.slice()) {
        if (!t.alive) continue;
        t.speedT = Math.max(0, t.speedT - dt);
        t.breakT = Math.max(0, t.breakT - dt);
        t.fireT = Math.max(0, t.fireT - dt);
        t.pierceT = Math.max(0, t.pierceT - dt);
        t.slowT = Math.max(0, t.slowT - dt);
        t.avoidT = Math.max(0, t.avoidT - dt);
        t.seekT = Math.max(0, t.seekT - dt);
        this.stepTip(t, dt);
      }

      if (this.timeLeft <= 0) this.end('时间到');
      else if (!this.tips.some(t => t.alive)) this.end('所有根尖都停止了生长');
    }

    updateCamera(dt) {
      if (this.show) return; // 收获动画自己控制镜头
      if (this.mode === 'select') {
        // 地块光标滑向选中的地块（离得太远就直接跳过去）
        if (this.pickPlot >= 0) {
          const tx = this.pickPlot * PLOT_W * TILE;
          this.curX = this.curX === null || Math.abs(tx - this.curX) > PLOT_W * TILE * 2 ? tx : this.curX + (tx - this.curX) * (1 - Math.exp(-22 * dt));
        }
        const k = 1 - Math.exp(-6 * dt);
        this.camX += (this.selCamX - this.camX) * k;
        this.camY += (this.selCamY - this.camY) * (1 - Math.exp(-4 * dt));
        return;
      }
      let tx = this.spawnX - W / 2, ty = -SKY;
      // 镜头只跟主根：分支长到哪都不抢画面，出屏的分支由边缘标记指示
      const t = this.running ? this.mainTip() : null;
      if (t) {
        // 前瞻：朝主根朝向偏一点，单独缓慢过渡，转向后镜头平滑地转过去而不是猛地一甩
        const kl = 1 - Math.exp(-1.2 * dt);
        this.lookX += (Math.cos(t.ang) * 36 - this.lookX) * kl;
        this.lookY += (Math.sin(t.ang) * 36 - this.lookY) * kl;
        // 死区：关注点只有离开屏幕中心一定距离后，镜头才开始跟随
        const ox = t.x + this.lookX - (this.camX + W / 2), oy = t.y + this.lookY - (this.camY + H / 2);
        tx = this.camX + (Math.abs(ox) > CAM_DZ_X ? ox - Math.sign(ox) * CAM_DZ_X : 0);
        ty = this.camY + (Math.abs(oy) > CAM_DZ_Y ? oy - Math.sign(oy) * CAM_DZ_Y : 0);
        // 主根尖始终留在画面内（离边缘留 CAM_M）
        tx = clamp(tx, t.x + CAM_M - W, t.x - CAM_M);
        ty = Math.max(-SKY, clamp(ty, t.y + CAM_M - H, t.y - CAM_M));
      }
      tx = clamp(tx, -40, WORLD_W - W + 40);
      ty = Math.min(ty, ROWS * TILE - H + 8);
      const k = 1 - Math.exp(-(this.running ? 5 : 2.2) * dt);
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
    }

    stepTip(t, dt) {
      if (t.stun > 0) { t.stun -= dt; return; }
      let mult = (t.speedT > 0 ? t.speedM : 1) * this.suit.speed;
      if (this.tree.traits.includes('deep') && Math.sin(t.ang) > 0.5) mult *= 1.3;
      if (t.slowT > 0) mult *= CFG.SLOW_MULT;
      this.autoGrow(t, dt);
      const pierce = t.pierceT > 0;
      // 老根、死根：可以穿过，但会减速（肉苁蓉直接吃掉死根，不减速）
      const oc = Math.floor(t.x / TILE), or = Math.floor(t.y / TILE), gi = this.cellIndex(t.x, t.y);
      if (!pierce && gi >= 0 && this.world.rootGrid[gi]) {
        mult *= CFG.OLD_ROOT_SLOW;
        if (!t.slowNoted) { t.slowNoted = true; this.popupAt(t, '穿过老根·减速', '#e8cfa0'); }
      } else if (!pierce && gi >= 0 && this.world.deadGrid[gi] && !this.tree.parasite) {
        mult *= CFG.OLD_ROOT_SLOW;
        if (!t.deadNoted) { t.deadNoted = true; this.popupAt(t, '穿过死根·减速', '#c8b8a0'); }
      }
      // 地层：空洞里悬空生长（变慢、慢慢下垂），黏土减速，盐碱吸走积攒的养分
      const here = this.tileAt(oc, or);
      if (here && here.type === 'cave' && !pierce) {
        mult *= CFG.CAVE_SLOW;
        const da = DOWN - wrapAng(t.ang);
        t.ang += clamp(da, -1, 1) * 0.9 * dt;
        if (!t.caveNoted) { t.caveNoted = true; this.popupAt(t, '悬空·下垂', '#d8c8b0'); }
      } else if (here && here.type === 'clay' && !pierce) {
        mult *= CFG.CLAY_SLOW;
        if (!t.clayNoted) { t.clayNoted = true; this.popupAt(t, '黏土·减速', '#d9a07a'); }
      } else if (here && here.type === 'ice' && !pierce) {
        mult *= CFG.CLAY_SLOW;
        if (!t.iceNoted) { t.iceNoted = true; this.popupAt(t, '冻土·减速', '#c8e0f0'); }
      } else if (here && here.type === 'salt') {
        this.nutrients = Math.max(0, this.nutrients - CFG.SALT_DRAIN * dt);
        if (!t.saltNoted) { t.saltNoted = true; this.popupAt(t, '盐碱·吸走养分', '#f0f0f0'); }
      }

      let dist = CFG.BASE_SPEED * mult * dt;
      if (Math.random() < 0.35 && !(here && here.type === 'cave')) this.dirt(t.x, t.y, 1, 14);
      while (dist > 0 && t.alive) {
        const [dx, dy] = dirOf(t);
        const s = Math.min(0.5, dist);
        const nx = t.x + dx * s, ny = t.y + dy * s;
        if (ny < 1) { this.kill(t, '钻出了地面'); break; }
        // 挂载的遇障效果会提前感知前方障碍，让自动转向有机会真正避开
        if (t.armed.length) {
          const ahead = this.cellAt(nx + dx * 5, ny + dy * 5);
          if (ahead && this.blocks(t, ahead)) { this.triggerArmed(t); continue; }
        }
        const col = Math.floor(nx / TILE), row = Math.floor(ny / TILE);
        const key = col + ',' + row;
        if (key !== t.tileKey) {
          const cell = this.tileAt(col, row);
          if (cell && (cell.type === 'rock' || cell.type === 'bedrock' || cell.type === 'fire' || cell.type === 'edge')) {
            if (!this.obstacle(t, cell, col, row)) break;
          } else {
            this.visited.add(row * COLS + col);
            if (this.tree.parasite) this.eatDead(t, nx, ny);
            if (cell && (cell.type === 'clay' || cell.type === 'salt' || cell.type === 'ice')) this.terrain[cell.type] = (this.terrain[cell.type] || 0) + 1;
            if (cell && cell.type === 'res') this.collect(t, cell, col, row);
            if (cell && cell.type === 'humus') this.eatHumus(t, col, row);
            if (!cell || cell.type !== 'cave') { this.digTile(col, row, nx, ny); this.dirt(nx, ny, 3, 20); }
          }
          t.tileKey = key;
        }
        t.x = nx; t.y = ny;
        dist -= s;
        this.totalLen += s;
        this.gain(s * CFG.NUT_GROW);
        if (ny > this.maxDepth) { this.gain((ny - this.maxDepth) * CFG.NUT_DEPTH); this.maxDepth = ny; }
        this.plot(t, s);
      }
    }

    // ================= 后期的自动生长：避障 / 寻宝（药剂效果或植物天生的特性） =================
    autoLv(t, id) {
      const k = AUTO_KEY[id], pot = t[k + 'T'] > 0 ? t[k + 'P'] : 0;
      return Math.max(pot, this.tree.traits.includes(id) ? 1 : 0);
    }

    autoGrow(t, dt) {
      const seek = this.autoLv(t, 'seek'), avoid = this.autoLv(t, 'avoid');
      if (seek) this.steerSeek(t, seek, dt);
      if (t.deadSeek) this.steerDead(t, dt);
      if (avoid) this.steerAvoid(t, avoid, dt); // 避障排在后面，优先保命
    }

    // 肉苁蓉吃饱分出的分支：每 0.3 秒找一次 DEAD_SEEK 格内最近的死根（不回头找身后的），朝它拐过去
    steerDead(t, dt) {
      if ((t.seekCD -= dt) <= 0) {
        t.seekCD = 0.3;
        const R = CFG.DEAD_SEEK, c0 = Math.floor(t.x / TILE), r0 = Math.floor(t.y / TILE), g = this.world.deadGrid;
        const [fx, fy] = dirOf(t);
        let best = null, bd = Infinity;
        for (let r = Math.max(0, r0 - R); r <= Math.min(ROWS - 1, r0 + R); r++) for (let c = Math.max(0, c0 - R); c <= Math.min(COLS - 1, c0 + R); c++) {
          if (!g[r * COLS + c]) continue;
          const x = c * TILE + 4 - t.x, y = r * TILE + 4 - t.y, d = Math.hypot(x, y);
          if (d > R * TILE || (x * fx + y * fy) / (d || 1) < -0.3) continue;
          if (d < bd) { bd = d; best = [c * TILE + 4, r * TILE + 4]; }
        }
        t.seekTgt = best;
      }
      if (!t.seekTgt) return;
      const want = Math.atan2(t.seekTgt[1] - t.y, t.seekTgt[0] - t.x);
      const da = Math.atan2(Math.sin(want - t.ang), Math.cos(want - t.ang));
      const k = CFG.AUTO_TURN * this.turnK() * dt;
      t.ang += clamp(da, -k, k);
    }


    // 沿某个方向看出去 len 远，是否会撞上挡路的东西
    rayBlocked(t, ang, len) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let d = 3; d <= len; d += 3) {
        const x = t.x + dx * d, y = t.y + dy * d;
        if (y < 2) return true;
        const cell = this.cellAt(x, y);
        if (cell && this.blocks(t, cell)) return true;
      }
      return false;
    }

    steerAvoid(t, lv, dt) {
      const len = TILE * (1.5 + 1.2 * lv);
      if (!this.rayBlocked(t, t.ang, len)) return;
      // 找偏离最小的一条通路；两边都通时沿用上次绕行的方向
      let side = 0;
      for (const off of [0.45, 0.9, 1.4, 1.9]) {
        if (!this.rayBlocked(t, t.ang + off * t.avoidSide, len)) { side = t.avoidSide; break; }
        if (!this.rayBlocked(t, t.ang - off * t.avoidSide, len)) { side = -t.avoidSide; break; }
      }
      if (!side) side = t.avoidSide;
      t.avoidSide = side;
      t.ang += side * CFG.AUTO_TURN * (1 + 0.3 * (lv - 1)) * this.turnK() * dt;
      if (!t.avoidNoted) { t.avoidNoted = true; this.popupAt(t, '察觉岩石·绕行', '#c4d0e0'); }
    }

    steerSeek(t, lv, dt) {
      if ((t.seekCD -= dt) <= 0) {
        t.seekCD = 0.3;
        const R = G.seekOf(lv), c0 = Math.floor(t.x / TILE), r0 = Math.floor(t.y / TILE);
        const [fx, fy] = dirOf(t);
        let best = null, bd = Infinity;
        for (let r = r0 - R; r <= r0 + R; r++) for (let c = c0 - R; c <= c0 + R; c++) {
          const cell = this.tileAt(c, r);
          if (!cell || cell.type !== 'res') continue;
          const x = c * TILE + 4 - t.x, y = r * TILE + 4 - t.y, d = Math.hypot(x, y);
          if (d > R * TILE || (x * fx + y * fy) / (d || 1) < -0.3) continue; // 不回头找身后的
          if (d < bd) { bd = d; best = [c * TILE + 4, r * TILE + 4]; }
        }
        if (best && (!t.seekTgt || best[0] !== t.seekTgt[0] || best[1] !== t.seekTgt[1])) this.popupAt(t, '嗅到了什么…', '#9fe0c8');
        t.seekTgt = best;
      }
      if (!t.seekTgt) return;
      const want = Math.atan2(t.seekTgt[1] - t.y, t.seekTgt[0] - t.x);
      const da = Math.atan2(Math.sin(want - t.ang), Math.cos(want - t.ang));
      const k = CFG.AUTO_TURN * 0.6 * (1 + 0.3 * (lv - 1)) * this.turnK() * dt;
      t.ang += clamp(da, -k, k);
    }

    blocks(t, cell) {
      return cell.type === 'edge' || ((cell.type === 'rock' || cell.type === 'bedrock') && t.breakT <= 0) || (cell.type === 'fire' && t.fireT <= 0);
    }

    triggerArmed(t) {
      const acts = t.armed.splice(0);
      G.sfx('trigger');
      for (const [a, p, kit] of acts) this.applyAction(t, a, p, kit);
    }

    // 返回 true 表示根尖可以进入该格
    obstacle(t, cell, col, row) {
      // 分支撞到挡路的东西就停下：不扣时间、不停顿（有防火时照样穿过熔岩）
      if (t.auto && !(cell.type === 'fire' && t.fireT > 0)) { this.kill(t, '分支停下了'); return false; }
      if (this.blocks(t, cell) && t.armed.length) {
        const ang0 = t.ang;
        this.triggerArmed(t);
        if (this.blocks(t, cell) && t.ang !== ang0) return false; // 转向避开了障碍
      }
      if (cell.type === 'edge') { this.kill(t, '撞上了崖壁'); return false; }
      const cx = col * TILE + 4, cy = row * TILE + 4;
      // 基岩：分层之间的屏障，硬撞撞不开，只有破障能钻过去
      if (cell.type === 'bedrock') {
        if (t.breakT > 0) {
          this.setTile(col, row, null);
          this.burst(cx, cy, ['#4a4452', '#8a8494', '#2a2630'], 16);
          this.digTile(col, row, t.x, t.y);
          G.sfx('smash');
          return true;
        }
        this.shake = 0.3;
        this.burst(t.x, t.y, ['#4a4452', '#8a8494'], 8);
        this.kill(t, '基岩：要破障才能钻过去');
        G.sfx('rock');
        return false;
      }
      if (cell.type === 'rock') {
        this.setTile(col, row, null);
        this.burst(cx, cy, ['#8f857a', '#c9c0b4', '#6b6259'], 14);
        this.digTile(col, row, t.x, t.y);
        if (t.breakT > 0) { G.sfx('smash'); return true; }
        // 硬撞：击碎岩石，但大幅扣除时间
        this.timeLeft -= this.rockPenalty;
        t.stun = CFG.ROCK_STUN;
        this.shake = 0.3; this.flash = 0.25;
        this.popupAt(t, `-${this.rockPenalty}秒`, '#ff5d5d', true);
        G.sfx('rock');
        G.emit('event', 'rock');
        return false;
      }
      if (t.fireT > 0) { this.terrain.fire = (this.terrain.fire || 0) + 1; return true; }
      this.burst(t.x, t.y, ['#e8592a', '#ffb347', '#3a2a22'], 12);
      this.kill(t, '烧焦了');
      G.sfx('burn');
      G.emit('event', 'burn');
      return false;
    }

    // 营养土：根钻过就吸收，多积攒一点养分
    eatHumus(t, col, row) {
      this.setTile(col, row, null);
      this.gain(CFG.HUMUS_NUT, '#a8c060');
      this.burst(col * TILE + 4, row * TILE + 4, ['#5a3a22', '#8a6a3a', '#a8c060'], 4);
      if (!t.humusNoted) { t.humusNoted = true; this.popupAt(t, '营养土·吸收养分', '#c8e08a'); }
    }

    collect(t, cell, col, row) {
      this.setTile(col, row, cell.cave ? { type: 'cave' } : null);
      const cx = col * TILE + 4, cy = row * TILE + 4;
      if (cell.id === 'water') {
        const nut = CFG.NUT_WATER, sec = G.campVal('dewRoot');
        this.gain(nut, '#8fd0ff');
        this.timeLeft += sec;
        this.popup(cx, cy, `+${Math.round(nut * this.nutMul)}养分 +${sec}秒`, '#8fd0ff');
        this.burst(cx, cy, ['#7fb5cf', '#e0f2ff'], 8);
        G.sfx('water');
        return;
      }
      if (cell.id === 'page') {
        const sp = G.Pages.find(pageNo(this.design, col, row));
        this.popup(cx, cy, `手札残页 · ${G.TREES[sp].name}种子的配方`, '#fee1b8');
        this.burst(cx, cy, ['#fee1b8', '#ffffff'], 10);
        G.sfx('collect');
        return;
      }
      this.gain(CFG.NUT_MAT, '#fee761');
      this.harvest[cell.id] = (this.harvest[cell.id] || 0) + 1;
      this.oreSpots.push({ id: cell.id, x: cx, y: cy });
      this.popup(cx, cy, `+${G.MATERIALS[cell.id].name} +${Math.round(CFG.NUT_MAT * this.nutMul)}养分`, '#fff2a8');
      this.burst(cx, cy, [G.MAT_COLOR[cell.id], '#ffffff'], 10);
      G.sfx('collect');
      G.emit('event', 'collect');
    }

    kill(t, reason) {
      this.finishRoot(t);
      t.alive = false;
      this.popupAt(t, reason, '#ffb08a');
      if (t.main) for (const o of this.tips) if (o.alive) { this.finishRoot(o); o.alive = false; } // 主根停了，分支也一起停
    }

    // ================= 树结果：养分越多，树越大、果越多 =================
    // 树的大小 0.1~1：越高级的植物要越多养分才能参天，且越往后长得越慢
    treeV() {
      const k = Math.min(1, this.nutrients / CFG.NUT_FULL[this.tree.tier]);
      return 0.1 + 0.9 * Math.pow(k, CFG.NUT_CURVE);
    }

    expectedFruits() {
      return Math.round(Math.floor(this.nutrients / CFG.NUT_PER_FRUIT) * this.tree.fruitMul * this.suit.yieldMul);
    }

    rollFruit() {
      const entries = Object.entries(this.tree.yields);
      let r = this.fruitRng() * entries.reduce((n, [, w]) => n + w, 0);
      for (const [id, w] of entries) if ((r -= w) < 0) return id;
      return entries[0][0];
    }

    // 回合结束：先播放收获动画，播完再结算
    end(reason) {
      if (this.show) return;
      this.running = false;
      this.pending = [];
      this.echoes = [];
      for (const t of this.tips) if (t.alive) this.finishRoot(t);
      const n = this.expectedFruits();
      while (this.fruits.length < n) this.fruits.push(this.rollFruit());
      // 根系经过的特殊地层：树上额外结出对应的地层果实
      for (const k in this.terrain) {
        const id = G.TERRAIN_FRUIT[k];
        if (id) for (let i = Math.min(2, 1 + Math.floor(this.terrain[k] / G.TERRAIN_PER[k])); i > 0; i--) this.fruits.push(id);
      }
      G.sfx('end');
      const m = this.leadTip() || this.tips[0];
      this.popupAt(m, '收获!', '#ffe7a8', true);
      for (const t of this.tips) if (t.alive) this.burst(t.x, t.y, ['#ffe066', '#ffffff'], 6);

      // 植物从幼苗长起，大小取决于本轮积攒的养分；之后它会永久留在这里
      this.plantSeed = (this.roundSeed + 99) >>> 0;
      const rng = G.rng(this.plantSeed);
      const v = this.treeV();
      this.plantV = v;
      const tr = buildTree(rng, v, this.tree.form);
      // 一棵树挂得下的果实有限（叶团越多挂得越多）
      this.fruits = this.fruits.slice(0, Math.min(36, tr.clusters.length * CFG.FRUIT_CAP));
      const growDur = 3 + 2.4 * v;
      timeTree(tr, SHOW.TREE0, growDur);
      const treeEnd = SHOW.TREE0 + growDur;
      const fruit0 = treeEnd + 1.1, fruitDur = n ? Math.min(1.8, 0.12 * n + 0.3) : 0.6;
      const outer = tr.clusters.slice().sort((a, b) => b.b.depth - a.b.depth || b.r - a.r);
      const nFr = Math.max(1, this.fruits.length);
      tr.fruits = this.fruits.map((id, i) => ({
        id, c: outer[i % outer.length], ang: rng() * TAU, rr: 0.25 + rng() * 0.5,
        bloomT: treeEnd - 0.4 + (i / nFr) * 1.0 + rng() * 0.1, fruitT: fruit0 + fruitDur * Math.sqrt(i / nFr),
      }));
      layoutTree(tr, 1e9, 0);
      this.treeObj = tr;

      // 养分回流：每个根尖沿自己的路径流回树干；树液：从树干流向生长中的枝梢
      const paths = this.tips.map(t => this.flowPath(t));
      const nf = Math.min(80, 14 + this.tips.length * 3), flows = [];
      for (let i = 0; i < nf; i++) flows.push({ p: paths[i % paths.length], t0: SHOW.FLOW + (i / nf) * 0.75 + rng() * 0.1, dur: 0.85 + rng() * 0.2 });
      const saps = [];
      for (let j = 0; j < 36; j++) saps.push({ chain: tr.chains[Math.floor(rng() * tr.chains.length)], t0: SHOW.TREE0 + 0.3 + (j / 36) * growDur * 0.85, dur: 0.9 });
      tr.saps = saps;

      // 镜头回到地面、树开始长时，地下挖到的矿物陆续飞进收获栏（在树长成前飞完）
      const ores = this.oreSpots.slice();
      const stagger = ores.length ? Math.min(0.12, growDur * 0.7 / ores.length) : 0;
      const oreAt = SHOW.TREE0 + 0.4, oreEnd = oreAt + (ores.length ? stagger * (ores.length - 1) + SHOW.ORE_FLY : 0);
      // 树高：和矿物同时开始计数，跟着树一起长到最终高度
      const topY = this.treeTop(tr);
      const hgt = { m: Math.max(0.1, Math.round(-topY * TS / TILE * 10) / 10), y: topY * TS,
        at: oreAt, end: Math.max(oreAt + 1.2, treeEnd), cur: 0, tenth: -1, meter: 0, doneT: -1 };
      // 镜头终点就是地表行走时的镜头位置，演出结束交还镜头时不会再动
      const [cam1x, cam1y] = G.selCamTarget();
      this.show = {
        t: 0, reason, done: false, burst: false, fruit0, flows, cam0x: this.camX, cam0y: this.camY, cam1x, cam1y, hgt,
        ores: ores.map((o, i) => ({ ...o, at: oreAt + i * stagger, done: false })),
        endAt: Math.max(fruit0 + fruitDur, oreEnd) + 0.9,
      };
      G.emit('growStart');
    }

    // 长成后的树冠顶端（原型坐标）：枝条控制点 + 叶团外沿
    treeTop(tr) {
      let y = 0;
      for (const b of tr.B) for (const p of [b.p0, b.p1, b.p2]) y = Math.min(y, p[1]);
      for (const cl of tr.clusters) y = Math.min(y, bez(cl.b, cl.s)[1] - cl.r * (cl.lift + cl.ay));
      return y;
    }

    // 地上这株植物有多高（米，1 格 = 1 米）：树一种下就是最终大小
    plantHeight(p) {
      const tr = this.treeOf(p);
      if (!tr.B[0].p0) layoutTree(tr, 1e9, 0);
      return Math.round(-this.treeTop(tr) * TS / TILE * 10) / 10;
    }
    // 坑底现在最高的那株：{ p, m }，坑底没有植物时为 null
    tallest() {
      let best = null;
      for (const p of this.levels[0].world.plants) { const m = this.plantHeight(p); if (!best || m > best.m) best = { p, m }; }
      return best;
    }

    // 树高计数：先快后慢（和枝条生长的节奏一致），每过一整米响一声，到顶时定格
    updateHeight(t) {
      const h = this.show.hgt;
      if (h.doneT >= 0 || t < h.at) return;
      const p = clamp01((t - h.at) / (h.end - h.at));
      h.cur = h.m * (1 - Math.pow(1 - p, 3));
      const tenth = Math.floor(h.cur * 10 + 1e-6);
      if (tenth !== h.tenth) { h.tenth = tenth; G.emit('treeH', { m: tenth / 10 }); }
      if (Math.floor(h.cur) > h.meter) { h.meter = Math.floor(h.cur); G.sfx('tick', 1 + h.meter * 0.06); }
      if (p >= 1) this.heightDone(t);
    }
    heightDone(t) {
      const h = this.show.hgt;
      if (h.doneT >= 0) return;
      h.doneT = t; h.cur = h.m;
      G.emit('treeH', { m: h.m, final: true });
      G.sfx('crit');
      this.popup(this.spawnX, h.y - 4, `${h.m.toFixed(1)} 米`, '#fee761', true);
      this.addFx('stars', this.spawnX, h.y, { col: '#fee761', n: 6 });
    }

    flowPath(t) {
      const pts = t.path.slice().reverse();
      for (let cur = t; cur.parent; cur = cur.parent) pts.push(...cur.parent.path.slice(0, cur.attach + 1).reverse());
      pts.push([this.spawnX, 0]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts, cum };
    }

    updateShow(dt) {
      const s = this.show;
      if (s.done) return;
      s.t += dt;
      const t = s.t;
      // 镜头从根尖平移回地面
      const k = ease(clamp01((t - SHOW.FLOW) / (SHOW.TREE0 - SHOW.FLOW)));
      this.camX = s.cam0x + (s.cam1x - s.cam0x) * k;
      this.camY = s.cam0y + (s.cam1y - s.cam0y) * k;
      // 破土
      if (!s.burst && t >= SHOW.TREE0) { s.burst = true; this.dirt(this.spawnX, 0, 26, 50); this.shake = 0.12; G.sfx('grow'); }
      // 结果：越冒越快
      const fr = this.treeObj.fruits;
      while (this.shown < fr.length && t >= fr[this.shown].fruitT) {
        const f = fr[this.shown], [x, y] = fruitPos(f, t);
        this.burst(this.spawnX + x * TS, y * TS, [G.MAT_COLOR[f.id], '#fff4ec', '#ffffff'], 6);
        this.shown++;
        G.sfx('fruit');
      }
      if (!fr.length && !s.noFruit && t >= s.fruit0) { s.noFruit = true; this.popup(this.spawnX, -20, '没有结果……', '#ffb08a'); }
      this.updateHeight(t);
      // 地下挖到的矿物飞入收获栏
      for (const o of s.ores) {
        if (!o.done && t >= o.at + SHOW.ORE_FLY) { o.done = true; G.emit('tally', o.id); G.sfx('collect'); }
      }
      if (t >= s.endAt) this.finish();
    }

    // 收获动画结束（或被跳过）：补齐所有表现，然后结算
    finish() {
      const s = this.show;
      if (!s || s.done) return;
      s.done = true;
      s.t = Math.max(s.t, s.endAt);
      this.shown = this.fruits.length;
      this.heightDone(s.t);
      this.camX = this.selCamX = s.cam1x; this.camY = this.selCamY = s.cam1y;
      const fruit = {};
      for (const f of this.treeObj.fruits) fruit[f.id] = (fruit[f.id] || 0) + 1;
      const oasis0 = this.oasis();
      this.commitPlant();
      G.emit('roundEnd', {
        reason: s.reason, harvest: { ...this.harvest }, fruit, ore: { ...this.harvest }, tree: this.tree.name, fruitN: this.treeObj.fruits.length, heightM: s.hgt.m,
        lenM: Math.floor(this.totalLen / TILE), depthM: Math.floor(this.maxDepth / TILE), nut: Math.round(this.nutrients),
        suit: this.suit, oasis0, oasis1: this.oasis(), terrain: { ...this.terrain }, reformed: this.reformed,
      });
    }

    // 新植物永久留下：记录位置与根系，并按品种的图样改造周围的地块
    commitPlant() {
      const w = this.world;
      const trO = this.treeObj;
      this.showPlant = {
        id: w.pid++, sp: this.sp, col: this.col, v: this.plantV, seed: this.plantSeed, day: this.day, hp: 2,
        fruits: trO.fruits.map(f => ({ id: f.id, ci: trO.clusters.indexOf(f.c), a: f.ang, r: f.rr, n: w.night })),
      };
      w.plants.push(this.showPlant);
      this.reformed = this.reformPlan(this.sp, this.col);
      for (const { p, to } of this.reformed) {
        w.soil[p] = to;
        const x = (p * PLOT_W + PLOT_W / 2) * TILE;
        this.addFx('puff', x, 0, { n: 5 });
        this.addFx('stars', x, -3, { col: G.SOIL_COLS[to], n: 5 });
      }
      if (this.deadDirty.size) { this.redrawChunks(this.deadDirty); this.deadDirty = new Set(); }
      w.cells[this.showPlant.id] = [...this.visited];
      for (const i of this.visited) w.rootGrid[i] = 1;
      // 根系连同每一点的粗细一起保存，并画进地下的缓存
      for (const R of this.rootShapes()) {
        const p = [];
        for (const [x, y] of R.pts) p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
        w.roots.push({ pid: this.showPlant.id, sp: this.sp, b: R.branch ? 1 : 0, p, w: R.w.map(v => Math.round(v * 10) / 10) });
        this.bakeRoot({ ...R, old: true });
      }
      this.flushBake();
      this.baked = true;
    }

    skipShow() { if (this.show && !this.show.done) this.finish(); }

    // ================= 根系：路径记录在根尖上，粗细每帧按「管道模型」重新计算 =================
    // 平滑后的位置（让 90° 转角画成圆弧）每隔 2 单位记一个点
    plot(t, s) {
      const k = 1 - Math.exp(-s / 2.2);
      t.vx += (t.x - t.vx) * k; t.vy += (t.y - t.vy) * k;
      const last = t.path[t.path.length - 1];
      if (Math.hypot(t.vx - last[0], t.vy - last[1]) >= 2) t.path.push([t.vx, t.vy]);
    }

    finishRoot(t) {
      t.vx = t.x; t.vy = t.y;
      t.path.push([t.x, t.y]);
    }

    // 本局所有根的形状：某点粗细 = 末梢粗细 + A·√(这一点下游的根长总和)，所以末梢最细、越靠近地表越粗，
    // 分叉处母根同时承载子根，自然更粗。子根总是比母根晚长出，倒序遍历就能先算出子根的总长
    rootShapes() {
      const st = this.rootStyle;
      const items = this.tips.map(t => {
        const pts = t.path.slice(), l = pts[pts.length - 1];
        if (t.alive && Math.hypot(t.x - l[0], t.y - l[1]) > 0.05) pts.push([t.x, t.y]);
        const cum = cumOf(pts);
        return { t, pts, cum, len: cum[cum.length - 1], kids: [], total: 0 };
      });
      const byTip = new Map(items.map(it => [it.t, it]));
      for (const it of items) if (it.t.parent && byTip.has(it.t.parent)) byTip.get(it.t.parent).kids.push(it);
      for (let k = items.length - 1; k >= 0; k--) items[k].total = items[k].len + items[k].kids.reduce((n, c) => n + c.total, 0);
      return items.map(it => {
        const kids = it.kids.slice().sort((a, b) => b.t.attach - a.t.attach), w = new Array(it.pts.length);
        let extra = 0, j = 0;
        for (let i = it.pts.length - 1; i >= 0; i--) {
          while (j < kids.length && kids[j].t.attach >= i) extra += kids[j++].total;
          w[i] = Math.min(st.max, st.tip + st.A * Math.sqrt(it.len - it.cum[i] + extra));
        }
        return { pts: it.pts, w, st, branch: !!it.t.parent, seed: it.t.id * 3.7 + (this.roundSeed % 97) };
      });
    }



    eachChunk(x, y, w, h, fn) {
      const cx0 = Math.floor(x / CPX), cx1 = Math.floor((x + w) / CPX);
      const cy0 = Math.max(0, Math.floor(y / CPX)), cy1 = Math.floor((y + h) / CPX);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const ch = this.chunk(cx, cy);
        if (ch) fn(ch, cx * CPX, cy * CPX);
      }
    }

    // ================= 粒子与飘字 =================
    burst(x, y, colors, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 30;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: 0.4 + Math.random() * 0.5, col: colors[i % colors.length], size: Math.random() < 0.4 ? 2 : 1 });
      }
    }
    dirt(x, y, n, power) {
      const cols = ['#8a5a3a', '#6b4430', '#b38660', '#4e3226'];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = power * (0.4 + Math.random() * 0.8);
        this.particles.push({ x: x + (Math.random() - 0.5) * 3, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.5, col: cols[i % cols.length], size: Math.random() < 0.3 ? 2 : 1 });
      }
    }
    updateParticles(dt) {
      for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 70 * dt; p.life -= dt; }
      this.particles = this.particles.filter(p => p.life > 0);
    }
    popup(x, y, text, color, big) { G.emit('popup', { x: x - this.camX, y: y - this.camY, text, color, big }); }
    popupAt(t, text, color, big) { this.popup(t.x, t.y - 5, text, color, big); }

  }


  G.Field = Field;
})();
