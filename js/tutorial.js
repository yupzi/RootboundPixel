// 新手教程：跟着流程一条条弹出的小提示框（屏幕上方正中，不挡操作，满足条件自己消失）
// 走动（开场站起来）→ 进洞消失；种植（出洞回到坑底）→ 种下消失；倒药（种下）→ 这一局结束消失；
// 睡觉（两颗初始种子都种完）→ 睡醒消失；炼药（第一次有一瓶药用完）→ 炼出第一瓶消失。每条只出现一次，进度记在存档的 st.tut
// 一次只显示一条：正在显示的那条没完成就一直是它，完成了再按顺序挑下一条
(function () {
  const $ = id => document.getElementById(id);
  const S = () => G.state;
  const k = s => `<kbd>${s}</kbd>`;
  const seedsLeft = () => G.TREE_ORDER.reduce((n, sp) => n + G.seedCount(sp), 0);

  // when：现在该不该显示；done：完成了没有；text(touch)：[标题, 正文]
  const STEPS = [
    {
      id: 'walk',
      when: st => st.phase === 'select' && st.room === 'pit',
      done: st => st.room === 'cave',
      text: t => ['走动', t ? '用十字键左右走，按「跳」跳起来。' : `${k('A')} ${k('D')} 左右走，${k('空格')} 跳。`],
    },
    {
      id: 'plant',
      when: st => st.tut.done.walk && st.phase === 'select' && st.room === 'pit' && seedsLeft() > 0,
      done: st => st.phase === 'plant',
      text: t => ['种植', t ? '站在沙地上点击，打开选种页面，点击种子后种下。' : `站在沙地上按 ${k('F')} 拿出种子，再按 ${k('F')} 种下。`],
    },
    {
      id: 'pour',
      when: st => st.tut.done.plant && st.phase === 'plant',
      done: st => st.phase !== 'plant',
      text: t => ['倒药', (t ? '根正往地下长。<b>按住</b>左上角的药瓶，把药倒进土里，松手就停。' : `根正往地下长。<b>按住</b> ${k('1')}–${k('6')} 把架子上的药倒进土里，松手就停。`)
        + '<br>药会改变根的长法，根碰到的养分越多，树就长得越高。'],
    },
    {
      id: 'sleep',
      when: st => st.tut.done.pour && st.phase === 'select' && st.room !== 'east' && seedsLeft() === 0,
      done: st => st.tut.sleepDay > 0 && st.day > st.tut.sleepDay,
      shown: st => { st.tut.sleepDay = st.day; }, // 从这一天起算，睡过一觉（日子往后走了）就算学会
      text: t => ['睡觉', (t ? '种子用完了。按十字键 ↓ 坐下，再<b>长按</b>「睡觉」键。' : `种子用完了。按 ${k('S')} 坐下，再<b>长按</b> ${k('F')} 睡一觉。`)
        + '<br>清晨，鸟儿会在沙地上留下新的种子。'],
    },
    {
      id: 'alc',
      when: st => st.tut.potOut && (st.phase === 'select' || st.phase === 'alchemy'),
      done: st => st.tut.brewed,
      text: (t, st) => ['炼药', st.phase === 'alchemy'
        ? (t ? '点左边的材料丢进锅里，再<b>按住</b>下面的「出瓶」键炼出新药。' : `点左边的材料丢进锅里，再<b>按住</b> ${k('空格')} 炼出新药。`)
        : (t ? '有一瓶药用完了。回洞里，点一下炼药锅。' : `有一瓶药用完了。回洞里，走到炼药锅前按 ${k('W')}。`)],
    },
  ];

  let cur = null, sig = '';
  G.Tut = {
    fresh: () => ({ done: {}, potOut: false, brewed: false, sleepDay: 0 }),
    potionEmpty() { const t = S().tut; if (t) t.potOut = true; },
    brewed() { const t = S().tut; if (t && t.potOut) t.brewed = true; },
    tick() {
      const st = S(), box = $('tutTip');
      if (!st.tut) { if (cur) { cur = null; box.classList.remove('show'); } return; }
      if (cur && cur.done(st)) { st.tut.done[cur.id] = true; cur = null; G.saveSoon(); }
      if (!cur || !cur.when(st)) {
        const was = cur;
        cur = STEPS.find(s => !st.tut.done[s.id] && s.when(st)) || null;
        if (cur && cur !== was && cur.shown) cur.shown(st);
      }
      const vis = !!cur && !G.fade && !G.Notes.isOpen() && !G.UI.bagOpen() && !G.Camp.isOpen();
      box.classList.toggle('show', vis);
      if (!cur) return;
      const touch = G.Touch.on, s = [cur.id, touch, st.phase].join('|');
      if (s === sig) return;
      sig = s;
      const [title, body] = cur.text(touch, st);
      box.className = 'px-flat' + (vis ? ' show' : '');
      box.innerHTML = `<div class="tt-h">${title}</div><div class="tt-b">${body}</div>`;
    },
  };
})();
