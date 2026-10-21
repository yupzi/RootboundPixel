// 设计好的地下地图（G.STRATA，由 editor.html 编辑、写回 js/strata.js）→ 每一格的地块
// 一层崖的设计 = 分层（深度带：名字、起始行、底色、空洞植物）+ 随机生成区域（矩形 + 配方 + 固定种子）+ 手绘方块（优先级最高）
// 地块用单字符编码，存档和设计数据共用：'.' 空土；手绘层里 '-' 表示没画（露出下面区域生成的结果）
(function () {
  const { COLS, ROWS } = G.GEO;
  const N = COLS * ROWS;

  // code → 地块。cave：空洞里的植株、手札残页（被拿走后变回空洞）
  const RES = { w: 'water', o: 'ironOre', n: 'fern', a: 'ashMoss', p: 'page' };
  const CAVE_RES = { n: 1, a: 1, p: 1 };
  const TYPE = { r: 'rock', b: 'bedrock', f: 'fire', c: 'cave', l: 'clay', s: 'salt', i: 'ice', h: 'humus' };
  const RES_CODE = Object.fromEntries(Object.entries(RES).map(([k, v]) => [v, k]));
  const TYPE_CODE = Object.fromEntries(Object.entries(TYPE).map(([k, v]) => [v, k]));
  function tileOf(ch, ph = 0) {
    if (RES[ch]) return CAVE_RES[ch] ? { type: 'res', id: RES[ch], cave: true, ph } : { type: 'res', id: RES[ch], ph };
    return TYPE[ch] ? { type: TYPE[ch] } : null;
  }
  function codeOf(t) { return !t ? '.' : t.type === 'res' ? (RES_CODE[t.id] || 'o') : TYPE_CODE[t.type] || '.'; }

  // 编辑器调色板：名字与概览色
  const TILES = [
    ['.', '空土', '#8a6446'], ['r', '岩石', '#9c8b7a'], ['b', '基岩', '#34303a'], ['f', '熔岩', '#e04a2c'],
    ['c', '空洞', '#2e2028'], ['l', '黏土', '#a0604a'], ['s', '盐碱', '#e6dfcf'], ['i', '冻土', '#cfe8f4'],
    ['h', '营养土', '#4a3020'], ['w', '露水', '#3f86bf'], ['o', '铁根矿', '#d0d8e0'],
    ['n', '羊齿蕨', '#5fae5a'], ['a', '灰烬苔', '#c87858'], ['p', '手札残页', '#f0e2c0'],
  ];

  // ---- 行程编码：字符 + 个数（个数为 1 时省略）----
  function encode(a) {
    let s = '';
    for (let i = 0; i < a.length;) {
      let j = i + 1;
      while (j < a.length && a[j] === a[i]) j++;
      s += a[i] + (j - i > 1 ? j - i : '');
      i = j;
    }
    return s;
  }
  function decode(s, n = N, fill = '-') {
    const a = [];
    for (const [, ch, k] of (s || '').matchAll(/(\D)(\d*)/g)) for (let i = +(k || 1); i > 0; i--) a.push(ch);
    while (a.length < n) a.push(fill);
    a.length = n;
    return a;
  }

  // ================= 区域里的随机生成 =================
  // 每种形状只往区域内还空着（'-'）的格子里写，先写的不会被后写的盖掉
  // it：{ shape, tile, n, min, max, where }；n 个数，min~max 大小（每种形状的含义见 SHAPES）
  const SHAPES = {
    cave:    { name: '蛇形空洞', size: '长度', def: { tile: 'c', n: 2, min: 5, max: 12 } },
    pool:    { name: '圆角池', size: '宽度', def: { tile: 'f', n: 2, min: 3, max: 5 } },
    lens:    { name: '透镜层', size: '半宽', def: { tile: 'l', n: 2, min: 2.5, max: 4.5 } },
    cluster: { name: '团块', size: '长度', def: { tile: 'r', n: 8, min: 2, max: 6 } },
    scatter: { name: '散布', size: '', def: { tile: 'o', n: 4, min: 1, max: 1, where: 'any' } },
    wall:    { name: '横墙(留缺口)', size: '缺口宽', def: { tile: 'b', n: 1, min: 2, max: 3 } },
  };
  const WHERE = { any: '任意空处', nearRock: '贴着岩石', caveFloor: '空洞底部' };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function genRegion(g, reg) {
    const R = G.rng(reg.seed >>> 0);
    const x0 = Math.max(0, reg.x), y0 = Math.max(0, reg.y), x1 = Math.min(COLS, reg.x + reg.w), y1 = Math.min(ROWS, reg.y + reg.h);
    if (x1 <= x0 || y1 <= y0) return;
    const W = x1 - x0, H = y1 - y0;
    const inR = (c, r) => c >= x0 && c < x1 && r >= y0 && r < y1;
    const at = (c, r) => g[r * COLS + c];
    const free = (c, r) => inR(c, r) && at(c, r) === '-';
    const set = (c, r, v) => { g[r * COLS + c] = v; };
    const adj = (c, r, codes) => DIRS.some(([dx, dy]) => inR(c + dx, r + dy) && codes.includes(at(c + dx, r + dy)));
    const size = it => it.min + R() * Math.max(0, it.max - it.min);
    const isize = it => Math.round(it.min) + R.int(Math.max(0, Math.round(it.max) - Math.round(it.min)) + 1);
    for (const it of reg.items || []) {
      const n = Math.max(0, Math.round(it.n || 0)), t = it.tile;
      if (it.shape === 'cave') for (let k = 0; k < n; k++) {
        let x = x0 + Math.min(3, W / 2) + R() * Math.max(0, W - 6), y = y0 + Math.min(3, H / 2) + R() * Math.max(0, H - 6), a = R() * Math.PI * 2;
        for (let i = 0, len = isize(it); i < len; i++) {
          const rad = 1 + R() * 1.2;
          for (let r = Math.floor(y - rad); r <= y + rad; r++) for (let c = Math.floor(x - rad * 1.5); c <= x + rad * 1.5; c++) {
            if (c < x0 + 1 || c >= x1 - 1 || r < y0 + 1 || r >= y1 - 1 || !free(c, r)) continue;
            if (((c + 0.5 - x) / 1.5) ** 2 + (r + 0.5 - y) ** 2 > rad * rad) continue;
            set(c, r, t);
          }
          a += (R() - 0.5) * 1.3;
          x = Math.max(x0 + 2, Math.min(x1 - 3, x + Math.cos(a) * 1.7));
          y = Math.max(y0 + 2, Math.min(y1 - 3, y + Math.sin(a) * 0.8));
        }
      } else if (it.shape === 'pool') for (let k = 0; k < n; k++) {
        // 圆角矩形，四周留 1 格（区域外的不管）
        for (let tries = 0; tries < 40; tries++) {
          const w = Math.min(W, isize(it)), h = Math.min(H, Math.max(2, Math.round(w * (0.5 + R() * 0.25))));
          const c0 = x0 + R.int(W - w + 1), r0 = y0 + R.int(H - h + 1);
          let ok = true;
          for (let r = r0 - 1; r <= r0 + h && ok; r++) for (let c = c0 - 1; c <= c0 + w && ok; c++) if (inR(c, r) && !free(c, r)) ok = false;
          if (!ok) continue;
          for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
            const corner = (c === c0 || c === c0 + w - 1) && (r === r0 || r === r0 + h - 1);
            if (corner && w > 2 && h > 2 && R() < 0.7) continue; // 削圆角
            set(c, r, t);
          }
          break;
        }
      } else if (it.shape === 'lens') for (let k = 0; k < n; k++) {
        // 扁扁的透镜：椭圆内、还空着的格子
        const a = size(it), b = Math.max(0.8, a * (0.3 + R() * 0.15));
        const x = x0 + Math.min(2, W / 2) + R() * Math.max(0, W - 4), y = y0 + Math.min(1, H / 2) + R() * Math.max(0, H - 2);
        for (let r = Math.floor(y - b); r <= y + b; r++) for (let c = Math.floor(x - a); c <= x + a; c++) {
          if (!free(c, r) || ((c + 0.5 - x) / a) ** 2 + ((r + 0.5 - y) / b) ** 2 > 1) continue;
          set(c, r, t);
        }
      } else if (it.shape === 'cluster') for (let k = 0; k < n; k++) {
        // 随机游走的一团（不贴着熔岩、露水）
        let c = x0 + R.int(W), r = y0 + R.int(H);
        for (let i = 0, len = isize(it); i < len; i++) {
          if (free(c, r) && !adj(c, r, 'fw')) set(c, r, t);
          const [dx, dy] = R.pick(DIRS);
          c += dx; r += dy;
        }
      } else if (it.shape === 'scatter') {
        const where = it.where || 'any';
        if (where === 'any') {
          for (let k = 0; k < n; k++) for (let tries = 0; tries < 200; tries++) {
            const c = x0 + R.int(W), r = y0 + R.int(H);
            if (free(c, r)) { set(c, r, t); break; }
          }
          continue;
        }
        // 候选格：贴着岩石的空处 / 空洞的底（下面不是空洞的空洞格）
        const cand = [];
        for (let r = y0; r < y1; r++) for (let c = x0; c < x1; c++) {
          if (where === 'nearRock' ? free(c, r) && adj(c, r, 'r') : at(c, r) === 'c' && (r + 1 >= ROWS || at(c, r + 1) !== 'c')) cand.push([c, r]);
        }
        for (let k = 0; k < n && cand.length; k++) { const [c, r] = cand.splice(R.int(cand.length), 1)[0]; set(c, r, t); }
      } else if (it.shape === 'wall') {
        // 整片填满，再竖着挖出 n 道缺口
        const gaps = [];
        for (let k = 0; k < n; k++) { const w = Math.min(W, isize(it)); gaps.push([x0 + R.int(W - w + 1), w]); }
        for (let r = y0; r < y1; r++) for (let c = x0; c < x1; c++) {
          if (free(c, r) && !gaps.some(([gc, gw]) => c >= gc && c < gc + gw)) set(c, r, t);
        }
      }
    }
  }

  // 区域按列表顺序生成（只有区域，不含手绘）
  function genRegions(design) {
    const g = new Array(N).fill('-');
    for (const reg of design.regions || []) genRegion(g, reg);
    return g;
  }
  // ================= 空洞植物：按所在分层的设置，长在所有空洞的底部 =================
  // 分层的 flora：{ d: 每格空洞底部长植物的概率, w: { n, a } 各品种的比例, seed }
  // 每格单独掷骰子（只看自己的位置和种子），所以改一处不会把别处的植物全打乱
  const FLORA = ['n', 'a'];
  const CAVE = { c: 1, n: 1, a: 1, p: 1 };
  // 没设置过的分层按深度给默认值（和随机地图的规则一样：浅处多羊齿蕨，越深灰烬苔越多）
  function defFlora(top) {
    const w = top < 40 ? { n: 70, a: 30 } : top < 72 ? { n: 50, a: 50 } : { n: 30, a: 70 };
    return { d: 0.25, w, seed: 0 };
  }
  function layerAt(design, r) {
    let L = design.layers[0];
    for (const l of design.layers) if (l.top <= r) L = l;
    return L;
  }
  // base：手绘 + 区域合成后的格子（还没长空洞植物）
  function floraAt(design, base, i) {
    if (base[i] !== 'c') return base[i];
    const c = i % COLS, r = (i - c) / COLS;
    if (r + 1 < ROWS && CAVE[base[i + COLS]]) return 'c'; // 下面还是空洞：不是底部
    const L = layerAt(design, r), f = L.flora || defFlora(L.top);
    if (!f || !(f.d > 0)) return 'c';
    const h = G.U.hash3(c, r, (f.seed | 0) + 7919);
    if (h % 10000 >= f.d * 10000) return 'c';
    const sum = FLORA.reduce((s, k) => s + Math.max(0, f.w[k] || 0), 0);
    if (!sum) return 'c';
    let x = (G.U.hash3(r, c, (f.seed | 0) + 104729) % 10000) / 10000 * sum;
    for (const k of FLORA) if ((x -= Math.max(0, f.w[k] || 0)) < 0) return k;
    return 'c';
  }
  // 手绘盖在区域上，都没有的就是空土（还没长空洞植物）
  function composeBase(design, regions = genRegions(design), paint = decode(design.paint)) {
    const out = new Array(N);
    for (let i = 0; i < N; i++) out[i] = paint[i] !== '-' ? paint[i] : regions[i] !== '-' ? regions[i] : '.';
    return out;
  }
  // 最终地图：再按分层长出空洞植物
  function compose(design, regions, paint) {
    const base = composeBase(design, regions, paint);
    return base.map((_, i) => floraAt(design, base, i));
  }

  // 地下地图的生成方式：design 用设计好的地图 / random 用原来的代码随机生成
  // 随机生成先藏起来了（设置里的按钮隐藏，开局总是设计地图）：残页只摆在设计地图里
  const MODE_KEY = 'rootbound-map-mode';
  G.mapMode = 'design';
  function setMode(m) { G.mapMode = m; try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* 记不住就只管这一次 */ } }

  // 游戏用：某层崖（G.LEVELS[].id）的设计地图；没有设计、或者选了随机生成就返回 null（用代码随机生成）
  const cache = {};
  function levelGrid(id) {
    const d = G.STRATA && G.STRATA[id];
    if (!d || G.mapMode === 'random') return null;
    return cache[id] || (cache[id] = compose(d));
  }

  // 写回 js/strata.js 的文件内容
  function fileText(all) {
    return '// 地下分层地图：由 editor.html 编辑并写回（格式见 js/strata_gen.js）\nG.STRATA = ' + JSON.stringify(all, null, 1) + ';\n';
  }

  // 试验场：编辑器把当前的设计放在这里，再打开 index.html?test
  const TEST_KEY = 'rootbound-strata-test';

  G.Strata = { TILES, SHAPES, WHERE, FLORA, defFlora, tileOf, codeOf, encode, decode, genRegions, composeBase, floraAt, compose, levelGrid, setMode, fileText, TEST_KEY };
})();
