// 植物学药剂笔记：坠崖后在洞穴里捡到的一本只写了开头的笔记。
// 前几页是原主人（同样掉进坑底的炼金师）留下的基础操作；植物、材料、药方、心得要靠玩家自己补全。
// st.notes：{ plants: {sp: 天}, mats: {id: 天}, tips: {id: 天}, recipes: {key: 天}, letters: {id: 天}、pages: {第几张: 天}（见 mail.js）, unread: [...] }
//   天 = 0 是原主人写的（棕墨水），≥1 是玩家第几天记下的（蓝墨水）
// 记录方式：每隔一小会儿把手上的种子 / 材料 / 图鉴和笔记对一遍（sync），没记过的就补上一页；心得由事件解锁（unlock）
(function () {
  const $ = id => document.getElementById(id);
  const S = () => G.state;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const { TREES, MATERIALS, ACTIONS, CFG } = G;

  // 只收坑底这一层的植物，以及它们会结出、或者在坑底地下能找到的材料
  const PLANTS = G.TREE_ORDER.filter(sp => TREES[sp].home === 0);
  const pitYield = new Set(PLANTS.flatMap(sp => Object.keys(TREES[sp].yields)));
  const MATS = G.MATERIAL_ORDER.filter(id => { const m = MATERIALS[id]; return pitYield.has(id) || ['ground', 'cave', 'terrain'].includes(m.source) || m.kind === 'bud'; });

  // ================= 心得：玩家自己的体会，由事件解锁 =================
  const TIPS = [
    { id: 'harvest', title: '根扎得越深，果子越多', hint: '等第一棵树长好的时候……',
      body: () => `<p>第一次收获。根系一路长，一路把<b>养分</b>攒回树里：根越长、扎得越深，攒得越多。每 ${CFG.NUT_PER_FRUIT} 养分结 1 个果子。</p><p>果子挂在树上，要自己爬上去摘（<kbd>W</kbd> 抓住树干）。摘不完的明天还在。</p>` },
    { id: 'rock', title: '别硬撞石头', hint: '根尖第一次撞上岩石时……',
      body: () => `<p>根尖撞上岩石，白白丢了 <b>${G.campVal('guard')} 秒</b>。看准了提前倒转向药绕开；地下的<b>铁根矿</b>能炼出破岩的药。</p>` },
    { id: 'sleep', title: '一夜之后', hint: '坐下来好好睡一觉……',
      body: () => '<p>睡了一觉。夜里老树有时会结出新果子（树越大、越高级，结得越多），要爬上去摘；挂了几天没摘的果子会熟透掉在树下。清晨有鸟儿从崖顶飞过，在沙地上留下几颗<b>先锋植物</b>的种子——每天都去捡。</p>' },
    { id: 'soil', title: '土会变好', hint: '有些植物种下以后，周围的土……',
      body: () => `<p>植物能改良周围的土：${G.SOIL_NAMES.map(n => `「${n}」`).join('→')}。越高级的植物越挑土：骆驼刺固沙，红柳做出沙壤，沙枣养出绿洲土，最后才种得下胡杨。</p><p>改土的植物结果不多。沙棘、白榆、银白杨一点土也不改，却结得多，还会照顾左边或右边的邻居——好地块该给谁，邻居怎么排，得想清楚。</p>` },
    { id: 'bud', title: '芽苞', hint: () => G.Mail.has('shovel') ? '铲掉一株植物试试？' : '也许需要一件趁手的工具……',
      body: () => '<p>按住 <kbd>X</kbd> 铲除植物，会掉下<b>芽苞</b>。芽苞放在锅的<b>第一格</b>，这一锅就结种子；后面放的材料「喂养」它，喂得越多，种子的等级越高。</p><p>随便乱喂只会长出红柳、沙枣、胡杨这样的改土植物；别的品种要照着<b>配方</b>喂，配方得去信里、地下找。</p>' },
    { id: 'deadRoot', title: '死根', hint: '铲掉的植物，根去哪了？',
      body: () => `<p>铲掉的植物，老根当场就枯成了<b>死根</b>，还是原来的样子，灰扑扑地盘在地下。新根钻过死根会变慢，也攒不到养分。</p><p>${G.Mail.received().some(l => l.id === 'cistanche') ? `寄生的<b>肉苁蓉</b>专吃死根：每吃一段，时限 +${CFG.EAT_DEAD_TIME} 秒。吃饱后把它铲掉，它的根会烂成<b>营养土</b>。` : '得找个法子把它们清掉……'}</p>` },
    { id: 'reaction', title: '反应材料', hint: '有的材料自己不生效……',
      body: () => '<p>有些材料自己不产生效果，而是<b>改造前面那个效果</b>：复制一遍、遇到障碍才触发、药效更强……所以投料的<b>顺序</b>最要紧。</p>' },
    { id: 'seed', title: '炼出了种子', hint: '锅里也能长出种子？',
      body: () => '<p>用芽苞炼出了种子！照着配方喂，才能炼出想要的植物。笔记的「植物」那一栏，还有好多空页。</p>' },
    { id: 'east', title: '营地岩洞', hint: '右边那道矮崖上面……',
      body: () => '<p>顺着树爬上了右边那道矮崖的崖顶。崖顶上面还压着一整块高高的岩壁，中间留着一道横着的缝，往里走到头是一个干燥的岩洞，洞顶有个小天窗漏下一束光。</p><p>有块平平的大石头能当<b>工作台</b>，旁边挖个坑就能沤<b>堆肥</b>：用不完的材料丢进去，攒够了堆肥，就能在这里搭点东西、做点工具。</p>' },
  ];
  const TIP = Object.fromEntries(TIPS.map(t => [t.id, t]));

  // ================= 状态 =================
  const N = () => S().notes;
  G.newNotes = () => ({ plants: { camelThorn: 0 }, mats: { leftFlower: 0, rightFlower: 0 }, tips: {}, recipes: {}, letters: {}, pages: {}, unread: [] });
  let queue = [], toastT = 0, syncT = 0;

  function record(kind, key, label) {
    const n = N();
    if (n[kind][key] !== undefined) return false;
    n[kind][key] = S().day;
    n.unread.push(kind);
    queue.push(label);
    G.saveSoon();
    renderBtn();
    if (open) render();
    return true;
  }
  const unlock = id => TIP[id] && record('tips', id, '心得 · ' + TIP[id].title);

  function sync() {
    const st = S(), f = G.field;
    for (const sp of PLANTS)
      if ((st.seeds[sp] || 0) > 0 || (f && f.world.plants.some(p => p.sp === sp))) record('plants', sp, '植物 · ' + TREES[sp].name);
    for (const id of MATS) if ((st.materials[id] || 0) > 0) record('mats', id, '材料 · ' + MATERIALS[id].name);
    for (const e of st.codex) if (N().recipes[e.key] === undefined) record('recipes', e.key, '药方 · ' + G.Alc.brew(e.recipes[0]).name);
    if ((st.materials.bud || 0) > 0) unlock('bud');
    if (st.codex.some(e => e.key.startsWith('seed:'))) unlock('seed');
    if (st.codex.some(e => e.recipes.some(r => r.some(id => MATERIALS[id].kind === 'reaction')))) unlock('reaction');
  }

  // ================= 右下角：按钮红点、新页小纸条 =================
  function renderBtn() { const d = $('btnNote').querySelector('.dot'); if (d) d.classList.toggle('hidden', !N().unread.length); }
  function tick(dt) {
    if (S().phase === 'title' || !G.gotKit('book')) return; // 还没捡到笔记：先不记
    if ((syncT -= dt) <= 0) { syncT = 0.4; sync(); }
    if ((toastT -= dt) <= 0 && queue.length) {
      const t = $('noteToast'), more = queue.length - 1;
      t.innerHTML = `<img src="assets/ui/icon_book.png?v=1018b"><div><div class="tt">笔记补全了一页${more > 0 ? `（还有 ${more} 页）` : ''}</div><div class="tn">${esc(queue.shift())}</div></div>`;
      t.classList.remove('hidden', 'show'); void t.offsetWidth; t.classList.add('show');
      G.sfx('collect');
      toastT = 1.4;
    }
  }

  // ================= 书页 =================
  const TABS = [
    { id: 'pre', name: '扉页', c: '#b55945' },
    { id: 'basic', name: '手记', c: '#a6b04f', lt: 1 },
    { id: 'plants', name: '植物', c: '#819447' },
    { id: 'mats', name: '材料', c: '#fdd179', lt: 1 },
    { id: 'recipes', name: '药方', c: '#405273' },
    { id: 'letters', name: '信件', c: '#e4a672', lt: 1 },
  ];
  const by = d => d ? `<div class="by">——坠崖第 ${d} 天记</div>` : '';
  const ownerBy = '<div class="by">——前人</div>';
  const blank = (t = '（这一页还空着）') => `<div class="blank">${t}</div>`;
  const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out.length ? out : [[]]; };

  // 收到种树大赛的信以后：记下坑底现在最高的树
  function contestRow() {
    if (N().letters.contest === undefined || !G.field) return '';
    const t = G.field.tallest();
    return `<div><span>最高的树</span><span>${t ? `${TREES[t.p.sp].name} ${t.m.toFixed(1)}` : '0'} / ${CFG.RESCUE_H} 米</span></div>`;
  }
  function stats() {
    const n = N(), k = o => Object.keys(o).length;
    const own = [k(n.plants), k(n.mats), k(n.tips)], all = [PLANTS.length, MATS.length, TIPS.length];
    const pct = Math.floor((own[0] + own[1] + own[2]) / (all[0] + all[1] + all[2]) * 100);
    return `<div class="bk-stats">
      <div><span>植物</span><span>${own[0]} / ${all[0]}</span></div>
      <div><span>材料</span><span>${own[1]} / ${all[1]}</span></div>
      <div><span>心得</span><span>${own[2]} / ${all[2]}</span></div>
      <div><span>药方</span><span>${k(n.recipes)} 种</span></div>
      ${contestRow()}
      <div class="tot"><span>笔记完成度</span><span>${pct}%</span></div></div>`;
  }

  // 原主人写下的基础操作：只写了个开头
  const BASICS = [
    `<h4>前言</h4><p>如果你读到这里，说明你也从崖顶掉下来了。不用担心，我在这里留了药剂和种子，种下一颗高树，就能爬出去啦。就当是一次难得的休假，来种树吧 ^3^</p>
     <p>这口锅能把植物的果实炼成<b>药剂</b>，药剂能引导植物的<b>根</b>。根扎得越深越长，树就长得越高。</p>
     <p>我把知道的都记下来了——可惜只来得及写个开头。剩下的，就交给你了。</p>${ownerBy}`,
    `<h4>一、种下去</h4><p><kbd>A</kbd><kbd>D</kbd> 走，<kbd>空格</kbd> 跳。往右走出洞口就是坑底的沙地，站到想种的地方按 <kbd>F</kbd>，手上有好几种种子就在左上角挑一种。站在结了果的树下按 <kbd>F</kbd> 能摇下一两颗果子，高处的也可以爬上去摘。脚下是什么土，左上角会写着；地上框子和种子底下的颜色是合不合适：绿色合适，黄色勉强，红色别种。</p>
     <h4>二、引导根</h4><p>种下后根自己往下长，时间有限。<b>按住</b>上方药剂架的格子（或数字键 <kbd>1</kbd>-<kbd>6</kbd>）把药倒进土里：<b>左旋剂</b>让根往左弯，<b>右旋剂</b>往右弯，松手就停。前面有岩石，就早点拐。</p>
     <p>不想等了，按 <kbd>H</kbd> 提前收获。</p>${ownerBy}`,
    `<h4>三、药剂有两种</h4><p><b>毫升药剂</b>：按住倒入，倒多少用多少。<b>一次性药剂</b>：按一下用掉一瓶。右键药剂架格子把药撤下，<kbd>B</kbd> 打开库存换上别的。</p>
     <h4>四、炼药锅</h4><p>洞里那口锅，走到锅边按 <kbd>W</kbd>。材料<b>按顺序</b>丢进锅里，最多三份，然后按住出瓶。顺序不同，炼出来的药也不同。</p>
     <p>骆驼刺结的<b>左旋花</b>、<b>右旋花</b>，各一份就能炼出左旋剂、右旋剂。</p>${ownerBy}`,
    `<h4>五、休息</h4><p>累了就在平地上按 <kbd>S</kbd> 坐下，长按 <kbd>F</kbd> 休息一下吧。</p>
     <h4>六、还没弄明白的</h4><p>锅里好像不只能炼药，似乎还能混合出新的种子。</p>`,
  ];

  function tipPages() {
    return chunk(TIPS, 2).map(two => two.map(t => {
      const d = N().tips[t.id];
      return d === undefined ? `<h4 class="lock">？？？</h4><p class="lock">${typeof t.hint === 'function' ? t.hint() : t.hint}</p>` : `<div class="pen"><h4>${t.title}</h4>${t.body()}${by(d)}</div>`;
    }).join('<div style="height:16px"></div>'));
  }

  function plantPage(sp) {
    const tr = TREES[sp], d = N().plants[sp];
    if (d === undefined) {
      const how = tr.parasite ? '寄生植物。听说它专吃死掉的老根。' : tr.tier === 0 ? '先锋植物。也许清晨的鸟儿会带来它的种子。' : tr.brew ? `${G.TIER_NAMES[tr.tier]}。能用芽苞炼出来，但得知道它的配方。` : `${G.TIER_NAMES[tr.tier]}。也许能用芽苞炼出来，要喂养到 ${tr.tier} 级。`;
      return `<div class="bk-plant"><div class="hd"><div class="ph q">？</div><div><div class="nm lock">？？？</div></div></div><p class="lock">还没见过这种植物。</p><p class="lock">${how}</p></div>`;
    }
    const fruits = Object.keys(tr.yields).map(id => N().mats[id] !== undefined
      ? `<span data-tip="mat:${id}"><img src="${G.iconURL(id)}">${MATERIALS[id].name}</span>` : '<span><i class="q">？</i></span>').join('');
    return `<div class="bk-plant${d ? ' pen' : ''}"><div class="hd"><div class="ph"><img src="${G.seedURL(sp)}"></div>
      <div><div class="nm">${tr.name}</div><span class="tier">${G.TIER_NAMES[tr.tier]}</span></div></div>
      <div><span class="k">喜欢的土：</span>「${G.SOIL_NAMES[tr.tier]}」以上</div>
      <div><span class="k">根：</span>${tr.traitText}${G.turnText(sp) ? '；' + G.turnText(sp) : ''}</div>
      ${G.effectText(sp).map(t => `<div><span class="k">种下后：</span>${t}</div>`).join('') || '<div><span class="k">种下后：</span>周围的土不会变好</div>'}
      <h4>果实</h4><div class="bk-fruits">${fruits || '不结果'}</div>
      ${d ? by(d) : ownerBy}</div>`;
  }

  function matHint(id) {
    const m = MATERIALS[id];
    if (m.kind === 'bud') return '铲掉的植物也许会掉下什么。';
    if (m.source === 'ground') return '地下的土层里也许埋着。';
    if (m.source === 'cave') return '地下的空洞里也许长着。';
    if (m.source === 'terrain') return `根系穿过${G.TERRAIN_NAMES[m.terrain]}以后，树上也许会结出。`;
    const who = PLANTS.filter(sp => TREES[sp].yields[id] && N().plants[sp] !== undefined).map(sp => TREES[sp].name);
    return who.length ? `${who.join('、')}的果实里也许有。` : '某种植物的果实。';
  }
  function matKind(m) { return m.kind === 'base' ? '基础 · ' + ACTIONS[m.action].short : m.kind === 'bud' ? '芽苞' : '反应材料'; }
  function matItem(id) {
    const m = MATERIALS[id], d = N().mats[id];
    if (d === undefined) return `<div class="bk-item lock"><div class="ic q">？</div><div class="bd"><span class="nm">？？？</span><div>${matHint(id)}</div></div></div>`;
    const known = G.Alc.knownMat(id);
    return `<div class="bk-item${d ? ' pen' : ''}" data-tip="mat:${id}"><div class="ic"><img src="${G.iconURL(id)}"></div><div class="bd"><span class="nm">${m.name}</span><span class="tg">${known ? matKind(m) : '？'}</span><div>${known ? m.desc : '还没下过锅，不知道它有什么用。炼一次就知道了。'}</div></div></div>`;
  }

  function recipeItem(e) {
    const res = G.Alc.brew(e.recipes[0]), d = N().recipes[e.key] || 0, r = e.recipes[0];
    const img = res.seed ? `<img src="${G.seedURL(res.seed)}">` : `<img src="${G.bottleURL(S().potions[e.key] || { key: e.key, instructions: res.instructions, mode: res.mode })}">`;
    const body = res.seed ? `${G.TIER_NAMES[res.tier]}的种子` : res.instructions.map(i => '▸ ' + G.Alc.describe(i, res.mode)).join('<br>');
    return `<div class="bk-item${d ? ' pen' : ''}"><div class="ic${res.seed ? '' : ' bt'}">${img}</div><div class="bd">
      <span class="nm">${esc(res.name)}</span><span class="rc">${r.map(id => `<img src="${G.iconURL(id)}" data-tip="mat:${id}">`).join('<span>→</span>')}</span>${e.recipes.length > 1 ? `<span class="tg">另有 ${e.recipes.length - 1} 种配方</span>` : ''}
      <div>${body}</div></div></div>`;
  }

  // 整本书：[{ tab, html }]，每个分栏从左页开始
  function build() {
    const pages = [], add = (tab, list) => {
      if (pages.length % 2) pages.push({ tab: pages[pages.length - 1].tab, html: blank('') });
      for (const html of list) pages.push({ tab, html });
    };
    add('pre', [
      `<div class="bk-title"><h3>植物学药剂笔记</h3>${stats()}</div>`,
      BASICS[0],
    ]);
    add('basic', [...BASICS.slice(1), ...tipPages()]);
    add('plants', PLANTS.map(plantPage));
    add('mats', chunk(MATS, 4).map(ids => ids.map(matItem).join('')));
    const recs = chunk(S().codex, 4).map(es => es.map(recipeItem).join('') + (es.length < 4 ? '<div class="more">还有好多组合没试过……</div>' : ''));
    add('recipes', recs);
    const letters = [...G.Mail.received().map(G.Mail.page), ...G.Pages.found().map(G.Pages.page)];
    add('letters', letters.length ? letters : [blank('还没有收到过信。')]);
    if (pages.length % 2) pages.push({ tab: 'letters', html: blank('') });
    return pages;
  }

  // ================= 打开 / 翻页 =================
  let open = false, spread = 0, pages = [];
  function render(dir = 0) {
    pages = build();
    const max = pages.length / 2 - 1;
    spread = Math.max(0, Math.min(max, spread));
    const L = pages[spread * 2], R = pages[spread * 2 + 1], tab = L.tab;
    const unread = N().unread;
    $('bkTabs').innerHTML = TABS.map(t => `<div class="bk-tab${t.lt ? ' lt' : ''}${t.id === tab ? ' on' : ''}" style="--c:${t.c}" data-t="${t.id}">${t.name}${unread.includes(t.id === 'basic' ? 'tips' : t.id) ? '<i class="dot"></i>' : ''}</div>`).join('');
    $('bkTabs').querySelectorAll('.bk-tab').forEach(el => { el.onclick = () => goTab(el.dataset.t); });
    for (const [side, pg, no] of [['l', L, spread * 2 + 1], ['r', R, spread * 2 + 2]]) {
      const el = $('bkPage' + side.toUpperCase());
      el.querySelector('.bk-pg').innerHTML = pg.html;
      el.querySelector('.bk-no').textContent = `- ${no} -`;
      if (dir) { el.style.setProperty('--fx', dir * 12 + 'px'); el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }
    }
    $('bkPrev').disabled = spread <= 0;
    $('bkNext').disabled = spread >= max;
    // 看过的分栏去掉红点
    const seen = new Set([L.tab, R.tab].map(t => t === 'basic' ? 'tips' : t));
    N().unread = unread.filter(k => !seen.has(k));
    renderBtn();
  }
  function flip(d) {
    const max = pages.length / 2 - 1, to = Math.max(0, Math.min(max, spread + d));
    if (to === spread) return;
    spread = to;
    G.sfx('click', 0.8);
    render(d);
  }
  // n：翻到这一栏的第几页（从 0 数）
  function goTab(id, n = 0) {
    const i = pages.findIndex(p => p.tab === id);
    if (i < 0) return;
    const to = Math.floor((i + n) / 2);
    G.sfx('click', 0.9);
    const d = Math.sign(to - spread);
    spread = to;
    render(d);
  }
  function show(tab, n) {
    if (open) { if (tab) goTab(tab, n); return; }
    sync();
    open = true;
    $('noteBook').classList.remove('hidden');
    G.hotbarUp && G.hotbarUp();
    G.sfx('click', 0.7);
    render();
    if (tab) goTab(tab, n);
  }
  function hide() {
    if (!open) return;
    open = false;
    $('noteBook').classList.add('hidden');
    $('tooltip').classList.add('hidden');
    G.sfx('click', 0.6);
    G.saveSoon();
  }

  function bind() {
    $('btnNote').onclick = () => (open ? hide() : show());
    $('bkPrev').onclick = () => flip(-1);
    $('bkNext').onclick = () => flip(1);
    $('bkClose').onclick = hide;
    $('noteBook').querySelector('.bk-dim').onclick = hide;
    $('noteBook').addEventListener('wheel', e => { e.preventDefault(); flip(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  }

  G.Notes = {
    PLANTS, MATS, TIPS,
    bind, tick, sync, unlock, show, hide, renderBtn,
    isOpen: () => open,
    // 书打开时接管键盘：翻页、切分栏、合上
    key(k, e) {
      if (k === 'Escape' || k === 'n' || k === 'Tab') { e.preventDefault(); hide(); }
      else if (k === 'a' || k === 'ArrowLeft' || k === 'q') flip(-1);
      else if (k === 'd' || k === 'ArrowRight' || k === 'e') flip(1);
      else if (k >= '1' && k <= String(TABS.length)) goTab(TABS[+k - 1].id);
      return true;
    },
  };
})();
