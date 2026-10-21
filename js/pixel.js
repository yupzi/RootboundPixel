// 像素工具：调色板、把矢量图「像素化」（硬边 + 收色到调色板）、无抗锯齿绘制、字符串定义的精灵
// 思路：沿用原来的矢量美术（图标、药瓶、树），画到很小的画布上，再把颜色收进统一的调色板，
// 这样全游戏的像素都来自同一套颜色，风格一致
(function () {
  const { hex } = G.U;

  // Endesga 32 为底，加几种沙漠、绿洲需要的过渡色
  const PAL_HEX = [
    '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
    '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
    '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
    '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
    // 补充：沙色、土色、草色、水色
    '#f4e2bd', '#f0cf8e', '#c9a46a', '#a07a4e', '#8a5a3a', '#5c3a26', '#86b257', '#b8d67c',
    '#5f8a3e', '#7fb5cf', '#2f5872', '#9a6fd6', '#e7609f', '#4f93d8', '#d8cfbc', '#f2df7a',
  ];
  const PAL = PAL_HEX.map(hex);
  G.PAL_HEX = PAL_HEX;

  // 最近色：亮度差权重更高，避免暗部跳色。按颜色缓存
  const nearCache = new Map();
  function nearest(r, g, b, pal = PAL) {
    const key = (r << 16) | (g << 8) | b;
    const cache = pal === PAL ? nearCache : null;
    if (cache && cache.has(key)) return cache.get(key);
    let best = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i], dr = r - p[0], dg = g - p[1], db = b - p[2];
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bd) { bd = d; best = i; }
    }
    if (cache) { if (cache.size > 60000) cache.clear(); cache.set(key, best); }
    return best;
  }

  // 像素化：alpha 二值化，颜色收进调色板（pal 不给则用全局调色板）
  function pixelize(cv, pal, alphaTh = 120) {
    const c = cv.getContext('2d'), img = c.getImageData(0, 0, cv.width, cv.height), d = img.data;
    const P = pal ? pal.map(h => typeof h === 'string' ? hex(h) : h) : PAL;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < alphaTh) { d[i + 3] = 0; continue; }
      const p = P[nearest(d[i], d[i + 1], d[i + 2], P)];
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  // 给不透明像素外围描一圈 1 像素的边
  function outline(cv, col) {
    const c = cv.getContext('2d'), w = cv.width, h = cv.height, img = c.getImageData(0, 0, w, h), d = img.data;
    const [r, g, b] = hex(col), src = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (src[i]) continue;
      if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) {
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    return cv;
  }

  // 无抗锯齿绘制：draw(g) 画到同尺寸的草稿画布上，alpha 二值化后贴回 target（矢量路径 → 硬边像素）
  const scratch = new Map();
  function crisp(target, draw, x = 0, y = 0, w = target.canvas.width, h = target.canvas.height) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    const k = w + 'x' + h;
    let s = scratch.get(k);
    if (!s) { s = G.mkCanvas(w, h); s.g = s.getContext('2d', { willReadFrequently: true }); scratch.set(k, s); if (scratch.size > 24) scratch.delete(scratch.keys().next().value); }
    const g = s.g;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.setTransform(1, 0, 0, 1, -x, -y);
    draw(g);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    let any = false;
    for (let i = 3; i < d.length; i += 4) { if (d[i] < 128) d[i] = 0; else { d[i] = 255; any = true; } }
    if (!any) return;
    g.putImageData(img, 0, 0);
    target.save(); target.setTransform(1, 0, 0, 1, 0, 0); target.drawImage(s, x, y); target.restore();
  }

  // 字符串精灵：rows 每个字符一个像素，map 字符 → 颜色（'.' 与空格透明）
  function sprite(rows, map) {
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const cv = G.mkCanvas(w, h), c = cv.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = map[ch];
      if (!col) return;
      c.fillStyle = col; c.fillRect(x, y, 1, 1);
    }));
    return cv;
  }
  function flipX(cv) {
    const o = G.mkCanvas(cv.width, cv.height), c = o.getContext('2d');
    c.translate(cv.width, 0); c.scale(-1, 1); c.drawImage(cv, 0, 0);
    return o;
  }

  // 像素圆（实心），在 (x, y) 画半径 r；用于光点、粒子、泡泡
  function disc(c, x, y, r, col) {
    c.fillStyle = col;
    x = Math.round(x); y = Math.round(y);
    if (r <= 0.75) { c.fillRect(x, y, 1, 1); return; }
    const R = Math.round(r);
    for (let dy = -R; dy <= R; dy++) {
      const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.3);
      c.fillRect(x - hw, y + dy, hw * 2 + 1, 1);
    }
  }
  function ring(c, x, y, r, col) {
    c.fillStyle = col;
    x = Math.round(x); y = Math.round(y);
    const n = Math.max(8, Math.round(r * 6));
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; c.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1); }
  }

  // 4×4 Bayer 抖动阈值：渐变按格子取舍，做出像素游戏常见的网点过渡
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  G.Px = { PAL, nearest, pixelize, outline, crisp, sprite, flipX, disc, ring, bayer };

  // ================= 用原来的矢量图生成像素图标 =================
  const iconCv = {};
  // 材料图标（20×20 像素），游戏里画在地下、果实上，界面里放大显示
  G.iconCanvas = id => {
    if (iconCv[id]) return iconCv[id];
    const cv = G.mkCanvas(20, 20);
    if (PIX_ICONS[id]) { PIX_ICONS[id](cv.getContext('2d')); return (iconCv[id] = outline(cv, '#3e2731')); }
    G.drawMaterial(cv.getContext('2d'), id, 10, 10.5, 8.6);
    return (iconCv[id] = pixelize(cv));
  };
  // 直接按像素画的图标（外圈描边由 outline 补上）
  const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const PIX_ICONS = {
    // 手札残页：撕掉一角的旧纸，写着几行字（不是材料，只是画在地下空洞里）
    page(c) {
      R(c, '#d3b48e', 5, 4, 12, 15); R(c, '#fee1b8', 4, 3, 12, 15);
      c.clearRect(13, 3, 4, 1); c.clearRect(14, 4, 3, 1); c.clearRect(15, 5, 2, 1); c.clearRect(16, 6, 1, 1);
      R(c, '#d3b48e', 13, 4, 1, 1); R(c, '#d3b48e', 14, 5, 1, 1); R(c, '#d3b48e', 15, 6, 1, 1);
      R(c, '#8a6a5a', 6, 6, 6, 1); R(c, '#8a6a5a', 6, 9, 8, 1); R(c, '#8a6a5a', 6, 12, 5, 1);
      R(c, '#5f8a3e', 12, 12, 2, 3); R(c, '#86b257', 11, 12, 1, 1); R(c, '#86b257', 14, 12, 1, 1);
    },
  };
  Object.assign(G.MAT_COLOR, { page: '#fee1b8' });
  const urlCache = {};
  G.iconURL = id => urlCache[id] || (urlCache[id] = G.iconCanvas(id).toDataURL());

  const seedCv = {}, seedURLs = {};
  G.seedPixel = (sp, n = 20) => {
    const k = sp + n;
    if (seedCv[k]) return seedCv[k];
    const cv = G.mkCanvas(n, n), c = cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(G.seedCanvas(sp), 0, 0, n, n);
    return (seedCv[k] = pixelize(cv));
  };
  G.seedURL = sp => seedURLs[sp] || (seedURLs[sp] = G.seedPixel(sp).toDataURL());

  // 药瓶 18×24 像素
  // 缓存键带上指令：强化（比如急弯多出一层缓行）以后瓶子跟着换色
  const bottleCache = {}, bottleKey = p => p.key + ':' + p.instructions.map(i => i.action).join(',') + ':' + p.mode;
  G.bottlePixel = potion => {
    const bk = bottleKey(potion);
    if (bottleCache[bk]) return bottleCache[bk];
    const src = G.bottleCanvas(potion), cv = G.mkCanvas(18, 24);
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(src, 0, 0, 18, 24);
    return (bottleCache[bk] = pixelize(cv));
  };
  const bottleURLs = {};

  // 药效小图标 9×9：奶白底 + 效果色（压暗）的 5×5 图形，叠在同色药水上也看得清。描边紫色 = 回响；上角金点 = 浓（右上）/ 极（两角）；右下红点 = 触障
  const GLYPH = {
    turnL:  ['.#...', '####.', '.#..#', '....#', '..##.'],
    turnR:  ['...#.', '.####', '#..#.', '#....', '.##..'],
    slow:   ['.##..', '#..#.', '#.#..', '#...#', '.####'],
    break:  ['...##', '..##.', '.###.', '.##..', '##...'],
    speed:  ['#.#..', '.#.#.', '..#.#', '.#.#.', '#.#..'],
    branch: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
    fire:   ['..#..', '.##..', '.###.', '#####', '.###.'],
    pierce: ['..#..', '..#..', '#####', '.###.', '..#..'],
    avoid:  ['.....', '.###.', '#.#.#', '.###.', '.....'],
    seek:   ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
    stall:  ['#####', '.#.#.', '..#..', '.#.#.', '#####'],
  };
  const chipURLs = {};
  G.chipURL = i => {
    const k = G.Alc.keyOf([i]);
    if (chipURLs[k]) return chipURLs[k];
    const cv = G.mkCanvas(9, 9), c = cv.getContext('2d'), px = (col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    px(i.delay > 0 ? '#9a6fd6' : '#2e1f22', 1, 0, 7, 9); px(i.delay > 0 ? '#9a6fd6' : '#2e1f22', 0, 1, 9, 7);
    px('#fbf2dc', 1, 1, 7, 7);
    const ink = G.U.mix(G.ACTIONS[i.action].color, '#2e1f22', 0.35);
    (GLYPH[i.action] || []).forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') px(ink, 2 + x, 2 + y); }));
    if ((i.power || 1) >= 2) px('#fee761', 7, 0, 2, 2);
    if ((i.power || 1) >= 3) px('#fee761', 0, 0, 2, 2);
    if (i.trigger === 'hit') px('#e2493b', 7, 7, 2, 2);
    return (chipURLs[k] = cv.toDataURL());
  };
  G.bottleURL = potion => { const bk = bottleKey(potion); return bottleURLs[bk] || (bottleURLs[bk] = G.bottlePixel(potion).toDataURL()); };
})();
