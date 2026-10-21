// 矢量美术（沿用绘本版）：材料图标、种子、药瓶。像素版由 pixel.js 把它们缩小并收色成像素图
(function () {
  const INK = '#3d2617';
  const TAU = Math.PI * 2;
  G.INK = INK;

  // 材料主色：果实、粒子、炼金锅液体都用它
  G.MAT_COLOR = {
    leftFlower: '#e7609f', rightFlower: '#4f93d8', windFruit: '#7cbf4e', ironOre: '#9aa8bd', ashMoss: '#d9774a',
    elmCoin: '#b8d27a', thornSpike: '#e08a3a', water: '#7fb5cf', bud: '#9ccf6a',
    fern: '#5f9a5a', tamariskSprout: '#d77a9e', oleasterBloom: '#f2df7a', poplarTear: '#e0b44a',
    thornSugar: '#e8c06a', stoneWhisker: '#c8b89a', poplarFluff: '#f2efe6',
  };

  G.mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------- 材料图标：在 20×20 的设计空间里绘制，(x, y) 为中心，s 为半宽 ----------
  const ICONS = {
    leftFlower(c) { flower(c, '#e7609f', '#f7b6d2'); },
    rightFlower(c) { c.scale(-1, 1); flower(c, '#4f93d8', '#b4d4f2'); },
    windFruit(c) {
      swoosh(c, [[-10, -4], [-6, -6], [-2, -4]]); swoosh(c, [[-11, 1], [-7, 0], [-3, 1]]); swoosh(c, [[-9, 6], [-6, 5], [-3, 6]]);
      c.beginPath(); c.moveTo(1.5, -5.5); c.quadraticCurveTo(2, -8, 4, -9); ink(c, 1.3, '#5a3a26');
      leaf(c, 4.5, -8, -0.4, 4, '#7fb052');
      const g = c.createRadialGradient(-0.5, -1.5, 0.5, 1.5, 1, 7);
      g.addColorStop(0, '#d6f0a4'); g.addColorStop(0.5, '#7cbf4e'); g.addColorStop(1, '#4b8a33');
      c.beginPath(); c.arc(1.5, 1, 6.5, 0, TAU); c.fillStyle = g; c.fill(); ink(c, 1.4);
      hl(c, -1.2, -1.8, 1.8, 1.1);
    },
    ironOre(c) {
      c.beginPath(); c.moveTo(-9, 8); c.lineTo(-7, 3); c.lineTo(-2, 1.5); c.lineTo(5, 2); c.lineTo(9, 5); c.lineTo(8.5, 8.5); c.closePath();
      c.fillStyle = '#8f8478'; c.fill(); ink(c, 1.3);
      crystal(c, -3.5, 5, -0.35, 4.5, 11, '#b8c6da');
      crystal(c, 3.5, 5, 0.3, 3.6, 8.5, '#93a6c2');
      crystal(c, 0, 5.5, 0, 4.2, 13, '#dfe8f4');
      sparkle(c, 6.5, -6, 2, '#ffffff');
    },
    ashMoss(c) {
      c.beginPath(); c.moveTo(4, -4); c.bezierCurveTo(1, -7, 7, -9, 3, -12); c.strokeStyle = 'rgba(120,110,100,.7)'; c.lineWidth = 1.1; c.lineCap = 'round'; c.stroke();
      c.beginPath(); c.moveTo(-9.5, 7.5);
      [[-8, 1], [-4, -2.5], [0.5, -3.5], [5, -2], [8.5, 1.5]].forEach(([x, y], i, a) => {
        const px = i ? a[i - 1][0] : -9.5, py = i ? a[i - 1][1] : 7.5;
        c.quadraticCurveTo((px + x) / 2 - 0.5, Math.min(py, y) - 2.4, x, y);
      });
      c.lineTo(9.5, 7.5); c.closePath();
      c.fillStyle = '#6f665e'; c.fill(); ink(c, 1.4);
      c.fillStyle = '#8c8279';
      for (const [x, y, r] of [[-5, 2, 2.2], [1, 0.5, 2.6], [5.5, 3, 2]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      for (const [x, y, r] of [[-3, 4.5, 1.3], [3, 3.5, 1.5], [-6.5, 5.5, 0.9], [6.5, 5.8, 1]]) {
        glowDot(c, x, y, r * 2.4, 'rgba(255,150,70,.35)');
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#ff9a4a'; c.fill();
        c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU); c.fillStyle = '#ffe2a0'; c.fill();
      }
    },
    // ---- 反应材料（产出型植物的特产） ----
    thornSpike(c) {
      // 棘刺：一段沙棘枝，上面几根尖硬的刺，挂着一粒橙色小果
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(-9, 8); c.quadraticCurveTo(-1, 2, 9, -8); ink(c, 3.2); c.strokeStyle = '#7a5a3a'; c.lineWidth = 2; c.stroke();
      for (const [x, y, a, l] of [[-5, 5, -2.2, 6], [-1, 2, 0.9, 6.5], [3, -2, -2.3, 7], [6, -5, 0.8, 5.5]]) {
        c.beginPath(); c.moveTo(x - Math.sin(a) * 1.2, y + Math.cos(a) * 1.2); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.lineTo(x + Math.sin(a) * 1.2, y - Math.cos(a) * 1.2); c.closePath();
        c.fillStyle = '#c9b08a'; c.fill(); ink(c, 0.9);
      }
      c.beginPath(); c.arc(-3.5, -3, 2.6, 0, TAU); c.fillStyle = '#f0a040'; c.fill(); ink(c, 1);
      hl(c, -4.3, -3.8, 0.9, 0.6);
    },
    elmCoin(c) {
      // 榆钱：一串圆圆的翅果，中间鼓着一粒种子
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(-9, -9); c.quadraticCurveTo(-2, -6, 2, 9); ink(c, 2.4); c.strokeStyle = '#7a5a3a'; c.lineWidth = 1; c.stroke();
      for (const [x, y, r] of [[-5, -5, 4.2], [3, -3, 4.6], [-2.5, 3.5, 4.4], [5, 5, 3.6]]) {
        c.beginPath(); c.arc(x, y, r, 0, TAU);
        const g = c.createRadialGradient(x, y, 0.3, x, y, r); g.addColorStop(0, '#e4efb8'); g.addColorStop(1, '#a8c46a');
        c.fillStyle = g; c.fill(); ink(c, 1);
        c.beginPath(); c.ellipse(x, y, r * 0.3, r * 0.42, 0.4, 0, TAU); c.fillStyle = '#c9a868'; c.fill();
      }
    },
    bud(c) {
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 10); c.quadraticCurveTo(-1, 6, 0, 2); ink(c, 3); c.strokeStyle = '#6a9e46'; c.lineWidth = 1.5; c.stroke();
      leaf(c, 0, 6, -2.6, 6, '#7fb052');
      leaf(c, 0, 7, -0.5, 5.5, '#7fb052');
      c.beginPath(); c.moveTo(0, 3); c.bezierCurveTo(-7, 0, -5, -9, 0, -11); c.bezierCurveTo(5, -9, 7, 0, 0, 3);
      const g = c.createLinearGradient(0, -11, 0, 3); g.addColorStop(0, '#d9f0a8'); g.addColorStop(1, '#79b24a');
      c.fillStyle = g; c.fill(); ink(c, 1.4);
      c.beginPath(); c.moveTo(0, 2); c.quadraticCurveTo(-2.5, -4, 0, -10); c.strokeStyle = 'rgba(61,38,23,.45)'; c.lineWidth = 0.9; c.stroke();
      hl(c, 2, -5, 1.2, 2);
    },
    // ---- 空洞植株 ----
    fern(c) {
      c.lineCap = 'round';
      // 三片羽状叶从根部散开，叶尖卷起
      for (const [rot, len] of [[-0.55, 15], [0, 17], [0.6, 14]]) {
        c.save(); c.translate(0, 9); c.rotate(rot);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(1.5, -len * 0.5, 0, -len); ink(c, 2.4); c.strokeStyle = '#4f7f3c'; c.lineWidth = 1.1; c.stroke();
        for (let k = 1; k < 7; k++) {
          const y = -len * k / 7.5, l = 3.6 * (1 - k / 9);
          for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(0.3, y); c.quadraticCurveTo(sd * l * 0.6, y - 1.6, sd * l, y - 0.6); c.lineTo(0.3, y + 0.8); c.fillStyle = k % 2 ? '#6aa95a' : '#82bd66'; c.fill(); c.strokeStyle = '#2c4429'; c.lineWidth = 0.6; c.stroke(); }
        }
        c.beginPath(); c.arc(-1, -len - 0.6, 1.3, -0.5, 4); ink(c, 1.1, '#2c4429');
        c.restore();
      }
    },
    // ---- 树木特产 ----
    tamariskSprout(c) {
      c.lineCap = 'round';
      // 红色的根芽：一段粗根上冒出两枝粉红嫩芽
      c.beginPath(); c.moveTo(-9, 7); c.quadraticCurveTo(-2, 4, 9, 7); ink(c, 4.6); c.strokeStyle = '#b96b4d'; c.lineWidth = 2.8; c.stroke();
      for (const [x, rot] of [[-3, -0.35], [3.5, 0.3]]) {
        c.save(); c.translate(x, 5); c.rotate(rot);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-1, -6, 0, -10); ink(c, 2.6); c.strokeStyle = '#9a4f3c'; c.lineWidth = 1.1; c.stroke();
        for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(0.4 * (k % 2 ? 1 : -1), -10 + k * 1.8, 1.5, 1.1, 0, 0, TAU); c.fillStyle = k % 2 ? '#f0b6d0' : '#d77a9e'; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.6; c.stroke(); }
        c.restore();
      }
    },
    oleasterBloom(c) {
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(-8, 9); c.quadraticCurveTo(-4, 0, 6, -6); ink(c, 2.6); c.strokeStyle = '#8a7a5a'; c.lineWidth = 1.2; c.stroke();
      leaf(c, -4, 3, -0.4, 7, '#a3b8a4');
      // 沙枣花：小小的四瓣黄花，香气飘散
      for (const [x, y, s] of [[-2, -1, 1], [3, -4.5, 1.1], [5.5, 1.5, 0.85]]) {
        c.save(); c.translate(x, y); c.scale(s, s);
        for (let k = 0; k < 4; k++) { c.save(); c.rotate(k * TAU / 4 + 0.4); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(2.4, -1, 0, -4); c.quadraticCurveTo(-2.4, -1, 0, 0); c.fillStyle = '#f7e88a'; c.fill(); ink(c, 0.8); c.restore(); }
        c.beginPath(); c.arc(0, 0, 0.9, 0, TAU); c.fillStyle = '#d9a73a'; c.fill();
        c.restore();
      }
      swoosh(c, [[-10, -6], [-7, -9], [-3, -8]]);
    },
    poplarTear(c) {
      // 胡杨泪：树干渗出的琥珀色树脂
      c.beginPath(); c.moveTo(-3, -10); c.bezierCurveTo(3, -4, 8, 1, 7, 5); c.arc(0, 5, 7, 0, Math.PI); c.bezierCurveTo(-7, 1, -6, -5, -3, -10);
      const g = c.createLinearGradient(0, -10, 0, 12); g.addColorStop(0, '#f8e0a0'); g.addColorStop(0.5, '#e0b44a'); g.addColorStop(1, '#a8701e');
      c.fillStyle = g; c.fill(); ink(c, 1.4);
      c.beginPath(); c.ellipse(0.5, 5, 3.2, 2.6, 0, 0, TAU); c.fillStyle = 'rgba(255,240,200,.35)'; c.fill();
      hl(c, -3, -1, 1.2, 2.6);
      sparkle(c, 6.5, -7, 1.7, '#fff4c8');
    },
    thornSugar(c) {
      // 刺糖：带刺的细枝上凝着几粒琥珀色的糖
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(-9, 9); c.quadraticCurveTo(-2, 2, 9, -8); ink(c, 2.6); c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.2; c.stroke();
      for (const [x, y, dx, dy] of [[-5, 5, -3, -2], [-1, 1, 2, 3], [3, -3, -2, -3], [6, -6, 3, 1]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx, y + dy); ink(c, 1, '#5a4024'); }
      for (const [x, y, r] of [[-3, 1, 3], [2.5, -1.5, 3.4], [5.5, 4.5, 2.6], [-6, -3, 2.4]]) {
        const g = c.createRadialGradient(x - 1, y - 1, 0.3, x, y, r);
        g.addColorStop(0, '#fff2c0'); g.addColorStop(0.55, '#e8c06a'); g.addColorStop(1, '#b07a2a');
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill(); ink(c, 1);
      }
      hl(c, 1.5, -2.5, 1.1, 0.8);
      sparkle(c, 8, 2, 1.6, '#fff8dc');
    },
    stoneWhisker(c) {
      // 绕石须：一块灰色小石头，沙枣根上的细须贴着石头绕了过去
      c.beginPath(); c.moveTo(-6, 6.5); c.quadraticCurveTo(-7.5, 0, -3, -1.5); c.quadraticCurveTo(2, -3, 5.5, 0.5); c.quadraticCurveTo(8, 4, 5, 6.5); c.closePath();
      const g = c.createRadialGradient(-2, 0, 0.5, 0, 3, 8); g.addColorStop(0, '#c8ccd4'); g.addColorStop(1, '#7a8090');
      c.fillStyle = g; c.fill(); ink(c, 1.3);
      hl(c, -2.5, 0.5, 1.4, 0.8);
      c.lineCap = 'round';
      const whisker = () => { c.beginPath(); c.moveTo(-2, -10); c.quadraticCurveTo(-1, -6, -5, -3.5); c.bezierCurveTo(-10, 0, -9.5, 8, -4, 9); c.quadraticCurveTo(0, 10, 2, 11); };
      whisker(); ink(c, 2.8); whisker(); c.strokeStyle = '#e8d8b0'; c.lineWidth = 1.3; c.stroke();
      for (const [x, y, dx, dy] of [[-7.5, -0.5, -2.5, -1.5], [-8, 4.5, -2.5, 1], [-5, 8.5, -1, 2.5]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx, y + dy); ink(c, 0.8, '#a89060'); }
    },
    poplarFluff(c) {
      // 杨絮：一团轻飘飘的白絮，裹着几粒小种子
      swoosh(c, [[-11, 6], [-8, 3], [-5, 5]]);
      for (const [x, y, r] of [[-3, 0, 5], [3, -2, 5.5], [1, 3.5, 4.5], [5.5, 3, 3.6], [-1, -5, 4]]) {
        const g = c.createRadialGradient(x - 1, y - 1, 0.3, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ddd8ca');
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill();
      }
      c.beginPath();
      for (const [x, y, r] of [[-3, 0, 5], [3, -2, 5.5], [1, 3.5, 4.5], [5.5, 3, 3.6], [-1, -5, 4]]) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.strokeStyle = 'rgba(61,38,23,.55)'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = '#7a5a3a';
      for (const [x, y] of [[-1.5, -1], [2.5, 1], [0.5, -3.5]]) { c.beginPath(); c.ellipse(x, y, 0.7, 1.1, 0.5, 0, TAU); c.fill(); }
      sparkle(c, 8, -7, 1.5, '#ffffff');
    },
    water(c) {
      c.beginPath(); c.moveTo(0, -9); c.bezierCurveTo(3, -4, 7, 0, 7, 3.5); c.arc(0, 3.5, 7, 0, Math.PI); c.bezierCurveTo(-7, 0, -3, -4, 0, -9);
      const g = c.createLinearGradient(0, -9, 0, 10);
      g.addColorStop(0, '#bfe0ef'); g.addColorStop(1, '#5d9bbd');
      c.fillStyle = g; c.fill(); ink(c, 1.4);
      hl(c, -3, 2, 1.4, 2.4);
    },
  };

  function ink(c, w, col) { c.strokeStyle = col || INK; c.lineWidth = w; c.lineJoin = 'round'; c.stroke(); }
  function hl(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, -0.6, 0, TAU); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill(); }
  function glowDot(c, x, y, r, col) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,150,70,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function sparkle(c, x, y, r, col) {
    c.beginPath();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU - Math.PI / 2, rr = k % 2 ? r * 0.3 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.5; c.stroke();
  }
  function leaf(c, x, y, rot, len, col) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
    c.fillStyle = col; c.fill(); ink(c, 1.1, '#2c4429');
    c.restore();
  }
  function swoosh(c, pts) {
    c.lineCap = 'round';
    const path = () => { c.beginPath(); c.moveTo(...pts[0]); c.quadraticCurveTo(...pts[1], ...pts[2]); };
    path(); c.strokeStyle = 'rgba(61,38,23,.5)'; c.lineWidth = 2.2; c.stroke();
    path(); c.strokeStyle = '#ffffff'; c.lineWidth = 1.1; c.stroke();
  }
  function crystal(c, x, y, rot, w, h, col) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -h * 0.7); c.lineTo(0, -h); c.lineTo(w / 2, -h * 0.7); c.lineTo(w / 2, 0); c.closePath();
    c.fillStyle = col; c.fill(); ink(c, 1.2);
    c.beginPath(); c.moveTo(0, -h); c.lineTo(0, 0); c.strokeStyle = 'rgba(61,38,23,.35)'; c.lineWidth = 0.7; c.stroke();
    c.beginPath(); c.moveTo(-w / 2 + 0.8, -h * 0.65); c.lineTo(-w / 2 + 0.8, -1); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 0.9; c.stroke();
    c.restore();
  }
  function flower(c, col, light) {
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(1.5, 10); c.quadraticCurveTo(-2.5, 5, 0, -2); ink(c, 2.8); c.strokeStyle = '#6a9e46'; c.lineWidth = 1.3; c.stroke();
    leaf(c, 0, 5.5, -0.5, 5, '#7fb052');
    c.save(); c.translate(0, -3.5);
    for (let k = 0; k < 5; k++) {
      c.save(); c.rotate(k * TAU / 5);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(5.2, -1.2, 6.2, -5.4); c.quadraticCurveTo(2.2, -6.6, 0, 0);
      c.fillStyle = k % 2 ? col : light; c.fill(); ink(c, 1.1);
      c.restore();
    }
    c.beginPath(); c.arc(0, 0, 2, 0, TAU); c.fillStyle = '#f6d36b'; c.fill(); ink(c, 1);
    c.restore();
  }

  G.drawMaterial = function (c, id, x, y, s) {
    const fn = ICONS[id];
    if (!fn) return;
    c.save(); c.translate(x, y); c.scale(s / 10, s / 10);
    fn(c);
    c.restore();
  };


  // ---------- 种子：颜色取自植物的叶色，等级越高种子越大 ----------
  G.seedCanvas = sp => {
    const tr = G.TREES[sp], [dark, mid, light, hi] = tr.form.leaf;
    const cv = G.mkCanvas(96, 96), c = cv.getContext('2d');
    c.translate(48, 52); c.scale(4.2, 4.2);
    const k = 0.75 + tr.tier * 0.1;
    c.scale(k, k);
    c.beginPath(); c.ellipse(0, 3, 6.5, 8, 0.35, 0, TAU);
    const g = c.createRadialGradient(-2, 0, 1, 0, 3, 9); g.addColorStop(0, '#f2d9a6'); g.addColorStop(1, '#a57846');
    c.fillStyle = g; c.fill(); ink(c, 1.3);
    c.beginPath(); c.moveTo(-1.5, -3); c.quadraticCurveTo(2.5, 2, 1, 9); c.strokeStyle = 'rgba(61,38,23,.4)'; c.lineWidth = 0.9; c.stroke();
    c.beginPath(); c.moveTo(1, -4); c.quadraticCurveTo(0, -8, 2, -10); ink(c, 2.6); c.strokeStyle = mid; c.lineWidth = 1.2; c.stroke();
    leaf(c, 2, -10, -2.4, 5, light);
    leaf(c, 2, -10, -0.6, 5, hi);
    hl(c, -2.5, 0, 1.3, 2.2);
    return cv;
  };

  // ---------- 药瓶：外观由指令自动生成（自下而上依次是第 1、2、3 条指令的颜色） ----------
  function bottleCanvas(potion) {
    const K = 96 / 36;
    const cv = G.mkCanvas(96, 128), c = cv.getContext('2d');
    c.scale(K, K);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const cx = 18, cy = 31, R = 13.2, nL = 13.6, nR = 22.4, nTop = 8.5;
    const a0 = Math.atan2(-Math.sqrt(R * R - (nR - cx) ** 2), nR - cx), a1 = Math.atan2(-Math.sqrt(R * R - (nL - cx) ** 2), nL - cx) + TAU;
    const shape = () => { c.beginPath(); c.moveTo(nL, nTop); c.lineTo(nR, nTop); c.arc(cx, cy, R, a0, a1); c.closePath(); };
    // 影子
    c.fillStyle = 'rgba(61,38,23,.18)'; c.beginPath(); c.ellipse(cx + 1, 45.5, 11, 2, 0, 0, TAU); c.fill();
    // 玻璃底色
    shape(); c.fillStyle = 'rgba(232,242,246,.85)'; c.fill();
    // 液体分层
    const ins = potion.instructions, n = Math.max(1, ins.length);
    const top = 21.5, bottom = cy + R;
    c.save(); shape(); c.clip();
    for (let i = 0; i < n; i++) {
      const y1 = bottom - (bottom - top) * (i / n), y0 = bottom - (bottom - top) * ((i + 1) / n);
      const col = ins[i] ? G.ACTIONS[ins[i].action].color : '#999';
      c.fillStyle = col; c.fillRect(0, y0, 36, y1 - y0 + 0.3);
      c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, y1 - 1.6, 36, 1.6);
    }
    c.beginPath(); c.ellipse(cx, top, 9.5, 1.3, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,.45)'; c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (const [x, y, r] of [[22, 38, 1.1], [14.5, 33, 0.8], [20, 28, 0.7]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    c.restore();
    // 轮廓与高光
    shape(); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.arc(cx, cy, R - 3, Math.PI * 0.95, Math.PI * 1.35); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.moveTo(nL + 1.6, nTop + 2); c.lineTo(nL + 1.6, 18); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1; c.stroke();
    // 瓶口与瓶塞
    rrect(c, 12.6, 6.6, 10.8, 2.8, 1.2); c.fillStyle = '#e8f2f6'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.1; c.stroke();
    rrect(c, 14.2, 1, 7.6, 6.2, 1.6); c.fillStyle = '#b98352'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(15.5, 3); c.lineTo(20.5, 3); c.strokeStyle = 'rgba(255,230,190,.6)'; c.lineWidth = 0.8; c.stroke();
    // 类型标记：毫升药剂瓶身有刻度，一次性药剂瓶塞有火漆封
    const mode = potion.mode || G.Alchemy.modeOf(ins);
    if (mode === 'pour') {
      c.strokeStyle = 'rgba(61,38,23,.75)'; c.lineWidth = 0.9;
      for (let k = 0; k < 4; k++) { const y = 27 + k * 4.2, l = k % 2 ? 2.6 : 4.2; c.beginPath(); c.moveTo(29.6 - l, y); c.lineTo(29.6, y); c.stroke(); }
    } else {
      c.beginPath();
      for (let k = 0; k <= 10; k++) { const a = k / 10 * TAU, rr = k % 2 ? 3.4 : 4; c.lineTo(18 + Math.cos(a) * rr, 5 + Math.sin(a) * rr); }
      c.closePath(); c.fillStyle = '#b8443a'; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.9; c.stroke();
      c.beginPath(); c.arc(18, 5, 1.6, 0, TAU); c.strokeStyle = 'rgba(255,220,200,.7)'; c.lineWidth = 0.7; c.stroke();
    }
    // 修饰标记：回响 = 紫色丝带，触障 = 红色贴纸
    if (ins.some(i => i.delay > 0)) {
      c.fillStyle = '#9a6fd6'; c.fillRect(nL - 0.4, 12, nR - nL + 0.8, 2.4);
      c.strokeStyle = INK; c.lineWidth = 0.8; c.strokeRect(nL - 0.4, 12, nR - nL + 0.8, 2.4);
      c.beginPath(); c.moveTo(nR, 13); c.lineTo(nR + 4, 11); c.lineTo(nR + 3.4, 15.5); c.closePath(); c.fillStyle = '#b896ec'; c.fill(); c.stroke();
    }
    if (ins.some(i => i.trigger === 'hit')) {
      c.beginPath(); c.arc(25, 38, 4, 0, TAU); c.fillStyle = '#e2493b'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#fff'; c.fillRect(24.4, 35.5, 1.2, 3); c.fillRect(24.4, 39.5, 1.2, 1.2);
    }
    return cv;
  }
  function rrect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  G.rrect = rrect;
  G.bottleCanvas = bottleCanvas;

  // 发光点（用于养分、树液等）
  G.glow = function (c, x, y, r, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,248,200,${a})`); g.addColorStop(0.35, `rgba(255,214,110,${a * 0.6})`); g.addColorStop(1, 'rgba(255,200,90,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  };
})();
