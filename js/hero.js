// 主角小禾：在坑底和树上跑跳的像素小人。A/D 走、空格跳、W/S 爬树干和绳梯，碰到果实就摘下
// 精灵来自 js/hero_sheet.js（源文件 assets/sprites/src/hero.aseprite，用 tools/import_hero.py 导出）
(function () {
  const { GEO } = G;
  const { WORLD_W } = GEO;
  const SH = G.HERO_SHEET;
  const WALK = 50;   // 世界单位 / 秒

  // ---------- 精灵帧（朝右，32×32，脚底中点在 (16, 31)） ----------
  const sheet = new Image();
  sheet.src = SH.src;
  const cache = new Map();
  // 从精灵表切出一块；图还没解码好时返回 null（不缓存）
  function cut(key, sx, sy, w, h) {
    if (cache.has(key)) return cache.get(key);
    if (!sheet.complete || !sheet.naturalWidth) return null;
    const cv = G.mkCanvas(w, h);
    cv.getContext('2d').drawImage(sheet, sx, sy, w, h, 0, 0, w, h);
    cache.set(key, cv);
    return cv;
  }
  const frame = (anim, i = 0) => { const l = SH.anim[anim], n = l[i % l.length]; return cut(n, n * SH.fw, 0, SH.fw, SH.fw); };
  const flipCache = new WeakMap();
  const flipped = cv => flipCache.get(cv) || (flipCache.set(cv, G.Px.flipX(cv)), flipCache.get(cv));
  // 绕帧中心顺时针转 q 个 90°（像素不会走样）；bot：转完后最下面一行不透明像素
  const rotCache = new WeakMap();
  function rotQ(cv, q) {
    q = ((q % 4) + 4) % 4;
    let arr = rotCache.get(cv);
    if (!arr) rotCache.set(cv, arr = []);
    if (arr[q]) return arr[q];
    const out = G.mkCanvas(cv.width, cv.height), c = out.getContext('2d'), h = cv.width / 2;
    c.translate(h, h); c.rotate(q * Math.PI / 2); c.translate(-h, -h);
    c.drawImage(cv, 0, 0);
    const d = c.getImageData(0, 0, out.width, out.height).data;
    out.bot = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) out.bot = Math.floor((i >> 2) / out.width);
    return (arr[q] = out);
  }

  // ---------- 平台跳跃 ----------
  // geo（由 Field.surfaceGeom 每帧给出）：plats 单向平台（从上方落下才会站住；solid 的不能按下 + 跳穿下去）、climbs 可攀爬的折线（树干、绳梯）
  const GRAV = 520, JUMP = 145, CLIMB = 42, FALL_MAX = 320;
  const BODY = 14;  // 身高（世界单位）

  class Hero {
    constructor() {
      this.x = 0; this.y = 0;
      this.bx0 = 4; this.bx1 = WORLD_W - 4; // 当前场景能走到的左右边界（由 geo 给出）
      this.vx = 0; this.vy = 0; this.face = 1; this.dist = 0;
      this.onGround = true; this.plat = null; this.coyote = 0; this.jumpBuf = 0; this.dropT = 0;
      this.climb = null;   // { pts, top, bot } 正在爬的树干 / 绳梯
      this.target = null;  // 点击地面后的目标 x
      this.act = null;     // 正在做的动作：{ kind: 'kneel'|'cheer'|'uproot'|开场的 'fall'|'lie'|'getup', t, dur, done }
      this.sit = false;    // 坐在地上（按 S）：走动、跳、爬就站起来
      this.blinkT = 2;
    }
    place(x, y = 0) { this.x = x; this.y = y; this.vx = this.vy = 0; this.climb = null; this.target = null; this.onGround = true; this.plat = null; this.sit = false; }
    walkTo(x) { this.target = Math.max(this.bx0, Math.min(this.bx1, x)); this.sit = false; }
    play(kind, dur, done) { this.act = { kind, t: 0, dur, done }; this.vx = 0; this.target = null; }
    onFloor() { return this.onGround && !this.plat && this.y > -0.5; } // 站在坑底的地面上（能种树的地方）
    center() { return [this.x, this.y - BODY / 2]; }

    // 某条折线在高度 y 处的 x（y 超出范围返回 null）
    static xOn(pts, y) {
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        if ((y - ay) * (y - by) <= 0 && ay !== by) return ax + (bx - ax) * (y - ay) / (by - ay);
      }
      return null;
    }
    // 找一条够得着的树干 / 绳梯：身体中段离它很近
    findClimb(geo, dir, reach = 5.5) {
      let best = null, bd = reach;
      for (const cl of geo.climbs) {
        for (const yy of [this.y - 3, this.y - 8, this.y - 12, this.y + (dir > 0 ? 3 : 0)]) {
          const x = Hero.xOn(cl.pts, yy);
          if (x === null) continue;
          const d = Math.abs(x - this.x);
          if (d < bd) { bd = d; best = cl; }
        }
      }
      return best;
    }

    update(dt, input, geo) {
      this.blinkT -= dt;
      if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;
      if (this.act) {
        const a = this.act;
        a.t += dt;
        if (a.t >= a.dur) { this.act = null; if (a.done) a.done(); }
        return;
      }
      input = input || {};
      geo = geo || { plats: [], climbs: [] };
      if (geo.x0 !== undefined) { this.bx0 = geo.x0; this.bx1 = geo.x1; }
      if (this.sit) {
        if (input.left || input.right || input.up || input.jump || this.target !== null) this.sit = false;
        else { this.vx = 0; return; }
      }
      if (input.jump) this.jumpBuf = 0.12; else this.jumpBuf -= dt;
      this.dropT -= dt;

      // ---- 攀爬中 ----
      if (this.climb) {
        const cl = this.climb, dirY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (this.jumpBuf > 0) {
          this.jumpBuf = 0; this.climb = null;
          const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          this.vy = -JUMP * 0.85; this.vx = (dx || this.face) * 55; if (dx) this.face = dx;
          G.sfx('click');
          return;
        }
        if ((input.left || input.right) && !dirY) { this.climb = null; this.vy = 0; this.vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 30; return; }
        const ny = Math.max(cl.top, Math.min(cl.bot, this.y + dirY * CLIMB * dt));
        this.dist += Math.abs(ny - this.y);
        this.y = ny;
        const x = Hero.xOn(cl.pts, this.y);
        if (x !== null) this.x = x;
        // 爬到底：落回地面 / 平台；爬到绳梯顶：翻上崖台
        if (dirY > 0 && this.y >= cl.bot - 0.01) { this.climb = null; this.y = cl.bot; if (cl.bot >= 0) { this.y = 0; this.onGround = true; this.plat = null; } }
        else if (dirY < 0 && this.y <= cl.top + 0.01 && cl.ladder) { this.climb = null; this.y = cl.top; this.x += cl.ladder * 6; this.vy = 0; }
        return;
      }

      // ---- 抓住树干 / 绳梯：按住 W 时，附近有树干就先走过去（已经站在它顶上就不去了，不然爬上崖顶还按着 W 会走回崖边掉下去） ----
      if (input.up && this.onGround && !this.target) {
        const near = this.findClimb(geo, -1, 32);
        if (near && this.y > near.top + 0.5 && !this.findClimb(geo, -1)) { const x = Hero.xOn(near.pts, this.y - 3) ?? Hero.xOn(near.pts, near.bot); if (x !== null) this.target = x; }
      }
      if ((input.up || (input.down && this.onGround)) && (!this.target || Math.abs(this.target - this.x) < 5.5)) {
        const cl = this.findClimb(geo, input.down ? 1 : -1);
        if (cl && !(input.down && this.y >= cl.bot - 0.5) && !(input.up && this.y <= cl.top + 0.5)) { // 已经在顶上了，按 W 不再抓回去
          this.climb = cl; this.vx = 0; this.vy = 0; this.onGround = false; this.plat = null; this.target = null;
          const x = Hero.xOn(cl.pts, Math.max(cl.top, Math.min(cl.bot, this.y)));
          if (x !== null) this.x = x;
          this.y = Math.max(cl.top, Math.min(cl.bot, this.y));
          return;
        }
      }

      // ---- 走 ----
      let dir = 0;
      if (input.left || input.right) { dir = (input.right ? 1 : 0) - (input.left ? 1 : 0); this.target = null; }
      else if (this.target !== null) {
        const d = this.target - this.x;
        if (Math.abs(d) < 1.2 || !this.onGround) this.target = null; else dir = Math.sign(d);
      }
      const acc = this.onGround ? (dir ? 10 : 14) : 5;
      this.vx += (dir * WALK - this.vx) * Math.min(1, dt * acc);
      if (Math.abs(this.vx) < 1 && !dir) this.vx = 0;
      if (dir) this.face = dir;

      // ---- 跳：落地前一小会儿按也算（跳跃缓冲），离开平台后一小会儿也能跳（土狼时间） ----
      if (this.onGround) this.coyote = 0.09; else this.coyote -= dt;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        if (input.down && this.plat && !this.plat.solid) { this.dropT = 0.25; this.plat = null; this.onGround = false; this.jumpBuf = 0; } // 下 + 跳：从树枝上跳下去
        else { this.vy = -JUMP; this.onGround = false; this.plat = null; this.coyote = 0; this.jumpBuf = 0; G.sfx('click'); this.dust(4); }
      }
      if (!input.jumpHeld && this.vy < -60) this.vy += GRAV * 1.3 * dt; // 松开空格：跳得矮一点

      // ---- 移动与碰撞 ----
      const px = this.x, py = this.y;
      this.vy = Math.min(FALL_MAX, this.vy + GRAV * dt);
      this.x = Math.max(this.bx0, Math.min(this.bx1, this.x + this.vx * dt));
      this.dist += Math.abs(this.x - px);
      this.y += this.vy * dt;
      const wasGround = this.onGround;
      this.onGround = false; this.plat = null;
      if (this.y >= 0) { this.y = 0; this.onGround = true; }
      else if (this.vy >= 0 && this.dropT <= 0) {
        // 单向平台：上一帧在它上面、这一帧穿过它，就站上去
        let best = null, by = Infinity;
        for (const s of geo.plats) {
          if (this.x < Math.min(s.x0, s.x1) || this.x > Math.max(s.x0, s.x1)) continue;
          const sy = s.x1 === s.x0 ? s.y0 : s.y0 + (s.y1 - s.y0) * (this.x - s.x0) / (s.x1 - s.x0);
          if (py <= sy + 1.2 && this.y >= sy - 0.01 && sy < by) { by = sy; best = s; }
        }
        if (best) { this.y = by; this.onGround = true; this.plat = best; }
      }
      if (this.onGround) {
        if (!wasGround && this.vy > 150) this.dust(6);
        this.vy = 0;
      }
      // 走路扬起的沙尘
      if (this.onGround && Math.abs(this.vx) > 30 && Math.random() < dt * (Math.abs(this.vx) / 12)) this.dust(1);
    }

    dust(n) {
      const room = G.state.room, ps = room === 'cave' ? G.Cave.particles : room === 'east' ? G.East.particles : G.field && G.field.particles;
      if (!ps) return;
      for (let i = 0; i < n; i++) ps.push({ x: this.x + (Math.random() - 0.5) * 6, y: this.y - 0.5, vx: (Math.random() - 0.5) * 30 - this.vx * 0.2, vy: -6 - Math.random() * 10, life: 0.3 + Math.random() * 0.25, col: Math.random() < 0.5 ? '#f0cf8e' : '#e4a672', size: 1 });
    }

    // 侧面的待机 / 走两套动作 + 一帧坐姿：空中定格在跑步大跨步那帧，爬树用走路帧，跪下、欢呼都用待机
    pose(T) {
      if (this.act) return this.act.kind === 'getup' ? ['sit'] : ['idle', Math.floor(T * 4)];
      if (this.sit) return ['sit'];
      if (this.climb) return ['walk', Math.floor(this.dist / 2.5)];
      if (!this.onGround) return ['run', this.vy < 0 ? 4 : 1];
      if (Math.abs(this.vx) > 4) return ['walk', Math.floor(this.dist / 5)];
      return this.blinkT < 0 ? ['blink'] : ['idle', Math.floor(T * 4)];
    }

    draw(c, X, Y, T, groundY) {
      // 开场摔下来：翻滚（跑步帧一档档转 90°）、趴在地上（待机帧转 90°，快起来时抽动两下）
      const a = this.act;
      if (a && (a.kind === 'fall' || a.kind === 'lie')) {
        const f = a.kind === 'fall' ? frame('run', 1) : frame('idle', 0);
        if (!f) return;
        const img = rotQ(this.face < 0 ? flipped(f) : f, (a.kind === 'fall' ? Math.floor(a.t / 0.08) + 1 : 1) * this.face);
        if (a.kind === 'fall') { if (groundY - Y < 60) { c.fillStyle = 'rgba(62,39,49,0.25)'; c.fillRect(X - 3, groundY, 7, 1); } c.drawImage(img, X - 16, Y - 28); return; }
        const tw = a.t > a.dur - 0.6 && Math.floor(a.t * 10) % 3 === 0 ? 1 : 0;
        c.fillStyle = 'rgba(62,39,49,0.35)'; c.fillRect(X - 12, Y, 25, 1);
        c.drawImage(img, X - 16, Y - img.bot - 1 - tw);
        return;
      }
      const f = frame(...this.pose(T));
      if (!f) return;
      const img = this.face < 0 ? flipped(f) : f;
      // 影子落在脚下的地面 / 树枝上
      if (this.onGround) { c.fillStyle = 'rgba(62,39,49,0.35)'; c.fillRect(X - 5, Y, 11, 1); c.fillRect(X - 3, Y + 1, 7, 1); }
      else if (groundY !== undefined && groundY - Y < 60) { c.fillStyle = 'rgba(62,39,49,0.25)'; c.fillRect(X - 3, groundY, 7, 1); }
      c.drawImage(img, X - 16, Y - 32);
    }
  }
  G.Hero = Hero;
})();
