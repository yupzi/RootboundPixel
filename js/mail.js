// 鸟儿捎来的信：崖顶的「植物魔法之家」用信鸽给帕西瓦尔·菌伞先生送货，「绿拇指园艺报」给爱种树的梅布尔·苔衣奶奶送报，
// 鸟却总把东西丢进坑底。
// 有的信是包裹（gift：附带一样工具，捡到就能用；seeds：附带种子 { 品种: 数量 }），有的只是信。
// recipe：信里写着这种植物的种子配方，读到就记进图鉴
// 每天清晨最多来一封：按顺序，第一封还没收到、且 day 已到的那封。都是坑底这一层的鸟带来的
// greet / sign：信头的称呼、落款（默认「尊敬的 收件人：」「——寄件人」）
// 收到的信记在笔记里：st.notes.letters { id: 收到的天 }，翻笔记的「信件」一栏能重读
(function () {
  const S = () => G.state;

  const SHOP = '植物魔法之家', MAGIC = '月桂婆婆魔法杂货铺', MR = '帕西瓦尔·菌伞';
  const PAPER = '绿拇指园艺报', GRAN = '梅布尔·苔衣';
  const LETTERS = [
    { id: 'shovel', day: 4, gift: 'shovel', from: SHOP, to: `${MR} 先生`,
      body: [
        '您订购的「园林铲（豪华款）」已由信鸽送达，请查收。',
        `使用方法非常简单：只要站在要铲除的植物前，<b>按住 <kbd>X</kbd></b> 即可。本铲经「${MAGIC}」施法加持，即使是孩童，也能轻而易举地铲除一整棵大树！`,
        '期待您的使用反馈，以及尾款。',
      ],
      ps: '信鸽不收小费，但它会偷吃种子，请看好您的花圃。' },
    { id: 'cistanche', day: 5, seeds: { cistanche: 3 }, recipe: 'cistanche', from: SHOP, to: `${MR} 先生`,
      body: [
        '您订购的「肉苁蓉种子」三颗随信附上，请查收。',
        '园林铲铲掉的植物，老根不会自己烂掉，只会枯成<b>死根</b>，占着地下，别的根钻过去也会变慢。肉苁蓉是寄生植物，专吃死根：把它种在死根附近，它的根会一路把死根吃干净，吃饱了还会分出新根，自己去找别处的死根。',
        '它的命很短，只够长 <b>15 秒</b>；不过每吃掉一段死根，就能多撑 <b>0.5 秒</b>。吃饱以后记得把它也铲掉——它的根会烂成上好的<b>营养土</b>。',
      ],
      ps: '想自己炼的话：芽苞放进锅的第一格，后面只喂一块<b>铁根矿</b>，就能炼出肉苁蓉的种子。' },
    { id: 'paper1', day: 9, recipe: 'seaBuckthorn', from: PAPER, to: `订户 ${GRAN} 女士`, greet: `亲爱的订户 ${GRAN} 女士：`, sign: `《${PAPER}》编辑部`,
      body: [
        `感谢您订阅《${PAPER}》！随信奉上本周的第 17 期。`,
        '【芽苞专栏】<b>沙棘种子</b>：芽苞放进锅的第一格，先喂<b>刺糖</b>，再喂<b>右旋花</b>。顺序不能颠倒。',
        '沙棘不改土，却结得多，枝上的<b>棘刺</b>是上好的炼金材料；它还会让左边邻居的根长得更快。',
      ],
      ps: '读者须知：芽苞要是随便乱喂，只会长出最普通的改土植物。' },
    { id: 'paper2', day: 12, from: PAPER, to: `订户 ${GRAN} 女士`, greet: `亲爱的订户 ${GRAN} 女士：`, sign: `《${PAPER}》编辑部`,
      body: [
        `本周的《${PAPER}》第 18 期到了，请查收。`,
      ],
      ps: '下期预告：王国植物学会的全国种树大赛就要开幕了，详情请留意学会的来信！' },
    // 种树大赛：结局的目标。坑底有树长到 CFG.RESCUE_H 米，清晨就被量树魔法阵发现（main.js 的 rescue）
    { id: 'contest', day: 13, from: '王国植物学会', to: '全国的园丁们', greet: '致全国的园丁与植物爱好者：', sign: '王国植物学会 · 大赛组委会',
      body: [
        '本会谨定于即日起，举办「参天之树」全国种树大赛。',
        `规则只有一条：在<b>四个月</b>内，种出一棵高达 <b>${G.CFG.RESCUE_H} 米</b>的树。不限树种，不限地点。`,
        `本会的魔法师已在全国布下<b>量树魔法阵</b>，每天清晨为所有的树量一次身高。一旦有树长到 ${G.CFG.RESCUE_H} 米，组委会将<b>立刻赶往现场</b>，当场播报、颁奖！`,
      ],
      ps: '参赛不必报名。魔法阵会自己找到您的树。' },
    { id: 'dun1', day: 15, from: SHOP, to: `${MR} 先生`,
      body: [
        '园林铲送达已有十余日，想必您已亲身体验到月桂婆婆的神奇力量。',
        '温馨提醒：尾款共计 <b>三枚银橡果</b>，交给信鸽带回即可，它认得路。',
      ],
      ps: '近来信鸽送件偶有偏差。如有任何疑问，欢迎来信。' },
    { id: 'gran', day: 18, from: GRAN, to: PAPER, greet: `亲爱的《${PAPER}》编辑部：`, sign: `${GRAN}（有点担心）`,
      body: [
        '我是你们的老订户梅布尔，住在崖顶东边那间爬满常春藤的小屋。',
        '已经两个星期没收到报纸了。是信鸽迷了路，还是报社出了什么事？',
        '院子里那棵老榆树还等着我照报上的法子给它找个伴儿呢。要是报纸寄丢了，能不能麻烦你们再寄一份？邮费我可以多付一枚橡果。',
      ],
      ps: '要是我的地址写得不清楚：我家门口种着两棵沙棘，一左一右，很好认。' },
    { id: 'percival', day: 31, from: MR, to: SHOP, greet: `致 ${SHOP}：`, sign: `${MR}（非常生气）`,
      body: [
        '我订的园林铲到底什么时候到？！',
        '你们的信鸽每天早上都从我家花园上空飞过，一次也没停下来过。我已经用汤勺挖了快一个月的蒲公英了。',
      ] },
  ];
  const LETTER = Object.fromEntries(LETTERS.map(l => [l.id, l]));
  const got = () => S().notes.letters;

  // 收到的信，按收到的先后
  const received = () => LETTERS.filter(l => got()[l.id] !== undefined);
  // 手上有这样工具了吗（包裹里带来的）
  const has = tool => LETTERS.some(l => l.gift === tool && got()[l.id] !== undefined);
  // 是包裹（附带工具或种子）还是只是一封信
  const parcel = id => !!(LETTER[id].gift || LETTER[id].seeds);

  // 清晨：今天鸟会带来的信（最多一封；已经掉在地上还没捡的那封不重复送）
  function dawn(onGround) {
    const l = LETTERS.find(l => got()[l.id] === undefined);
    return l && l.day <= S().day && !onGround.some(m => m.id === l.id) ? [l.id] : [];
  }

  // 捡起地上的信：记进笔记，包裹里的工具到手，信里的配方记进图鉴，翻开笔记读信
  function receive(id) {
    const l = LETTER[id];
    got()[id] = S().day;
    S().notes.unread.push('letters');
    for (const sp in l.seeds || {}) S().seeds[sp] = (S().seeds[sp] || 0) + l.seeds[sp];
    if (l.recipe) G.Alc.learnSeed(l.recipe);
    G.UI.kitPicked(iconURL(id), parcel(id) ? '一个包裹' : '一封信');
    G.sfx('collect');
    G.save('select');
    setTimeout(() => G.Notes.show('letters', received().indexOf(l)), 600);
  }

  // ---- 像素图：包裹（牛皮纸 + 麻绳）/ 信封（火漆）。(x, y) 是底边中点 ----
  const INK = '#3e2731';
  function draw(c, id, x, y) {
    const box = parcel(id), r = (dx, dy, w, h, col) => { c.fillStyle = col; c.fillRect(x + dx, y + dy, w, h); };
    if (box) {
      r(-6, -10, 12, 10, INK);
      r(-5, -9, 10, 8, '#c28569'); r(-5, -9, 10, 1, '#e4a672');
      r(-1, -9, 2, 8, '#fee1b8'); r(-5, -6, 10, 1, '#fee1b8');      // 麻绳
      r(-2, -12, 1, 3, INK); r(1, -12, 1, 3, INK);                   // 蝴蝶结
    } else {
      r(-6, -8, 12, 8, INK);
      r(-5, -7, 10, 6, '#fee1b8');
      r(-4, -6, 1, 1, '#d3b48e'); r(-3, -5, 1, 1, '#d3b48e'); r(-2, -4, 1, 1, '#d3b48e');
      r(3, -6, 1, 1, '#d3b48e'); r(2, -5, 1, 1, '#d3b48e'); r(1, -4, 1, 1, '#d3b48e');
      r(-1, -4, 2, 2, '#b55945');                                     // 火漆
    }
  }
  const icons = {};
  function iconURL(id) {
    if (!icons[id]) {
      const cv = document.createElement('canvas'), k = 3;
      cv.width = cv.height = 14 * k;
      const c = cv.getContext('2d');
      c.scale(k, k);
      draw(c, id, 7, 12);
      icons[id] = cv.toDataURL();
    }
    return icons[id];
  }

  // 笔记「信件」一栏的一页
  function page(l) {
    const d = got()[l.id];
    return `<div class="bk-letter"><div class="lt-hd"><span>寄件人：${l.from}</span><span class="lt-stamp">信鸽<br>速递</span></div>
      <h4>${l.greet || `尊敬的 ${l.to}：`}</h4>${l.body.map(t => `<p>${t}</p>`).join('')}
      <div class="lt-sign">——${l.sign || l.from}</div>
      ${l.recipe ? recipeRow(l.recipe) : ''}
      ${l.ps ? `<p class="lt-ps">P.S. ${l.ps}</p>` : ''}
      <div class="by">坠崖第 ${d} 天，鸟儿捎来</div></div>`;
  }
  // 配方一行：芽苞 → 材料 → 材料
  const recipeRow = sp => `<div class="lt-rc">${['bud', ...G.TREES[sp].brew].map(id => `<span data-tip="mat:${id}"><img src="${G.iconURL(id)}">${G.MATERIALS[id].name}</span>`).join('<i>→</i>')}<i>＝</i><span><img src="${G.seedURL(sp)}">${G.TREES[sp].name}</span></div>`;

  G.Mail = { LETTERS, received, has, parcel, dawn, receive, draw, page };

  // ================= 手札残页 =================
  // 前人（同样掉进坑底的炼金师）从笔记里撕下来的几页，落在地下的空洞里，根尖碰到就捡到
  // 设计地图里的残页按从浅到深的顺序，依次是 PAGES 里的这几页；捡到的记在 st.notes.pages { 第几张: 天 }
  const PAGES = [
    { sp: 'seaBuckthorn', body: ['沙棘：芽苞后面先放<b>刺糖</b>，再放<b>右旋花</b>。骆驼刺结的东西就够了。', '它结的棘刺很好用，能让药碰到障碍才生效。'] },
    { sp: 'elm', body: ['白榆：芽苞后面先放<b>疾风果</b>，再放<b>棘刺</b>。', '棘刺要先种出沙棘才有。白榆结的榆钱，能把药效复制一遍。'] },
    { sp: 'whitePoplar', body: ['银白杨：芽苞后面先放<b>胡杨泪</b>，再放<b>榆钱</b>。', '要胡杨和白榆都结了果才凑得齐。我还没种成过，听说它结的杨絮能让药效更强。'] },
  ];
  const found = () => S().notes.pages;
  // 根尖捡到第 n 张残页：记进笔记，配方记进图鉴。返回它写的是哪种植物
  function find(n) {
    const pg = PAGES[Math.min(n, PAGES.length - 1)];
    if (found()[n] === undefined) {
      found()[n] = S().day;
      S().notes.unread.push('letters');
      G.Alc.learnSeed(pg.sp);
      G.saveSoon();
    }
    return pg.sp;
  }
  const foundPages = () => Object.keys(found()).map(Number).sort((a, b) => a - b);
  function pagePage(n) {
    const pg = PAGES[Math.min(n, PAGES.length - 1)];
    return `<div class="bk-letter bk-scrap"><h4>（一张撕下来的笔记）</h4>${pg.body.map(t => `<p>${t}</p>`).join('')}
      ${recipeRow(pg.sp)}<div class="by">坠崖第 ${found()[n]} 天，在地下的空洞里捡到</div></div>`;
  }

  G.Pages = { PAGES, find, found: foundPages, page: pagePage };
})();
