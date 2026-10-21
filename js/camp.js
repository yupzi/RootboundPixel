// 营地岩洞：坑底右崖半腰洞口里的那一屏（east.js）上的东西。多余的材料丢进堆肥坑换成堆肥（st.camp.compost），再花堆肥升级（st.camp.lv）
// 场景里的空位（绳梯、篝火、鸟架）走过去按 F 直接搭；工具类（水囊、底肥……）在工作台的面板里做。价格和效果见 data.js 的 G.UPGRADES
// 道具图来自 js/camp_art.js（tools/build_camp.py 把 AI 生成的原图缩成像素图），底边落在地面那一行。
// 不动的道具由 east.js 按洞里的亮度图压暗后烤进背景（drawProps）；还没搭的空位画成一圈虚线轮廓；
// 动的部分每帧画（draw）：火苗、火光、烟、火星，鸟架上的小鸟（小鸟也按亮度图压暗）
// 绳梯搭好以后从右崖崖顶的洞口垂到坑底（drawCamp，在坑底的画面里画）；生了篝火，坑底能看到烟顺着洞口顶飘出来
(function () {
  const $ = id => document.getElementById(id);
  const S = () => G.state;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { PX, W, WORLD_W } = G.GEO;
  const UP = G.UPGRADES;
  const INK = '#3e2731';
  const WOOD = ['#c28569', '#8a5a3a', '#5c3a26'], ROPE = '#c9a46a';
  const REACH = 13; // 离空位这么近（世界单位）就能按 F
  const SPOTS = [{ id: 'compost', x: G.CAMP_SPOTS.compost }, { id: 'bench', x: G.CAMP_SPOTS.bench },
    ...Object.keys(UP).filter(id => UP[id].at === 'scene').map(id => ({ id, x: UP[id].x }))];
  const BENCH = Object.keys(UP).filter(id => UP[id].at === 'bench');
  const maxLv = id => UP[id].cost.length;
  const px = x => Math.round(x * PX);

  // ================= 面板上的小图标：一个字符一个像素，按 2 倍（大图 4 倍）显示 =================
  const PAL = { k: INK, d: '#5c3a26', s: '#8a5a3a', l: '#c28569', b: '#a57855', G: '#86b257', g: '#5f8a3e',
    c: '#c9a46a', C: '#e8cf98', w: '#4a7fb5', W: '#8fc3e8', e: '#cfe8ec', n: '#7f9aa8', m: '#8b9bb4', M: '#c0cbdc' };
  function pixURL(rows) {
    const cv = G.mkCanvas(rows[0].length, rows.length), c = cv.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (PAL[ch]) { c.fillStyle = PAL[ch]; c.fillRect(x, y, 1, 1); } }));
    return cv.toDataURL();
  }
  const ICON = {
    compost: ['.....G.GG...', '....GGgGG...', '......g.....', '......g.....', '...kkkgkk...', '..kslssssk..',
      '.kssssdslsk.', '.ksdslsssdk.', 'kssssssdsssk', 'ksdsslssdsdk', 'kddddddddddk', '.kkkkkkkkkk.'],
    bench: ['............', '...kkkkkkk..', '..kMMMMMmmk.', '..kmmmmmmmk.', '...kkkbskk..', '.....kbsk...',
      '.....kbsk...', '.....kbsk...', '.....kbsk...', '.....kbsk...', '.....kdsk...', '......kk....'],
    canteen: ['....kkkk....', '....kbbk....', '...kkkkkk...', '..kcCCccck..', '.kcCCcwcccck', '.kcCcwWwccck',
      '.kcccwwwccck', '.kccccwcccbk', '.kcccccccbbk', '..kccccbbbk.', '...kkkkkkk..', '............'],
    manure: ['............', '.....kk.....', '....kcck....', '.....kk.....', '...kkCCkk...', '..kCCccccck.',
      '.kCCccGGccck', '.kCccGgGccck', '.kccccgcccbk', '.kcccccccbbk', '..kkkkkkkkk.', '............'],
    guard: ['.....CC.....', '.....Cc.....', '..kkkkkkkk..', '..kbllllbk..', '..kbbbbbbk..', '..kdsdsdsk..',
      '..kbbbbbbk..', '..kkkkkkkk..', '.....Cc.....', '.....Cc.....', '......c.....', '......c.....'],
    dewRoot: ['.....k......', '....kWk.....', '...kWwwk....', '...kwwwk....', '....kkk.....', '.....Cc.....',
      '.....Cc.....', '...c.Cc.c...', '....ccCc....', '...c..Cc.c..', '..c...c...c.', '......c.....'],
    cylinder: ['..kkkkkkkk..', '...keeenk...', '...keeeek...', '...keeenk...', '...keeeek...', '...kGGGnk...',
      '...kGgGGk...', '...kGGgnk...', '...kgGGGk...', '..kkkkkkkk..', '.kbbbbbbbbk.', '.kkkkkkkkkk.'],
  };
  const ICO = {};
  for (const k in ICON) ICO[k] = pixURL(ICON[k]);
  // 行内的小堆肥（8×8）：HUD、价格、换算值后面都用它，挂在 CSS 变量上
  document.documentElement.style.setProperty('--ico-compost', `url(${pixURL(['....GG..', '...Gg...', '..kkgk..', '.kslssk.',
    'kssdslsk', 'ksdsssdk', 'kddddddk', '.kkkkkk.'])})`);
  const CPI = '<i class="cpi"></i>';

  // ================= 道具图：解码成画布（虚线轮廓要读像素）。ax 对齐到空位的 x（图的中线），ay 是最下面一行 =================
  const ART = G.CAMP_ART, M = ART.meta, IMG = {};
  let loaded = 0;
  for (const k in ART.img) {
    const im = new Image();
    im.onload = () => {
      const cv = G.mkCanvas(im.width, im.height);
      cv.getContext('2d').drawImage(im, 0, 0);
      cv.ax = im.width >> 1; cv.ay = im.height - 1;
      IMG[k] = cv;
      loaded++;
    };
    im.src = ART.img[k];
  }
  // 还没搭的空位：轮廓画成一圈隔一个点的浅色虚线（洞里暗，深色的看不见）
  function ghostOf(cv) {
    if (cv.ghost) return cv.ghost;
    const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
    const a = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    const g = G.mkCanvas(w, h), c = g.getContext('2d');
    c.fillStyle = '#f4e2bd';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if ((x + y) % 2 === 0 && a(x, y) && !(a(x - 1, y) && a(x + 1, y) && a(x, y - 1) && a(x, y + 1))) c.fillRect(x, y, 1, 1);
    g.ax = cv.ax; g.ay = cv.ay;
    return (cv.ghost = g);
  }
  const SCENE_IMG = { ladder: () => IMG.ladder, fire: () => IMG.fire, perch: lv => lv > 1 ? IMG.perch2 : IMG.perch1 };
  // 图上某一点（相对图的左上角）在屏幕上的位置
  const at = (img, x, floor, [dx, dy]) => [x - img.ax + dx, floor - img.ay + dy];
  const put = (c, img, x, floor) => img && c.drawImage(img, x - img.ax, floor - img.ay);

  // ================= 火、鸟 =================
  const fx = { sparks: [], sparkT: 0, smoke: [], smokeT: 0 };

  const Camp = {};
  G.Camp = Camp;
  Camp.has = id => G.campLv(id) > 0;
  Camp.ready = () => loaded === Object.keys(ART.img).length;
  // 搭了什么、搭到几级：变了就要重新烤背景
  Camp.sig = () => Object.keys(SCENE_IMG).map(id => G.campLv(id)).join('');

  // 火苗底部的屏幕位置（y 是相对地面那一行的偏移）；没搭篝火时是 null
  function flameBase() {
    const img = IMG.fire;
    return img && Camp.has('fire') ? at(img, px(UP.fire.x), 0, M.fire.flame) : null;
  }
  Camp.fireAt = flameBase;
  Camp.update = function (dt) {
    const fb = flameBase();
    if (fb && (fx.sparkT -= dt) <= 0) {
      fx.sparkT = 0.1 + Math.random() * 0.2;
      fx.sparks.push({ x: fb[0] + (Math.random() - 0.5) * 6, y: fb[1] - 6, vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 18, life: 0.6 + Math.random() * 0.7 });
    }
    // 烟：直直地往上飘，朝天窗那边去
    if (fb && (fx.smokeT -= dt) <= 0) {
      fx.smokeT = 0.35 + Math.random() * 0.3;
      fx.smoke.push({ x: fb[0], y: fb[1] - 14, t: 0, life: 4 + Math.random() * 1.5, ph: Math.random() * 6 });
    }
    for (const s of fx.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    fx.sparks = fx.sparks.filter(s => s.life > 0);
    for (const s of fx.smoke) { s.t += dt; s.y -= dt * 14; s.x += Math.sin(s.t * 1.3 + s.ph) * dt * 3; }
    fx.smoke = fx.smoke.filter(s => s.t < s.life);
    if (hintT > 0) hintT -= dt;
  };

  // 不动的道具：堆肥坑、工作台、搭好的东西（east.js 画在单独一层上压暗后烤进背景）
  Camp.drawProps = function (c, floor) {
    put(c, IMG.compost, px(G.CAMP_SPOTS.compost), floor);
    put(c, IMG.bench, px(G.CAMP_SPOTS.bench), floor);
    for (const id in SCENE_IMG) { const lv = G.campLv(id); if (lv) put(c, SCENE_IMG[id](lv), px(UP[id].x), floor); }
  };
  // 每帧画的（人后面）：还没搭的虚线、火光和火苗、小鸟。dim(颜色, x, y) 按洞里那一点的亮度压暗
  Camp.draw = function (c, T, floor, dim) {
    const blink = 0.35 + 0.25 * Math.sin(T * 3);
    for (const id in SCENE_IMG) {
      const lv = G.campLv(id), x = px(UP[id].x), img = SCENE_IMG[id](lv);
      if (!img) continue;
      if (!lv) { c.globalAlpha = blink; put(c, ghostOf(img), x, floor); c.globalAlpha = 1; continue; }
      if (id === 'fire') { drawGlow(c, T, floor); drawFlame(c, T, floor); }
      if (id === 'perch') drawBirds(c, T, img, x, floor, lv, dim);
    }
  };
  // 人前面的：火星、烟
  Camp.drawFront = function (c, T, floor) {
    for (const s of fx.smoke) {
      const u = s.t / s.life, r = 1 + Math.round(u * 3), a = 0.3 * Math.min(1, s.t * 2) * (1 - u);
      c.fillStyle = `rgba(214,196,180,${a.toFixed(2)})`;
      const sx = Math.round(s.x), sy = floor + Math.round(s.y);
      c.fillRect(sx - r, sy - r + 1, r * 2 + 1, r * 2 - 1); c.fillRect(sx - r + 1, sy - r, r * 2 - 1, r * 2 + 1); // 削掉四个角，像一团烟
    }
    c.fillStyle = '#fee761';
    for (const s of fx.sparks) if (s.life > 0.25 || Math.floor(T * 20) % 2) c.fillRect(Math.round(s.x), floor + Math.round(s.y), 1, 1);
  };
  // 火光：火堆周围一团柔和的暖光（滤色叠加，随火苗轻轻跳）
  function drawGlow(c, T, floor) {
    const fb = flameBase();
    if (!fb) return;
    const x = fb[0], cy = floor + fb[1] - 4, R = 60 + Math.sin(T * 7) * 3 + Math.sin(T * 13) * 2;
    const g = c.createRadialGradient(x, cy, 2, x, cy, R);
    g.addColorStop(0, 'rgba(255,190,90,0.5)'); g.addColorStop(0.35, 'rgba(255,150,60,0.2)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    c.save();
    c.globalCompositeOperation = 'screen';
    c.fillStyle = g;
    c.fillRect(x - R, cy - R, R * 2, R * 2);
    c.restore();
  }
  // 火苗：一行行往上收窄，轻轻摇，外红内黄
  function drawFlame(c, T, floor) {
    const fb = flameBase();
    if (!fb) return;
    const x = fb[0], base = floor + fb[1], H = 15 + Math.round(Math.sin(T * 9) * 1.5 + Math.sin(T * 23));
    for (let i = 0; i < H; i++) {
      const k = i / H, w = Math.max(1, Math.round(Math.pow(1 - k, 0.75) * 11 + Math.sin(T * 17 + i) * 0.8));
      const sx = x + Math.round(Math.sin(T * 6 + i * 0.5) * k * 2), y = base - i;
      c.fillStyle = '#e43b44'; c.fillRect(sx - (w >> 1), y, w, 1);
      if (w > 2) { c.fillStyle = '#f77622'; c.fillRect(sx - (w >> 1) + 1, y, w - 2, 1); }
      if (w > 4 && k < 0.7) { c.fillStyle = k < 0.35 ? '#fee761' : '#feae34'; c.fillRect(sx - (w >> 1) + 2, y, w - 4, 1); }
    }
  }
  // 鸟架上歇着的小鸟（从天窗飞进来的）：一级一只、二级两只，隔一会儿换个朝向、蹦一下，偶尔飞走一阵
  function drawBirds(c, T, img, x, floor, lv, dim) {
    M[lv > 1 ? 'perch2' : 'perch1'].seats.forEach((seat, i) => {
      if ((T * 0.07 + i * 0.43) % 1 > 0.75) return;
      const [bx, by] = at(img, x, floor, seat), face = Math.floor(T * 0.5 + i) % 2 ? 1 : -1, hop = Math.floor(T * 2.3 + i * 5) % 7 === 0 ? 1 : 0;
      const P = (dx, dy, w, h, col) => { c.fillStyle = dim(col, bx, by - 3); c.fillRect(face > 0 ? bx + dx : bx - dx - w + 1, by + dy - hop, w, h); };
      P(-2, -4, 5, 4, INK); P(1, -6, 3, 3, INK); P(4, -5, 2, 1, INK); P(-4, -3, 2, 1, INK);
      P(-1, -3, 3, 2, '#8a5a3a'); P(2, -5, 1, 2, '#8a5a3a'); P(0, -2, 2, 1, '#e8b796'); P(4, -5, 1, 1, '#feae34');
    });
  }

  // ================= 坑底画面里的营地：绳梯从洞口顺着崖面垂到坑底，篝火的烟顺着洞口顶飘出来 =================
  const P = G.Field.prototype, VW = W * PX + 1;
  const ladderX = m => m.x0 - 1; // 绳梯贴着崖面挂在洞口下面
  P.drawCamp = function (c, T) {
    const m = this.lv === 0 && this.mouth();
    if (!m) return;
    if (G.campLv('ladder')) {
      const lx = this.X(ladderX(m)), top = this.Y(m.y), yb = this.Y(0);
      if (lx > -12 && lx < VW + 12) {
        for (let yy = top; yy < yb; yy++) {
          const k = (yy - top) / Math.max(1, yb - top), sw = Math.round(Math.sin(T * 1.6 + yy * 0.02) * k * 1.5);
          c.fillStyle = WOOD[1]; c.fillRect(lx - 3 + sw, yy, 1, 1); c.fillRect(lx + 3 + sw, yy, 1, 1);
          if ((yy - top) % 7 === 3) { c.fillStyle = INK; c.fillRect(lx - 3 + sw, yy + 1, 7, 1); c.fillStyle = WOOD[0]; c.fillRect(lx - 3 + sw, yy, 7, 1); }
        }
        // 洞口里钉的两根木桩，绳子绕在上面
        const sx = this.X(ladderX(m) + 5);
        c.fillStyle = INK; c.fillRect(sx, top - 7, 4, 8); c.fillRect(sx + 7, top - 5, 4, 6);
        c.fillStyle = WOOD[1]; c.fillRect(sx + 1, top - 6, 2, 6); c.fillRect(sx + 8, top - 4, 2, 4);
        c.fillStyle = ROPE; c.fillRect(lx - 3, top - 2, sx - lx + 5, 1); c.fillRect(lx + 3, top - 1, sx - lx + 6, 1);
      }
    }
    // 篝火的烟：贴着洞口顶从里面飘出来，出了洞口再往上散
    if (G.campLv('fire')) {
      const x0 = this.X(WORLD_W + 14), top = this.Y(m.top);
      for (let i = 0; i < 8; i++) {
        const u = (T * 0.16 + i / 8) % 1, r = 1 + Math.round(u * 3);
        const out = Math.max(0, u - 0.3);
        const x = Math.round(x0 - u * 50 + Math.sin(T * 0.8 + i * 2) * 2), y = Math.round(top + 4 - out * 110);
        c.fillStyle = `rgba(236,226,214,${(0.45 * (1 - u)).toFixed(2)})`;
        c.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1); c.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
      }
    }
  };
  // 坑底地表的攀爬线：绳梯（爬到顶往右翻进洞口）
  Camp.climbs = function (f) {
    const m = G.campLv('ladder') && f.lv === 0 && f.mouth();
    if (!m) return [];
    // ladder：爬到顶往右翻进洞口多远（×6）。只翻 4 个单位，站在原地按 S 就能抓住绳梯下去
    return [{ pts: [[ladderX(m), m.y], [ladderX(m), 0]], top: m.y, bot: 0, ladder: 4 / 6 }];
  };

  // ================= 空位与头顶提示 =================
  let hint = '', hintT = 0;
  Camp.hint = function (text) { hint = text; hintT = 2.2; G.sfx('fail'); };
  function nearSpot(hero) {
    let best = null, bd = REACH;
    for (const s of SPOTS) { const d = Math.abs(hero.x - s.x); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  Camp.tag = function (hero) {
    if (hintT > 0) return esc(hint);
    const s = nearSpot(hero);
    if (!s) return '';
    if (s.id === 'compost') return `${G.keyCap('F')} 堆肥坑`;
    if (s.id === 'bench') return `${G.keyCap('F')} 工作台`;
    const u = UP[s.id], lv = G.campLv(s.id);
    if (lv >= maxLv(s.id)) return '';
    const cost = u.cost[lv];
    return `${G.keyCap('F')} ${lv ? '加高' : '搭'}${u.name} <span class="${S().camp.compost >= cost ? 'ok' : 'bad'}">${cost} 堆肥</span>`;
  };
  // 触屏行动键上的字：站在哪个东西旁边、按下去会做什么
  Camp.actName = function (hero) {
    const s = nearSpot(hero);
    if (!s) return '';
    if (s.id === 'compost') return '堆肥坑';
    if (s.id === 'bench') return '工作台';
    const lv = G.campLv(s.id);
    return lv >= maxLv(s.id) ? '' : (lv ? '加高' : '搭') + UP[s.id].name;
  };
  Camp.interact = function (hero) {
    const s = nearSpot(hero);
    if (!s) return;
    if (s.id === 'compost' || s.id === 'bench') { open(s.id); return; }
    if (G.campLv(s.id) < maxLv(s.id)) buy(s.id);
  };

  // 花堆肥升一级。场景里的东西搭好时冒一阵尘土和金星
  function buy(id) {
    const st = S(), lv = G.campLv(id), cost = UP[id].cost[lv];
    if (lv >= maxLv(id)) return false;
    if (st.camp.compost < cost) { if (panel) G.sfx('fail'); else Camp.hint(`堆肥不够，还差 ${cost - st.camp.compost}`); return false; }
    st.camp.compost -= cost;
    st.camp.lv[id] = lv + 1;
    G.sfx('levelup');
    if (UP[id].at === 'scene') burst(UP[id].x, ['#fee761', '#ffffff', '#f0cf8e', '#e4a672'], 18);
    G.save('select');
    return true;
  }
  function burst(x, cols, n) {
    for (let i = 0; i < n; i++) G.East.particles.push({ x: x + (Math.random() - 0.5) * 16, y: -2 - Math.random() * 10, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0.5 + Math.random() * 0.5, col: cols[i % cols.length], size: 1 });
  }

  // 只在营地岩洞里显示的堆肥数（放在地表的 #surf 里，离开地表阶段跟着收起）
  let lastHud = '';
  Camp.renderHud = function (show) {
    const sig = show ? String(S().camp.compost) : '';
    if (sig === lastHud) return;
    lastHud = sig;
    $('campBox').classList.toggle('hidden', !show);
    if (show) $('campBox').innerHTML = `${CPI}堆肥 <b>${sig}</b>`;
  };

  // ================= 堆肥坑 / 工作台：和炼药锅一样的整屏舞台 =================
  // 左一栏（材料 / 工具），正中是场景里那件道具放大 6 倍，右一栏（这一堆 / 蓝图），顶上一块堆肥计数，道具下面按住的按钮。
  // 堆肥坑：点材料，材料划一道弧落到肥堆上；按住翻堆，一份份沉下去，变成堆肥粒飞进计数。
  // 工作台：选中的工具悬在石台上方（还没做是一张蓝色的图样）；按住打造，锤子越敲越快，满了堆肥粒从计数飞进工具，工具成形。
  // 所有坐标都是 960×540 的界面坐标；特效画在 #cpFx 上，开着时自己跑一个 requestAnimationFrame
  const TAU = Math.PI * 2, FX_INK = '#181425';
  const PK = 6, BASE = 452;                       // 道具放大倍数、底边（和炼药锅的锅底同一行）
  const TOOL_Y = 236, DESK = 298;                 // 工作台上悬着的工具的中心、石台面那一行（工具的影子落在这）
  const HEAP = ['#5c3a26', '#8a5a3a', '#6b442c', '#86b257'], METAL = ['#ffffff', '#fee761', '#c0cbdc', '#8b9bb4'];
  function pixCanvas(rows) {
    const cv = G.mkCanvas(rows[0].length, rows.length), c = cv.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (PAL[ch]) { c.fillStyle = PAL[ch]; c.fillRect(x, y, 1, 1); } }));
    return cv;
  }
  // 还没做的工具画成图样：浅蓝的半透明剪影，轮廓一圈亮线
  function blueprintOf(rows) {
    const h = rows.length, w = rows[0].length, on = (x, y) => y >= 0 && y < h && x >= 0 && x < w && PAL[rows[y][x]];
    const cv = G.mkCanvas(w, h), c = cv.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const edge = !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1));
      c.fillStyle = edge ? 'rgba(220,239,255,.95)' : (x + y) % 2 ? 'rgba(143,195,232,.45)' : 'rgba(143,195,232,.25)';
      c.fillRect(x, y, 1, 1);
    }
    return cv;
  }
  const TOOL = {}, PLAN = {};
  for (const id of BENCH) { TOOL[id] = pixCanvas(ICON[id]); PLAN[id] = blueprintOf(ICON[id]); }
  const HAMMER = pixCanvas(ICON.bench);
  const PELLET = pixCanvas(['....GG..', '...Gg...', '..kkgk..', '.kslssk.', 'kssdslsk', 'ksdsssdk', 'kddddddk', '.kkkkkk.']);

  let panel = null, sel = 0;
  const V = {
    t: 0, raf: 0, last: 0,
    pile: [],        // 堆肥坑：准备丢进去的，一份一个 { id, x, y, t, dur, x0, y0, arc, landed }
    sinkers: [], pellets: [], parts: [], texts: [],
    disp: 0,         // 计数上显示的数（堆肥粒飞到了才加上去）
    jolt: 0, glow: 0, wob: 0, hold: null, shakeT: 0, shakeK: 0, abT: 0,
    swing: 0, hitT: 0, flashT: 0, popT: 0, combo: 0, haul: null,
  };
  Camp.isOpen = () => !!panel;
  const local = el => {
    const g = $('game').getBoundingClientRect(), r = el.getBoundingClientRect(), k = 960 / g.width;
    return { x: (r.left - g.left + r.width / 2) * k, y: (r.top - g.top + r.height / 2) * k };
  };
  function open(kind) {
    panel = kind; sel = 0;
    Object.assign(V, { pile: [], sinkers: [], pellets: [], parts: [], texts: [], disp: S().camp.compost, jolt: 0, glow: 0.3, hold: null, haul: null, flashT: 0, popT: 0 });
    $('campView').classList.remove('hidden');
    $('campView').dataset.kind = kind;
    $('tooltip').classList.add('hidden');
    G.sfx('click');
    renderAll();
    V.last = performance.now();
    cancelAnimationFrame(V.raf);
    V.raf = requestAnimationFrame(frame);
  }
  Camp.close = function () {
    if (!panel) return;
    panel = null;
    endHold();
    cancelAnimationFrame(V.raf);
    V.pile = [];
    $('campView').classList.add('hidden');
    $('tooltip').classList.add('hidden');
    $('game').classList.remove('aberr');
    $('cpStage').style.transform = '';
  };
  function renderAll() {
    const comp = panel === 'compost';
    $('cpTitle').innerHTML = `<img src="${ICO[comp ? 'compost' : 'bench']}">${comp ? '堆肥坑' : '工作台'}`;
    $('cpRTitle').textContent = comp ? '这一堆' : '图样';
    $('cpKeys').innerHTML = comp ? '点一下丢一份 · <kbd>Shift</kbd>+点 全丢 · 右键 / <kbd>⌫</kbd> 拿回 · <i class="use">架</i> 药剂架上的药要用它'
      : '<kbd>W</kbd><kbd>S</kbd> 选工具 · 按住 <kbd>空格</kbd> 打造';
    renderCount();
    if (comp) { renderMats(); renderHeap(); } else { renderTools(); renderPlan(); }
  }
  // 顶上的计数：皮面街机读数，前导零压暗
  function renderCount(cls) {
    const n = Math.max(0, Math.round(V.disp)), s = String(n).padStart(4, '0'), z = s.length - String(n).length;
    $('cpCount').innerHTML = `<div class="cc-lb">${CPI}堆肥</div><div class="nb-num${cls ? ' ' + cls : ''}"><span class="z">${s.slice(0, z)}</span>${s.slice(z)}</div>`;
  }
  function nudge(el, cls = 'deny') { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ---------- 小工具：像素方块粒子、飘字、震屏、色差（和炼药锅一个手感） ----------
  function burstAt(x, y, cols, n, spd = 160, up = 80, g = 420) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random() * 0.7);
      V.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: 0.4 + Math.random() * 0.5, max: 0.9, col: cols[i % cols.length], s: Math.random() < 0.3 ? 6 : 4, g });
    }
  }
  function text(x, y, s, col, big = false, rainbow = false, tag = null, life) {
    if (tag) V.texts = V.texts.filter(t => t.tag !== tag);
    const l = life || (big ? 1.3 : 0.9);
    V.texts.push({ x, y, s, col, big, rainbow, tag, life: l, max: l });
  }
  function shake(k, t = 0.18) { if (!G.opts || !G.opts.shake) return; V.shakeK = Math.max(V.shakeK, k); V.shakeT = Math.max(V.shakeT, t); }
  const ring = (x, y, r, life, col) => V.parts.push({ ring: true, x, y, r, life, max: life, col });

  // ================= 堆肥坑 =================
  const inPile = id => V.pile.filter(u => u.id === id).length;
  const left = id => (S().materials[id] || 0) - inPile(id);
  const pileTotal = () => V.pile.reduce((s, u) => s + G.compostOf(u.id), 0);
  function shelfMats() {
    const out = new Set();
    for (const key of S().hotbar) { const e = key && G.Alc.entry(key); if (e) for (const r of e.recipes) for (const id of r) out.add(id); }
    return out;
  }
  // 第 k 份落在肥堆上的哪儿：堆成一个小土丘，底下一层九份，往上一层少两份、垫高一截
  // 堆满 25 份以后从底下一层重新开始叠（错开半格）
  function restAt(k) {
    const wrap = Math.floor(k / 25);
    let L = 0, n = 9;
    k %= 25;
    while (k >= n) { k -= n; L++; n -= 2; }
    const span = (n - 1) * 17, jx = ((k * 37 + L * 11) % 5) - 2, jy = ((k * 13 + L) % 3) * 2;
    return { x: 480 - span / 2 + k * 17 + jx + ((L + wrap) % 2) * 6, y: -wrap * 4 + 372 - L * 15 + jy - Math.round(Math.sin((k + 0.5) / n * Math.PI) * 6) };
  }
  function renderMats() {
    const st = S(), used = shelfMats();
    const ids = [...G.MATERIAL_ORDER, ...Object.keys(G.MATERIALS).filter(id => !G.MATERIAL_ORDER.includes(id))].filter(id => st.materials[id] > 0);
    $('cpSub').textContent = ids.length ? ids.length + ' 种' : '';
    $('cpList').innerHTML = ids.length ? `<div class="mg">${ids.map(id => {
      const n = left(id), p = inPile(id);
      return `<div class="mc${n > 0 ? '' : ' empty'}${p ? ' in' : ''}" data-id="${id}" data-tip="mat:${id}" style="--mc:#b5d65a"><img src="${G.iconURL(id)}"><span class="ct">${n}</span>
        <span class="ev">${CPI}+${G.compostOf(id)}</span>${used.has(id) ? '<i class="use">架</i>' : ''}${p ? `<i class="pd">↓${p}</i>` : ''}</div>`;
    }).join('')}</div>` : '<div class="mats-empty">布包里没有材料<br>去种树、摘果子吧</div>';
    $('cpList').querySelectorAll('.mc').forEach(el => {
      const id = el.dataset.id;
      el.onpointerdown = e => { if (e.button === 0) toss(id, el, e.shiftKey ? left(id) : 1); };
      el.oncontextmenu = e => { e.preventDefault(); takeBack(id); };
    });
  }
  // 右栏：标签卡上列着这一堆，最下面是丢进去以后的堆肥数
  function renderHeap() {
    const st = S(), n = V.pile.length, total = pileTotal();
    const ids = [...new Set(V.pile.map(u => u.id))];
    $('cpRTag').innerHTML = n ? `<span class="bi-tag c-green">${n} 份</span>` : '';
    $('cpInfo').classList.toggle('idle', !n);
    $('cpInfo').innerHTML = !n ? `<div class="cpi-hero"><div class="bi-pic"><img src="${ICO.compost}"></div><div class="bi-nm">空的</div><div class="bi-mode">等材料下坑</div></div>
      <div class="bi-tips"><div><i>1</i>点左边的材料，丢到肥堆上</div><div><i>2</i>按住翻堆，沤成堆肥</div><div><i>3</i>堆肥拿去工作台打造工具</div></div>`
      : `<div class="cp-list">${ids.map(id => `<div class="cp-row" data-id="${id}"><img src="${G.iconURL(id)}">${G.MATERIALS[id].name}<i>×${inPile(id)}</i><span>+${inPile(id) * G.compostOf(id)}</span></div>`).join('')}</div>
      <div class="cp-sum">${CPI}<span class="was">${st.camp.compost}</span><span class="to">→</span><b>${st.camp.compost + total}</b><em>+${total}</em></div>
      <div class="cp-warn">翻进去就拿不回来了</div>
      <button class="pxbtn gray tiny" id="cpBack">全拿回来</button>`;
    $('cpInfo').querySelectorAll('.cp-row').forEach(el => { el.onclick = () => takeBack(el.dataset.id); });
    if ($('cpBack')) $('cpBack').onclick = takeAll;
    holdLabel();
  }
  // 丢一份（Shift 全丢）：每份划一道弧落到肥堆上
  function toss(id, el, n) {
    if (V.haul) return;
    n = Math.min(n, left(id));
    if (n <= 0) { nudge(el); G.sfx('fail'); return; }
    const from = local(el);
    for (let i = 0; i < n; i++) {
      const k = V.pile.length, r = restAt(k);
      V.pile.push({ id, img: G.iconCanvas(id), x0: from.x, y0: from.y - 10, x: from.x, y: from.y, x1: r.x, y1: r.y, t: -i * 0.05, dur: 0.38, arc: 90 + Math.random() * 40, landed: false });
    }
    G.sfx('click', 1.05 + Math.min(V.pile.length, 12) * 0.05);
    renderMats(); renderHeap();
  }
  function land(u) {
    u.landed = true;
    V.jolt = Math.min(1, V.jolt + 0.5); V.glow = Math.min(1, V.glow + 0.2);
    burstAt(u.x1, u.y1 + 8, HEAP, 8, 120, 110);
    text(u.x1, u.y1 - 24, `+${G.compostOf(u.id)}`, '#b5d65a', false, false, null, 0.7);
    G.sfx('plop', 0.8 + Math.min(V.pile.indexOf(u), 16) * 0.05);
    shake(1, 0.06);
  }
  function takeBack(id) {
    if (V.haul) return;
    let i = -1;
    for (let k = V.pile.length - 1; k >= 0; k--) if (V.pile[k].id === id) { i = k; break; }
    if (i < 0) return;
    const [u] = V.pile.splice(i, 1);
    burstAt(u.x1, u.y1, HEAP, 5, 80, 60);
    V.pile.forEach((p, k) => { const r = restAt(k); p.x1 = r.x; p.y1 = r.y; if (p.landed) { p.x = r.x; p.y = r.y; } });
    G.sfx('click', 0.8);
    renderMats(); renderHeap();
  }
  function takeAll() {
    if (V.haul || !V.pile.length) return;
    for (const u of V.pile) burstAt(u.x1, u.y1, HEAP, 2, 80, 60);
    V.pile = [];
    G.sfx('click', 0.8);
    renderMats(); renderHeap();
  }
  // 翻堆满了：账一次算清（存档），画面上一份份沉下去、吐出堆肥粒飞进计数
  function dump() {
    const st = S(), units = V.pile.filter(u => u.landed);
    if (!units.length) return false;
    const total = units.reduce((s, u) => s + G.compostOf(u.id), 0);
    for (const u of units) { st.materials[u.id]--; if (!st.materials[u.id]) delete st.materials[u.id]; }
    st.camp.compost += total;
    V.pile = V.pile.filter(u => !u.landed);
    const gap = Math.min(0.07, 1.1 / units.length);
    units.forEach((u, k) => V.sinkers.push({ id: u.id, img: u.img, x: u.x1, y: u.y1, t: -k * gap, dur: 0.22, val: G.compostOf(u.id) }));
    V.haul = { total, left: total, n: units.length };
    V.combo = 0;
    G.sfx('brew'); shake(3, 0.15);
    V.jolt = 1; V.glow = 1;
    burstAt(480, 330, HEAP, 24, 220, 160);
    G.save('select');
    renderMats(); renderHeap();
    return true;
  }
  // 一份沉到底：冒一团土，吐出几粒堆肥飞向计数（太多时一粒顶几份）
  function sink(s) {
    burstAt(s.x, s.y + 6, HEAP, 6, 90, 90);
    V.parts.push({ x: s.x, y: s.y, vx: 0, vy: -24, life: 0.8, max: 0.8, col: 'steam', s: 8, g: -8 });
    const to = local($('cpCount')), per = V.haul.total > 80 ? 3 : V.haul.total > 40 ? 2 : 1;
    for (let v = s.val, i = 0; v > 0; i++) {
      const val = Math.min(per, v); v -= val;
      V.pellets.push({ x0: s.x, y0: s.y, x: s.x, y: s.y, x1: to.x + (Math.random() - 0.5) * 40, y1: to.y + 6, t: -i * 0.04, dur: 0.5 + Math.random() * 0.15, arc: 60 + Math.random() * 80, val, dir: 1 });
    }
  }
  function pelletIn(p) {
    V.disp += p.val;
    V.haul.left -= p.val;
    V.combo++;
    G.sfx('orb', 1 + Math.min(V.combo, 30) * 0.03);
    renderCount('bump');
    burstAt(p.x1, p.y1, ['#b5d65a', '#fee761', '#ffffff'], 3, 70, 30, 200);
    if (V.haul.left > 0) return;
    // 全部到账：报个数，多了就是大丰收
    const h = V.haul, to = local($('cpCount'));
    V.haul = null;
    V.disp = S().camp.compost;
    renderCount('bump');
    text(to.x, to.y + 44, `+${h.total} 堆肥`, '#b5d65a', true, false, 'haul', 1.6);
    if (h.total >= 30) {
      text(480, 250, '大丰收！', '#fee761', true, true, 'big', 2);
      G.sfx('levelup'); G.sfx('crit');
      shake(6, 0.3); V.abT = 0.4;
      burstAt(to.x, to.y, ['#fee761', '#ffffff', '#b5d65a', '#feae34'], 30, 260, 120);
      ring(to.x, to.y, 8, 0.6, '#fee761');
    } else {
      G.sfx('pop');
      ring(to.x, to.y, 6, 0.4, '#ffffff');
    }
  }

  // ================= 工作台 =================
  const pipsOf = (lv, max) => Array.from({ length: max }, (_, k) => `<i${k < lv ? ' class="on"' : ''}></i>`).join('');
  const curTool = () => BENCH[sel];
  function renderTools() {
    const have = S().camp.compost;
    sel = Math.max(0, Math.min(BENCH.length - 1, sel));
    $('cpSub').textContent = `${BENCH.filter(id => G.campLv(id) >= maxLv(id)).length} / ${BENCH.length}`;
    $('cpList').innerHTML = `<div class="ub-list">${BENCH.map((id, i) => {
      const u = UP[id], lv = G.campLv(id), max = maxLv(id), done = lv >= max, cost = u.cost[lv];
      return `<div class="ub-row${i === sel ? ' sel' : ''}${done ? ' done' : ''}" data-i="${i}"><span class="ub-ic"><img src="${ICO[id]}"></span>
        <div class="ub-nm">${u.name}<span class="ub-pip">${pipsOf(lv, max)}</span></div>
        <span class="ub-st">${done ? '<i class="ub-ok"></i>' : `<span class="${have >= cost ? 'ok' : 'bad'}">${CPI}${cost}</span>`}</span></div>`;
    }).join('')}</div>`;
    $('cpList').querySelectorAll('.ub-row').forEach(el => { el.onpointerdown = e => { if (e.button === 0) pick(+el.dataset.i); }; });
  }
  function pick(i) {
    if (V.hold || V.flashT > 0.3 || i === sel) return;
    sel = i;
    V.popT = 0.25;
    G.sfx('click', 1.2);
    renderTools(); renderPlan();
  }
  // 右栏的蓝图：每一级的效果，做过的打勾、下一级亮起；满级盖章
  function renderPlan(made) {
    const id = curTool(), u = UP[id], lv = G.campLv(id), max = maxLv(id), done = lv >= max, have = S().camp.compost, cost = u.cost[lv];
    const steps = Array.from({ length: max }, (_, k) => {
      const cls = k < lv ? 'got' : k === lv ? 'next' : 'lock';
      return `<div class="bp-step ${cls}${made && k === lv - 1 ? ' flash' : ''}"><i>${k < lv ? '' : k + 1}</i><span>${u.text(u.val[k + 1])}</span></div>`;
    }).join('');
    $('cpRTag').innerHTML = done ? '<span class="bi-tag c-green">满级</span>' : lv ? `<span class="bi-tag c-gold">第 ${lv} 级</span>` : '';
    $('cpInfo').classList.remove('idle');
    $('cpInfo').innerHTML = `<div class="ub-bp">
      <div class="bp-top"><span class="bp-ic"><img src="${ICO[id]}"></span><div><div class="bp-nm">${u.name}</div><div class="bp-lv"><span class="ub-pip">${pipsOf(lv, max)}</span></div></div></div>
      <div class="bp-steps">${steps}</div>
      <div class="bp-foot">${done ? `<div class="bp-stamp${made ? ' new' : ''}">做好了</div>` : `<div class="bp-cost">${CPI}<b class="${have >= cost ? '' : 'bad'}">${cost}</b><span>/ ${have}</span></div>`}</div>
    </div>`;
    holdLabel();
  }
  // 打造满了：账先算清，堆肥粒从计数飞进工具，最后一粒到了工具成形
  function forge() {
    const id = curTool(), st = S(), lv = G.campLv(id), cost = UP[id].cost[lv];
    if (lv >= maxLv(id) || st.camp.compost < cost) return false;
    st.camp.compost -= cost;
    st.camp.lv[id] = lv + 1;
    G.save('select');
    const from = local($('cpCount')), n = Math.min(cost, 18), per = cost / n;
    for (let i = 0; i < n; i++) V.pellets.push({ x0: from.x, y0: from.y + 6, x: from.x, y: from.y, x1: 480 + (Math.random() - 0.5) * 24, y1: TOOL_Y + (Math.random() - 0.5) * 24, t: -i * 0.025, dur: 0.42, arc: 50 + Math.random() * 50, val: per, dir: -1, last: i === n - 1, tool: id });
    V.disp = st.camp.compost + cost;
    G.sfx('charge', 1.8);
    return true;
  }
  function pelletOut(p) {
    burstAt(p.x1, p.y1, ['#b5d65a', '#fee761'], 2, 60, 20, 200);
    G.sfx('orb', 0.9 + Math.random() * 0.2);
    if (!p.last) return;
    // 工具成形：白光一闪、一圈光环、金星
    const id = p.tool, lv = G.campLv(id), done = lv >= maxLv(id);
    V.disp = S().camp.compost;
    renderCount();
    V.flashT = 0.5; V.popT = 0.35; V.glow = 1; V.jolt = 1;
    burstAt(480, TOOL_Y, [...METAL, '#feae34'], 34, 280, 120);
    ring(480, TOOL_Y, 10, 0.6, '#fee761'); ring(480, TOOL_Y, 4, 0.8, '#ffffff');
    shake(done ? 6 : 4, done ? 0.3 : 0.18);
    if (done) {
      text(480, TOOL_Y - 70, '满级！', '#fee761', true, true, 'big', 2);
      text(480, TOOL_Y - 46, `${UP[id].name}做好了`, '#ffffff', false, false, 'bigName', 2);
      G.sfx('levelup'); G.sfx('crit'); V.abT = 0.4;
    } else {
      text(480, TOOL_Y - 70, lv > 1 ? `第 ${lv} 级！` : '做好了！', '#fee761', true, false, 'big', 1.6);
      text(480, TOOL_Y - 46, UP[id].text(UP[id].val[lv]), '#ffffff', false, false, 'bigName', 1.6);
      G.sfx('levelup');
    }
    renderTools(); renderPlan(true);
  }

  // ================= 按住：翻堆 / 打造 =================
  function holdLabel() {
    const b = $('cpHold');
    if (panel === 'compost') { $('cpHoldT').innerHTML = '按住翻堆 <kbd>空格</kbd>'; b.disabled = !V.pile.length || !!V.haul; return; }
    const id = curTool(), lv = G.campLv(id), done = lv >= maxLv(id);
    $('cpHoldT').innerHTML = done ? '已经满级' : `按住${lv ? '改进' : '打造'} <kbd>空格</kbd>`;
    b.disabled = done;
  }
  function startHold() {
    if (V.hold || V.haul) return;
    const b = $('cpHold');
    if (panel === 'compost') {
      if (!V.pile.some(u => u.landed)) { nudge(b); G.sfx('fail'); return; }
    } else {
      const id = curTool(), lv = G.campLv(id), cost = UP[id].cost[lv];
      if (lv >= maxLv(id) || V.flashT > 0.3 || V.pellets.length) { nudge(b); G.sfx('fail'); return; }
      if (S().camp.compost < cost) {
        nudge(b); G.sfx('fail'); nudge($('cpCount').querySelector('.nb-num'));
        text(480, 150, `堆肥不够，还差 ${cost - S().camp.compost}`, '#ff8a8a', false, false, 'lack');
        return;
      }
    }
    V.hold = { t: 0, need: panel === 'compost' ? 0.7 : 1.1 };
    V.swing = 0;
    b.classList.add('held');
  }
  function endHold() {
    if (!V.hold) return;
    V.hold = null;
    $('cpHold').classList.remove('held');
    $('cpHold').querySelector('.rc-bar i').style.width = '0';
  }
  document.addEventListener('pointerup', endHold);
  document.addEventListener('pointercancel', endHold);
  $('cpHold').onpointerdown = e => { if (e.button === 0) startHold(); };
  function holdTick(dt) {
    const h = V.hold;
    if (!h) return;
    h.t += dt;
    const p = Math.min(1, h.t / h.need);
    $('cpHold').querySelector('.rc-bar i').style.width = (p * 100).toFixed(0) + '%';
    V.glow = Math.max(V.glow, 0.3 + p * 0.6);
    if (panel === 'compost') {
      // 翻堆：肥堆左右晃，土块绕着堆转，越来越快
      V.wob = p;
      if (Math.floor((h.t - dt) * 10) !== Math.floor(h.t * 10)) G.sfx('charge', 0.7 + p * 0.6);
      if (Math.random() < dt * (10 + p * 40)) {
        const a = Math.random() * TAU;
        V.parts.push({ x: 480 + Math.cos(a) * 80, y: 340 + Math.sin(a) * 14, vx: -Math.sin(a) * 120 * (0.5 + p), vy: -60 - p * 80, life: 0.5, max: 0.5, col: HEAP[Math.floor(Math.random() * 4)], s: 4, g: 300 });
      }
      if (p >= 1) { endHold(); V.wob = 0; dump(); }
    } else {
      // 打造：锤子抬起、砸下，越敲越快；每一下火星、石台一震
      const f = 2.2 + p * 7, prev = V.swing;
      V.swing = (V.swing + dt * f) % 1;
      if (V.swing < prev) strike(p);
      if (p >= 1) { endHold(); forge(); }
    }
  }
  function strike(p) {
    const x = 480 + 36, y = TOOL_Y + 12;
    burstAt(x, y, METAL, 6 + Math.round(p * 8), 150 + p * 120, 90);
    V.hitT = 0.08; V.jolt = Math.min(1, V.jolt + 0.4);
    G.sfx('smash', 2.2 + p * 1.2); G.sfx('tick', 1.4 + p * 0.6);
    shake(1 + p * 2, 0.06);
  }

  // ================= 每帧 =================
  function frame(now) {
    if (!panel) return;
    const dt = Math.max(0, Math.min(0.05, (now - V.last) / 1000)); // rAF 的时间戳可能比 performance.now() 早一点
    V.last = Math.max(V.last, now);
    tick(dt);
    draw();
    V.raf = requestAnimationFrame(frame);
  }
  const arcPos = (o, e) => { const u = Math.min(1, o.t / o.dur), k = e ? 1 - Math.pow(1 - u, 2) : u; o.x = o.x0 + (o.x1 - o.x0) * k; o.y = o.y0 + (o.y1 - o.y0) * k - o.arc * 4 * u * (1 - u); return u; };
  function tick(dt) {
    V.t += dt;
    holdTick(dt);
    V.jolt = Math.max(0, V.jolt - dt * 4);
    V.glow = Math.max(0.2, V.glow - dt * 0.8);
    V.hitT = Math.max(0, V.hitT - dt); V.flashT = Math.max(0, V.flashT - dt); V.popT = Math.max(0, V.popT - dt);
    if (!V.hold) V.wob = Math.max(0, V.wob - dt * 4);
    for (const u of V.pile) {
      if (u.landed) continue;
      u.t += dt;
      if (u.t < 0) continue;
      if (arcPos(u) >= 1) land(u);
    }
    for (const s of V.sinkers) { s.t += dt; if (s.t >= s.dur && !s.gone) { s.gone = true; sink(s); } }
    V.sinkers = V.sinkers.filter(s => !s.gone);
    for (const p of V.pellets) {
      p.t += dt;
      if (p.t < 0) continue;
      if (p.dir < 0 && !p.left) { p.left = true; V.disp -= p.val; renderCount('drain'); } // 从计数里飞出去的那一刻扣掉
      if (Math.random() < 0.5) V.parts.push({ x: p.x, y: p.y, vx: 0, vy: 20, life: 0.25, max: 0.25, col: p.dir > 0 ? '#b5d65a' : '#fee761', s: 4, g: 0 });
      if (arcPos(p, true) >= 1) { p.gone = true; if (p.dir > 0) pelletIn(p); else pelletOut(p); }
    }
    V.pellets = V.pellets.filter(p => !p.gone);
    for (const p of V.parts) { p.life -= dt; if (p.ring) p.r += dt * 260; else { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; } }
    V.parts = V.parts.filter(p => p.life > 0);
    for (const t of V.texts) { t.life -= dt; t.y -= dt * (t.big ? 20 : 40); }
    V.texts = V.texts.filter(t => t.life > 0);
    // 环境：肥堆冒着淡淡的热气、偶尔飞来一只小虫；工作台上浮着灰
    if (panel === 'compost') {
      if (Math.random() < dt * (2 + V.pile.length * 0.3)) V.parts.push({ x: 480 + (Math.random() - 0.5) * 140, y: 330, vx: (Math.random() - 0.5) * 8, vy: -18, life: 2, max: 2, col: 'steam', s: 6, g: -4 });
    } else if (Math.random() < dt * 2) V.parts.push({ x: 480 + (Math.random() - 0.5) * 300, y: 280 + Math.random() * 40, vx: (Math.random() - 0.5) * 6, vy: -6, life: 2.4, max: 2.4, col: 'mote', s: 2, g: 0 });
    // 震屏 / 色差
    V.shakeT = Math.max(0, V.shakeT - dt);
    const k = V.shakeT > 0 ? V.shakeK : 0;
    if (!k) V.shakeK = 0;
    $('cpStage').style.transform = k ? `translate(${Math.round((Math.random() - 0.5) * k * 2)}px, ${Math.round((Math.random() - 0.5) * k * 2)}px)` : '';
    V.abT = Math.max(0, V.abT - dt);
    $('game').classList.toggle('aberr', V.abT > 0 && !!(G.opts && G.opts.shake));
  }

  // ================= 绘制 =================
  function draw() {
    const c = $('cpFx').getContext('2d'), comp = panel === 'compost';
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 960, 540);
    c.imageSmoothingEnabled = false;
    // 道具后面的光：堆肥坑是暖绿，工作台是炉火一样的橙
    const gc = comp ? '#86b257' : '#feae34', gy = comp ? 330 : TOOL_Y + 40;
    const g = c.createRadialGradient(480, gy, 10, 480, gy, 260);
    g.addColorStop(0, hexA(gc, 0.16 + V.glow * 0.22)); g.addColorStop(1, hexA(gc, 0));
    c.fillStyle = g; c.fillRect(210, gy - 270, 540, 540);
    const img = IMG[comp ? 'compost' : 'bench'];
    if (img) {
      const w = img.width * PK, h = img.height * PK;
      c.fillStyle = 'rgba(10,8,14,.55)'; c.fillRect(480 - w * 0.45, BASE - 4, w * 0.9, 10);
      // 落料 / 砸一下时压扁再弹回；翻堆时左右晃
      const sq = Math.sin(V.jolt * Math.PI) * V.jolt, wob = V.wob ? Math.round(Math.sin(V.t * (20 + V.wob * 30)) * V.wob * 3) * 2 : 0;
      c.save();
      c.translate(480 + wob, BASE); c.scale(1 + sq * 0.05, 1 - sq * 0.07); c.translate(-480, -BASE);
      c.drawImage(img, 480 - w / 2, BASE - h, w, h);
      if (comp) for (const u of V.pile) if (u.landed) icon(c, u.img, u.x, u.y, 32);
      c.restore();
    }
    if (comp) {
      for (const u of V.pile) if (!u.landed && u.t >= 0) icon(c, u.img, u.x, u.y, 36, Math.sin(u.t * 30) * 0.12);
      for (const s of V.sinkers) {
        const u = Math.max(0, s.t / s.dur);
        c.globalAlpha = 1 - u;
        icon(c, s.img, s.x, s.y + u * 14, 32 * (1 - u * 0.6));
        c.globalAlpha = 1;
      }
    } else drawTool(c);
    for (const p of V.parts) {
      const a = Math.min(1, p.life / p.max * 1.5);
      if (p.ring) { pxRing(c, p.x, p.y, p.r, p.col, a); continue; }
      if (p.col === 'steam') { c.fillStyle = `rgba(232,240,214,${0.16 * a})`; c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); continue; }
      if (p.col === 'mote') { c.fillStyle = `rgba(255,232,190,${0.5 * a})`; c.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); continue; }
      const s = p.s, x = Math.round(p.x - s / 2), y = Math.round(p.y - s / 2);
      c.globalAlpha = a;
      if (s >= 4) { c.fillStyle = FX_INK; c.fillRect(x - 2, y - 2, s + 4, s + 4); }
      c.fillStyle = p.col; c.fillRect(x, y, s, s);
      c.globalAlpha = 1;
    }
    for (const p of V.pellets) if (p.t >= 0) c.drawImage(PELLET, Math.round(p.x - 8), Math.round(p.y - 8), 16, 16);
    for (const t of V.texts) {
      c.globalAlpha = Math.min(1, t.life / t.max * 2);
      outlined(c, t.s, t.x, t.y, t.big ? 24 : 12, t.rainbow ? 'rb' : t.col);
      c.globalAlpha = 1;
    }
  }
  function icon(c, img, x, y, w, wob = 0) {
    c.drawImage(img, Math.round(x - w / 2), Math.round(y - w / 2), Math.round(w), Math.round(w * (1 + wob)));
  }
  // 工作台上悬着的工具：上下浮动，脚下一圈光；还没做的是图样，打造时从下往上一点点变成实物；锤子在右边
  function drawTool(c) {
    const id = curTool(), lv = G.campLv(id), p = V.hold ? Math.min(1, V.hold.t / V.hold.need) : 0;
    const bob = V.hold ? 0 : Math.round(Math.sin(V.t * 2.4) * 2) * 2;
    const pop = V.popT > 0 ? 1 + Math.sin(V.popT / 0.35 * Math.PI) * 0.25 : 1;
    const S6 = 72 * pop, x = 480 - S6 / 2, y = TOOL_Y - S6 / 2 + bob + (V.hitT > 0 ? 2 : 0);
    c.fillStyle = hexA('#feae34', 0.18 + V.glow * 0.2);
    c.fillRect(480 - 40, DESK, 80, 4); c.fillRect(480 - 28, DESK + 4, 56, 4);
    if (lv === 0) {
      c.drawImage(PLAN[id], Math.round(x), Math.round(y), S6, S6);
      if (p > 0) {
        const hh = Math.round(12 * p) / 12 * S6;
        c.save(); c.beginPath(); c.rect(x, y + S6 - hh, S6, hh); c.clip();
        c.drawImage(TOOL[id], Math.round(x), Math.round(y), S6, S6);
        c.restore();
        c.fillStyle = 'rgba(255,240,180,.9)'; c.fillRect(Math.round(x) - 4, Math.round(y + S6 - hh) - 2, S6 + 8, 2);
      }
    } else c.drawImage(TOOL[id], Math.round(x), Math.round(y), S6, S6);
    if (V.flashT > 0 || V.hitT > 0) {
      c.globalAlpha = V.flashT > 0 ? V.flashT * 1.6 : 0.5;
      c.globalCompositeOperation = 'lighter';
      c.drawImage(TOOL[id], Math.round(x), Math.round(y), S6, S6);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    // 锤子：手柄底端是转轴。抬起慢、砸下快；不按的时候斜靠着
    const s = V.swing, ang = V.hold ? (s < 0.7 ? -1.05 + (s / 0.7) * 1.3 : 0.25 - ((s - 0.7) / 0.3) * 1.3) : -0.35 + Math.sin(V.t * 1.5) * 0.04;
    c.save();
    c.translate(572, TOOL_Y + 44); c.rotate(ang);
    c.drawImage(HAMMER, -39, -72, 72, 72);
    c.restore();
  }
  function hexA(h, a) { const [r, g, b] = G.U.hex(h); return `rgba(${r},${g},${b},${a})`; }
  function pxRing(c, x, y, r, col, a) {
    c.globalAlpha = a; c.fillStyle = col;
    const n = Math.max(12, Math.round(r * 0.8));
    for (let i = 0; i < n; i++) { const t = i / n * TAU; c.fillRect(Math.round(x + Math.cos(t) * r) - 2, Math.round(y + Math.sin(t) * r * 0.7) - 2, 4, 4); }
    c.globalAlpha = 1;
  }
  const RB = ['#ff6b6b', '#feae34', '#fee761', '#63c74d', '#2ce8f5', '#7c8cff', '#e070e0'];
  function outlined(c, s, x, y, size, col) {
    c.font = `${size}px FusionPixel, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = FX_INK;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [2, 2]]) c.fillText(s, Math.round(x + dx), Math.round(y + dy));
    if (col === 'rb') {
      const w = c.measureText(s).width; let cx = x - w / 2;
      c.textAlign = 'left';
      [...s].forEach((ch, i) => { c.fillStyle = RB[(i + Math.floor(V.t * 10)) % RB.length]; c.fillText(ch, Math.round(cx), Math.round(y + Math.sin(V.t * 8 + i) * 2)); cx += c.measureText(ch).width; });
      c.textAlign = 'center';
    } else { c.fillStyle = col; c.fillText(s, Math.round(x), Math.round(y)); }
  }

  // 开着时的按键：Esc / F 关上；空格 按住翻堆 / 打造；工作台 W / S 选；堆肥坑 ⌫ 拿回最后丢的那份
  Camp.key = function (k, e) {
    if (k === 'Escape' || k === 'f') { e.preventDefault(); Camp.close(); return; }
    if (k === ' ') { e.preventDefault(); if (!e.repeat) startHold(); return; }
    if (e.repeat) return;
    if (panel === 'compost') {
      if (k === 'Backspace' && V.pile.length) { e.preventDefault(); takeBack(V.pile[V.pile.length - 1].id); }
      return;
    }
    const mv = { w: -1, ArrowUp: -1, s: 1, ArrowDown: 1 }[k];
    if (mv) { e.preventDefault(); pick((sel + mv + BENCH.length) % BENCH.length); }
  };
  Camp.keyUp = k => { if (k === ' ') endHold(); };
  $('cpClose').onclick = () => Camp.close();
})();
