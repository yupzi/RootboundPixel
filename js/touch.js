// 触屏按键：左下十字键（= WASD），右下 跳（= 空格）、行动键（= F，键上写着现在会做什么）、铲（= 按住 X）
// 按下去就是按了对应的键（main.js 的 G.pressKey / G.releaseKey），和键盘走同一套逻辑
// 摸一下屏幕才出来，一碰键盘或鼠标就收起；只在地表、洞里走动（和弹出种子菜单）时显示，开着炼药、营地、库存、笔记时收起
// 按键按屏幕的实际像素摆在窗口左下、右下角：两侧黑边够宽就落在黑边里，不够就叠在画面上，这时把画面右下的按钮往上挪
// 手机竖着拿：盖一层「请横过来」，游戏停住
(function () {
  const $ = id => document.getElementById(id);
  const T = G.Touch = { on: false, portrait: false };
  const coarse = matchMedia('(pointer: coarse)');
  const held = new Map(); // 按着的手指 → 它按着的键
  let shown = false, sig = '';

  // 手指 id 改按 k（null 是松开）；换键时先松开旧的
  function hold(id, k) {
    const old = held.get(id);
    if (old === k) return;
    if (old) G.releaseKey(old);
    if (k) { held.set(id, k); G.pressKey(k); } else held.delete(id);
  }
  function releaseAll() {
    for (const k of held.values()) G.releaseKey(k);
    held.clear();
    pad.dataset.dir = '';
    for (const el of document.querySelectorAll('#touch .down')) el.classList.remove('down');
  }

  function setOn(v) {
    if (T.on === v) return;
    T.on = v;
    document.body.classList.toggle('touch', v);
    if (!v) releaseAll();
  }
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') setOn(true); else if (e.pointerType === 'mouse') setOn(false); }, { capture: true });
  addEventListener('keydown', () => setOn(false), { capture: true });

  // 十字键：一根手指按着，滑到哪个方向就换成哪个键；中间一小圈不算
  const pad = $('tPad');
  function padKey(e) {
    const r = pad.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width * 2 - 1, dy = (e.clientY - r.top) / r.height * 2 - 1;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.25) return null;
    return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'a' : 'd') : (dy < 0 ? 'w' : 's');
  }
  function padTo(e, k) { hold(e.pointerId, k); pad.dataset.dir = k || ''; }
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); padTo(e, padKey(e)); });
  pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) padTo(e, padKey(e)); });
  for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, e => padTo(e, null));

  // 右边的键：按下 = 按键，松开 = 放开；can() 不成立时按了没反应
  function btn(el, k, can) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!can()) return;
      el.setPointerCapture(e.pointerId);
      el.classList.add('down');
      hold(e.pointerId, k);
    });
    for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, e => { el.classList.remove('down'); hold(e.pointerId, null); });
  }
  let state = { act: '', dig: null };
  btn($('tJump'), ' ', () => true);
  btn($('tAct'), 'f', () => !!state.act);
  btn($('tDig'), 'x', () => !!(state.dig && state.dig.ok));
  $('touch').addEventListener('contextmenu', e => e.preventDefault());

  T.tick = function () {
    const port = (T.on || coarse.matches) && innerHeight > innerWidth;
    if (port !== T.portrait) {
      T.portrait = port;
      $('rotate').classList.toggle('hidden', !port);
      if (port) { releaseAll(); G.releaseAll(); }
    }
    const UI = G.UI;
    const vis = T.on && !port && G.state.phase === 'select' && !G.Notes.isOpen() && !UI.bagOpen() && !G.Camp.isOpen();
    if (vis !== shown) {
      shown = vis;
      $('touch').classList.toggle('hidden', !vis);
      if (!vis) releaseAll();
      sig = '';
    }
    if (!vis) { if (!sig) { sig = '-'; T.layout(); } return; }
    state = G.touchState();
    const s = [state.act, state.dig ? state.dig.ok : '', !!state.menu].join('|');
    if (s === sig) return;
    sig = s;
    const act = $('tAct');
    act.textContent = state.act;
    act.classList.toggle('off', !state.act);
    $('tDig').classList.toggle('hidden', !state.dig);
    $('tDig').classList.toggle('off', !(state.dig && state.dig.ok));
    $('tJump').classList.toggle('hidden', !!state.menu);
    T.layout();
  };

  // 按键叠到画面上时，画面左下（笔记提示）、右下（库存、笔记、设置）的东西往上挪到按键上面（舞台像素）
  T.layout = function () {
    const v = G.view, g = $('game');
    if (!v) return;
    let l = 0, r = 0;
    if (shown) {
      const bottom = v.y + 540 * v.k, lift = rc => Math.max(0, Math.ceil((bottom - rc.top) / v.k) + 8 - 12);
      const pr = pad.getBoundingClientRect();
      if (pr.right > v.x) l = lift(pr);
      let top = Infinity, left = Infinity;
      for (const el of document.querySelectorAll('#tBtns > div:not(.hidden)')) { const rc = el.getBoundingClientRect(); top = Math.min(top, rc.top); left = Math.min(left, rc.left); }
      if (left < v.x + 960 * v.k) r = lift({ top });
    }
    g.style.setProperty('--liftL', l + 'px');
    g.style.setProperty('--liftR', r + 'px');
  };
})();
