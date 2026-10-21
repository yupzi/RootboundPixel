// 炼金规则引擎：只有通用规则，没有任何配方表。
// 一瓶药剂 = 一串「效果指令」 { action, trigger: 'now'|'hit', delay, power, toBranch }
// 材料按投进锅里的顺序处理：
//   基础材料 → 追加一条新指令（药效档次 power = 材料的 pot），并成为「当前指令」
//   榆钱     → 复制当前指令（延迟 +1.5s）追加，复制品成为新的当前指令
//   棘刺     → 当前指令改为遇障触发
//   杨絮     → 当前指令的药效提高一档（最高 3 档）
// 每条指令都只作用于主根；分枝长出的分支是自主的，不受药剂影响
// 一瓶里有分枝时，同瓶的避障 / 寻宝不给主根，而是让这瓶长出的分支终身带着（toBranch）
// 药剂类型同样由通用规则决定：所有指令都能持续生效（且没有遇障触发）→ 毫升药剂，按住倒入；否则整瓶为一次性药剂
// 种子：第一份材料是芽苞时，这一锅炼出种子。后面的材料「喂养」芽苞：
//   喂养材料按顺序正好是某种植物的 brew（配方，如沙棘：刺糖 → 右旋花）时，结出它
//   否则按保底规则：等级 = 喂养材料的分量之和（基础材料 = 它的药效档次，反应材料 2，最高 3）
//     品种 = 该等级中没有配方、老家已经到过、结果材料与喂养材料最契合的植物；到过的植物里没有这一级就往下降
//   配方从信件、地下的手札残页里学到（learnSeed：直接记进图鉴）
// 图鉴：按效果记录炼出过的每一种药剂（不同排列殊途同归时算同一种，另记一种配方）
(function () {
  const { MATERIALS, ACTIONS, CFG } = G;
  const S = () => G.state;
  const feedOf = m => m.kind === 'base' ? (m.pot || 1) : m.kind === 'reaction' ? 2 : 0;
  const POT = ['', '', '·浓', '·极'];
  const POT_PREFIX = ['', '', '浓', '极'];
  const actOf = i => ACTIONS[i.action];
  const BRANCH_KIT = new Set(['avoid', 'seek']); // 和分枝同瓶时交给分支终身带着的效果

  // steps[i]：第 i 份材料做了什么 { ok, text, act }（act：这一步影响的效果，用来上色）
  function brew(materialIds) {
    const ids = materialIds.filter(Boolean);
    if (ids.length && MATERIALS[ids[0]].kind === 'bud') return brewSeed(ids);
    const instructions = [], steps = [];
    let cur = null;
    for (const id of ids) {
      const m = MATERIALS[id];
      if (m.kind === 'bud') { steps.push({ ok: false, text: '芽苞要放第一格' }); continue; }
      if (m.kind === 'base') {
        cur = { action: m.action, trigger: 'now', delay: 0, power: m.pot || 1 };
        instructions.push(cur);
        steps.push({ ok: true, act: m.action, text: `生成【${ACTIONS[m.action].short}】${cur.power > 1 ? POT[cur.power] : ''}` });
        continue;
      }
      if (!cur) { steps.push({ ok: false, text: '前面没有效果，挥发了' }); continue; }
      const nm = `【${actOf(cur).short}】`;
      if (m.op === 'echo') {
        const copy = { ...cur, delay: round1(cur.delay + CFG.ECHO_DELAY) };
        instructions.push(copy);
        cur = copy;
        steps.push({ ok: true, act: cur.action, text: `复制${nm} +${CFG.ECHO_DELAY}秒` });
      } else if (m.op === 'hit') {
        if (cur.trigger === 'hit') { steps.push({ ok: false, text: '已是遇障触发' }); continue; }
        cur.trigger = 'hit';
        steps.push({ ok: true, act: cur.action, text: `${nm}改为遇障触发` });
      } else if (m.op === 'amp') {
        if (cur.power >= 3) { steps.push({ ok: false, text: '药效已是最高档' }); continue; }
        cur.power++;
        steps.push({ ok: true, act: cur.action, text: `${nm}药效升到${POT[cur.power].slice(1)}` });
      }
    }
    if (instructions.some(i => i.action === 'branch')) for (const i of instructions) if (BRANCH_KIT.has(i.action)) i.toBranch = true;
    return { instructions, steps, key: keyOf(instructions), name: nameOf(instructions), mode: modeOf(instructions) };
  }

  function brewSeed(ids) {
    const steps = [{ ok: true, text: '芽苞：这一锅结种子' }], feed = [];
    for (const id of ids.slice(1)) {
      const m = MATERIALS[id];
      if (m.kind === 'bud') { steps.push({ ok: false, text: '芽苞不能喂养芽苞' }); continue; }
      feed.push(id);
      steps.push({ ok: true, text: `喂养 +${feedOf(m)} 级` });
    }
    const reach = sp => G.TREES[sp].home <= S().maxLevel; // 老家那层到过了才认得这种植物
    // 有配方的植物：喂养的材料正好是它的 brew 那一串
    const exact = G.TREE_ORDER.find(sp => { const b = G.TREES[sp].brew; return b && reach(sp) && b.length === feed.length && b.every((id, i) => id === feed[i]); });
    if (exact) return { seed: exact, tier: G.TREES[exact].tier, capped: false, steps, instructions: [], key: 'seed:' + exact, name: G.TREES[exact].name + '种子', mode: 'seed' };
    let tier = Math.min(3, feed.reduce((n, id) => n + feedOf(MATERIALS[id]), 0)), species = null;
    const want = tier;
    for (; tier > 0 && !species; tier--) {
      let best = -1;
      for (const sp of G.TREE_ORDER) {
        const tr = G.TREES[sp];
        if (tr.brew || tr.tier !== tier || !reach(sp)) continue;
        const total = Object.values(tr.yields).reduce((a, b) => a + b, 0);
        const fit = feed.reduce((n, id) => n + (tr.yields[id] || 0), 0) / total;
        if (fit > best) { best = fit; species = sp; }
      }
      if (species) break;
    }
    if (!species) tier = 0;
    return { seed: species, tier, capped: tier < want, steps, instructions: [], key: species ? 'seed:' + species : '', name: species ? G.TREES[species].name + '种子' : '', mode: 'seed' };
  }

  function modeOf(ins) {
    return ins.length && ins.every(i => ACTIONS[i.action].pour && i.trigger !== 'hit') ? 'pour' : 'shot';
  }
  function round1(v) { return Math.round(v * 10) / 10; }
  // 效果完全相同的药剂视为同一种（不同排列可能殊途同归）
  function keyOf(ins) {
    return ins.map(i => `${i.action}|${i.trigger}|${i.delay}|${i.power || 1}${i.toBranch ? '|b' : ''}`).join(';');
  }
  function insName(i) {
    let p = '';
    if (i.delay > 0) p += i.delay === CFG.ECHO_DELAY ? '回响' : `${Math.round(i.delay / CFG.ECHO_DELAY)}重回响`;
    if (i.trigger === 'hit') p += '触障';
    return p + POT_PREFIX[i.power || 1] + actOf(i).short;
  }
  function nameOf(ins) {
    if (!ins.length) return '';
    if (ins.length === 1) return insName(ins[0]) + '剂';
    return ins.map(insName).join('·') + '合剂';
  }
  function describe(i, mode) {
    // 药剂只作用于主根（分支是自主的）；和分枝同瓶的避障 / 寻宝交给分支终身带着
    const who = G.GROUP_ACTS.has(i.action) ? '' : '主根';
    const A = actOf(i), p = i.power || 1;
    if (i.toBranch) return `新分支终身${A.pourText(p)}`;
    if (mode === 'pour') return i.delay > 0 ? `倒入 ${i.delay} 秒后重放：${who}${A.pourText(p)}` : `倒入时：${who}${A.pourText(p)}`;
    const when = i.delay > 0 ? `${i.delay}秒后` : '立即';
    if (i.trigger === 'hit') return `${when}挂载于主根：遇障碍时${A.shotText(p)}`;
    return `${when}：${who}${A.shotText(p)}`;
  }

  // ================= 图鉴 =================
  // st.codex：[{ key, recipes: [[材料…], …] }]，按发现顺序
  const entry = key => S().codex.find(e => e.key === key);
  const sameRecipe = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // 记一笔：返回 'new' 新药剂 / 'alt' 已知药剂的新配方 / null
  function record(res, recipe) {
    const e = entry(res.key);
    if (!e) { S().codex.push({ key: res.key, recipes: [recipe] }); return 'new'; }
    if (e.recipes.some(r => sameRecipe(r, recipe))) return null;
    if (recipe.length < e.recipes[0].length) e.recipes.unshift(recipe); else e.recipes.push(recipe); // 最短的配方排第一，图鉴里显示它
    return 'alt';
  }
  // 学到一种种子的配方（信件、残页）：记进图鉴，标上 learned（亲手炼过才去掉）。返回是不是第一次知道
  function learnSeed(sp) {
    if (record({ key: 'seed:' + sp }, ['bud', ...G.TREES[sp].brew]) !== 'new') return false;
    entry('seed:' + sp).learned = true;
    return true;
  }
  // 材料要下锅炼成过一次才知道它做什么（芽苞的用法一开始就知道；只是读到的配方不算）
  const knownMat = id => MATERIALS[id].kind === 'bud' || S().codex.some(e => !e.learned && e.recipes.some(r => r.includes(id)));

  // ================= 库存 =================
  // 把一锅（材料列表）炼成 n 瓶，记进图鉴，放上药剂架。返回 { potion, res, found }
  function addPotion(recipe, n) {
    const st = S(), ids = recipe.filter(Boolean), res = brew(ids);
    if (res.seed) {
      st.seeds[res.seed] = (st.seeds[res.seed] || 0) + n;
      const found = record(res, ids);
      delete entry(res.key).learned;
      return { res, found, n };
    }
    if (!res.instructions.length) return null;
    let p = st.potions[res.key];
    if (!p) p = st.potions[res.key] = { key: res.key, name: res.name, instructions: res.instructions, mode: res.mode, count: 0, ml: 0 };
    if (p.mode === 'pour') p.ml += n * G.campVal('cylinder'); else p.count += n; // 量筒只影响新炼的
    if (!st.hotbar.includes(res.key)) { const free = st.hotbar.indexOf(null); if (free >= 0) st.hotbar[free] = res.key; }
    return { potion: p, res, found: record(res, ids), n };
  }

  G.Alchemy = { brew, describe, actOf, keyOf, nameOf, modeOf, entry, knownMat, learnSeed, addPotion };
  G.Alc = G.Alchemy;
})();
