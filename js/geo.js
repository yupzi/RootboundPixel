// 地表的可站立 / 可攀爬几何：由树的骨架（和绘制用的是同一套布局）、崖台、绳梯、右侧矮崖（和崖顶上通往营地的洞口）生成
// plats：单向平台 { x0, y0, x1, y1, kind }，从上方落下才会站住
// climbs：可攀爬的折线 { pts: [[x, y]...] 从上到下, top, bot, ladder? }
// x0 / x1：左右能走到哪（有洞穴开口的那层，左边能走进崖壁里一点）
// fruits：树上果实的世界坐标 { x, y, p, f }
(function () {
  const { TILE, WORLD_W } = G.GEO;
  const TR = G.Tree, TS = TR.TS;
  const P = G.Field.prototype;
  // 右侧矮崖崖顶上的洞口（世界坐标），通往营地岩洞：洞口底就是矮崖的崖顶，洞口顶是上面压着的高岩体的岩檐（从右崖的图里量的：rceil）。
  // y 洞口底（站人的地方），top 洞口顶，x0 崖面，x1 往里走到多深就切到营地岩洞
  const CA = G.CLIFF_ART;
  P.mouth = function () {
    const rt = this.rightTop();
    if (rt === null) return null;
    return { y: rt, top: rt - (CA.rtop - CA.rceil) / G.GEO.PX, x0: WORLD_W - 1, x1: WORLD_W + 24 };
  };
  G.MOUTH_IN = 4; // 在洞口里走到离 x1 还有这么远，就切到营地岩洞

  // hy：小禾脚底的高度。右侧矮崖是实心的：脚在崖顶以下时被崖面挡住；到了崖顶那一层能走进洞口；再往上是高岩体，也挡住
  // hx：小禾的 x。进了右崖（过了崖面）就不算树的枝条、叶团、树干了：靠崖长的树枝叶会伸进洞口，不然人会被它们托着、拽着进不去
  P.surfaceGeom = function (hy = 0, hx = -Infinity) {
    const plats = [], climbs = [], fruits = [];
    const cx0 = this.camX - 80, cx1 = this.camX + G.GEO.W + 80;
    for (const p of hx >= WORLD_W - 1 ? [] : this.world.plants) {
      const bx = p.col * TILE + TILE / 2;
      if (bx < cx0 || bx > cx1) continue;
      const tr = this.treeOf(p), K = TS;
      if (!tr.B[0].p0) TR.layoutTree(tr, 1e9, 0);
      const W = (x, y) => [bx + x * K, y * K];
      for (const b of tr.B) {
        if (b.g <= 0) continue;
        const n = 6, pts = [];
        for (let i = 0; i <= n; i++) pts.push(W(...TR.bez(b, i / n * b.g)));
        // 粗一点的枝条：平缓的段可以站，陡的主干 / 一级枝可以爬
        const thick = b.w0 * K >= 0.9;
        if (thick) for (let i = 1; i <= n; i++) {
          const [ax, ay] = pts[i - 1], [cx, cy] = pts[i], dx = cx - ax;
          if (Math.abs(dx) > 0.3 && Math.abs((cy - ay) / dx) < 1.1) plats.push({ x0: ax, y0: ay, x1: cx, y1: cy, kind: 'branch' });
        }
        const steep = Math.abs(Math.cos(b.ang)) < 0.55;
        if ((b.depth === 0 || (b.depth === 1 && steep && thick))) {
          const down = pts.slice().reverse(); // 从上到下
          climbs.push({ pts: down, top: down[0][1], bot: Math.min(0, down[down.length - 1][1]), plant: p });
        }
      }
      // 叶团顶部：软软的平台，可以一路踩到树冠
      for (const cl of tr.clusters) {
        const st = TR.clusterState(cl, 1e9), rx = cl.r * cl.ax * st.s, ry = cl.r * cl.ay * st.s;
        const [x, y] = W(st.x, st.y - ry * 0.62);
        plats.push({ x0: x - rx * 0.7 * K, y0: y, x1: x + rx * 0.7 * K, y1: y, kind: 'leaf' });
      }
      for (const f of tr.fruits) { const [fx, fy] = TR.fruitPos(f, 1e9); const [x, y] = W(fx, fy); fruits.push({ x, y, p, f }); }
    }
    // 崖台与绳梯
    const lp = this.lip();
    if (lp) plats.push({ x0: lp.x0, y0: lp.y, x1: lp.x1, y1: lp.y, kind: 'lip' });
    const ld = this.ladder();
    if (ld) climbs.push({ pts: [[ld.x, ld.y0], [ld.x, ld.y1]], top: ld.y0, bot: ld.y1, ladder: lp.side });
    climbs.push(...G.Camp.climbs(this)); // 营地里搭的绳梯，从洞口垂到坑底
    const rt = this.rightTop(), m = this.mouth();
    if (rt !== null) plats.push({ x0: WORLD_W - 1, x1: WORLD_W + 60, y0: rt, y1: rt, kind: 'cliff', solid: true }); // 矮崖崖顶 = 洞口底
    const inMouth = m && hy <= m.y + 0.5 && hy >= m.top + 6; // 脚在洞口那么高的范围里，才能往里走（头可以稍微擦着洞口顶）
    return { plats, climbs, fruits, x0: this.hasCave() ? -G.CAVE.MOUTH : 4, x1: inMouth ? m.x1 - 2 : WORLD_W - 4 };
  };

  // 一株植物树上所有果实的世界坐标（铲除时让它们掉下来）
  P.fruitSpots = function (p) {
    const tr = this.treeOf(p), K = TS, bx = p.col * TILE + TILE / 2;
    if (!tr.B[0].p0) TR.layoutTree(tr, 1e9, 0);
    return tr.fruits.map(f => { const [fx, fy] = TR.fruitPos(f, 1e9); return { id: f.id, x: bx + fx * K, y: fy * K }; });
  };

  // 摘下一颗果实：从植物的果实列表里拿掉
  P.pickFruit = function (fr) {
    const list = fr.p.fruits || [];
    const i = list.indexOf(fr.f.ref);
    if (i < 0) return false;
    list.splice(i, 1);
    fr.p.fruitGen = (fr.p.fruitGen || 0) + 1;
    this.addFx('ring', fr.x, fr.y, { col: G.MAT_COLOR[fr.f.id] || '#fee761', r1: 12 });
    this.addFx('stars', fr.x, fr.y, { col: '#ffffff', n: 4 });
    this.popup(fr.x, fr.y - 4, '+' + G.MATERIALS[fr.f.id].name, '#fff2a8');
    return true;
  };
})();
