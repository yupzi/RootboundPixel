// 游戏状态、阶段流转、输入、主循环
// 一天：坑里自由活动（走跳爬、选位置）→ 种植（引导根系）→ 树长大结果 → 爬树摘果 → 去隐藏洞穴里的炼药锅炼药。种多少棵都行，
// 想进入下一天就在任意平地上按 S 坐下，再长按 F 睡觉。坑底右边的崖壁矮一些，树长得够高就能爬上去、往右走到下一屏
(function () {
  const $ = id => document.getElementById(id);
  const UI = G.UI;
  const { TILE, W, PX, WORLD_W } = G.GEO;
  const clamp = G.U.clamp;

  G.state = {
    phase: 'title',
    room: 'pit',     // pit：峭壁的坑（G.field 的各层）/ cave：坑底左侧崖壁里的隐藏洞穴 / east：坑底右崖半腰洞口里的营地岩洞
    day: 1,
    maxLevel: 0,     // 爬到过的最高一层
    materials: {},   // 开局没有材料：种骆驼刺、摘它的转向花，别的材料随新植物慢慢出现
    codex: [],       // 图鉴：炼出过的每一种药剂 / 种子 [{ key, recipes }]
    potions: {},
    hotbar: new Array(G.CFG.HOTBAR).fill(null),
    seeds: { camelThorn: G.CFG.START_SEEDS }, // 每种植物的种子数量。先锋种子靠每天清晨路过的鸟，其它靠芽苞炼制
    pickSp: 'camelThorn',
    selected: null,
    pouring: [],     // 正在倒入的毫升药剂（可以同时倒好几瓶）[{ slot, key, pid }]
    notes: G.newNotes(), // 植物学笔记（见 notes.js）
    kit: [],         // 前人留在洞里、还没捡起来的东西（见下面的开场）
    camp: { compost: 0, lv: {} }, // 营地岩洞：攒下的堆肥、各项升级的等级（见 camp.js、data.js 的 G.UPGRADES）
    tut: null,       // 新手教程的进度（见 tutorial.js），新游戏才有
  };
  const st = G.state;
  // 洞里的这样东西已经捡到了（种子 seed / 两瓶药 leftFlower、rightFlower / 笔记 book）
  G.gotKit = id => !st.kit.some(k => k.id === id);

  // ================= 存档（与绘本版、沙漠版分开存） =================
  const SAVE_KEY = 'rootbound-cliff-v11';
  G.save = function (phase) {
    try {
      const potions = {};
      for (const k in st.potions) { const { segs, ...p } = st.potions[k]; potions[k] = p; }
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        phase, room: st.room, day: st.day, maxLevel: st.maxLevel, materials: st.materials, codex: st.codex, potions, hotbar: st.hotbar, seeds: st.seeds, notes: st.notes, kit: st.kit, camp: st.camp, tut: st.tut,
        heroX: G.hero.x, heroY: Math.min(0, G.hero.y), world: G.field.serialize(), mapMode: G.mapMode,
      }));
    } catch (e) { /* 无痕模式等无法存档时忽略 */ }
  };
  // 摘果子这种频繁的小事：攒一下再存
  let saveT = 0;
  G.saveSoon = () => { saveT = 1.5; };
  G.loadSave = function () { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } };
  G.clearSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ } };

  G.continueGame = function () {
    const d = G.loadSave();
    if (!d) return G.newGame();
    Object.assign(st, { room: d.room, day: d.day, maxLevel: d.maxLevel || 0, materials: d.materials, codex: d.codex, potions: d.potions, hotbar: d.hotbar, seeds: d.seeds, notes: d.notes, kit: d.kit, camp: d.camp, tut: d.tut });
    G.field.load(d.world);
    if (d.mapMode !== G.mapMode) G.field.regenUnderground(); // 存档时用的是另一种地下地图
    G.hero.place(d.heroX, d.heroY);
    if (d.phase === 'alchemy') G.enterAlchemy();
    else G.enterSelect(false);
  };
  // 新游戏：两手空空地从崖顶摔进坑底（见下面的开场），开局的东西都散落在洞里等着捡
  // soft：从标题画面直接接上开场（标题的镜头就停在开场下坠的高度，不用黑屏）
  G.newGame = function (soft) {
    G.clearSave();
    st.potions = {};
    st.hotbar = new Array(G.CFG.HOTBAR).fill(null);
    st.seeds = {};
    st.codex = [];
    st.notes = G.newNotes();
    st.kit = KIT.map(k => ({ ...k }));
    st.camp = { compost: 0, lv: {} };
    st.tut = G.Tut.fresh();
    UI.renderShelf();
    startIntro(soft);
  };
  // 标题画面：镜头抬到坑底上方的天空（就是开场小禾掉下来的地方），标题写在天上
  G.titleScene = function () {
    st.phase = 'title'; st.room = 'pit';
    UI.setPhase('title');
    G.field.enterSelect();
    G.hero.place(INTRO.landX); G.hero.act = null;
    G.field.camX = G.field.selCamX = -40;
    G.field.camY = G.field.selCamY = INTRO.y0;
    UI.showTitle(G.loadSave());
  };
  // 继续：先暗下去再读档
  G.continueSoft = () => fadeTo(0.5, 0.15, 0.6, () => G.continueGame());

  // ================= 开场：从崖顶摔进坑底 → 趴一会儿 → 坐起来左右看看 → 站起来自由活动 =================
  // 全程没有文字。空格 / 回车 / Esc / 点画面跳过
  // y0：镜头一开始的高度；小禾从画面上方 above 远处、已经带着 vy0 的速度掉进画面（崖顶在更高处，一进画面就是在下坠，不会停在半空）
  // x：贴着左崖壁的起点；landX：落地点。下坠途中被崖壁弹开一点，慢慢飘到 landX
  const INTRO = { x: 8, landX: 36, y0: -320, above: 150, vy0: 200, grav: 360, vmax: 260, lie: 2, getup: 1.3 };
  let intro = null; // { stage: 'fall'|'down', t, vy, vx, rockT }
  function startIntro(soft) {
    const f = G.field, h = G.hero;
    st.phase = 'intro'; st.room = 'pit';
    UI.overlay(null);
    UI.setPhase('intro');
    f.enterSelect();
    h.place(INTRO.x, INTRO.y0 - INTRO.above); h.face = -1; h.onGround = false;
    h.play('fall', Infinity);
    // 先算出下坠总时长，让横向漂移正好在落地时到 landX
    let T = 0, y = INTRO.y0 - INTRO.above, vy = INTRO.vy0;
    while (y < 0) { vy = Math.min(INTRO.vmax, vy + INTRO.grav / 60); y += vy / 60; T += 1 / 60; }
    intro = { stage: 'fall', t: 0, vy: INTRO.vy0, vx: (INTRO.landX - INTRO.x) / T, rockT: 0 };
    f.camX = f.selCamX = -40; // 镜头靠左，摔下来时一路看得见高高的左崖壁
    f.camY = f.selCamY = INTRO.y0;
    if (!soft) G.fade = { t: 0, out: 0, hold: 0.25, inn: 0.9, mid() {}, done: true }; // 从黑屏亮起来
  }
  // 崖上跟着掉下来的碎石：落到地面就没了
  function rock(x, y, vy) {
    const cols = ['#c8925a', '#8a5a3a', '#e4a672', '#6b4430'];
    G.field.particles.push({ x, y, vx: (Math.random() - 0.5) * 12, vy, life: 9, col: cols[Math.floor(Math.random() * 4)], size: Math.random() < 0.3 ? 2 : 1, rock: true });
  }
  function introTick(dt) {
    const f = G.field, h = G.hero, it = intro;
    h.update(dt, null, null); // 只推进动作的计时（趴着 → 坐起来 → 站好）
    if (!intro) return;
    it.t += dt;
    for (const p of f.particles) if (p.rock && p.y > -0.5) { p.life = 0; if (Math.random() < 0.5) f.dirt(p.x, 0, 1, 12); }
    if (it.stage === 'fall') {
      // 碎石：一路跟着掉下来
      if ((it.rockT -= dt) <= 0) {
        it.rockT = 0.05;
        rock(h.x + (Math.random() - 0.5) * 24, Math.min(h.y, f.camY) - 4 - Math.random() * 20, 60 + Math.random() * 90 + it.vy * 0.6);
      }
      it.vy = Math.min(INTRO.vmax, it.vy + INTRO.grav * dt);
      h.y += it.vy * dt;
      h.x = Math.min(INTRO.landX, h.x + it.vx * dt);
      if (h.y >= 0) land();
      // 镜头跟着往下，到地面时正好是平时的高度
      f.camY = f.selCamY = clamp(h.y - G.GEO.H * 0.45, INTRO.y0, G.GEO.SEL_CAMY);
      return;
    }
    // 坐起来以后左右看看，最后看向左边（洞口那边）
    const a = h.act;
    if (a && a.kind === 'getup') h.face = a.t < 0.35 ? -1 : a.t < 0.75 ? 1 : -1;
  }
  function land() {
    const f = G.field, h = G.hero;
    h.y = 0; h.onGround = true;
    intro.stage = 'down';
    f.shake = 0.35;
    f.dirt(h.x, 0, 24, 46);
    h.dust(10);
    G.sfx('rock');
    h.play('lie', INTRO.lie, () => h.play('getup', INTRO.getup, endIntro));
  }
  function endIntro() {
    intro = null;
    for (const p of G.field.particles) if (p.rock) p.life = 0;
    G.hero.act = null;
    G.enterSelect(false, true);
  }
  function skipIntro() {
    if (!intro) return;
    G.fade = null;
    G.hero.place(INTRO.landX); G.hero.face = -1;
    endIntro();
    snapCamera();
  }

  // ================= 前人留在洞里的东西 =================
  // 散落在洞口到锅边的地上（x 是洞穴的世界坐标），走过去就捡起来；笔记在锅边的光里，最后捡到，捡到就翻开扉页
  const KIT = [{ id: 'seed', x: 186 }, { id: 'leftFlower', x: 166 }, { id: 'rightFlower', x: 148 }, { id: 'book', x: 130 }];
  function pickKit(k) {
    st.kit = st.kit.filter(x => x !== k);
    if (k.id === 'seed') {
      st.seeds.camelThorn = (st.seeds.camelThorn || 0) + G.CFG.START_SEEDS;
      st.pickSp = G.field.pickSp = 'camelThorn';
      UI.kitPicked(G.seedURL('camelThorn'), `骆驼刺种子 ×${G.CFG.START_SEEDS}`);
    } else if (k.id === 'book') {
      UI.kitPicked('assets/ui/icon_book.png?v=1018b', '植物学笔记');
      setTimeout(() => G.Notes.show('pre'), 600);
    } else {
      const { potion } = G.Alc.addPotion([k.id], 3);
      st.notes.recipes[potion.key] = 0; // 前人炼的药，配方算前人写的
      UI.kitPicked(G.bottleURL(potion), potion.name);
    }
    G.Cave.pickFx(k.x);
    G.sfx('collect');
    UI.gate();
    UI.renderShelf();
    UI.renderSelect();
    G.save('select');
  }

  // ================= 药剂库存 =================
  G.assignHotbar = function (key, i) {
    const old = st.hotbar.indexOf(key);
    if (old >= 0) st.hotbar[old] = st.hotbar[i];
    st.hotbar[i] = key;
    st.selected = null;
    G.sfx('click');
    UI.renderShelf();
  };
  G.potionLeft = p => p.mode === 'pour' ? p.ml : p.count;
  function removeIfEmpty(p) {
    if (G.potionLeft(p) > 0.01) return;
    delete st.potions[p.key];
    G.Tut.potionEmpty();
    const at = st.hotbar.indexOf(p.key);
    if (at >= 0) st.hotbar[at] = null;
  }

  // 按下药剂格子 / 数字键：一次性药剂立即使用；毫升药剂开始倒入，直到松开（可以同时按住好几格）
  G.hotbarDown = function (i, pid = 'key') {
    if (st.selected) { G.assignHotbar(st.selected, i); return; }
    const key = st.hotbar[i], p = key && st.potions[key];
    if (st.phase !== 'plant' || !G.field.running) {
      if (p) UI.say('种下植物以后才能用药剂。右键格子可以把药剂撤下。', 2.5);
      return;
    }
    if (!p) { G.sfx('fail'); return; }
    if (p.mode === 'pour') {
      if (st.pouring.some(pr => pr.slot === i)) return;
      st.pouring.push({ slot: i, key, pid, sfxT: 0 });
      G.field.pourStart(p);
      UI.setPouring(i, true);
      return;
    }
    G.field.usePotion(p);
    p.count--;
    removeIfEmpty(p);
    G.sfx('potion');
    UI.renderShelf();
    UI.flashSlot(i);
  };
  G.hotbarUp = function (i, pid) {
    for (const pr of st.pouring.slice()) if (i != null ? pr.slot === i : pid == null || pr.pid === pid) stopPour(pr);
  };
  function stopPour(pr) {
    st.pouring = st.pouring.filter(x => x !== pr);
    const p = st.potions[pr.key];
    if (p) { G.field.pourEnd(p); removeIfEmpty(p); }
    UI.setPouring(pr.slot, false);
    UI.renderShelf();
  }
  G.pourTick = function (dt) {
    for (const pr of st.pouring.slice()) {
      const p = st.potions[pr.key];
      if (!p || st.phase !== 'plant' || !G.field.running) { stopPour(pr); continue; }
      // 细流：倒得一样久，药剂用得更少
      const use = Math.min(p.ml, G.CFG.POUR_RATE * dt);
      G.field.pourTick(p, use / G.CFG.POUR_RATE);
      p.ml -= use;
      if ((pr.sfxT -= dt) <= 0) { pr.sfxT = 0.22; G.sfx('pour'); }
      UI.updateAmount(pr.slot, p);
      if (p.ml <= 0.01) stopPour(pr);
    }
  };

  // ================= 阶段 =================
  // 种子都有数量：先锋种子每天清晨由鸟儿留在各层的沙地上，其它要靠炼金
  // 目前只做坑底这一层：老家在崖上的植物不在流程里，种子先藏起来（数量当 0，菜单里也就不出现）
  const inFlow = sp => G.TREES[sp].home === 0;
  G.seedCount = sp => inFlow(sp) ? st.seeds[sp] || 0 : 0;
  // 鸟会带来的先锋种子：老家那层已经到过的
  const birdPool = () => G.TREE_ORDER.filter(sp => G.TREES[sp].tier === 0 && !G.TREES[sp].parasite && G.TREES[sp].home <= st.maxLevel);
  G.speciesKnown = sp => { const tr = G.TREES[sp]; return tr.home <= st.maxLevel || G.seedCount(sp) > 0; };

  // 地表自由活动：在坑里走、跳、爬树、摘果、选地方种。newDay 为 true 时先过一夜（各层植物长大、结果）
  G.enterSelect = function (newDay, keepCam) {
    const f = G.field;
    if (newDay) { st.day++; f.newDay(birdPool(), G.Mail.dawn(f.levels[0].world.mail)); G.Notes.unlock('sleep'); }
    st.phase = 'select';
    st.selected = null;
    fixPick();
    UI.overlay(null);
    UI.setPhase('select');
    f.enterSelect();
    f.pickSp = st.pickSp;
    if (!keepCam) snapCamera();
    if (newDay) f.startBird([...f.nightReport.birdSeeds, ...f.nightReport.mail]);
    UI.renderSelect();
    UI.renderShelf();
    G.save('select');
    if (keepCam) return;
    const n = f.world.plants.length, rep = newDay && f.nightReport;
    if (!n && f.lv === 0 && st.day === 1) UI.say('我们住在峭壁脚下的沙坑里。走到沙地上按 <b>F</b> 种下<b>先锋植物</b>，等树长高了，就能爬上去摘果子！', 7);
    else if (rep) UI.say(nightText(rep), 6);
    else if (newDay) UI.say(`第${st.day}天。挑一种植物，走到想种的地方按 <b>F</b>。`, 5);
    if (newDay) checkRescue();
  };

  // ================= 结局：种树大赛 =================
  // 收到大赛的信以后，清晨坑底有树长到 RESCUE_H 米：醒来后树下亮起量树魔法阵 → 黑屏 → 获救卡片
  function checkRescue() {
    if (G.Mail.received().every(l => l.id !== 'contest')) return;
    const t = G.field.tallest();
    if (!t || t.m < G.CFG.RESCUE_H) return;
    const f = G.field, x = t.p.col * TILE + TILE / 2;
    setTimeout(() => {
      if (st.phase !== 'select') return;
      G.sfx('crit');
      for (let i = 0; i < 4; i++) setTimeout(() => f.addFx('ring', x, -2, { col: '#fee761', r1: 30 + i * 12, dur: 0.8 }), i * 250);
      f.addFx('stars', x, -t.m * TILE, { col: '#fee761', n: 10 });
      UI.say(`${G.TREES[t.p.sp].name}脚下的沙地亮起了一圈金色的花纹……是信里说的<b>量树魔法阵</b>！`, 5);
      setTimeout(() => fadeTo(1.2, 0.6, 0.6, () => {
        st.phase = 'title';
        UI.setPhase('title');
        UI.showRescue(G.TREES[t.p.sp].name, t.m);
      }), 4500);
    }, (WAKE_T + 0.6) * 1000);
  }
  function nightText(rep) {
    const out = [];
    if (rep.fruit) out.push(`夜里老树们又结了 <b>${rep.fruit}</b> 个果子。`);
    if (rep.fell) out.push(`有 <b>${rep.fell}</b> 个没摘的果子熟透了，掉在树下，走过去捡。`);
    const names = a => [...new Set(a)].join('、');
    if (rep.birdSeeds.length) out.push(`清晨有鸟儿飞过，在沙地上留下了 <b>${rep.birdSeeds.length}</b> 颗种子，快去捡！`);
    if (rep.mail.length) out.push(`鸟儿还丢下了一个${G.Mail.parcel(rep.mail[0].id) ? '<b>包裹</b>' : '<b>信封</b>'}，上面写的不是我的名字……`);
    if (rep.humus) out.push(`肉苁蓉的根烂掉了，地下多了 <b>${rep.humus}</b> 格<b>营养土</b>，新根钻过能多积攒养分。`);
    return out.length ? `第${st.day}天。` + out.join('<br>') : `第${st.day}天。挑一种植物，走到想种的地方按 <b>F</b>。`;
  }

  G.pickSpecies = function (sp) {
    if (G.seedCount(sp) <= 0) { UI.say(`没有${G.TREES[sp].name}的种子了。`, 3); G.sfx('fail'); return; }
    st.pickSp = sp;
    G.field.pickSp = sp;
    G.sfx('click');
    UI.renderSelect();
  };
  // 选中的植物种子用完了：换成手上还有的第一种
  function fixPick() {
    if (G.seedCount(st.pickSp) > 0) return;
    st.pickSp = G.TREE_ORDER.find(sp => G.seedCount(sp) > 0) || st.pickSp;
    G.field.pickSp = st.pickSp;
  }

  // 按住 X：小禾蹲下把这块地上的植物拔掉（松手就停）。果子掉在地上，老根当场枯成死根（肉苁蓉的根第二天烂成营养土）
  function startUproot() {
    const f = G.field, hero = G.hero;
    if (hero.act || G.trans || G.fade || st.room !== 'pit' || !G.Mail.has('shovel')) return; // 铲子是第 4 天鸟儿捎来的包裹
    if (!hero.onFloor()) { UI.say('要站在地上才能铲除植物。', 2); G.sfx('fail'); return; }
    const p = f.plantIn(f.pickPlot);
    if (!p) { UI.say('这块地上没有植物。', 2); G.sfx('fail'); return; }
    const x = p.col * TILE + TILE / 2;
    hero.face = x >= hero.x ? 1 : -1;
    hero.play('uproot', G.CFG.UPROOT_TIME, () => finishUproot(p));
    hero.act.plant = p;
  }
  function stopUproot() {
    const a = G.hero.act;
    if (a && a.kind === 'uproot') G.hero.act = null;
  }
  function finishUproot(p) {
    const f = G.field, tr = G.TREES[p.sp];
    if (!f.world.plants.includes(p)) return;
    const drops = f.fruitSpots(p);
    // 芽苞：按植物大小（p.v 0.1~1）掉 1~3 个，从根部附近蹦出来
    const buds = Math.min(3, 1 + Math.floor((p.v - 0.1) / 0.3)), bx = p.col * TILE + TILE / 2;
    for (let i = 0; i < buds; i++) drops.push({ id: 'bud', x: bx + (i - (buds - 1) / 2) * 5, y: -6 });
    f.removePlant(p, drops);
    f.shake = 0.15;
    G.sfx('smash');
    UI.renderSelect();
    UI.say(`铲除了${tr.name}。` + `${drops.length > buds ? `树上的 <b>${drops.length - buds}</b> 个果子和` : ''}<b>${buds}</b> 个芽苞掉在地上了，走过去捡。` + (tr.parasite ? '它的根明天会烂成<b>营养土</b>。' : ''), 5);
    if (!tr.parasite) G.Notes.unlock('deadRoot');
    G.save('select');
  }

  // 按 F：脚下这块地上有植物就摇树；手上有种子、脚下是空地时，先在正上方弹出种子菜单，选好再种（哪怕只有一种）
  function plantKey() {
    const f = G.field, have = G.TREE_ORDER.filter(sp => G.seedCount(sp) > 0);
    const here = st.room === 'pit' && f.pickPlot >= 0 ? f.plantIn(f.pickPlot) : null;
    if (here) { shakeTree(here); return; }
    if (!have.length || st.room !== 'pit' || !G.hero.onFloor() || f.plantIn(f.pickPlot)) { tryPlant(); return; }
    keys.left = keys.right = keys.up = keys.down = false;
    G.hero.target = null;
    UI.openSeedMenu(have);
  }
  // 摇树：推一下树干，树晃起来，摇下 1~3 颗果子落在地上
  function shakeTree(p) {
    const f = G.field, hero = G.hero;
    if (hero.act || G.trans || G.fade || !hero.onFloor()) return;
    hero.face = p.col * TILE + TILE / 2 >= hero.x ? 1 : -1;
    hero.play('shake', 0.25, () => {
      const n = f.shakePlant(p);
      f.shake = 0.06;
      G.sfx(n ? 'fruit' : 'branch');
      if (n) G.saveSoon();
      else UI.say(`${G.TREES[p.sp].name}上没有果子。`, 2);
    });
  }
  // 营地岩洞里按 F：堆肥坑、工作台打开面板，空位直接搭（站定了才行）
  function campKey() {
    if (!G.hero.onGround) return;
    keys.left = keys.right = keys.up = keys.down = false;
    G.hero.target = null;
    G.Camp.interact(G.hero);
  }
  // 小禾蹲下种下种子，然后进入种植
  G.tryPlant = () => tryPlant();
  function tryPlant() {
    const f = G.field, hero = G.hero;
    if (hero.act || G.trans || G.fade) return;
    if (st.room === 'cave') { UI.say('洞里没有土，种不了东西。', 2); G.sfx('fail'); return; }
    if (st.room === 'east') { UI.say('这里种不了东西。', 2); G.sfx('fail'); return; }
    if (!hero.onFloor()) { UI.say('要站在地上才能种。', 2); G.sfx('fail'); return; }
    if (G.seedCount(st.pickSp) <= 0) { UI.say('手上没有种子了。看看地上有没有鸟儿留下的，或者等明天清晨的鸟。', 4); G.sfx('fail'); return; }
    const col = f.pickCol, why = f.plantBlock(st.pickSp, col);
    if (why) { UI.say(why + (f.plantIn(f.pickPlot) && G.Mail.has('shovel') ? '，先按住 <b>X</b> 铲除它，或者换个地方。' : '，换个地方吧。'), 3); G.sfx('fail'); return; }
    G.sfx('click');
    // 走到种植点旁边（站在自己这一侧），到了再种
    const mx = col * TILE + TILE / 2, side = hero.x < mx ? -1 : 1;
    hero.walkTo(mx + side * 10);
    plantAfterWalk = { col, x: hero.target, face: -side };
  }
  // 走到了就开始种；半路被方向键、跳跃或点别处打断就算了
  function plantWalkTick() {
    const p = plantAfterWalk, hero = G.hero;
    if (!p) return;
    if (keys.left || keys.right || keys.jump || (hero.target !== null && hero.target !== p.x)) { plantAfterWalk = null; return; }
    if (hero.target !== null) return;
    plantAfterWalk = null;
    if (Math.abs(hero.x - p.x) > 2 || !hero.onFloor()) return;
    hero.face = p.face;
    startPlanting(p.col);
  }
  function startPlanting(col, row = 0) {
    const f = G.field;
    st.seeds[st.pickSp]--;
    st.phase = 'plant';
    UI.setPhase('plant');
    f.newRound(st.day, st.pickSp, col, row);
    UI.renderShelf();
    const has = st.hotbar.some(Boolean);
    UI.say(has ? `种下了${G.TREES[st.pickSp].name}！根系开始生长了，看准时机<b>按住</b>药剂。` : '药剂架是空的……这次只能靠运气了！');
  }

  G.on('growStart', () => {
    st.phase = 'grow';
    UI.setPhase('grow');
    UI.tallyStart();
    G.hero.play('cheer', 3);
    UI.say('收获时间！养分正顺着根流回树里……', 3);
  });
  // 树长好了：果实挂在枝头，等小禾爬上去摘；地下采到的矿物直接收下
  G.on('roundEnd', data => {
    for (const [id, n] of Object.entries(data.harvest)) st.materials[id] = (st.materials[id] || 0) + n;
    UI.tallyHide();
    G.hero.act = null;
    G.enterSelect(false, true);
    G.Notes.unlock('harvest');
    if (data.reformed.length) G.Notes.unlock('soil');
    const n = data.fruitN, h = `长到 <b>${data.heightM.toFixed(1)}</b> 米，`;
    UI.say(n >= 10 ? `${h}结了满满 <b>${n}</b> 个果子！爬上去摘吧，<b>W</b> 抓住树干往上爬。` : n > 0 ? `${h}结出 <b>${n}</b> 个果子，挂在树上了。去摘吧！` : `${h}可惜没有结果……根要扎得更长更深！`, 6);
  });

  // 在洞穴里的炼药锅前按 W：站到锅边，打开炼药界面
  G.enterAlchemy = function () {
    const h = G.hero;
    h.face = h.x < G.Cave.pot ? 1 : -1;
    st.phase = 'alchemy';
    UI.overlay(null);
    UI.setPhase('alchemy');
    G.sfx('click');
    G.WS.open();
    UI.renderShelf();
    G.save('alchemy');
  };
  // 离开锅边：回到洞里自由走动，还是同一天
  function leaveAlchemy() { G.WS.close(); G.enterSelect(false, true); }

  // ================= 黑屏过渡：切房间、睡觉 =================
  // out 秒变黑 → 调 mid → 停 hold 秒 → inn 秒亮回来。过渡中不接受输入
  function fadeTo(out, hold, inn, mid) {
    if (G.fade || G.trans) return;
    G.fade = { t: 0, out, hold, inn, mid, done: false };
  }
  function fadeTick(dt) {
    const fd = G.fade;
    if (!fd) return;
    fd.t += dt;
    if (!fd.done && fd.t >= fd.out) { fd.done = true; fd.mid(); }
    if (fd.t >= fd.out + fd.hold + fd.inn) G.fade = null;
  }
  function fadeAlpha() {
    const fd = G.fade;
    if (!fd) return 0;
    return fd.t < fd.out ? fd.t / fd.out : fd.t < fd.out + fd.hold ? 1 : 1 - (fd.t - fd.out - fd.hold) / fd.inn;
  }

  // 横版切房间：往左走进崖壁的开口 → 洞穴右端；往右走出洞口 → 坑底开口旁
  // 坑底右崖崖顶的洞口往里走 → 营地岩洞左边的洞口；从那里往左走出去 → 回到崖顶的洞口里
  let caveSeen = false;
  function goRoom(to) {
    const from = st.room;
    fadeTo(0.18, 0.05, 0.22, () => {
      const h = G.hero;
      st.room = to;
      if (to === 'cave') { h.place(G.Cave.entry); h.face = -1; G.Cave.particles = []; }
      else if (to === 'east') { h.place(G.East.entry); h.face = 1; G.East.particles = []; G.Notes.unlock('east'); }
      else if (from === 'east') { const m = G.field.mouth(); h.place(m.x1 - G.MOUTH_IN - 4, m.y); h.face = -1; }
      else { h.place(10 - G.CAVE.MOUTH); h.face = 1; }
      snapCamera();
      h.vx = h.face * 40; // 接着往前走两步，看起来是走进来的
      UI.renderSelect();
      if (to === 'cave' && !caveSeen) { caveSeen = true; UI.say('崖壁里藏着一个没人住的洞穴，最里面有一口旧<b>炼药锅</b>。走到锅边按 <b>W</b> 炼药。', 6); }
      G.save('select');
    });
  }

  // 睡觉：在平地上按 S 坐下，再长按 F（或按住头顶按钮）SLEEP_HOLD 秒，眼前暗角收拢 → 黑屏睡到第二天 →
  // 醒来时眼睛睁开一半、又困得合上一点、再完全睁开，人还坐在原地
  const SLEEP_HOLD = 1.5, DOZE_BACK = 0.5; // 按满多久入睡；松手后多久清醒回来
  const WAKE_T = 2;                        // 醒来睁眼动画的时长
  const Z_LIFE = 1.6;                      // 每个 z 飘多久
  G.doze = 0;                              // 0..1 犯困进度，暗角和按钮进度条都看它
  G.waking = false;
  let zzz = [], zzzT = 0, zzzN = 0;        // 头顶飘起的 z（世界坐标）
  let wakeT = 0;
  G.sleep = function () {
    const h = G.hero;
    if (st.phase !== 'select' || !h.sit || G.fade) return;
    G.sfx('click');
    fadeTo(0.3, 1.4, 0.35, () => {
      const x = h.x, face = h.face;
      keys.sleep = false; zzz = [];
      G.enterSelect(true);
      h.place(x); h.face = face; h.sit = true;
      snapCamera();
      G.doze = 1; G.waking = true; wakeT = 0; // 亮回来时先是一条眼缝
    });
  };
  // 睁眼曲线：1 → 0.45（睁开一半）→ 0.8（又困得合上）→ 0（完全醒了）
  const ease = t => t * t * (3 - 2 * t);
  function wakeCurve(t) {
    if (t < 0.6) return 1 - 0.55 * ease(t / 0.6);
    if (t < 0.95) return 0.45 + 0.35 * ease((t - 0.6) / 0.35);
    return 0.8 * (1 - ease(Math.min(1, (t - 0.95) / (WAKE_T - 0.95))));
  }
  // 发呆：在能坐的地方站着不动 SIT_IDLE 秒就自己坐下（坐下本身就是歇一会儿，不只是为了睡觉）；动一下就站起来
  const SIT_IDLE = 5;
  let idleT = 0;
  function idleSit(dt) {
    const h = G.hero;
    const busy = h.sit || G.trans || keys.left || keys.right || keys.up || keys.down || keys.jumpHeld || h.target !== null || Math.abs(h.vx) > 1 ||
      st.pouring.length || G.Notes.isOpen() || UI.bagOpen() || UI.seedMenuOpen() || G.Camp.isOpen() || !canSit();
    idleT = busy ? 0 : idleT + dt;
    if (idleT >= SIT_IDLE) { idleT = 0; h.sit = true; potAfterWalk = false; }
  }
  function dozeTick(dt) {
    const h = G.hero;
    if (!h.sit || G.waking) keys.sleep = false; // 站起来就算放弃了；刚醒的时候也不能接着睡
    if (G.fade) return;
    idleSit(dt);
    if (G.waking) {
      wakeT += dt;
      G.doze = wakeCurve(wakeT);
      if (wakeT >= WAKE_T) { G.waking = false; G.doze = 0; }
    } else if (keys.sleep && st.phase === 'select') {
      G.doze = Math.min(1, G.doze + dt / SLEEP_HOLD);
      // 越困 z 冒得越快、越大
      if ((zzzT -= dt) <= 0 && G.doze > 0.08) {
        zzzT = 0.5 - G.doze * 0.22;
        zzz.push({ x: h.x + h.face * 6, y: h.y - 11, t: 0, size: G.doze > 0.6 ? 1 : 0, side: zzzN++ % 2 ? 1 : -1 });
      }
      if (G.doze >= 1) G.sleep();
    } else G.doze = Math.max(0, G.doze - dt / DOZE_BACK);
    // 斜着往小禾面朝的那边飘（正上方是睡觉按钮，别被挡住），越飘越快
    for (const z of zzz) { z.t += dt; z.y -= dt * (5 + z.t * 5); z.x += dt * h.face * (9 + z.t * 4); }
    zzz = zzz.filter(z => z.t < Z_LIFE);
  }

  // 犯困的暗角：以小禾为圆心，一圈 4×4 Bayer 抖动的暗色从屏幕边缘往里收，doze=1 时只剩一小点
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const DOZE_R = 300; // 刚按下时光圈的半径（画布像素，画布 480×270）
  let dozeImg = null;
  const dozeCv = document.createElement('canvas');
  // z 的三种大小；飘的过程中一级级长大
  const Z_GLYPH = [['111', '010', '111'], ['1111', '0010', '0100', '1111'], ['11111', '00010', '00100', '01000', '11111']];
  function drawDoze(c, view, hero) {
    const e = G.doze;
    if (e <= 0 && !zzz.length) return;
    const w = c.canvas.width, h = c.canvas.height;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); // 画完场景后 ctx 上还留着镜头变换
    const cx = Math.round(hero.x * PX) - view.ox, cy = Math.round((hero.y - 8) * PX) - view.oy;
    if (e > 0) {
      if (!dozeImg || dozeImg.width !== w) dozeImg = c.createImageData(w, h);
      // 半径先快后慢地收（不管小禾在屏幕哪儿，一按下四周就开始暗）；带一点呼吸般的起伏，像在打瞌睡
      const breathe = 1 + 0.06 * Math.sin(clock * 4.5) * (1 - e);
      const r = DOZE_R * Math.pow(1 - e, 1.6) * breathe, soft = 30 + 50 * (1 - e), dim = e * e * 0.5;
      const d = new Uint32Array(dozeImg.data.buffer), INK = 0x180c0c; // ABGR 里的 rgb(12,12,24)：偏冷的夜色
      for (let y = 0; y < h; y++) {
        const dy = y - cy, row = y * w, by = (y & 3) * 4;
        for (let x = 0; x < w; x++) {
          const dx = x - cx, t = (Math.sqrt(dx * dx + dy * dy) - r) / soft;
          const v = Math.max(dim, t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
          // 量化成 5 档透明度，用 Bayer 阈值决定落在哪一档 → 像素风的抖动过渡
          const a = Math.min(4, Math.floor(v * 4 + BAYER[by + (x & 3)])) * 63.75;
          d[row + x] = ((a | 0) << 24) | INK;
        }
      }
      // putImageData 会直接覆盖像素，所以先写到离屏画布再叠上去
      if (dozeCv.width !== w) { dozeCv.width = w; dozeCv.height = h; }
      dozeCv.getContext('2d').putImageData(dozeImg, 0, 0);
      c.drawImage(dozeCv, 0, 0);
    }
    // z：冒出来时弹一下，边飘边长大、左右摇摆、整个字来回歪；描深色边，亮处暗处都看得见
    for (const z of zzz) {
      const u = z.t / Z_LIFE, a = Math.min(1, z.t * 6, (1 - u) * 3);
      const g = Z_GLYPH[Math.min(2, z.size + Math.floor(u * 2.4))], n = g.length;
      const pop = z.t < 0.12 ? -1 : 0; // 刚冒出来往上弹一像素
      const zx = Math.round((z.x + Math.sin(z.t * 3.5) * (1.5 + u * 3) * z.side) * PX) - view.ox - (n >> 1);
      const zy = Math.round(z.y * PX) - view.oy - n + pop;
      const tilt = Math.sin(z.t * 6 + z.side) > 0 ? 1 : -1; // 上半截往一边错开一像素 → 字在晃
      const px = (i, j) => [zx + i + (j < n >> 1 ? tilt : 0), zy + j];
      for (const [col, d] of [[`rgba(24,12,40,${a * 0.8})`, 1], [`rgba(222,206,255,${a})`, 0]]) {
        c.fillStyle = col;
        g.forEach((rowS, j) => { for (let i = 0; i < n; i++) if (rowS[i] === '1') {
          const [x, y] = px(i, j);
          if (d) { c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3); } else c.fillRect(x, y, 1, 1);
        } });
      }
    }
    c.restore();
  }
  // 捡到笔记以前不能坐下睡觉（不然第二天的鸟会带来种子，洞里那些东西就不用去找了）
  // 营地岩洞又冷又暗：生了篝火才能坐下
  const canSit = () => { const h = G.hero; return G.gotKit('book') && h.onGround && !h.plat && h.y > -0.5 && !h.climb && !h.act && (st.room !== 'east' || G.Camp.has('fire')); };

  // ================= 换层：爬上崖台 / 顺着绳梯下去 =================
  function goLevel(to) {
    if (G.trans || to < 0 || to >= G.LEVELS.length) return;
    G.trans = { k: 0, dir: to > G.field.lv ? 1 : -1, to, swapped: false };
    G.sfx(to > G.field.lv ? 'grow' : 'branch');
  }
  function swapLevel() {
    const f = G.field, tr = G.trans, up = tr.dir > 0;
    f.finishBird();
    f.setLevel(tr.to);
    if (up) { const dx = f.downExit(); G.hero.place(dx.x - dx.side * 18); G.hero.face = -dx.side; }
    else { const lp = f.lip(); G.hero.place(lp.side > 0 ? WORLD_W - 10 : 10, lp.y); G.hero.face = -lp.side; }
    f.particles = []; f.fx = [];
    snapCamera();
    UI.renderSelect();
    const L = G.LEVELS[tr.to], first = tr.to > st.maxLevel;
    if (first) st.maxLevel = tr.to;
    UI.banner(`第${tr.to + 1}层 · ${L.name}`, L.sub);
    if (first) {
      const news = G.TREE_ORDER.filter(sp => G.TREES[sp].home === tr.to).map(sp => G.TREES[sp].name);
      UI.say(`爬上来了！这里是<b>${L.name}</b>。${news.length ? `这一层长着${news.join('、')}，` : ''}土和地下都和下面不一样。`, 7);
      if (L.top) setTimeout(() => UI.showEnding(), 1800);
    } else UI.say(up ? `回到了${L.name}。` : `下到了${L.name}，顺着绳梯就能回到地面。`, 3);
    G.save('select');
  }

  // 小禾周围能做的事：坐着 / 洞里的锅边 / 崖台上往上爬 / 下山口 / 地上种树
  function context() {
    const f = G.field, h = G.hero;
    if (h.sit) return 'sit';
    if (st.room === 'cave') return G.Cave.nearPot(h) ? 'pot' : 'cave';
    if (st.room === 'east') return h.onGround ? 'east' : 'air';
    if (h.climb) return 'climb';
    const lp = f.lip();
    if (lp && h.onGround && h.plat && h.plat.kind === 'lip') return Math.abs(h.x - (lp.side > 0 ? WORLD_W : 0)) < 22 ? 'up' : 'lip';
    const dx = f.downExit();
    if (dx && h.onFloor() && Math.abs(h.x - dx.x) < 12) return 'down';
    if (h.onFloor()) return 'floor';
    return h.onGround ? 'tree' : 'air';
  }
  G.context = context;

  // 触屏按键现在能做什么（touch.js 每帧问）：act 是行动键（= F）上的字，空串就是没事可做；dig：铲键在不在、能不能按
  G.touchState = function () {
    const f = G.field, h = G.hero;
    if (UI.seedMenuOpen()) return { act: '种下', dig: null, menu: true };
    const dig = st.room === 'pit' && G.Mail.has('shovel') ? { ok: h.onFloor() && !!f.plantIn(f.pickPlot) } : null;
    if (G.trans || G.fade || (h.act && h.act.kind !== 'uproot')) return { act: '', dig };
    const ctx = context();
    let act = '';
    if (ctx === 'sit') act = '睡觉';
    else if (st.room === 'east') act = h.onGround ? G.Camp.actName(h) : '';
    else if (st.room === 'pit' && h.onFloor()) act = f.plantIn(f.pickPlot) ? '摇树' : G.gotKit('seed') ? '种植' : '';
    return { act, dig };
  };

  function snapCamera() {
    if (st.room !== 'pit') return; // 洞穴、营地岩洞都是一屏大小，镜头不动
    const f = G.field;
    lookX = G.hero.face * 18;
    f.selCamX = f.camX = clamp(G.hero.x - W / 2 + lookX, -40, WORLD_W - W + 40);
    f.selCamY = f.camY = camYFor(G.hero.y);
  }
  // 地表行走时镜头该在的位置（收获演出用它做镜头终点，交还时无缝衔接）
  G.selCamTarget = function () {
    lookX = G.hero.face * 18;
    return [clamp(G.hero.x - W / 2 + lookX, -40, WORLD_W - W + 40), camYFor(G.hero.y)];
  };
  // 镜头高度：站在地上时看到地面和一点地下；爬高了就跟着往上（最高看到崖台 / 右侧矮崖顶再往上一点）
  function camYFor(y) {
    const f = G.field, lp = f.lip(), rt = f.rightTop(), top = -((lp ? -lp.y : rt !== null ? -rt : 60) + 130);
    return clamp(y - 70, top, G.GEO.SEL_CAMY);
  }
  G.teleportHero = function (x) {
    if (st.phase !== 'select' || st.room !== 'pit' || G.hero.act || G.trans || G.fade || !G.hero.onFloor()) return;
    G.hero.walkTo(x);
  };

  G.on('event', ev => {
    if (ev === 'rock') G.Notes.unlock('rock');
    if (ev === 'rock') UI.say(`哎呀，硬撞岩石！<b>-${G.field.rockPenalty} 秒</b>`, 2.5);
    else if (ev === 'burn') UI.say('根尖被熔岩烧焦了！', 2.5);
  });

  // ================= 试验场（index.html?test）：编辑器把当前地图放进 localStorage 再打开这里 =================
  // 不读也不写存档；材料、种子、药剂都管够。R 重置地图并重开，T 切换无限时间
  const TEST = new URLSearchParams(location.search).has('test') ? (() => { try { return JSON.parse(localStorage.getItem(G.Strata.TEST_KEY)); } catch (e) { return null; } })() || {} : null;
  G.TEST = TEST;
  const TEST_POTIONS = [['leftFlower'], ['rightFlower'], ['ironOre'], ['ashMoss'], ['fern'], ['windFruit'], ['tamariskSprout'], ['tamariskSprout', 'stoneWhisker', 'oleasterBloom'], ['thornSugar'], ['stoneWhisker']];
  function testRefill() {
    for (const p of Object.values(st.potions)) { if (p.mode === 'pour') p.ml = 99 * G.CFG.BOTTLE_ML; else p.count = 99; }
    for (const sp of G.TREE_ORDER) st.seeds[sp] = 99;
    UI.renderShelf();
  }
  function testInit() {
    G.save = G.saveSoon = () => {};
    for (const id in G.MATERIALS) st.materials[id] = 99;
    st.potions = {};
    st.hotbar = new Array(TEST_POTIONS.length).fill(null);
    for (const r of TEST_POTIONS) G.Alc.addPotion(r, 1);
    if (TEST.sp && G.TREES[TEST.sp]) st.pickSp = TEST.sp;
    st.notes.letters.shovel = 0; // 铲子平时是第 4 天鸟儿捎来的，试验场直接给
    testRefill();
    const tag = document.createElement('div');
    tag.className = 'px-hint';
    tag.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:50;pointer-events:none';
    tag.innerHTML = '试验场 · <b>R</b> 重置地图重开 · <b>T</b> 无限时间';
    $('game').appendChild(tag);
    st.room = 'pit';
    G.hero.place(TEST.start ? TEST.start.col * TILE : 30); G.hero.face = 1;
    G.enterSelect(false);
    if (TEST.start) testRound();
    else UI.say('试验场：走到想种的地方按 <b>F</b>。<b>R</b> 重置地图，<b>T</b> 无限时间。', 6);
  }
  // 从编辑器里选的位置直接开一局
  function testRound() {
    const { col, row } = TEST.start;
    testRefill();
    G.hero.place(clamp(col * TILE + TILE / 2 - 14, 6, WORLD_W - 6));
    startPlanting(col, row);
  }
  function testReset() {
    const f = G.field;
    G.hotbarUp();
    G.hero.act = null;
    f.levels = []; f.lv = undefined; f.setLevel(0);
    f.particles = []; f.fx = [];
    UI.tallyHide();
    G.enterSelect(false);
    if (TEST.start) testRound();
    else { testRefill(); UI.say('地图已重置。', 2); }
  }

  // 调试用：从短到长枚举配方（基底开头，最多 3 份材料），挑出 n 种还没有的药剂，各给 10 瓶
  function debugPotions(n) {
    const ids = Object.keys(G.MATERIALS).filter(id => G.MATERIALS[id].kind !== 'bud');
    const bases = ids.filter(id => G.MATERIALS[id].kind === 'base');
    let got = 0, layer = bases.map(id => [id]);
    while (layer.length && got < n) {
      for (const r of layer) {
        const res = G.Alc.brew(r);
        if (!res.instructions.length || st.potions[res.key]) continue;
        const p = st.potions[res.key] = { key: res.key, name: res.name, instructions: res.instructions, mode: res.mode, count: 0, ml: 0 };
        if (p.mode === 'pour') p.ml = 10 * G.CFG.BOTTLE_ML; else p.count = 10;
        const free = st.hotbar.indexOf(null);
        if (free >= 0) st.hotbar[free] = res.key;
        if (++got >= n) break;
      }
      layer = layer.length && layer[0].length < 3 ? layer.flatMap(r => ids.map(id => [...r, id])) : [];
    }
    return got;
  }

  // 调试：直接放下一棵长满的胡杨（v=1），不走种植、不改土、地下没有根
  function debugTree() {
    const f = G.field, w = f.world;
    if (st.room !== 'pit' || f.lv !== 0 || st.phase !== 'select') return;
    let plot = f.plotOf(G.GEO.COLS - 1);
    while (plot >= 0 && f.plantIn(plot)) plot--;
    if (plot < 0) return;
    const col = f.plotMid(plot), id = w.pid++;
    w.plants.push({ id, sp: 'populus', col, v: 1, seed: (Math.random() * 1e9) >>> 0, day: st.day, hp: 2, fruits: [] });
    w.cells[id] = [];
    f.addFx('puff', col * TILE + TILE / 2, 0, { n: 8 });
    G.sfx('grow');
    UI.renderSelect();
    G.saveSoon();
  }

  // ================= 输入 =================
  const keys = { left: false, right: false, up: false, down: false, jump: false, jumpHeld: false, sleep: false };
  let lookX = 18, potAfterWalk = false; // potAfterWalk：洞里点了锅，走到锅边就开始炼药
  let plantAfterWalk = null;            // 按了 F：走到种植点旁边就开始种 { col, x, face }
  // 键盘和触屏按键（touch.js）走同一套：触屏按下 / 松开就当按了对应的键
  const TOUCH_EV = { repeat: false, preventDefault() {} };
  G.pressKey = k => keyDown(k, TOUCH_EV);
  G.releaseKey = k => keyUp(k);
  function bindInput() {
    addEventListener('keydown', e => keyDown(e.key.length === 1 ? e.key.toLowerCase() : e.key, e));
    addEventListener('keyup', e => keyUp(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    addEventListener('pointerup', e => G.hotbarUp(null, e.pointerId));
    addEventListener('pointercancel', e => G.hotbarUp(null, e.pointerId));
    addEventListener('blur', releaseAll);

    // 点击画面：地上点哪走到哪（坑底点崖壁开口就走进洞穴）；洞里点锅 → 走到锅边开始炼药。收获动画中点击跳过
    $('view').addEventListener('pointerdown', e => {
      if (st.phase === 'grow') { G.field.skipShow(); return; }
      if (st.phase === 'intro') { skipIntro(); return; }
      if (UI.seedMenuOpen()) { UI.closeSeedMenu(); return; }
      if (st.phase !== 'select' || G.trans || G.fade || G.hero.act || !G.hero.onFloor()) return;
      const [lx, ly] = UI.toLocal(e);
      if (st.room === 'cave') {
        const [wx, wy] = G.Cave.toWorld(lx, ly), onPot = G.Cave.onPot(wx, wy);
        potAfterWalk = onPot;
        G.hero.walkTo(onPot ? G.Cave.potSpot(G.hero) : wx);
        return;
      }
      if (st.room === 'east') { G.hero.walkTo(G.East.toWorld(lx, ly)[0]); return; }
      const wx = G.field.camX + lx / (PX * 2), wy = G.field.camY + ly / (PX * 2), f = G.field;
      // 触屏：点自己脚下这块空地（地面附近）= 按行动键，弹出种子菜单
      if (e.pointerType === 'touch' && f.pickPlot >= 0 && f.plotOf(Math.floor(wx / TILE)) === f.pickPlot && !f.plantIn(f.pickPlot) && wy > -24 && wy < 16) { plantKey(); return; }
      G.hero.walkTo(wx);
    });
    $('btnHarvest').onclick = () => { if (G.field.running) G.field.end('提前收获'); };
    $('btnOut').onclick = () => leaveAlchemy();
    // 头顶的睡觉按钮也要按住（手机上就靠它）
    const sb = $('btnSleep'), letGo = () => { keys.sleep = false; };
    sb.addEventListener('pointerdown', e => { e.preventDefault(); keys.sleep = true; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) sb.addEventListener(ev, letGo);
    sb.addEventListener('contextmenu', e => e.preventDefault());
    $('btnBag').onclick = () => UI.toggleBag();
    G.Notes.bind();
    // 设置面板：音乐 / 音效开关（M 键也能切换）
    $('btnSet').onclick = () => UI.toggleSettings();
    const muteBtn = $('btnMute'), showMute = () => { muteBtn.textContent = G.muted ? '关' : '开'; muteBtn.className = 'pxbtn tiny ' + (G.muted ? 'gray' : 'green'); };
    muteBtn.onclick = () => { G.muted = !G.muted; showMute(); };
    showMute();
    // 地下地图：设计地图 / 原来的随机生成。种植中不能换；换了以后去过的各层地下立刻重新生成
    // 试验场里也能换（方便对比），但不改本机的设置
    const mapBtn = $('setMap'), showMap = () => { mapBtn.textContent = G.mapMode === 'random' ? '随机' : '设计'; mapBtn.className = 'pxbtn tiny ' + (G.mapMode === 'random' ? 'yellow' : 'green'); };
    let mapMsgT = 0;
    mapBtn.onclick = () => {
      if (st.phase === 'plant' || st.phase === 'grow') {
        G.sfx('fail');
        mapBtn.textContent = '种植中不能换';
        clearTimeout(mapMsgT); mapMsgT = setTimeout(showMap, 1500);
        return;
      }
      const m = G.mapMode === 'random' ? 'design' : 'random';
      if (TEST) G.mapMode = m; else G.Strata.setMode(m);
      G.field.regenUnderground();
      showMap();
      G.sfx('click');
      G.save(st.phase === 'alchemy' ? 'alchemy' : 'select');
    };
    showMap();
  }
  // 松开所有按着的键（窗口失焦、手机竖过来暂停时）
  function releaseAll() { G.hotbarUp(); stopUproot(); for (const k in keys) keys[k] = false; }
  G.releaseAll = releaseAll;

  function keyDown(k, e) {
    idleT = 0;
    if (st.phase === 'title') { UI.titleKey(k, e); return; }
    if (st.phase === 'intro') { if (!e.repeat && (k === ' ' || k === 'Enter' || k === 'Escape')) { e.preventDefault(); skipIntro(); } return; }
    // 调试：F9 一键获得 20 种还没有的药剂，各 10 瓶（不记进图鉴）
    if (k === 'F9') {
      e.preventDefault();
      if (!e.repeat) {
        const n = debugPotions(20);
        G.saveSoon();
        UI.renderShelf();
        UI.say(`调试：获得 <b>${n}</b> 种药剂`, 2);
      }
      return;
    }
    // 调试：F8 堆肥 +999（在哪都行），在坑底时还会在最靠右的空地块上长出一棵参天的胡杨，方便爬上右边的矮崖
    if (k === 'F8') {
      e.preventDefault();
      if (!e.repeat) { st.camp.compost += 999; G.saveSoon(); debugTree(); }
      return;
    }
    // 调试：F10 一键获得流程内所有种类的种子各 10 颗
    if (k === 'F10') {
      e.preventDefault();
      if (!e.repeat) {
        for (const sp of G.TREE_ORDER) if (inFlow(sp)) st.seeds[sp] = (st.seeds[sp] || 0) + 10;
        if (!G.seedCount(st.pickSp)) { st.pickSp = 'camelThorn'; G.field.pickSp = st.pickSp; }
        G.saveSoon();
        UI.renderShelf(); UI.renderSelect();
        UI.say('调试：所有种子 <b>+10</b>', 2);
      }
      return;
    }
    if (G.Notes.isOpen()) { G.Notes.key(k, e); return; }
    if (UI.bagOpen()) { UI.bagKey(k, e); return; }
    if (UI.seedMenuOpen()) { UI.seedMenuKey(k, e); return; }
    if (G.Camp.isOpen()) { G.Camp.key(k, e); return; }
    if (k === 'n' && !e.repeat && G.gotKit('book') && (st.phase === 'select' || st.phase === 'alchemy') && !G.trans && !G.fade) { G.Notes.show(); return; }
    if (TEST && !e.repeat && (k === 'r' || k === 't') && !G.trans && !G.fade && st.room === 'pit' && st.phase !== 'alchemy') {
      if (k === 'r') testReset();
      else { G.field.infTime = !G.field.infTime; UI.say(G.field.infTime ? '无限时间：<b>开</b>' : '无限时间：<b>关</b>', 2); }
      return;
    }
    if (k >= '1' && k <= String(st.hotbar.length)) { if (!e.repeat) G.hotbarDown(+k - 1); return; }
    if (k === 'm') { $('btnMute').click(); return; }
    if (st.phase === 'select') {
      if (G.trans || G.fade || G.hero.act) return;
      const ctx = context();
      if (k === 'a' || k === 'ArrowLeft') keys.left = true;
      else if (k === 'd' || k === 'ArrowRight') keys.right = true;
      else if (k === 'w' || k === 'ArrowUp') {
        if (!e.repeat && ctx === 'pot') { potAfterWalk = true; G.hero.walkTo(G.Cave.potSpot(G.hero)); }
        else if (!e.repeat && ctx === 'up') goLevel(G.field.lv + 1);
        else keys.up = true;
      }
      else if (k === 's' || k === 'ArrowDown') {
        // 下山口优先；其余平地上按 S 坐下（再按一次站起来）
        if (!e.repeat && ctx === 'down') goLevel(G.field.lv - 1);
        else if (!e.repeat && ctx === 'sit') G.hero.sit = false;
        else if (!e.repeat && canSit()) { G.hero.sit = true; G.hero.target = null; potAfterWalk = false; }
        else if (!e.repeat && st.room === 'east' && G.hero.onGround && G.gotKit('book')) G.Camp.hint('洞里又冷又暗，没有火睡不着……');
        else keys.down = true;
      }
      else if (k === ' ') { e.preventDefault(); if (!e.repeat) keys.jump = true; keys.jumpHeld = true; }
      else if (k === 'f' && !e.repeat) { if (ctx === 'sit') keys.sleep = true; else if (st.room === 'east') campKey(); else plantKey(); }
      else if (k === 'x' && !e.repeat) startUproot();
      else if (k === 'b' && !e.repeat && !UI.noPotions()) UI.toggleBag();
      else if (k === 'Escape') { st.selected = null; UI.renderShelf(); }
    } else if (st.phase === 'plant') {
      if (k === 'h' && G.field.running) G.field.end('提前收获');
    } else if (st.phase === 'grow') {
      if (k === ' ' || k === 'Enter') { e.preventDefault(); G.field.skipShow(); }
    } else if (st.phase === 'alchemy') {
      if (G.WS.key(k, e)) return;
      if (k === 'b' && !e.repeat && !UI.noPotions()) { UI.toggleBag(); return; }
      if (k === 'Escape') { if (st.selected) { st.selected = null; UI.renderShelf(); } else leaveAlchemy(); }
    }
  }
  function keyUp(k) {
    if (k === 'a' || k === 'ArrowLeft') keys.left = false;
    if (k === 'd' || k === 'ArrowRight') keys.right = false;
    if (k === 'w' || k === 'ArrowUp') keys.up = false;
    if (k === 's' || k === 'ArrowDown') keys.down = false;
    if (k === ' ') keys.jumpHeld = false;
    if (k === 'x') stopUproot();
    if (k === 'f') keys.sleep = false;
    if (st.phase === 'alchemy') G.WS.keyUp(k);
    if (G.Camp.isOpen()) G.Camp.keyUp(k);
    if (k >= '1' && k <= String(st.hotbar.length)) G.hotbarUp(+k - 1);
  }

  // 窗口缩放：960×540 的舞台用 zoom 放大（浏览器按真实分辨率排版、出字，不是把位图拉伸）。
  // 倍数取「一个游戏像素（舞台 2px）正好落在整数个屏幕像素上」的最大值：屏幕像素/舞台像素 取 0.5 的倍数，位置也对齐到屏幕像素
  function fit() {
    const dpr = devicePixelRatio || 1, g = $('game');
    const raw = Math.min(innerWidth / 960, innerHeight / 540) * dpr;
    const n = raw >= 1 ? Math.floor(raw * 2) / 2 : raw, k = n / dpr;
    const x = Math.round((innerWidth - 960 * k) / 2 * dpr) / dpr, y = Math.round((innerHeight - 540 * k) / 2 * dpr) / dpr;
    G.view = { x, y, k };
    g.style.zoom = k;
    g.style.left = x / k + 'px';
    g.style.top = y / k + 'px';
    G.Touch.layout();
  }

  // ================= 地表的每一帧：移动、摘果、崖台、镜头 =================
  function surfaceTick(dt) {
    const f = G.field, hero = G.hero;
    if (G.fade) { hero.update(dt, null, f.surfaceGeom(hero.y, hero.x)); return; }
    if (G.trans) {
      const tr = G.trans;
      tr.k += dt / 0.55;
      if (tr.k >= 1 && !tr.swapped) { tr.swapped = true; swapLevel(); }
      if (tr.k >= 2) G.trans = null;
      hero.update(dt, null, f.surfaceGeom(hero.y, hero.x));
      return;
    }
    const geo = f.surfaceGeom(hero.y, hero.x);
    hero.update(dt, hero.act ? null : keys, geo);
    plantWalkTick();
    keys.jump = false;
    if (st.phase !== 'select') return;
    // 走进左侧崖壁的开口：切到洞穴
    if (f.hasCave() && hero.x < 4 - G.CAVE.MOUTH + 3 && hero.onFloor()) { goRoom('cave'); return; }
    // 跳向右崖崖顶的洞口：人在空中、贴着崖面、按着右，脚在洞口底上下一段范围里，就扒住边翻上去（不然高度要卡得很准才跳得进去）
    const m = f.mouth();
    if (m && !hero.onGround && !hero.climb && keys.right && hero.x >= WORLD_W - 4.5 && hero.y > m.top + 6 && hero.y < m.y + 8) {
      hero.x = WORLD_W + 1; hero.y = m.y; hero.vy = 0;
    }
    // 站在右崖崖顶上往洞口深处走：切到营地岩洞
    if (m && hero.onGround && hero.plat && hero.plat.kind === 'cliff' && hero.x > m.x1 - G.MOUTH_IN) { goRoom('east'); return; }
    // 摘果子：碰到就摘
    const [hx, hy] = hero.center();
    for (const fr of geo.fruits) {
      if (Math.abs(fr.x - hx) < 8 && Math.abs(fr.y - hy) < 13 && f.pickFruit(fr)) {
        gainMat(fr.f.id, fr.x, fr.y);
        G.sfx('fruit');
        G.saveSoon();
        UI.fruitPicked(fr.f.id);
      }
    }
    // 铲除中：根部翻起尘土
    if (hero.act && hero.act.kind === 'uproot' && Math.random() < dt * 12) f.dirt(hero.act.plant.col * TILE + TILE / 2 + (Math.random() - 0.5) * 6, 0, 2, 30);
    // 地上的果子（铲除植物时掉下的、熟透落下的）：走过就捡
    for (const d of f.world.drops.slice()) {
      if (Math.abs(d.x - hx) < 7 && hy > -16 && f.pickDrop(d)) {
        gainMat(d.id, d.x, -6);
        G.sfx('fruit');
        G.saveSoon();
        UI.fruitPicked(d.id);
      }
    }
    // 捡鸟儿捎来的信、包裹
    for (const m of f.world.mail.slice()) if (Math.abs(m.x - hx) < 8 && hy > -16 && f.pickMail(m)) G.Mail.receive(m.id);
    // 第一次站上崖台：固定绳梯
    // 捡鸟儿留下的种子：走过就捡
    for (const s of f.world.seeds.slice()) {
      if (Math.abs(s.x - hx) < 7 && hy > -16 && f.pickGroundSeed(s)) {
        const had = G.seedCount(st.pickSp) > 0;
        st.seeds[s.sp] = (st.seeds[s.sp] || 0) + 1;
        if (!had) { st.pickSp = s.sp; f.pickSp = s.sp; }
        G.sfx('fruit');
        G.saveSoon();
        UI.renderSelect();
        UI.seedPicked(s.sp);
        UI.say(`捡到一颗<b>${G.TREES[s.sp].name}</b>种子。`, 2);
      }
    }
    const lp = f.lip();
    if (lp && hero.onGround && hero.plat && hero.plat.kind === 'lip' && !f.world.ladder) {
      f.world.ladder = true;
      f.addFx('ring', hero.x, hero.y - 6, { col: '#fee761', r1: 30, dur: 0.6 });
      f.addFx('stars', hero.x, hero.y - 6, { col: '#fee761', n: 10 });
      G.sfx('end');
      UI.say(`爬上崖台了！我在这里固定了一条<b>绳梯</b>，以后随时能上下。走到崖壁边按 <b>W</b> 继续往上爬，去<b>${G.LEVELS[f.lv + 1].name}</b>！`, 7);
      G.save('select');
    }
    // 选中小禾所在的地块；植物种在地块中间那一列（还没捡到种子时不显示地块光标）
    f.pickPlot = G.gotKit('seed') ? f.plotOf(Math.floor(hero.x / TILE)) : -1;
    f.pickCol = f.plotMid(f.pickPlot);
    // 镜头：跟着小禾，并朝她面对的方向多看一点
    lookX += (hero.face * 18 - lookX) * Math.min(1, dt * 2);
    f.selCamX = clamp(hero.x - W / 2 + lookX, -40, WORLD_W - W + 40);
    f.selCamY = camYFor(hero.y);
  }

  // 摘到一份材料：进材料袋
  function gainMat(id) { st.materials[id] = (st.materials[id] || 0) + 1; }

  // 营地岩洞的每一帧：只有走、跳；往左走出洞口回到坑底右崖崖顶的洞口里
  function eastTick(dt) {
    const hero = G.hero;
    hero.update(dt, G.fade || hero.act ? null : keys, G.East.geo());
    keys.jump = false;
    if (!G.fade && G.East.atExit(hero)) goRoom('pit');
  }

  // 洞里的每一帧：只有走、跳；走出洞口回到坑底，点过锅就走到锅边开始炼药
  function caveTick(dt) {
    const hero = G.hero, cave = G.Cave;
    hero.update(dt, G.fade || hero.act ? null : keys, cave.geo());
    keys.jump = false;
    if (G.fade) return;
    if (keys.left || keys.right) potAfterWalk = false;
    for (const k of st.kit.slice()) if (hero.onGround && Math.abs(hero.x - k.x) < 6) pickKit(k);
    if (potAfterWalk && hero.target === null) { potAfterWalk = false; if (cave.nearPot(hero)) { G.enterAlchemy(); return; } }
    if (cave.atExit(hero)) goRoom('pit');
  }

  let last = performance.now(), clock = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.Touch.tick();
    if (G.Touch.portrait) { requestAnimationFrame(loop); return; } // 手机竖着：整个游戏停住，等横过来
    clock += dt;
    const f = G.field, hero = G.hero;
    if (saveT > 0 && (saveT -= dt) <= 0) G.save(st.phase === 'alchemy' ? 'alchemy' : 'select');
    fadeTick(dt);
    if (st.room === 'cave' && (st.phase === 'select' || st.phase === 'alchemy')) {
      // 洞穴：坑里的世界照常走（鸟、特效），只是不画
      if (st.phase === 'select') { caveTick(dt); f.update(dt); }
      else hero.update(dt, null, null);
      G.Cave.update(dt, hero, st.phase === 'alchemy');
      f.setSub(0, 0); // 洞穴、营地岩洞镜头不动，画布不用平移
      G.Cave.render(f.ctx, dt, clock, hero);
      if (st.phase === 'alchemy') G.WS.tick(dt);
      if (st.phase === 'select') { dozeTick(dt); drawDoze(f.ctx, G.Cave, hero); UI.renderSurfTick(f, hero, context()); }
    } else if (st.room === 'east' && st.phase === 'select') {
      // 营地岩洞：和洞穴一样，坑里的世界照常走，只是不画
      eastTick(dt); f.update(dt);
      G.East.update(dt);
      f.setSub(0, 0);
      G.East.render(f.ctx, dt, clock, hero);
      dozeTick(dt); drawDoze(f.ctx, G.East, hero); UI.renderSurfTick(f, hero, context());
    } else {
      G.pourTick(dt);
      if (st.phase === 'select') surfaceTick(dt);
      else if (st.phase === 'intro') introTick(dt);
      else hero.update(dt, null, null);
      f.update(dt);
      f.render();
      if (st.phase === 'plant') UI.renderHUD(f);
      if (st.phase === 'select') { dozeTick(dt); drawDoze(f.ctx, f, hero); UI.renderSurfTick(f, hero, context()); }
    }
    const fa = fadeAlpha();
    if (fa > 0) { const c = f.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = `rgba(12,8,12,${Math.min(1, fa)})`; c.fillRect(0, 0, f.cv.width, f.cv.height); }
    UI.idleSay(dt);
    G.Notes.tick(dt);
    G.Tut.tick();
    G.Music.tick(dt);
    requestAnimationFrame(loop);
  }

  function init() {
    if (TEST && TEST.design) { G.STRATA = { ...G.STRATA, [TEST.id]: TEST.design }; G.mapMode = 'design'; } // 试验场总是用编辑器里的地图
    G.field = new G.Field($('view'));
    G.hero = new G.Hero();
    UI.setPhase('title');
    UI.renderShelf();
    G.field.enterSelect();
    snapCamera();
    if (TEST) testInit();
    else G.titleScene();
    bindInput();
    fit();
    addEventListener('resize', fit);
    requestAnimationFrame(loop);
  }
  // 等像素字体加载好再开始，避免界面先用系统字体闪一下
  (document.fonts && document.fonts.load ? document.fonts.load('12px FusionPixel', '种树炼金吃果果') : Promise.resolve()).catch(() => {}).then(init);
})();
