// DOM 界面（960×540 的逻辑坐标，整体随窗口缩放）：对话框、地表信息、种植 HUD、药剂架、炼药界面、卡片、提示框
(function () {
  const $ = id => document.getElementById(id);
  const S = () => G.state;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { PX, TILE, COLS } = G.GEO;
  const UIK = PX * 2; // 世界单位 → 界面像素（界面是画布的 2 倍）

  const UI = {};
  G.UI = UI;

  let curPhase = 'title';
  UI.setPhase = function (phase) {
    curPhase = phase;
    $('game').className = 'phase-' + phase;
    $('surf').classList.toggle('hidden', phase !== 'select');
    $('hud').classList.toggle('hidden', phase !== 'plant');
    $('alchemy').classList.toggle('hidden', phase !== 'alchemy');
    if (phase !== 'select') { UI.closeSeedMenu(); G.Camp.close(); }
    if (phase !== 'select' && phase !== 'alchemy') UI.hideBag();
    if (phase !== 'select' && phase !== 'alchemy' && G.Notes) G.Notes.hide();
    UI.gate();
    UI.toggleSettings(false);
  };
  // 两瓶药都还躺在洞里
  UI.noPotions = () => !G.gotKit('leftFlower') && !G.gotKit('rightFlower');
  // 按阶段和开局捡到了什么，收起用不上的按钮：捡到药以前没有药剂架和库存，捡到笔记以前没有笔记按钮
  UI.gate = function () {
    const phase = curPhase, noPot = UI.noPotions();
    $('shelf').classList.toggle('hidden', phase === 'title' || phase === 'intro' || phase === 'grow' || phase === 'result' || noPot);
    // 库存：地表和炼药时都能开；炼药时它占掉右下角设置按钮的位置
    $('btnBag').classList.toggle('hidden', !(phase === 'select' || phase === 'alchemy') || noPot);
    $('btnSet').classList.toggle('hidden', phase === 'alchemy');
    // 笔记：地表自由活动和炼药时都能翻；种植、收获时收起来
    $('btnNote').classList.toggle('hidden', !(phase === 'select' || phase === 'alchemy') || !G.gotKit('book'));
  };

  // 对话框已去掉：各处的台词调用留着，但不再显示
  UI.say = function () {};
  UI.idleSay = function () {};

  // ================= 提示框 =================
  function tipFor(el) {
    const tip = el.dataset.tip;
    const extra = UI.extraTip && UI.extraTip(tip);
    if (extra) return extra;
    if (tip.startsWith('mat:')) {
      const id = tip.slice(4), m = G.MATERIALS[id];
      const trees = G.TREE_ORDER.filter(sp => G.TREES[sp].yields[id]).map(sp => G.TREES[sp].name);
      const src = m.source === 'ground' ? '地下挖掘' : m.source === 'cave' ? '地下空洞' + (trees.length ? ' · ' + trees.join('、') : '')
        : m.source === 'terrain' ? `根系经过${G.TERRAIN_NAMES[m.terrain]}后结出` + (trees.length ? ' · ' + trees.join('、') : '') : trees.join('、') + '结出';
      return `<b>${m.name}</b> <span class="t-dim">${src}</span><br>${G.Alc.knownMat(id) ? m.desc : '<span class="t-dim">还没下过锅，不知道它有什么用</span>'}`;
    }
    if (tip.startsWith('sp:')) {
      const sp = tip.slice(3), tr = G.TREES[sp], n = G.seedCount(sp);
      return `<b>${tr.name}</b> <span class="t-dim">${G.TIER_NAMES[tr.tier]} · 喜欢「${G.SOIL_NAMES[tr.tier]}」以上</span><br>
        ${G.effectText(sp).join('<br>')}<br>${tr.traitText}${G.turnText(sp) ? '<br>' + G.turnText(sp) : ''}<br><span class="t-dim">结果：${Object.keys(tr.yields).map(id => G.MATERIALS[id].name).join('、') || '不结果'}<br>
        种子：${n} 颗</span>`;
    }
    if (tip.startsWith('potion:')) {
      const p = S().potions[tip.slice(7)];
      if (!p) return '';
      return `<b>${esc(p.name)}</b> ${amountText(p)}<br><span class="t-dim">${MODE_HINT[p.mode]}</span><br>${p.instructions.map(i => '▸ ' + G.Alc.describe(i, p.mode)).join('<br>')}`;
    }
    return tip;
  }
  document.addEventListener('mousemove', e => {
    const tt = $('tooltip');
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tt.classList.add('hidden'); return; }
    const html = tipFor(el);
    if (!html) { tt.classList.add('hidden'); return; }
    tt.innerHTML = html;
    tt.classList.remove('hidden');
    const [mx, my] = UI.toLocal(e);
    let x = mx + 14, y = my + 14;
    if (x + tt.offsetWidth > 956) x = mx - tt.offsetWidth - 10;
    if (y + tt.offsetHeight > 536) y = my - tt.offsetHeight - 10;
    tt.style.left = x + 'px'; tt.style.top = y + 'px';
  });
  // 提示里的按键：键盘上显示键名；触屏时 W / S 换成十字键的 ▲ ▼，F / X 不写（行动键、铲键上自己有字）
  G.keyCap = k => {
    if (!G.Touch.on) return `<kbd>${k}</kbd>`;
    const t = { W: '▲', S: '▼' }[k];
    return t ? `<kbd>${t}</kbd>` : '';
  };
  // 屏幕坐标 → 界面逻辑坐标（960×540）
  UI.toLocal = e => { const v = G.view; return [(e.clientX - v.x) / v.k, (e.clientY - v.y) / v.k]; };

  // ================= 药剂类型 =================
  const MODE_HINT = { pour: '毫升药剂 · 按住倒入，松开即停', shot: '一次性药剂 · 按一下使用' };
  const amountText = p => p.mode === 'pour' ? `${Math.ceil(p.ml)}ml` : `×${p.count}`;
  UI.amountText = amountText;

  // ================= 飘字（坐标是相对镜头的世界单位） =================
  G.on('popup', ({ x, y, text, color, big }) => {
    const d = document.createElement('div');
    d.className = 'popup' + (big ? ' big' : '');
    d.textContent = text;
    d.style.left = Math.round(x * UIK) + 'px';
    d.style.top = Math.round(y * UIK) + 'px';
    d.style.color = color || '#fff';
    $('popups').appendChild(d);
    setTimeout(() => d.remove(), 1000);
  });

  // ================= 药效小图标 =================
  // 叠在瓶身上的一排小图标（最多 3 个；超过 3 个时画前 2 个，后面写 +n）
  const chipsHTML = ins => {
    const k = ins.length > 3 ? 2 : ins.length;
    return `<span class="pchips">${ins.slice(0, k).map(i => `<i class="pc" style="background-image:url(${G.chipURL(i)})"></i>`).join('')}${k < ins.length ? `<b>+${ins.length - k}</b>` : ''}</span>`;
  };
  UI.potionIcon = p => `<span class="picon"><img src="${G.bottleURL(p)}">${chipsHTML(p.instructions)}</span>`;
  // 说明栏：每条药效一行 = 小图标 + 效果名和修饰标签 + 白话说明（等于小图标的图例）
  UI.insHTML = (ins, mode) => ins.map(i => {
    const p = i.power || 1, tags = (p > 1 ? `<em class="t-pow">${p > 2 ? '极' : '浓'}</em>` : '') + (i.delay > 0 ? `<em class="t-echo">回响 +${i.delay}s</em>` : '') + (i.trigger === 'hit' ? '<em class="t-hit">触障</em>' : '');
    return `<div class="ins-row" style="--ac:${G.ACTIONS[i.action].color}"><i class="pc" style="background-image:url(${G.chipURL(i)})"></i>
      <div><div class="ins-h">${G.Alc.actOf(i).short}${tags}</div><div class="ins-d">${G.Alc.describe(i, mode)}</div></div></div>`;
  }).join('');

  // ================= 药剂架 & 库存 =================
  // 药剂格：左上角一条、右上角一条（格数为奇数时左边多一格）。左边那条下面是地块条
  const slotHTML = (i, p) => p
    ? `<span class="key">${i + 1}</span><img src="${G.bottleURL(p)}">${chipsHTML(p.instructions)}<i class="mode"></i><span class="cnt">${amountText(p)}</span>`
    : `<span class="key">${i + 1}</span><i class="ghost"></i>`;
  UI.slotEl = i => $('shelf').querySelector(`.hslot[data-slot="${i}"]`);
  UI.renderShelf = function () {
    const st = S(), half = Math.ceil(st.hotbar.length / 2);
    $('hotL').innerHTML = ''; $('hotR').innerHTML = '';
    st.hotbar.forEach((key, i) => {
      const p = key && st.potions[key];
      const d = document.createElement('div');
      d.className = 'hslot' + (p ? ' ' + p.mode : '');
      d.dataset.slot = i;
      if (p) d.dataset.tip = 'potion:' + key;
      d.innerHTML = slotHTML(i, p);
      d.onpointerdown = e => {
        if (e.button !== 0) return;
        if (d.hasPointerCapture(e.pointerId)) d.releasePointerCapture(e.pointerId);
        G.hotbarDown(i, e.pointerId);
      };
      d.oncontextmenu = e => { e.preventDefault(); st.hotbar[i] = null; UI.renderShelf(); };
      $(i < half ? 'hotL' : 'hotR').appendChild(d);
    });
    for (const pr of st.pouring) UI.setPouring(pr.slot, true);
    if (UI.bagOpen()) renderBag();
  };

  // 库存界面：左边是所有药剂，右边是选中那瓶的说明，下面是药剂架的两条（点格子 / 按数字键放上去）
  let bagSel = null;
  const bagCols = () => getComputedStyle($('bagList')).gridTemplateColumns.split(' ').length;
  UI.bagOpen = () => !$('bagView').classList.contains('hidden');
  UI.showBag = function () {
    const keys = Object.keys(S().potions);
    if (!keys.includes(bagSel)) bagSel = keys[0] || null;
    $('bagView').classList.remove('hidden');
    $('tooltip').classList.add('hidden');
    G.sfx('click');
    renderBag();
  };
  UI.hideBag = function () { $('bagView').classList.add('hidden'); };
  UI.toggleBag = function () { if (UI.bagOpen()) UI.hideBag(); else UI.showBag(); };
  function bagPut(i) {
    if (!bagSel) { G.sfx('fail'); return; }
    G.assignHotbar(bagSel, i);
    const el = $('bagView').querySelector(`.hslot[data-slot="${i}"]`);
    if (el) el.classList.add('fired');
  }
  function renderBag() {
    const st = S(), list = Object.values(st.potions), half = Math.ceil(st.hotbar.length / 2);
    $('bagN').textContent = list.length ? `· ${list.length} 种` : '';
    const lb = $('bagList');
    lb.innerHTML = list.length ? '' : '<div class="inv-empty">空</div>';
    for (const p of list) {
      const c = document.createElement('div'), on = st.hotbar.indexOf(p.key);
      c.className = 'bcard ' + p.mode + (bagSel === p.key ? ' sel' : '');
      c.dataset.tip = 'potion:' + p.key;
      c.innerHTML = `<img src="${G.bottleURL(p)}">${chipsHTML(p.instructions)}<span class="ct">${amountText(p)}</span>${on >= 0 ? `<span class="on">${on + 1}</span>` : ''}`;
      c.onclick = () => { bagSel = p.key; G.sfx('click'); renderBag(); };
      c.onpointerdown = e => bagDragStart(e, { key: p.key, img: G.bottleURL(p) });
      lb.appendChild(c);
    }
    const p = bagSel && st.potions[bagSel], info = $('bagInfo');
    if (p) {
      const on = st.hotbar.indexOf(p.key);
      info.innerHTML = `<div class="bi-top">${UI.potionIcon(p)}<div><div class="bi-nm">${esc(p.name)}</div>
        <div class="bi-ct">${amountText(p)}</div><div class="bi-md ${p.mode}">${MODE_HINT[p.mode]}</div></div></div>
        <div class="bi-ins">${UI.insHTML(p.instructions, p.mode)}</div>
        ${on >= 0 ? `<div class="bi-on">第 <b>${on + 1}</b> 格 <button class="pxbtn gray tiny bi-off">撤下</button></div>` : ''}`;
      const off = info.querySelector('.bi-off');
      if (off) off.onclick = () => { st.hotbar[on] = null; G.sfx('click'); UI.renderShelf(); };
    } else info.innerHTML = '';
    $('bagL').innerHTML = ''; $('bagR').innerHTML = '';
    st.hotbar.forEach((key, i) => {
      // 每格下面写出装着的药剂全名（长名字换行）
      const q = key && st.potions[key], c = document.createElement('div');
      c.className = 'bg-cell';
      c.dataset.slot = i;
      c.innerHTML = `<div class="hslot${q ? ' ' + q.mode : ''}${key && key === bagSel ? ' cur' : ''}" data-slot="${i}">${slotHTML(i, q)}</div>
        <div class="bg-nm${q ? ' ' + q.mode : ''}">${q ? esc(q.name) : '空'}</div>`;
      c.onclick = () => bagPut(i);
      if (q) c.onpointerdown = e => bagDragStart(e, { key, from: i, img: G.bottleURL(q) });
      c.oncontextmenu = e => { e.preventDefault(); st.hotbar[i] = null; G.sfx('click'); UI.renderShelf(); };
      $(i < half ? 'bagL' : 'bagR').appendChild(c);
    });
  }
  // 拖拽：把药剂卡拖到下面的格子上 = 放上药剂架；格子拖到格子上 = 两格互换；格子拖回左边的列表 = 撤下
  // 按下后挪动超过 4px 才算拖，否则还是普通点击
  let drag = null;
  const swallowClick = ev => { ev.stopPropagation(); ev.preventDefault(); };
  function bagDragStart(e, d) {
    if (e.button !== 0) return;
    e.preventDefault(); // 不让浏览器自己拖图片
    drag = Object.assign(d, { x0: e.clientX, y0: e.clientY, on: false, ghost: null, over: null });
    addEventListener('pointermove', bagDragMove);
    addEventListener('pointerup', bagDragEnd);
    addEventListener('pointercancel', bagDragEnd);
  }
  function dropAt(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return el && (el.closest('#bagView .bg-cell') || el.closest('#bagList'));
  }
  function bagDragMove(e) {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      drag.on = true;
      const k = G.view ? G.view.k : 1, g = drag.ghost = document.createElement('img');
      g.src = drag.img;
      g.className = 'bag-ghost';
      Object.assign(g.style, { width: 36 * k + 'px', height: 48 * k + 'px', margin: -24 * k + 'px 0 0 ' + -18 * k + 'px' });
      document.body.appendChild(g);
      $('bagView').classList.add('dragging');
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    const over = dropAt(e);
    if (over !== drag.over) {
      if (drag.over) drag.over.classList.remove('drop');
      drag.over = over;
      if (over) over.classList.add('drop');
    }
  }
  function bagDragEnd(e) {
    removeEventListener('pointermove', bagDragMove);
    removeEventListener('pointerup', bagDragEnd);
    removeEventListener('pointercancel', bagDragEnd);
    const d = drag;
    drag = null;
    if (!d || !d.on) return;
    d.ghost.remove();
    $('bagView').classList.remove('dragging');
    if (d.over) d.over.classList.remove('drop');
    // 拖完松手时浏览器还会补一个 click，吞掉它
    addEventListener('click', swallowClick, true);
    setTimeout(() => removeEventListener('click', swallowClick, true), 0);
    const st = S(), to = e.type === 'pointerup' ? dropAt(e) : null;
    if (!to) return;
    bagSel = d.key;
    if (to.id === 'bagList') {
      if (d.from === undefined) { renderBag(); return; }
      st.hotbar[d.from] = null;
      G.sfx('click');
      UI.renderShelf();
      return;
    }
    const i = +to.dataset.slot;
    if (d.from === undefined) { bagPut(i); return; }
    if (i !== d.from) [st.hotbar[i], st.hotbar[d.from]] = [st.hotbar[d.from], st.hotbar[i]];
    G.sfx('click');
    UI.renderShelf();
    const el = $('bagView').querySelector(`.hslot[data-slot="${i}"]`);
    if (el) el.classList.add('fired');
  }
  // 库存界面开着时的按键：B / Esc 关上，1-6 放上药剂架，方向键 / WASD 挑药剂
  UI.bagKey = function (k, e) {
    const st = S(), keys = Object.keys(st.potions);
    if (k === 'b' || k === 'Escape' || k === 'Tab') { e.preventDefault(); UI.hideBag(); return; }
    if (k >= '1' && k <= String(st.hotbar.length)) { if (!e.repeat) bagPut(+k - 1); return; }
    const n = bagCols(), mv = { a: -1, ArrowLeft: -1, d: 1, ArrowRight: 1, w: -n, ArrowUp: -n, s: n, ArrowDown: n }[k];
    if (mv && keys.length) {
      e.preventDefault();
      const to = Math.max(0, keys.indexOf(bagSel)) + mv;
      if (to < 0 || to >= keys.length) return;
      bagSel = keys[to]; G.sfx('click'); renderBag();
    }
  };
  $('bagClose').onclick = () => UI.hideBag();
  $('bagView').querySelector('.bg-dim').onclick = () => UI.hideBag();

  UI.setPouring = function (i, on) { const el = UI.slotEl(i); if (el) el.classList.toggle('pouring', on); };
  UI.updateAmount = function (i, p) {
    const el = UI.slotEl(i), c = el && el.querySelector('.cnt');
    if (c) c.textContent = amountText(p);
  };
  UI.flashSlot = function (i) { const el = UI.slotEl(i); if (!el) return; el.classList.remove('fired'); void el.offsetWidth; el.classList.add('fired'); };
  UI.toggleSettings = function (on) {
    const p = $('setPanel'), show = on === undefined ? p.classList.contains('hidden') : on;
    p.classList.toggle('hidden', !show);
    $('btnSet').classList.toggle('on', show);
  };

  // ================= 种植 HUD =================
  let lastHud = '';
  // 养分计分板：树的阶段（按树的大小）、飘字、涨跌反馈
  const STAGES = [[0.25, '幼苗'], [0.5, '小树'], [0.75, '成树'], [0.999, '大树'], [Infinity, '参天']];
  const nb = { round: null, nut: 0, fruit: 0, stage: '', drainT: 0 };
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  G.on('nutPop', ({ v, col }) => {
    const box = $('nutPops'), el = document.createElement('span'), num = $('hudNut');
    el.textContent = '+' + Math.round(v);
    el.style.setProperty('--c', col);
    el.style.left = (num.offsetLeft + num.offsetWidth + 4 + Math.random() * 10) + 'px';
    box.appendChild(el);
    setTimeout(() => el.remove(), 950);
    restart(num, 'bump');
  });
  function renderNut(f, expect) {
    if (nb.round !== f.roundSeed) Object.assign(nb, { round: f.roundSeed, nut: f.nutrients, fruit: expect, stage: '' });
    const num = $('hudNut'), n = Math.round(f.nutrients), s = String(n), pad = Math.max(0, 5 - s.length);
    if (num.dataset.n !== s) { num.dataset.n = s; num.innerHTML = `<span class="z">${'0'.repeat(pad)}</span>${s}`; }
    // 盐碱吸养分：读数变红抖动，停止下降后再恢复
    if (f.nutrients < nb.nut - 1e-6) nb.drainT = performance.now() + 200;
    num.classList.toggle('drain', performance.now() < nb.drainT);
    nb.nut = f.nutrients;
    const fr = $('hudFruit');
    fr.textContent = '×' + expect;
    if (expect > nb.fruit) restart(fr, 'bump');
    nb.fruit = expect;
    const v = f.treeV(), stage = STAGES.find(([t]) => v < t)[1], st = $('hudStage');
    if (stage !== nb.stage) { st.textContent = stage; if (nb.stage) restart(st, 'up'); nb.stage = stage; }
  }
  UI.renderHUD = function (f) {
    const t = Math.max(0, f.timeLeft);
    renderNut(f, f.expectedFruits());
    // 时限条：按 2px 一格缩短，最后 8 秒变红闪烁
    const w = Math.round(Math.min(1, t / f.roundTime) * 100 * 4) / 4, sig = w + '|' + (t < 8);
    if (sig === lastHud) return;
    lastHud = sig;
    $('barTime').style.width = w + '%';
    $('barTime').parentNode.classList.toggle('danger', t < 8);
  };

  // ================= 收获动画中的计数栏 =================
  let tally = {};
  // 树高读数：两位整数 + 一位小数，前导零压暗（和养分板一样）
  function renderHeight(m) {
    const t = m.toFixed(1).padStart(4, '0'), z = t.match(/^0(?=\d)/) ? 1 : 0;
    $('tlHNum').innerHTML = `<span class="z">${t.slice(0, z)}</span>${t.slice(z)}`;
  }
  // 新材料加一格、已有的数量 +1；变动的格子跳一下
  function renderTally(id) {
    const box = $('tlItems'), total = Object.values(tally).reduce((a, b) => a + b, 0);
    $('tlTotal').textContent = total ? '×' + total : '';
    if (!id) { box.innerHTML = ''; return; }
    let cell = box.querySelector(`[data-id="${id}"]`);
    if (!cell) {
      cell = document.createElement('span');
      cell.dataset.id = id;
      cell.innerHTML = `<img src="${G.iconURL(id)}"><i></i>`;
      const order = G.MATERIAL_ORDER, after = [...box.children].find(c => order.indexOf(c.dataset.id) > order.indexOf(id));
      box.insertBefore(cell, after || null);
    }
    cell.lastChild.textContent = tally[id];
    restart(cell, 'pop');
  }
  UI.tallyStart = function () {
    tally = {}; meter = 0;
    const box = $('growTally');
    box.classList.remove('hidden', 'done');
    $('tlTree').textContent = G.field.tree.name;
    $('tlHNum').classList.remove('fin', 'bump');
    renderHeight(0);
    renderTally();
  };
  UI.tallyHide = function () { $('growTally').classList.add('hidden'); };
  let meter = 0;
  // 每过一整米读数跳一下；到顶时放大定格，整块皮面闪一圈金边
  G.on('treeH', ({ m, final }) => {
    const num = $('tlHNum');
    renderHeight(m);
    if (!final) { if (Math.floor(m) > meter) { meter = Math.floor(m); restart(num, 'bump'); } return; }
    num.classList.remove('bump');
    restart(num, 'fin');
    restart($('growTally'), 'done');
  });
  G.on('tally', id => {
    tally[id] = (tally[id] || 0) + 1;
    renderTally(id);
  });

  // ================= 卡片 =================
  UI.overlay = function (html) {
    const o = $('overlay');
    o.classList.remove('title', 'out');
    if (!html) { o.classList.add('hidden'); o.innerHTML = ''; return o; }
    o.innerHTML = html;
    o.classList.remove('hidden');
    return o;
  };

  // ================= 标题画面 =================
  // 不用卡片：镜头停在坑底上方的天空（G.titleScene），标题直接写在天上：「种树炼金」一行，「吃果果」一个字一个字蹦下来；
  // 字底下挂一串果子，一个个冒出来轻轻晃。偶尔有一封信从崖顶飘下来，落进坑里（信只会往下掉）。菜单是几行字，前面的小芽是光标
  const TITLE_FRUITS = ['windFruit', 'thornSugar', 'elmCoin', 'poplarTear', 'rightFlower'];
  function titleLogo() {
    const ch = (s, cls, d0) => [...s].map((c, i) => `<span class="${cls}" style="animation-delay:${(d0 + i * 0.12).toFixed(2)}s">${c}</span>`).join('');
    return `<h1 class="tt-name">${ch('种树', 'g', 0)}${ch('炼金', 'au', 0.24)}</h1>
        <div class="tt-eat">${ch('吃', 'e', 0.7)}${ch('果果', 'f', 0.82)}</div>
        <div class="tt-fruits">${TITLE_FRUITS.map((id, i) => `<i style="animation-delay:${(1.5 + i * 0.15).toFixed(2)}s"><img src="${G.iconURL(id)}" style="animation-delay:${(-i * 0.5).toFixed(2)}s"></i>`).join('')}</div>`;
  }
  const SPROUT = '<svg class="tt-cur" viewBox="0 0 7 8" width="14" height="16" shape-rendering="crispEdges"><path fill="#819447" d="M0 1h2v1h1v1H1V2H0z M4 0h3v1H6v1H4z"/><path fill="#a6b04f" d="M1 1h1v1H1z M5 0h1v1H5z"/><path fill="#5d6e22" d="M3 2h1v6H3z"/></svg>';
  const LETTER = '<svg viewBox="0 0 9 7" width="18" height="14" shape-rendering="crispEdges"><path fill="#303843" d="M0 0h9v7H0z"/><path fill="#fee1b8" d="M1 1h7v5H1z"/><path fill="#f2b888" d="M1 1h1v1h1v1h1v1h1V3h1V2h1V1h1v1H7v1H6v1H5v1H4V4H3V3H2V2H1z M1 5h7v1H1z"/><path fill="#b55945" d="M4 3h1v1H4z"/></svg>';
  let title = null; // { items: [{ id, label, sub }], sel, armed, busy }
  UI.showTitle = function (save) {
    const items = save
      ? [{ id: 'cont', label: '继续', sub: `第 ${save.day} 天` }, { id: 'new', label: '重新开始' }]
      : [{ id: 'new', label: '开始' }];
    title = { items, sel: 0, armed: false, busy: false };
    const o = UI.overlay(`<div class="tt-vig"></div>
      <div class="tt-sand">${'<i></i>'.repeat(7)}</div>
      <div class="tt-letter"><div>${LETTER}</div></div>
      <div class="tt-logo">
        ${titleLogo()}
        <p class="tt-tag">掉进坑里的第一天，先种一棵树吧。</p>
        <div class="tt-menu">${items.map((it, i) => `<div class="tt-it" data-i="${i}">${SPROUT}<span class="l">${it.label}</span>${it.sub ? `<span class="s">${it.sub}</span>` : ''}</div>`).join('')}</div>
      </div>
      <p class="tt-credit">角色 <a href="https://erisesra.itch.io/character-templates-pack" target="_blank" rel="noopener">Eris Esra</a> · 字体 Fusion Pixel</p>`);
    o.classList.add('title');
    o.querySelectorAll('.tt-it').forEach(el => {
      const i = +el.dataset.i;
      el.onmouseenter = () => titleSel(i);
      el.onclick = () => { titleSel(i); titleGo(); };
    });
    titleSel(0);
  };
  function titleSel(i) {
    if (!title || title.busy) return;
    if (i !== title.sel) { title.armed = false; G.sfx('tick'); }
    title.sel = i;
    $('overlay').querySelectorAll('.tt-it').forEach((el, j) => {
      const it = title.items[j], arm = title.armed && j === i;
      el.classList.toggle('on', j === i);
      el.classList.toggle('arm', arm);
      el.querySelector('.l').textContent = arm ? '再选一次：清除所有进度' : it.label;
    });
  }
  function titleGo() {
    if (!title || title.busy) return;
    const it = title.items[title.sel];
    // 有存档时重新开始要再确认一次（就地改字，不弹浏览器的对话框）
    if (it.id === 'new' && title.items.length > 1 && !title.armed) { title.armed = true; titleSel(title.sel); G.sfx('fail'); return; }
    title.busy = true;
    G.sfx('click');
    const o = $('overlay');
    o.classList.add('out');
    if (it.id === 'cont') G.continueSoft();
    // 菜单淡出以后，小禾就从镜头上方掉下来
    setTimeout(() => { title = null; if (it.id === 'new') G.newGame(true); else UI.overlay(null); }, it.id === 'new' ? 700 : 500);
  }
  UI.titleKey = function (k, e) {
    if (!title || e.repeat) return;
    const n = title.items.length;
    if (k === 'ArrowUp' || k === 'w') titleSel((title.sel + n - 1) % n);
    else if (k === 'ArrowDown' || k === 's') titleSel((title.sel + 1) % n);
    else if (k === 'Enter' || k === ' ' || k === 'f') { e.preventDefault(); titleGo(); }
  };

  const SUIT_NAMES = ['合适', '勉强', '恶劣', '极恶劣'];
  UI.SUIT_NAMES = SUIT_NAMES;
  UI.afterHarvest = () => G.enterAlchemy();
  // 换层时的大标题
  let bannerT = 0;
  UI.banner = function (title, sub) {
    const b = $('banner');
    b.innerHTML = `<div class="bt">${esc(title)}</div><div class="bs">${esc(sub)}</div>`;
    b.classList.remove('hidden', 'show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => b.classList.add('hidden'), 3200);
  };
  // 摘果子：右上角的小计数（今天摘了什么）
  let picked = {}, pickT = 0;
  function addPicked(key, img, fit) {
    const p = picked[key] || (picked[key] = { img, fit, n: 0 });
    p.n++;
    const el = $('pickBox'), seed = Object.keys(picked).some(k => k.startsWith('seed:'));
    el.innerHTML = `<div class="ptitle">${seed ? '捡到' : '摘到'}</div><div class="tl-items">${Object.values(picked).map(q => `<span><img src="${q.img}"${q.fit ? ' style="width:auto"' : ''}>${q.n}</span>`).join('')}</div>`;
    el.classList.remove('hidden', 'bump'); void el.offsetWidth; el.classList.add('bump');
    clearTimeout(pickT);
    pickT = setTimeout(() => { el.classList.add('hidden'); picked = {}; }, 4000);
  }
  UI.fruitPicked = id => addPicked(id, G.iconURL(id));
  // 捡到鸟儿留下的种子：和果子共用右上角的小计数
  UI.seedPicked = sp => addPicked('seed:' + sp, G.seedURL(sp), true);
  // 捡到洞里前人留下的东西：右上角同一个小框
  UI.kitPicked = function (img, name) {
    const el = $('pickBox');
    picked = {};
    el.innerHTML = `<div class="ptitle">捡到</div><div class="tl-items"><span><img src="${img}" style="width:auto">${esc(name)}</span></div>`;
    el.classList.remove('hidden', 'bump'); void el.offsetWidth; el.classList.add('bump');
    clearTimeout(pickT);
    pickT = setTimeout(() => el.classList.add('hidden'), 3000);
  };
  // 种树大赛的结局：被量树魔法阵发现，组委会赶来颁奖，小禾获救
  UI.showRescue = function (tree, m) {
    const o = UI.overlay(`<div class="card px-panel pin" style="position:relative">
      <h1>获救</h1>
      <p class="loop">「参天之树」全国种树大赛，冠军诞生！</p>
      <p>坠崖第 <b>${S().day}</b> 天的清晨，坑底的${esc(tree)}长到了 <b>${m.toFixed(1)}</b> 米。量树魔法阵亮起来没多久，组委会的人就赶到了崖顶。</p>
      <p>他们一边播报，一边往下张望——谁也没想到，冠军是一个掉进沙坑的炼金师。绳梯垂了下来，小禾抱着奖杯，终于爬出了沙坑。</p>
      <p class="sub">全剧终。谢谢游玩！</p>
      <div class="row-btns"><button class="pxbtn" id="btnTitle">回到标题</button></div>
    </div>`);
    o.querySelector('#btnTitle').onclick = () => G.titleScene();
  };
  UI.showEnding = function () {
    const w = G.field.world;
    const o = UI.overlay(`<div class="card px-panel pin" style="position:relative">
      <h1>崖顶</h1>
      <p class="loop">小禾爬上了云雾林！</p>
      <p>用了 <b>${S().day}</b> 天，从坑底的一株骆驼刺开始，一棵树一棵树地爬到了云海之上。脚下的每一层崖台，都留着她种下的树和绳梯。</p>
      <p class="sub">你可以继续在每一层种树、炼药，把整面峭壁都染绿。</p>
      <div class="row-btns"><button class="pxbtn" id="btnGoOn">继续经营</button></div>
    </div>`);
    o.querySelector('#btnGoOn').onclick = () => UI.overlay(null);
  };

  // ================= 地表：左上角的地块条 + 种子菜单 =================
  UI.renderSelect = function () {
    lastTag = ''; lastPlot = '';
    if (menu) renderMenu();
  };

  // 左上角药剂架下面一条：脚下这块地的土、上面长着什么、能做什么（每帧调用，内容变了才重写）。不在坑底、地块光标不在时收起
  let lastPlot = '';
  function renderPlot(f, hero, ctx) {
    const st = S(), box = $('plotBox'), pp = f.pickPlot;
    const show = st.room === 'pit' && pp >= 0 && G.gotKit('seed');
    const here = show ? f.plantIn(pp) : null, act = hero.act && hero.act.kind === 'uproot' ? hero.act : null;
    const prog = act ? Math.min(10, Math.floor(act.t / act.dur * 10)) : -1, ready = ctx === 'floor';
    const ripe = here ? (here.fruits || []).length : 0;
    const sig = [show, pp, here ? here.col : '', ripe, prog, ready, !!menu, G.Mail.has('shovel'), G.Touch.on].join('|');
    if (sig === lastPlot) return;
    lastPlot = sig;
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const k = f.plotSoil(pp);
    let html = `<span class="pb-soil"><i style="background:${G.SOIL_COLS[k]}"></i>${G.SOIL_NAMES[k]}</span>`;
    if (here) html += `<span class="pb-sp">${G.TREES[here.sp].name}</span>`;
    if (act) html += `<span class="pb-do warn">${'■'.repeat(prog)}${'□'.repeat(10 - prog)}</span>`;
    else if (here) {
      if (ripe) html += `<span class="pb-do">${G.keyCap('F')} 摇树</span>`;
      if (G.Mail.has('shovel')) html += `<span class="pb-do">按住 ${G.keyCap('X')} 铲除</span>`;
    }
    else if (!menu) html += `<span class="pb-do">${G.keyCap('F')} 种植</span>`;
    box.innerHTML = html;
    box.classList.toggle('far', !ready);
  }

  // 种子菜单：地块条下面一排种子格，底下的色条是种在这块地上合不合适（和地上的光标同色）
  let menu = null; // { list, i }
  UI.seedMenuOpen = () => !!menu;
  UI.openSeedMenu = function (list) {
    menu = { list, i: Math.max(0, list.indexOf(S().pickSp)) };
    $('seedMenu').classList.remove('hidden');
    G.sfx('click');
    menuPick(menu.i, true);
  };
  UI.closeSeedMenu = function () {
    if (!menu) return;
    menu = null;
    $('seedMenu').classList.add('hidden');
    $('tooltip').classList.add('hidden');
    lastPlot = '';
  };
  function menuPick(i, quiet) {
    const n = menu.list.length;
    menu.i = (i + n) % n;
    const sp = menu.list[menu.i];
    if (sp === S().pickSp) renderMenu();
    else if (quiet) { S().pickSp = G.field.pickSp = sp; renderMenu(); }
    else G.pickSpecies(sp); // 会调 renderSelect → renderMenu
  }
  function menuGo() {
    const f = G.field, sp = menu.list[menu.i];
    if (f.plantBlock(sp, f.pickCol)) {
      G.sfx('fail');
      const el = $('seedMenu').querySelector('.sm-c.cur');
      if (el) { el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny'); }
      return;
    }
    UI.closeSeedMenu();
    G.tryPlant();
  }
  function renderMenu() {
    const f = G.field, col = f.pickCol, sp = menu.list[menu.i];
    const cells = menu.list.map((s, i) => {
      const no = f.plantBlock(s, col), lv = no ? 3 : f.suitInfo(s, col).level;
      return `<div class="sm-c${i === menu.i ? ' cur' : ''}${no ? ' no' : ''}" data-i="${i}" data-tip="sp:${s}" style="--sc:${G.LV_COL[lv]}"><img src="${G.seedURL(s)}"><span class="ct">${G.seedCount(s)}</span></div>`;
    }).join('');
    const why = f.plantBlock(sp, col), s = why ? null : f.suitInfo(sp, col);
    const line = why ? `<span class="bad">${esc(why)}</span>`
      : `${G.TREES[sp].name} · <span class="${['ok', 'warn', 'bad', 'bad'][s.level]}">${SUIT_NAMES[s.level]}</span>`;
    const box = $('seedMenu');
    box.innerHTML = `<div class="sm-row">${cells}</div><div class="sm-nm">${line}</div>
      <div class="sm-keys"><kbd>A</kbd><kbd>D</kbd> 选 <kbd>F</kbd> 种下 <kbd>Esc</kbd> 取消</div>`;
    box.querySelectorAll('.sm-c').forEach(el => {
      el.onclick = () => { const i = +el.dataset.i; if (i === menu.i) menuGo(); else menuPick(i); };
    });
  }
  // 菜单开着时的按键：A / D 选，F / 空格 / 回车种下，Esc / S / X 收起
  UI.seedMenuKey = function (k, e) {
    const mv = { a: -1, ArrowLeft: -1, q: -1, d: 1, ArrowRight: 1, e: 1 }[k];
    if (mv) { e.preventDefault(); menuPick(menu.i + mv); return; }
    if (e.repeat) return;
    if (k === 'f' || k === ' ' || k === 'Enter') { e.preventDefault(); menuGo(); }
    else if (k === 'Escape' || k === 's' || k === 'ArrowDown' || k === 'x') UI.closeSeedMenu();
  };

  // 主角头顶的小提示：炼药、去上下层、摘果子（地块的事都在左上角的地块条里）。每帧更新位置，内容变了才重写
  let lastTag = '';
  UI.renderSurfTick = function (f, hero, ctx) {
    const st = S();
    renderPlot(f, hero, ctx);
    const tag = $('plotTag'), sleep = $('btnSleep'), view = st.room === 'cave' ? G.Cave : st.room === 'east' ? G.East : f;
    const tx = (Math.round(hero.x * PX) - view.ox) * 2 - (view.subX || 0) + 'px', ty = (Math.round((hero.y - 19) * PX) - view.oy) * 2 - (view.subY || 0) + 'px';
    tag.style.left = tx;
    tag.style.top = ty;
    const bar = ctx === 'sit' && sleep.querySelector('.sl-bar');
    if (bar) bar.style.width = (G.waking ? 0 : G.doze * 100).toFixed(1) + '%';
    const p = ctx === 'floor' || ctx === 'tree' ? nearestPlant(f, hero) : null, busy = !!hero.act;
    G.Camp.renderHud(st.room === 'east');
    const camp = st.room === 'east' && !G.Camp.isOpen() ? G.Camp.tag(hero) : '';
    const sig = [ctx, p ? p.col + ':' + (p.fruits || []).length : '', busy, f.world.ladder, st.day, camp, G.Touch.on].join('|');
    if (sig === lastTag) return;
    lastTag = sig;
    let html = '';
    const next = G.LEVELS[f.lv + 1], below = G.LEVELS[f.lv - 1];
    const fruitN = p ? (p.fruits || []).length : 0;
    sleep.classList.toggle('hidden', ctx !== 'sit');
    if (ctx === 'sit') sleep.innerHTML = `<i class="sl-bar"></i><span>长按 ${G.keyCap('F')} 睡觉</span>`;
    else if (ctx === 'pot') html = `${G.keyCap('W')} 炼药`;
    else if (ctx === 'up') html = `${G.keyCap('W')} ${next.name}`;
    else if (ctx === 'down') html = `${G.keyCap('S')} ${below.name}`;
    else if (ctx === 'tree' || ctx === 'air') html = fruitN ? `<i class="fr"></i>×${fruitN}` : '';
    else if (ctx === 'floor' && fruitN && !busy) html = `${G.keyCap('W')} <i class="fr"></i>×${fruitN}`;
    else if (ctx === 'east' || camp) html = camp; // 营地岩洞：空位、堆肥坑、工作台的提示
    tag.innerHTML = html;
    tag.classList.toggle('hidden', !html);
  };
  function nearestPlant(f, hero) {
    let best = null, bd = 30;
    for (const p of f.world.plants) { const d = Math.abs(p.col * TILE + TILE / 2 - hero.x); if (d < bd) { bd = d; best = p; } }
    return best;
  }
})();
