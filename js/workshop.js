// 炼金工坊：洞穴里炼药锅前的界面。左边材料栏，中间药剂架、锅位和大锅（锅下面出瓶），右边「这一锅」的药效
// 玩法：点材料按顺序丢进锅里（最多 CFG.SLOTS 份），每份材料落锅时锅位上立刻显示它做了什么——指令链在眼前一步步成形。
// 按住出瓶，按着不放就连炼。没见过的组合出瓶时「新发现」，记进图鉴；同一种药换了个配方也会记下来（殊途同归）
// 锅位里的材料只是预留，出瓶时才真正扣掉。所有坐标都是 960×540 的界面坐标
(function () {
  const $ = id => document.getElementById(id);
  const S = () => G.state;
  const A = G.Alc, UI = G.UI;
  const { MATERIALS, ACTIONS, CFG } = G;
  const TAU = Math.PI * 2;
  const INK = '#181425';
  const mix = G.U.mix;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 设置：屏幕震动 / 闪光可以关 ----------
  G.opts = { shake: true };
  try { Object.assign(G.opts, JSON.parse(localStorage.getItem('rootbound-opts') || '{}')); } catch (e) { /* 忽略 */ }
  G.saveOpts = () => { try { localStorage.setItem('rootbound-opts', JSON.stringify(G.opts)); } catch (e) { /* 忽略 */ } };

  // ---------- 材料的颜色与标签：基础材料用效果色，反应材料按作用 ----------
  const OP = {
    echo: { col: '#b07ce0', tag: '回响' },
    hit: { col: '#ff8a5a', tag: '触障' },
    amp: { col: '#2ce8f5', tag: '增幅' },
  };
  // 没用过的材料不知道做什么：灰色、标签是问号；没炼过的组合，锅位上也只亮这个颜色
  const UNKNOWN = '#9a8f80', NOVEL = '#d8c38a';
  const accent = id => { const m = MATERIALS[id]; return !A.knownMat(id) ? UNKNOWN : m.kind === 'base' ? ACTIONS[m.action].color : m.kind === 'bud' ? '#9ccf6a' : OP[m.op].col; };
  const tagOf = id => { const m = MATERIALS[id]; return !A.knownMat(id) ? '？' : m.kind === 'base' ? ACTIONS[m.action].short + (m.pot > 1 ? '+'.repeat(m.pot - 1) : '') : m.kind === 'bud' ? '种子' : OP[m.op].tag; };

  // ---------- 锅：沿用洞穴里那口锅的像素图，放大 6 倍画在正中 ----------
  const PK = 6, [PW, PH] = G.CAVE_ART.size.pot;
  const POT = { x: 480, y: 452 };                 // 锅底中心：中间那一栏的正中，锅下面留一行给出瓶
  const potImg = new Image(), maskImg = new Image();
  let liqTop = 6, liqX0 = 8, liqX1 = 26;          // 液面在锅图里的行与左右（加载后从遮罩里量出来）
  maskImg.onload = () => {
    const c = G.mkCanvas(PW, PH).getContext('2d');
    c.drawImage(maskImg, 0, 0);
    const d = c.getImageData(0, 0, PW, PH).data;
    for (let y = 0; y < PH; y++) {
      let a = -1, b = -1;
      for (let x = 0; x < PW; x++) if (d[(y * PW + x) * 4 + 3] > 0) { if (a < 0) a = x; b = x; }
      if (a >= 0) { liqTop = y; liqX0 = a; liqX1 = b; break; }
    }
  };
  potImg.src = G.CAVE_ART.pot; maskImg.src = G.CAVE_ART.potMask;
  const tint = G.mkCanvas(PW, PH), tc = tint.getContext('2d');
  const potLeft = () => POT.x - PW * PK / 2, potTop = () => POT.y - PH * PK;
  const mouth = () => ({ x: POT.x, y: potTop() + liqTop * PK + 2 });
  const BASE_LIQ = '#4fb88a';

  // ---------- 状态 ----------
  const W = {
    open: false, t: 0, liquid: BASE_LIQ, liqTo: BASE_LIQ, jolt: 0, glow: 0, swirl: 0,
    items: [], parts: [], texts: [], flyers: [],
    slots: [],        // 锅位里的材料（按投入顺序）
    landed: 0,        // 已经落进锅里的份数（后面的还在空中飞）
    fresh: -1,        // 刚落锅的锅位：步骤文字播一下入场动画
    hold: null,       // 按住出瓶：{ t, n, need }
    shakeT: 0, shakeK: 0, abT: 0,
  };
  let fx, fc;

  const local = el => {
    const g = $('game').getBoundingClientRect(), r = el.getBoundingClientRect(), k = 960 / g.width;
    return { x: (r.left - g.left + r.width / 2) * k, y: (r.top - g.top + r.height / 2) * k, w: r.width * k, h: r.height * k };
  };

  // ---------- 小工具：像素方块粒子、飘字、震屏、色差 ----------
  function burst(x, y, cols, n, spd = 160, up = 80) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random() * 0.7);
      W.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: 0.4 + Math.random() * 0.5, max: 0.9, col: cols[i % cols.length], s: Math.random() < 0.3 ? 6 : 4, g: 420 });
    }
  }
  // tag：同一类飘字只留最新的一条（连炼时不会叠成一摞）
  function text(x, y, s, col, big = false, rainbow = false, tag = null, life) {
    if (tag) W.texts = W.texts.filter(t => t.tag !== tag);
    const l = life || (big ? 1.3 : 0.9);
    W.texts.push({ x, y, s, col, big, rainbow, tag, life: l, max: l });
  }
  function shake(k, t = 0.18) { if (!G.opts.shake) return; W.shakeK = Math.max(W.shakeK, k); W.shakeT = Math.max(W.shakeT, t); }
  function aberrate(t = 0.25) { W.abT = Math.max(W.abT, t); }
  function nudge(el, cls = 'deny') { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ================= 锅位与预览 =================
  const used = id => W.slots.filter(s => s === id).length;
  const avail = id => (S().materials[id] || 0) - used(id);
  const busy = () => W.landed < W.slots.length;            // 还有材料在空中
  const preview = () => A.brew(W.slots.slice(0, W.landed));
  const brewable = res => res.seed ? true : res.instructions.length > 0;
  // 这一锅出瓶后会怎样：'new' 新药剂 / 'alt' 已知药剂的新配方 / 'known'
  function novelty(res) {
    if (!res.key) return null;
    const e = A.entry(res.key), r = W.slots.slice(0, W.landed);
    if (!e) return 'new';
    return e.recipes.some(x => x.length === r.length && x.every((y, i) => y === r[i])) ? 'known' : 'alt';
  }
  const fakePotion = res => ({ key: res.key, instructions: res.instructions, mode: res.mode });

  // 没炼过的组合：每份材料做了什么都藏起来，出瓶才知道（放错位置的失败提示照常显示）
  const stepHidden = (res, s) => s.ok && novelty(res) === 'new';
  const stepText = (res, s) => stepHidden(res, s) ? '？？？' : s.text;
  function renderSlots() {
    const res = preview(), steps = res.steps, n = CFG.SLOTS;
    let html = '';
    for (let i = 0; i < n; i++) {
      const id = i < W.landed ? W.slots[i] : null, s = id && steps[i];
      const flying = i >= W.landed && i < W.slots.length;
      const cls = id ? (s.ok ? 'on' : 'bad') : 'empty' + (i === W.slots.length && !busy() ? ' next' : '');
      const ac = id ? (stepHidden(res, s) ? NOVEL : s.act ? ACTIONS[s.act].color : accent(id)) : '';
      html += `<div class="pslot ${cls}${i === W.fresh ? ' pop' : ''}" data-i="${i}" style="${ac ? '--ac:' + ac : ''}" data-tip="${id ? 'pslot:' + i : ''}">
        <div class="pf"><span class="no">${i + 1}</span>${id ? `<img src="${G.iconURL(id)}">` : flying ? '' : ''}</div>
        <div class="stp${i === W.fresh ? ' fresh' : ''}">${id ? esc(stepText(res, s)) : flying ? '…' : ''}</div>
        ${i < n - 1 ? '<span class="arw">▶</span>' : ''}</div>`;
    }
    $('potSlots').innerHTML = html;
    $('potSlots').querySelectorAll('.pslot.on,.pslot.bad').forEach(el => { el.onpointerdown = e => { if (e.button === 0) removeSlot(+el.dataset.i); }; });
    W.fresh = -1;
    renderInfo(res);
  }

  // 「这一锅」是一张标本卡：上面框里是成品和名字，中间是药效，最下面是每次出瓶得多少
  const card = (pic, name, sub, body, foot = '') => `<div class="bi-hero"><div class="bi-pic">${pic}</div>
    <div class="bi-nm${[...name].length > 7 ? ' long' : ''}">${name}</div><div class="bi-mode">${sub}</div></div>
    <div class="bi-body">${body}</div>${foot ? `<div class="bi-foot">${foot}</div>` : ''}`;
  function renderInfo(res) {
    const box = $('brewInfo'), btn = $('btnBrew');
    btn.disabled = !W.landed || !brewable(res) || busy();
    $('brewTag').innerHTML = '';
    if (!W.landed) {
      box.innerHTML = card('', '空锅', '等材料下锅', `<div class="bi-tips"><div><i>1</i>点左边的材料，按顺序丢进锅里</div>
        <div><i>2</i>最多 ${CFG.SLOTS} 份；顺序不同，炼出来的药也不同</div><div><i>3</i>按住出瓶，按着不放就连炼</div></div>`);
      box.classList.add('idle');
      return;
    }
    box.classList.remove('idle');
    const nv = novelty(res);
    $('brewTag').innerHTML = nv === 'new' ? '<span class="bi-tag rb">' + [...'新组合！'].map((c, i) => `<i style="--i:${i}">${c}</i>`).join('') + '</span>'
      : nv === 'alt' ? '<span class="bi-tag c-gold">新配方</span>'
        : nv === 'known' ? `<span class="bi-tag c-green">药方 #${S().codex.findIndex(e => e.key === res.key) + 1}</span>` : '';
    if (res.seed !== undefined) {
      if (!res.seed) { box.innerHTML = card('<b class="bx">×</b>', '芽苞还饿着', '后面再放点材料喂它', ''); return; }
      const tr = G.TREES[res.seed];
      const hid = nv === 'new';
      box.innerHTML = card(hid ? '<b class="bq">?</b>' : `<img class="sd" src="${G.seedURL(res.seed)}">`, hid ? '？？？种子' : esc(res.name), hid ? '？？？' : G.TIER_NAMES[res.tier],
        `<div class="bi-sec">说明</div><div class="bi-ins">${hid ? '<div>▸ 没见过的种子，出瓶才知道是什么</div>' : `<div>▸ 喜欢「${G.SOIL_NAMES[tr.tier]}」以上</div>${res.capped ? '<div class="c-red">▸ 更高一级的植物还没认识：去更高的崖台找找</div>' : ''}`}</div>`,
        `<span>每次出瓶</span><span>${CFG.BREW_YIELD} 颗种子</span>`);
      return;
    }
    if (!res.instructions.length) { box.innerHTML = card('<b class="bx">×</b>', '炼不出东西', '锅里没有能生效的材料', ''); return; }
    const hidden = nv === 'new';
    box.innerHTML = card(hidden ? '<b class="bq">?</b>' : G.UI.potionIcon(fakePotion(res)), hidden ? '？？？' : esc(res.name),
      hidden ? '没炼过的组合' : res.mode === 'pour' ? '毫升药剂 · 按住倒入' : '一次性药剂 · 按一下使用',
      `<div class="bi-sec">药效</div><div class="bi-ins">${hidden ? '<div>▸ 没炼过的组合，出瓶才知道药效</div>'
        : G.UI.insHTML(res.instructions, res.mode)}</div>`,
      `<span>每次出瓶</span><span>${hidden ? '？' : res.mode === 'pour' ? CFG.BREW_YIELD * G.campVal('cylinder') + ' ml' : CFG.BREW_YIELD + ' 瓶'}</span>`);
  }

  // ---------- 材料栏：按特性分组，只列有的；没用过的材料不知道特性，统一放在最后 ----------
  function renderMats() {
    const have = id => (S().materials[id] || 0) > 0;
    const groups = [...G.MAT_GROUPS.map(([nm, ids]) => [nm.split(' · ')[0], ids.filter(id => have(id) && A.knownMat(id))]),
      ['没用过', G.MATERIAL_ORDER.filter(id => have(id) && !A.knownMat(id))]].filter(g => g[1].length);
    $('matsN').textContent = groups.length ? groups.reduce((n, g) => n + g[1].length, 0) + ' 种' : '';
    $('mats').innerHTML = groups.length ? groups.map(([nm, ids]) => `<div class="mg-h">${nm}</div><div class="mg">${ids.map(id => {
      const n = avail(id);
      return `<div class="mc${n > 0 ? '' : ' empty'}" data-mat="${id}" data-tip="alc:${id}" style="--mc:${accent(id)}"><img src="${G.iconURL(id)}"><span class="ct">${n}</span><span class="ev">${tagOf(id)}</span></div>`;
    }).join('')}</div>`).join('') : '<div class="mats-empty">布包里没有材料<br>去种树、摘果子吧</div>';
    $('mats').querySelectorAll('.mc').forEach(el => {
      el.onpointerdown = e => { if (e.button === 0) addSlot(el.dataset.mat, el); };
      el.oncontextmenu = e => e.preventDefault();
    });
  }

  // ================= 投料 =================
  function addSlot(id, el, delay = 0) {
    if (W.slots.length >= CFG.SLOTS) { nudge(el); nudge($('potSlots'), 'deny'); G.sfx('fail'); text(POT.x, 230, '锅位满了：先出瓶，或点锅位拿出来', '#ff8a8a', false, false, 'full'); return false; }
    if (avail(id) <= 0) { nudge(el); G.sfx('fail'); return false; }
    const i = W.slots.length;
    W.slots.push(id);
    const from = el ? local(el) : { x: 480, y: 500 }, m = mouth();
    W.items.push({ id, i, img: G.iconCanvas(id), x0: from.x, y0: from.y - 10, x1: m.x + (Math.random() - 0.5) * 40, y1: m.y, t: -delay, dur: 0.4, arc: 110 + Math.random() * 40 });
    G.sfx('click', 1.1 + i * 0.12);
    renderMats();
    renderSlots();
    return true;
  }
  // 落锅：水花、锅身一震、锅位亮起、显示这一步做了什么
  function land(it) {
    W.landed = Math.max(W.landed, it.i + 1);
    W.fresh = it.i;
    const res = preview(), s = res.steps[it.i], col = stepHidden(res, s) ? NOVEL : s.ok && s.act ? ACTIONS[s.act].color : accent(it.id);
    W.liqTo = s.ok ? mix(col, BASE_LIQ, 0.25) : '#6a5a6a';
    W.jolt = Math.min(1, W.jolt + 0.7); W.glow = Math.min(1, W.glow + 0.35);
    burst(it.x1, it.y1, [col, mix(col, '#ffffff', 0.5), '#ffffff'], 12, 160, 130);
    renderSlots();
    const slot = $('potSlots').children[it.i], sp = slot ? local(slot.querySelector('.pf')) : { x: POT.x, y: 140 };
    if (s.ok) {
      G.sfx('plop', 1 + it.i * 0.15);
      // 一缕光从锅里升到锅位
      W.parts.push({ beam: true, x: it.x1, y: it.y1, tx: sp.x, ty: sp.y, life: 0.3, max: 0.3, col });
      burst(sp.x, sp.y, [col, '#ffffff'], 8, 110, 20);
      shake(1.5, 0.08);
      // 成形的组合是新的：锅里冒金光
      if (W.landed === W.slots.length && brewable(res) && novelty(res) === 'new') {
        G.sfx('charge', 1.6);
        text(POT.x, mouth().y - 50, '？新组合', '#fee761', false, true, 'novel', 1.2);
        burst(POT.x, mouth().y, ['#fee761', '#ffffff', '#feae34'], 14, 140, 160);
      }
    } else {
      G.sfx('fail');
      for (let k = 0; k < 6; k++) W.parts.push({ x: it.x1 + (Math.random() - 0.5) * 50, y: it.y1, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 1, max: 1, col: 'smoke', s: 8, g: -10 });
      text(it.x1, it.y1 - 30, s.text, '#ff8a8a', false, false, 'bad');
    }
  }
  function removeSlot(i) {
    if (busy() || W.hold) return;
    const id = W.slots[i], el = $('potSlots').children[i];
    W.slots.splice(i, 1);
    W.landed = W.slots.length;
    if (el) { const p = local(el.querySelector('.pf')); burst(p.x, p.y, [accent(id), '#ffffff'], 6, 90, 40); }
    G.sfx('click', 0.8);
    renderMats(); renderSlots();
  }
  // ================= 出瓶：按住蓄力，满了出瓶，按着不放蓄力越来越快 =================
  function startHold() {
    if (W.hold) return;
    const res = preview();
    if (!W.landed || busy() || !brewable(res)) { nudge($('btnBrew')); G.sfx('fail'); return; }
    W.hold = { t: 0, n: 0, need: 0.42 };
    $('btnBrew').classList.add('held');
  }
  function endHold() {
    if (!W.hold) return;
    W.hold = null;
    $('btnBrew').classList.remove('held');
    $('btnBrew').querySelector('.rc-bar i').style.width = '0';
    W.swirl = 0;
  }
  document.addEventListener('pointerup', endHold);
  document.addEventListener('pointercancel', endHold);
  function holdTick(dt) {
    const h = W.hold;
    if (!h) return;
    h.t += dt;
    const p = Math.min(1, h.t / h.need);
    $('btnBrew').querySelector('.rc-bar i').style.width = (p * 100).toFixed(0) + '%';
    W.swirl = p; W.glow = Math.max(W.glow, 0.3 + p * 0.5);
    if (Math.floor((h.t - dt) * 12) !== Math.floor(h.t * 12)) G.sfx('charge', 1 + p * 0.8 + Math.min(h.n, 10) * 0.05);
    if (p < 1) return;
    brewOne();
    h.n++;
    if (!W.landed || !brewable(preview())) { endHold(); return; }
    h.t = 0; h.need = Math.max(0.12, h.need * 0.78);
  }
  function brewOne() {
    const st = S(), recipe = W.slots.slice(0, W.landed);
    const out = A.addPotion(recipe, CFG.BREW_YIELD);
    if (!out) return;
    G.Tut.brewed();
    for (const id of recipe) st.materials[id]--;
    // 材料不够再炼一次时，从后往前撤掉
    while (W.slots.length && W.slots.some(id => avail(id) < 0)) W.slots.pop();
    W.landed = W.slots.length;
    const m = mouth(), res = out.res;
    W.texts = W.texts.filter(t => t.tag !== 'novel');
    if (res.seed) {
      launch(G.seedPixel(res.seed), out.n, local($('wsRight')), () => G.sfx('fruit'));
      popFx(G.TREES[res.seed].form.leaf[2], `${res.name} +${out.n}`);
    } else {
      const slot = st.hotbar.indexOf(res.key), hb = UI.slotEl(slot);
      launch(G.bottlePixel(out.potion), 1, hb ? local(hb) : local($('wsRight')), () => { UI.renderShelf(); if (slot >= 0) UI.flashSlot(slot); G.sfx('potion', 1.2); });
      popFx(ACTIONS[res.instructions[res.instructions.length - 1].action].color, `${res.name} +${res.mode === 'pour' ? out.n * G.campVal('cylinder') + 'ml' : out.n + '瓶'}`);
    }
    if (out.found === 'new') {
      text(m.x, m.y - 84, '新发现！', '#fee761', true, true, 'found', 2);
      text(m.x, m.y - 60, res.name, '#ffffff', false, false, 'foundName', 2);
      G.sfx('levelup'); G.sfx('crit');
      shake(6, 0.3); aberrate(0.4);
      burst(m.x, m.y, ['#fee761', '#ffffff', '#feae34', '#2ce8f5', '#e070e0'], 40, 300, 200);
      W.parts.push({ ring: true, x: m.x, y: m.y, r: 10, life: 0.6, max: 0.6, col: '#fee761' });
      W.parts.push({ ring: true, x: m.x, y: m.y, r: 4, life: 0.8, max: 0.8, col: '#ffffff' });
    } else if (out.found === 'alt') {
      text(m.x, m.y - 84, '殊途同归！', '#fee761', true, false, 'found', 1.6);
      text(m.x, m.y - 60, '笔记记下了另一种配方', '#fee1b8', false, false, 'foundName', 1.6);
      G.sfx('levelup', 1.3); shake(3, 0.15);
    }
    renderMats(); renderSlots();
    G.saveSoon();
  }
  function launch(img, n, to, done) {
    const m = mouth();
    for (let i = 0; i < n; i++) W.flyers.push({ img, x0: m.x, y0: m.y - 10, x1: to.x, y1: to.y, t: -i * 0.12, dur: 0.6, arc: 160 + i * 30, done: i === n - 1 ? done : null });
  }
  function popFx(col, label) {
    const m = mouth();
    W.jolt = 1; W.glow = 1; W.swirl = 0;
    burst(m.x, m.y, [col, '#ffffff', mix(col, '#ffffff', 0.5)], 16, 190, 180);
    W.parts.push({ ring: true, x: m.x, y: m.y, r: 8, life: 0.35, max: 0.35, col: '#ffffff' });
    G.sfx('pop', 1 + Math.min(W.hold ? W.hold.n : 0, 12) * 0.04);
    shake(2.5, 0.12);
    text(m.x, m.y - 40, label, '#ffffff', false, false, 'brew');
  }

  // ================= 每帧 =================
  function tick(dt) {
    if (!W.open) return;
    W.t += dt;
    holdTick(dt);
    W.jolt = Math.max(0, W.jolt - dt * 4);
    W.glow = Math.max(0.15, W.glow - dt * 0.8);
    W.liquid = mix(W.liquid, W.liqTo, Math.min(1, dt * 5));
    if (!W.landed) W.liqTo = mix(W.liqTo, BASE_LIQ, Math.min(1, dt * 0.8));
    for (const it of W.items) {
      it.t += dt;
      if (it.t < 0) continue;
      const u = Math.min(1, it.t / it.dur);
      it.x = it.x0 + (it.x1 - it.x0) * u; it.y = it.y0 + (it.y1 - it.y0) * u - it.arc * 4 * u * (1 - u);
      if (u >= 1 && !it.done) { it.done = true; land(it); }
    }
    W.items = W.items.filter(it => !it.done);
    for (const f of W.flyers) {
      f.t += dt;
      if (f.t < 0) continue;
      const u = Math.min(1, f.t / f.dur), e = 1 - Math.pow(1 - u, 2);
      f.x = f.x0 + (f.x1 - f.x0) * e; f.y = f.y0 + (f.y1 - f.y0) * e - f.arc * 4 * u * (1 - u);
      if (Math.random() < 0.7) W.parts.push({ x: f.x + (Math.random() - 0.5) * 10, y: f.y + 10, vx: 0, vy: 30, life: 0.3, max: 0.3, col: '#fff2a8', s: 4, g: 0 });
      if (u >= 1) { f.gone = true; burst(f.x1, f.y1, ['#ffffff', '#fee761'], 8, 120, 40); if (f.done) f.done(); }
    }
    W.flyers = W.flyers.filter(f => !f.gone);
    for (const p of W.parts) { p.life -= dt; if (p.ring) p.r += dt * 260; else if (!p.beam) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; } }
    W.parts = W.parts.filter(p => p.life > 0);
    for (const t of W.texts) { t.life -= dt; t.y -= dt * (t.big ? 20 : 40); }
    W.texts = W.texts.filter(t => t.life > 0);
    // 锅里冒泡、冒热气；成形的是新组合时冒金星
    const m = mouth(), res = W.landed && !busy() ? preview() : null, novel = res && brewable(res) && novelty(res) === 'new';
    if (Math.random() < dt * (6 + W.glow * 20)) W.parts.push({ x: POT.x + (liqX0 + Math.random() * (liqX1 - liqX0) - PW / 2) * PK, y: m.y + 2, vx: 0, vy: -20 - Math.random() * 30, life: 0.5, max: 0.5, col: mix(W.liquid, '#ffffff', 0.4), s: 4, g: -30 });
    if (Math.random() < dt * 3) W.parts.push({ x: POT.x + (Math.random() - 0.5) * 80, y: m.y - 4, vx: (Math.random() - 0.5) * 10, vy: -26, life: 1.6, max: 1.6, col: 'steam', s: 6, g: -6 });
    if (novel && Math.random() < dt * 14) W.parts.push({ x: POT.x + (Math.random() - 0.5) * (liqX1 - liqX0) * PK, y: m.y, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 60, life: 0.8, max: 0.8, col: ['#fee761', '#ffffff', '#feae34'][Math.floor(Math.random() * 3)], s: 4, g: 40 });
    // 震屏 / 色差
    W.shakeT = Math.max(0, W.shakeT - dt);
    const k = W.shakeT > 0 ? W.shakeK : 0;
    if (!k) W.shakeK = 0;
    $('alcStage').style.transform = k ? `translate(${Math.round((Math.random() - 0.5) * k * 2)}px, ${Math.round((Math.random() - 0.5) * k * 2)}px)` : '';
    W.abT = Math.max(0, W.abT - dt);
    $('game').classList.toggle('aberr', W.abT > 0 && G.opts.shake);
    draw();
  }

  // ================= 绘制（特效画布 960×540） =================
  function draw() {
    const c = fc;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 960, 540);
    c.imageSmoothingEnabled = false;
    // 锅后的光晕
    const m = mouth(), g = c.createRadialGradient(POT.x, m.y, 10, POT.x, m.y, 260);
    g.addColorStop(0, hexA(W.liquid, 0.28 + W.glow * 0.3)); g.addColorStop(1, hexA(W.liquid, 0));
    c.fillStyle = g; c.fillRect(POT.x - 270, m.y - 270, 540, 540);
    c.fillStyle = 'rgba(10,8,14,.55)'; c.fillRect(POT.x - PW * PK * 0.45, POT.y - 4, PW * PK * 0.9, 10);
    // 锅：落料时压扁再弹回
    const sq = Math.sin(W.jolt * Math.PI) * W.jolt;
    c.save();
    c.translate(POT.x, POT.y); c.scale(1 + sq * 0.08, 1 - sq * 0.1); c.translate(-POT.x, -POT.y);
    if (potImg.complete && potImg.naturalWidth) {
      c.drawImage(potImg, potLeft(), potTop(), PW * PK, PH * PK);
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, PW, PH); tc.drawImage(maskImg, 0, 0);
      tc.globalCompositeOperation = 'source-in'; tc.fillStyle = W.liquid; tc.fillRect(0, 0, PW, PH);
      c.drawImage(tint, potLeft(), potTop(), PW * PK, PH * PK);
      c.fillStyle = hexA('#ffffff', 0.35);
      c.fillRect(POT.x - (liqX1 - liqX0) * PK * 0.3, m.y, (liqX1 - liqX0) * PK * 0.25, 4);
      if (W.swirl > 0) {
        const rx = (liqX1 - liqX0) * PK * 0.42, n = 10;
        for (let i = 0; i < n; i++) {
          const a = W.t * (6 + W.swirl * 14) + i / n * TAU;
          c.fillStyle = i % 2 ? '#ffffff' : mix(W.liquid, '#ffffff', 0.6);
          c.fillRect(Math.round(POT.x + Math.cos(a) * rx * (0.4 + 0.6 * W.swirl)), Math.round(m.y + 6 + Math.sin(a) * 6), 4, 4);
        }
      }
    }
    c.restore();
    for (const p of W.parts) {
      const a = Math.min(1, p.life / p.max * 1.5);
      if (p.ring) { pxRing(c, p.x, p.y, p.r, p.col, a); continue; }
      if (p.beam) { beam(c, p, a); continue; }
      if (p.col === 'steam') { c.fillStyle = `rgba(255,248,232,${0.18 * a})`; c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); continue; }
      if (p.col === 'smoke') { c.fillStyle = `rgba(120,100,120,${0.5 * a})`; c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); continue; }
      const s = p.s, x = Math.round(p.x - s / 2), y = Math.round(p.y - s / 2);
      c.globalAlpha = a;
      if (s >= 4) { c.fillStyle = INK; c.fillRect(x - 2, y - 2, s + 4, s + 4); }
      c.fillStyle = p.col; c.fillRect(x, y, s, s);
      c.globalAlpha = 1;
    }
    for (const it of W.items) {
      if (it.t < 0) continue;
      const w = 40, wob = Math.sin(it.t * 30) * 0.12;
      c.drawImage(it.img, Math.round(it.x - w / 2), Math.round(it.y - w / 2), w, Math.round(w * (1 + wob)));
    }
    for (const f of W.flyers) {
      if (f.t < 0) continue;
      const k = 2, w = f.img.width * k, h = f.img.height * k, st = 1 + Math.sin(Math.min(1, f.t / f.dur) * Math.PI) * 0.25;
      c.drawImage(f.img, Math.round(f.x - w * st / 2), Math.round(f.y - h * st / 2), Math.round(w * st), Math.round(h * st));
    }
    if (W.hold && W.hold.n >= 2) {
      outlined(c, `×${W.hold.n}`, POT.x + 130, potTop() + 10, 24, W.hold.n >= 8 ? 'rb' : W.hold.n >= 4 ? '#fee761' : '#ffffff');
      outlined(c, '连炼', POT.x + 130, potTop() - 16, 12, '#ead4aa');
    }
    for (const t of W.texts) {
      c.globalAlpha = Math.min(1, t.life / t.max * 2);
      outlined(c, t.s, t.x, t.y, t.big ? 24 : 12, t.rainbow ? 'rb' : t.col);
      c.globalAlpha = 1;
    }
  }
  // 从锅里升到锅位的一缕光：像素点沿直线排开，越往上越亮
  function beam(c, p, a) {
    const n = 14, u = 1 - p.life / p.max;
    c.globalAlpha = a;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      if (k > u * 1.6) break;
      c.fillStyle = i % 2 ? '#ffffff' : p.col;
      c.fillRect(Math.round(p.x + (p.tx - p.x) * k) - 2, Math.round(p.y + (p.ty - p.y) * k) - 2, 4, 4);
    }
    c.globalAlpha = 1;
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
    const o = 2;
    c.fillStyle = INK;
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [o, o]]) c.fillText(s, Math.round(x + dx), Math.round(y + dy));
    if (col === 'rb') {
      const w = c.measureText(s).width; let cx = x - w / 2;
      c.textAlign = 'left';
      [...s].forEach((ch, i) => { c.fillStyle = RB[(i + Math.floor(W.t * 10)) % RB.length]; c.fillText(ch, Math.round(cx), Math.round(y + Math.sin(W.t * 8 + i) * 2)); cx += c.measureText(ch).width; });
      c.textAlign = 'center';
    } else { c.fillStyle = col; c.fillText(s, Math.round(x), Math.round(y)); }
  }

  // ================= 提示框 =================
  UI.extraTip = function (tip) {
    const [k, v] = tip.split(':');
    if (k === 'alc') {
      const m = MATERIALS[v];
      if (!A.knownMat(v)) return `<b>${m.name}</b> 剩 ${avail(v)}<br><span class="t-dim">还没下过锅，不知道它有什么用</span>`;
      const kind = m.kind === 'base' ? '<span class="c-green">基础材料</span> · 生成新效果' : m.kind === 'bud' ? '<span class="c-green">芽苞</span> · 放第一格结种子' : '<span class="c-gold">反应材料</span> · 改造前一个效果';
      return `<b>${m.name}</b> 剩 ${avail(v)}<br>${kind}<br>${m.desc}`;
    }
    if (k === 'pslot') {
      const id = W.slots[+v];
      const res = preview();
      return id ? `<b>${MATERIALS[id].name}</b><br>${esc(stepText(res, res.steps[+v]))}<br><span class="t-dim">点一下拿出来</span>` : null;
    }
    return null;
  };

  // ================= 打开 / 关闭 =================
  let built = false;
  function build() {
    if (built) return;
    built = true;
    fx = $('wsFx'); fc = fx.getContext('2d');
    $('btnBrew').onpointerdown = e => { if (e.button === 0) startHold(); };
  }
  function showOpts() { const b = $('setShake'); b.textContent = G.opts.shake ? '开' : '关'; b.className = 'pxbtn tiny ' + (G.opts.shake ? 'green' : 'gray'); }
  G.WS = {
    open() {
      build();
      W.open = true;
      G.Cave.hideHero = true;
      W.items = []; W.parts = []; W.texts = []; W.flyers = [];
      W.slots = W.slots.filter(id => avail(id) >= 0); W.landed = W.slots.length;
      renderMats(); renderSlots();
    },
    close() { W.open = false; G.Cave.hideHero = false; endHold(); W.items = []; W.landed = W.slots.length; $('game').classList.remove('aberr'); },
    tick,
    key(k, e) {
      if (k === ' ') { e.preventDefault(); if (!e.repeat) startHold(); return true; }
      if (k === 'Backspace') { e.preventDefault(); if (W.slots.length) removeSlot(W.slots.length - 1); return true; }
      return false;
    },
    keyUp(k) { if (k === ' ') endHold(); },
    showOpts,
  };
  setTimeout(() => { if ($('setShake')) { $('setShake').onclick = () => { G.opts.shake = !G.opts.shake; G.saveOpts(); showOpts(); }; showOpts(); } }, 0);
})();
