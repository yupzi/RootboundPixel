// 静态数据：数值配置、效果、材料
window.G = window.G || {};

G.CFG = {
  ROUND_TIME: 30,       // 每局秒数
  BASE_SPEED: 20,       // 根尖基础速度（像素/秒）
  SPEED_MULT: 2,        // 加速倍率
  SHOT_DUR: 3,          // 一次性药剂中加速 / 破障 / 防火的持续秒数
  BOTTLE_ML: 100,       // 毫升药剂每瓶的容量
  POUR_RATE: 40,        // 倒入速度（毫升/秒）
  TURN_RATE: 75,        // 倒入转向药剂时的弯曲速度（度/秒）
  TURN_TIER: [1.3, 1.1, 0.75, 0.65], // 各等级植物的转向灵活度：越大的树根越粗直、越难弯（乘在倒入转向和自动转向上，一次性 90° 不受影响）
  POUR_HOLD: 0.12,      // 停止倒入后持续效果的余韵（秒）
  ECHO_DELAY: 1.5,      // 榆钱（回响）的延迟
  ROCK_PENALTY: 3,      // 硬撞岩石扣除的秒数
  ROCK_STUN: 0.5,       // 撞石后停顿
  SLOW_MULT: 0.4,       // 缓行时的速度倍率
  AUTO_TURN: 2.4,       // 避障 / 寻宝自动转向的最大角速度（弧度/秒）
  BIRD_RARE: {}, // 鸟带来的每颗种子有这么大的概率换成这种植物（只在它的老家那层）
  // 养分：本局根系积攒的成绩，只增不减（盐碱除外），决定树长多大、结多少果
  NUT_PER_FRUIT: 30,    // 每 30 养分结 1 个果
  NUT_GROW: 1 / 15,     // 每像素根长积攒的养分（150 像素 = 1 个果）
  NUT_DEPTH: 10 / 64,   // 最深处每下探 1 像素额外积攒的养分（8 格 = 1 个果）
  NUT_MAT: 5,           // 采集矿物
  NUT_WATER: 10,        // 采集露水
  NUT_FULL: [600, 900, 1200, 1600], // 各等级的植物长到参天要积攒的养分（先锋 / 灌木 / 小乔木 / 大型乔木）
  NUT_CURVE: 0.7,       // 树的大小 = (养分 / NUT_FULL)^0.7：前面长得快，越往后越难
  RESCUE_H: 16,         // 种树大赛的目标（米，1 格 = 1 米）：收到大赛的信以后，清晨坑底有树到了这么高就被量树魔法阵发现 → 获救结局
  WATER_TIME: 1,        // 每格露水延长本局时限的秒数
  BRANCH_ANG: Math.PI / 6, // 分支朝主根偏这么多（左右交替）
  MAX_BRANCH: 3,        // 同时生长的分支最多几条（停下的不算）
  BREW_YIELD: 2,
  SLOTS: 3,             // 炼药锅的锅位：一锅最多放几份材料
  HOTBAR: 6,
  // ---- 沙漠绿洲 ----
  OLD_ROOT_SLOW: 0.5,   // 穿过老根时的速度倍率
  UPROOT_TIME: 1,       // 按住 X 铲除一株植物要多久（秒）
  HUMUS_NUT: 3,         // 根钻过一格营养土积攒的养分（铲掉的肉苁蓉，它的根第二天烂成营养土）
  // 铲掉的普通植物，老根当场枯成死根（保持原来的形状）：别的根钻过会减速，只有肉苁蓉能吃掉
  EAT_DEAD_TIME: 0.5,   // 肉苁蓉每吃掉一格死根，本局时限 +0.5 秒
  EAT_SIZE: 2,          // 肉苁蓉根尖吃掉以它为中心 N×N 格内的死根（2 = 2×2）
  EAT_BRANCH: 10,       // 肉苁蓉每吃掉这么多格死根，从当前根尖分出一条自己找死根的分支
  DEAD_SEEK: 6,         // 找死根的分支能嗅到多远的死根（格）
  SCRAP_CELLS: 3,       // 每晚清掉连在一起不超过这么多格的零碎死根（肉苁蓉漏掉的）
  PLOT_W: 3,            // 地表按地块划分：每块这么多列，一块只种一株

  ORE_PER_DAY: 3,       // 每天夜里地下重新长出的铁根矿
  BIRD_SEEDS: [2, 3],   // 每天清晨鸟儿在每一层留下的先锋种子数（最少~最多）
  START_SEEDS: 2,       // 开局自带的骆驼刺种子
  // ---- 种植环境：土壤等级不够的地块不能种；离开老家能种，只是越恶劣越难 ----
  HOME_H: 0.6,          // 离开植物的老家（所在层）每差一层，恶劣度 +0.6
  FRUIT_CAP: 3,         // 每个叶团最多挂这么多果实
  FRUIT_TRIES: 4,       // 老树每晚有几次结果的机会（每次概率 = 平均结果数 / 4）
  FRUIT_FALL: 3,        // 果子挂了这么多晚还没摘，就熟透掉在树下
  HARSH_SPEED: 0.6,     // 根速 = 1 / (1 + 0.6·恶劣度)
  HARSH_TIME: 0.28,     // 时限 = 原时限 × (1 − 0.28·恶劣度)，至少 MIN_TIME 秒
  MIN_TIME: 5,
  // ---- 地下 ----
  CAVE_SLOW: 0.65,      // 在空洞里悬空生长的速度倍率（并逐渐下垂）
  CLAY_SLOW: 0.55,      // 黏土层速度倍率
  SALT_DRAIN: 4,        // 盐碱层每秒吸走的养分
  CAVE_REGROW: 0.35,    // 空洞植株被采走后，每晚重新长出的概率
};

// 视口与地图几何（世界单位）。世界坐标：地表 y=0，向下为正
// 世界固定大小：COLS 列 × ROWS 行（格），超出即世界边缘
// 像素版：画面 480×270 像素，PX = 每世界单位的像素数，所以一格（TILE）= 16 像素。SEL_CAMY：地面行走时的镜头高度
G.GEO = { W: 240, H: 135, PX: 2, TILE: 8, CS: 16, SKY: 56, SEL_CAMY: -92, COLS: 48, ROWS: 1024 };
// 隐藏洞穴（坑底左侧崖壁里的小房间，世界单位）：W 洞穴宽（一屏）、POT 炼药锅的 x、
// MOUTH 小禾往崖壁里走多深就切进洞穴（洞口画在崖壁的美术里，cliff_art.js）
G.CAVE = { W: 240, POT: 108, MOUTH: 20 };

// 根尖方向用弧度表示（屏幕坐标，y 向下）：π/2 朝下。左转 = 角度增大（朝下时转向屏幕左侧）

// 药效档次 p（1~3）：材料自带，杨絮可以把前一个效果提高一档
const potK = p => 1 + 0.5 * (p - 1);
G.ACTIONS = {
  // pour：能否随倒入持续生效。只要药剂里有一条不能持续的效果（或被改成遇障触发），整瓶就是一次性药剂
  // ---- 前期：转向、缓行、破障 → 精打细算地绕开岩石 ----
  turnL:  { name: '左转', short: '左旋', color: '#e7609f', pour: true, pourText: p => `持续向左弯曲${p > 1 ? `（弯得更急 ×${potK(p)}）` : ''}`, shotText: () => '向左转 90°' },
  turnR:  { name: '右转', short: '右旋', color: '#4f93d8', pour: true, pourText: p => `持续向右弯曲${p > 1 ? `（弯得更急 ×${potK(p)}）` : ''}`, shotText: () => '向右转 90°' },
  slow:   { name: '缓行', short: '缓行', color: '#b9a37a', pour: true, pourText: p => `根长得很慢，同时倒入的转向弯得更急 ×${G.slowTurnOf(p)}`, shotText: p => `${G.durOf(p)} 秒内缓行，转向更灵活` },
  break:  { name: '破障', short: '破岩', color: '#a9b6c8', pour: true, pourText: () => '无损击碎岩石', shotText: p => `${G.durOf(p)} 秒内无损击碎岩石` },
  // ---- 中期：加速、分枝，以及应对地层的药 ----
  speed:  { name: '加速', short: '疾风', color: '#7cbf4e', pour: true, pourText: p => `生长速度 ×${G.speedOf(p)}`, shotText: p => `${G.durOf(p)} 秒内生长速度 ×${G.speedOf(p)}` },
  branch: { name: '分枝', short: '分枝', color: '#e6cf7e', pour: false, shotText: p => `主根旁分出${p > 1 ? ` ${p} 条` : '一条'}自主分支，朝主根偏 30° 笔直生长` },
  fire:   { name: '防火', short: '御火', color: '#e8823e', pour: true, pourText: () => '免疫熔岩', shotText: p => `${G.durOf(p)} 秒内免疫熔岩` },
  pierce: { name: '穿行', short: '穿行', color: '#6fae8e', pour: true, pourText: () => '无视老根、黏土与空洞的阻碍', shotText: p => `${G.durOf(p)} 秒内无视老根、黏土与空洞的阻碍` },
  // ---- 后期：让根自己长。部分植物天生带有同名特性（见 G.TREES[].traits） ----
  avoid:  { name: '避障', short: '探石', color: '#8796ad', pour: true, pourText: p => `自动绕开前方的岩石与熔岩${p > 1 ? '（看得更远）' : ''}`, shotText: p => `${G.durOf(p)} 秒内自动绕开岩石与熔岩` },
  seek:   { name: '寻宝', short: '寻踪', color: '#4fb79c', pour: true, pourText: p => `自动弯向 ${G.seekOf(p)} 格内的露水、矿物与洞穴植株`, shotText: p => `${G.durOf(p)} 秒内自动弯向附近的露水、矿物与洞穴植株` },
  stall:  { name: '缓时', short: '缓时', color: '#c9a64a', pour: true, pourText: p => `时限消耗 ×${G.stallOf(p)}`, shotText: p => `${G.durOf(p)} 秒内时限消耗 ×${G.stallOf(p)}` },
};
// 只结算一次的效果：分枝从主根长出，缓时作用于时限（其余效果都作用于主根，分支不受药剂影响）
G.GROUP_ACTS = new Set(['branch', 'stall']);
G.slowTurnOf = p => Math.round((1.6 + 0.4 * (p - 1)) * 10) / 10;
G.seekOf = p => 5 + 3 * p;                              // 寻宝的感知半径（格）
G.stallOf = p => [0.8, 0.7, 0.65][p - 1];                // 缓时：时限流逝的倍率
G.speedOf = p => Math.round((G.CFG.SPEED_MULT + 0.5 * (p - 1)) * 10) / 10;
G.durOf = p => G.CFG.SHOT_DUR * potK(p);
G.potK = potK;

// kind：base 基础材料（产生效果，pot = 药效档次）/ reaction 反应材料 / bud 芽苞
// source：ground 地下矿物，cave 空洞里长的植株，terrain 根系经过某种地层后树才会结出，其余由树结出（见 G.TREES[].yields）
// 前期（先锋植物）：转向、缓行、破障。中期（灌木、小乔木、浅层空洞）：加速、分枝、回响
// 后期（大乔木、特殊地层）：避障、寻宝，让根自己长，去找特定地层
G.MATERIALS = {
  leftFlower:  { name: '左旋花', kind: 'base', pot: 1, action: 'turnL',  desc: '倒入时根尖持续向左弯曲' },
  rightFlower: { name: '右旋花', kind: 'base', pot: 1, action: 'turnR',  desc: '倒入时根尖持续向右弯曲' },
  thornSugar:  { name: '刺糖', kind: 'base', pot: 1, action: 'slow',   desc: '骆驼刺枝上凝出的糖粒，黏糊糊的。倒入时根长得很慢；和转向药同时倒能拐出急弯，从石缝里钻过去' },
  ironOre:     { name: '铁根矿', kind: 'base', pot: 1, source: 'ground', action: 'break',  desc: '倒入时无损击碎岩石。地下每天只长出几块，省着用' },
  windFruit:   { name: '疾风果', kind: 'base', pot: 1, action: 'speed',  desc: '倒入时生长速度 ×2' },
  ashMoss:     { name: '灰烬苔', kind: 'base', pot: 1, source: 'cave', action: 'fire',   desc: '倒入时免疫熔岩。空洞里也能找到' },
  fern:        { name: '羊齿蕨', kind: 'base', pot: 1, source: 'cave', action: 'pierce', desc: '倒入时无视老根、黏土的减速，在空洞里也不会下垂。长在空洞里' },
  tamariskSprout: { name: '红柳根芽', kind: 'base', pot: 1, action: 'branch', desc: '主根旁分出一条自主分支，朝主根偏 30° 的方向笔直生长，撞到障碍就停下。同一瓶里的绕石须、沙枣花会让这条分支终身避障、寻宝。一次性效果，会让整瓶变成一次性药剂。红柳的特产' },
  oleasterBloom: { name: '沙枣花', kind: 'base', pot: 2, action: 'seek', desc: '花香引着根尖自动弯向附近的露水、矿物与洞穴植株。沙枣的特产' },
  stoneWhisker: { name: '绕石须', kind: 'base', pot: 1, action: 'avoid', desc: '沙枣根上的细须，碰到石头就自己绕开。倒入时根尖自动绕开岩石与熔岩。沙枣的特产' },
  poplarTear:  { name: '胡杨泪', kind: 'base', pot: 1, action: 'stall', desc: '倒入时时限流逝变慢。胡杨的特产' },
  elmCoin:     { name: '榆钱', kind: 'reaction', op: 'echo', desc: '一串长得一模一样的翅果：复制前一个效果，1.5 秒后再次触发（毫升药剂会把倒入过程延迟重放一遍）。白榆的特产' },
  thornSpike:  { name: '棘刺', kind: 'reaction', op: 'hit',  desc: '沙棘枝上的硬刺：前一个效果改为「遭遇障碍时」自动触发。整瓶变成一次性药剂。沙棘的特产' },
  poplarFluff: { name: '杨絮', kind: 'reaction', op: 'amp', desc: '前一个效果的药效提高一档（最高 3 档）。银白杨的特产' },
  bud:         { name: '芽苞', kind: 'bud', desc: '放在第一格：这一锅炼出种子而不是药剂。后面的材料决定种子的等级；照着配方喂才能结出特定的品种。铲除植物时掉落，植物越大掉得越多' },
};
// 地层结果：本局根系经过这些地层，收获时树会额外结出对应材料
G.TERRAIN_NAMES = { fire: '熔岩' };
G.TERRAIN_PER = { fire: 2 }; // 每经过这么多格多结 1 个（至少 1 个，最多 2 个）
G.TERRAIN_FRUIT = {};
for (const id in G.MATERIALS) if (G.MATERIALS[id].terrain) G.TERRAIN_FRUIT[G.MATERIALS[id].terrain] = id;
// 植物：等级（适合的土壤等级）、根系特性、结果材料权重。
// form：地面形态的绘制参数；trait：挖根时的特性；daily：老树每晚平均结几个果（再乘大小）；fruitMul：当天结果倍率
// 地块效果（at 都是相对所在地块的偏移：0 脚下，±1 两侧……），图样各不相同，要想好种在哪里
// reform：种下时改造这些地块的土。up 升几级，max 最多升到哪级土（先锋只能固沙，灌木做出沙壤，乔木才有绿洲土）
// buff：活着时照顾这些地块上的邻居（新种下的那一局，以及每晚的恶劣度）。可以叠加
//   speed 根速倍率 / time 本局时间 +秒 / food 开局养分 + / yield 结果倍率 / ease 恶劣度 −
// root：根的样子。col 颜色；A 粗细系数（某点粗细 = tip + A·√下游根长）；max 最粗；wig/wf 弯曲幅度/频率；hair 根毛密度；deco 附着物
// 先锋植物只结基础材料；越高级的植物结出越高档的特产
G.TIER_NAMES = ['先锋植物', '灌木', '小乔木', '大型乔木'];
G.SOIL_NAMES = ['流沙', '固定沙地', '沙壤', '绿洲土'];
G.SOIL_COLS = ['#e4a672', '#c9c06a', '#86b257', '#3e8948']; // 小地图、改土提示用的代表色
// form：树的形态。trunks 主干数、len / lenV 主干长度、spread 灌木主干张开角度、depth 分枝层数、leafR 叶团大小、leaf 叶色（暗→亮）
//   可选：up 枝条向上收拢的程度（默认 0.1）、bendK 枝条弯曲、lenK 子枝长度、spreadK 分枝张角、depthAdd 多分几层、leafAlong 枝条中段也长叶团
//   rK 叶团整体放大、ax / ay 叶团横向 / 纵向比例、trunkK 主干加粗、wK 所有枝条加粗。画法（颜色、纹理、果实造型）见 tree_art.js
// traits：常驻特性。deep 直根 / fix 根瘤 / long 耐旱 / tough 千年不倒
//   以及与后期药效同名的 avoid 避障 / seek 寻宝：天生就有（药效 1 档），喝了同类药剂时取更高的档
G.TREES = {
  // ---- 坑底：改土线（骆驼刺 → 红柳 → 沙枣 → 胡杨）一步步把流沙改成绿洲土，只结基础材料，结得少
  //      产出线（沙棘、白榆、银白杨）不改土，各结一种反应材料，结得多，还照顾一侧或两侧的邻居 ----
  camelThorn: {
    name: '骆驼刺', tier: 0, daily: 0.4, fruitMul: 0.7,
    reform: { at: [-1, 0, 1], up: 1, max: 1 },
    traits: ['deep'], traitText: '直根深扎：根尖朝下生长时速度 ×1.3',
    yields: { leftFlower: 3, rightFlower: 3, thornSugar: 2 },
    root: { col: '#d6aa6e', A: 0.16, max: 5, tip: 0.85, wig: 0.2, wf: 0.2, hair: 0.12 },
    form: { trunks: 6, len: 26, lenV: 10, spread: 1.1, depth: 0, leafR: 6, leaf: ['#3d5a2c', '#5f8a3e', '#86b257', '#b8d67c'], up: 0.2, depthAdd: 1, lenK: 0.8, spreadK: 1.2, wK: 0.75, rK: 1.55, ax: 1.35, ay: 0.85 },
  },
  // 肉苁蓉：寄生植物，专吃死根。本局只有 time 秒，每吃一格死根加时；不结果、不改土、鸟不会带来（parasite）
  // brew：种子配方。芽苞喂养的材料正好是这一串（按顺序）时，炼出它的种子；配方写在信件和地下的手札残页里
  cistanche: {
    name: '肉苁蓉', tier: 0, daily: 0, fruitMul: 0, time: 15, parasite: true, brew: ['ironOre'],
    traits: [], traitText: `寄生：本局只有 15 秒，根尖一口吃掉 ${G.CFG.EAT_SIZE}×${G.CFG.EAT_SIZE} 格死根，每吃一格时限 +${G.CFG.EAT_DEAD_TIME} 秒；每吃 ${G.CFG.EAT_BRANCH} 格分出一条自己找死根的分支`,
    yields: {},
    root: { col: '#e0b878', A: 0.15, max: 5, tip: 0.85, wig: 0.5, wf: 0.3, hair: 0.05, deco: 'node' },
    form: { trunks: 3, len: 14, lenV: 6, spread: 0.3, depth: 0, leafR: 5, leaf: ['#6a4a2a', '#a8763e', '#d8a85a', '#f4d890'] },
  },
  tamarisk: {
    name: '红柳', tier: 1, daily: 0.6, fruitMul: 0.8,
    reform: { at: [-2, -1, 0, 1, 2], up: 1, max: 2 },
    traits: [], traitText: '一条主根，没什么特别',
    yields: { windFruit: 3, tamariskSprout: 2 },
    root: { col: '#b96b4d', A: 0.18, max: 6, tip: 0.9, wig: 0.45, wf: 0.15, hair: 0.25, deco: 'node' },
    form: { trunks: 5, len: 44, lenV: 14, spread: 0.8, depth: 1, leafR: 9, leaf: ['#4b4a3a', '#7d8a5a', '#c47aa0', '#f0b6d0'], up: 0.32, bendK: 1.7, wK: 0.7, rK: 1.1 },
  },
  seaBuckthorn: {
    name: '沙棘', tier: 1, daily: 1.0, fruitMul: 1.1, brew: ['thornSugar', 'rightFlower'],
    buff: { at: [-1], speed: 1.2 },
    traits: ['fix'], traitText: '根瘤固氮：积攒的养分 +20%',
    yields: { thornSpike: 4, thornSugar: 1 },
    root: { col: '#c09058', A: 0.17, max: 6, tip: 0.9, wig: 0.4, wf: 0.2, hair: 0.3, deco: 'nodule' },
    form: { trunks: 4, len: 48, lenV: 14, spread: 0.7, depth: 1, leafR: 9, leaf: ['#3f4f3a', '#6b8460', '#9bb38a', '#f0a040'], up: 0.22, leafAlong: true, rK: 0.95, ax: 1.1 },
  },
  oleaster: {
    name: '沙枣', tier: 2, daily: 0.9, fruitMul: 0.9,
    reform: { at: [-1, 0, 1], up: 1, max: 3 },
    traits: ['long'], traitText: '耐旱：本局时间 +6 秒',
    yields: { oleasterBloom: 1, stoneWhisker: 1 },
    root: { col: '#93623e', A: 0.21, max: 7.5, tip: 1, wig: 0.55, wf: 0.12, hair: 0.2, deco: 'knot' },
    form: { trunks: 1, len: 80, lenV: 40, spread: 0.6, depth: 2, leafR: 13, leaf: ['#3e4e40', '#6f8a78', '#a3b8a4', '#d8e4c8'], up: 0.04, bendK: 2.4, lenK: 0.95, trunkK: 1.25, rK: 1.1 },
  },
  elm: {
    name: '白榆', tier: 2, daily: 1.2, fruitMul: 1.2, brew: ['windFruit', 'thornSpike'],
    buff: { at: [1], time: 4 },
    traits: [], traitText: '一条主根，没什么特别',
    yields: { elmCoin: 3, thornSpike: 1 },
    root: { col: '#8a6a48', A: 0.2, max: 7, tip: 1, wig: 0.7, wf: 0.18, hair: 0.45 },
    form: { trunks: 1, len: 74, lenV: 30, spread: 0.8, depth: 2, leafR: 12, leaf: ['#36502e', '#5f8a46', '#8fb862', '#d4e49a'], up: 0, spreadK: 1.25, rK: 1.35, ax: 1.15, ay: 0.85 },
  },
  populus: {
    name: '胡杨', tier: 3, daily: 1.6, fruitMul: 1.3,
    reform: { at: [-3, -2, -1, 0, 1, 2, 3], up: 1, max: 3 },
    traits: ['tough'], traitText: '千年不倒：撞岩石只扣 1 秒，本局时间 +8 秒',
    yields: { poplarTear: 1 },
    root: { col: '#a8733f', A: 0.26, max: 10, tip: 1.1, wig: 0.8, wf: 0.09, hair: 0.2 },
    form: { trunks: 1, len: 100, lenV: 60, spread: 0.7, depth: 3, leafR: 15, leaf: ['#4e4a24', '#8a8a34', '#c6b84a', '#f0dc78'], up: 0, bendK: 2, spreadK: 1.12, lenK: 0.85, trunkK: 1.7, rK: 1.15, ax: 1.3, ay: 0.6 },
  },
  whitePoplar: {
    name: '银白杨', tier: 3, daily: 1.6, fruitMul: 1.4, brew: ['poplarTear', 'elmCoin'],
    buff: { at: [-1, 1], yield: 1.25 },
    traits: [], traitText: '一条主根，没什么特别',
    yields: { poplarFluff: 3, elmCoin: 1 },
    root: { col: '#b08a66', A: 0.24, max: 9, tip: 1.05, wig: 0.3, wf: 0.1, hair: 0.15, deco: 'knot' },
    form: { trunks: 1, len: 112, lenV: 46, spread: 0.45, depth: 3, leafR: 12, leaf: ['#3e4c46', '#748a80', '#b0c2b8', '#e8f0ea'], up: 0.45, lenK: 1.05, rK: 1.05, ax: 0.85, ay: 1.5 },
  },
  // ---- 崖上各层的植物（home = 老家所在层；离开老家也能种，只是更吃力） ----
};

// 炼种子时同等契合的植物按这个顺序挑。有配方（brew）的植物只认配方，所以配错了在坑底只会长出红柳 / 沙枣 / 胡杨
G.TREE_ORDER = ['camelThorn', 'cistanche', 'tamarisk', 'seaBuckthorn', 'oleaster', 'elm', 'populus', 'whitePoplar'];
for (const sp in G.TREES) if (G.TREES[sp].home === undefined) G.TREES[sp].home = 0;
// 地块效果的文字：哪几块地 + 怎么变
const whereText = at => {
  const foot = at.includes(0), side = at.filter(d => d > 0), n = side.length, run = n && side.every((d, i) => d === i + 1);
  const left = at.filter(d => d < 0).map(d => -d);
  if (left.length !== n || !side.every(d => left.includes(d))) { // 只照顾一侧
    const one = (ds, nm) => !ds.length ? '' : ds.length === 1 && ds[0] === 1 ? `${nm}边紧挨的一块地` : `${nm}边的 ${ds.sort((a, b) => a - b).join('、')} 号地块`;
    return (foot ? '脚下和' : '') + [one(left, '左'), one(side, '右')].filter(Boolean).join('、');
  }
  return !n ? '脚下这块地'
    : (foot ? '脚下和' : '') + (run ? (n === 1 ? '两侧的地块' : `两侧各 ${n} 块地`) : n === 1 ? `隔 ${side[0] - 1} 块的两侧` : `两侧的 ${side.join('、')} 号地块`);
};
G.buffText = b => [
  b.speed > 1 && `根速 ×${b.speed}`, b.time && `时间 +${b.time} 秒`, b.food && `开局养分 +${b.food}`,
  b.yield > 1 && `结果 ×${b.yield}`, b.ease && `恶劣度 −${b.ease}`,
].filter(Boolean).join(' · ');
G.turnText = sp => { const k = G.CFG.TURN_TIER[G.TREES[sp].tier]; return k > 1 ? `根细而柔：转向 ×${k}` : k < 1 ? `根粗而直：转向 ×${k}` : ''; };
G.effectText = function (sp) {
  const { reform: r, buff: b } = G.TREES[sp], out = [];
  if (r) out.push(`改土：${whereText(r.at)}${r.up >= r.max ? `提升为「${G.SOIL_NAMES[r.max]}」` : `升 ${r.up} 级，最高「${G.SOIL_NAMES[r.max]}」`}`);
  if (b) out.push(`照顾邻居：${whereText(b.at)}上种下的植物${G.buffText(b)}`);
  return out;
};

// ================= 峭壁：一层一层的坑 =================
// 每层是夹在两面崖壁之间的坑。reach：通往上一层的崖台离地面的高度（世界单位）；exit：崖台在哪一侧（1 右 / -1 左）
// 树冠够得着崖台（小禾还能再跳 ~26），就能爬上去；第一次上去后会固定一条绳梯
// wallR（坑底）：没有崖台，右侧崖壁本身矮，崖顶离地面这么高；崖顶上方还压着一整块高岩体，两者之间是个大洞口（画在右崖的图里），
//   站在崖顶往右走进洞口是营地岩洞（east.js）
// 颜色：sky 天空四段（荒 → 绿）、back 远景、strata 土层、sand/grass 地表、wall 崖壁
G.LEVELS = [
  {
    id: 'pit', name: '坑底沙地', sub: '峭壁脚下的沙坑', wallR: 80, cave: true,
    sky: ['#e9c48a', '#f0d39c', '#f5e0b4', '#f9ebcc'], skyGreen: ['#5aa0d8', '#7ab8e0', '#a4d4e8', '#d8eef0'],
    back: { kind: 'canyon', cols: ['#d8a870', '#c08850', '#a87040'], green: ['#a8b878', '#88a060', '#6a8848'] },
    strata: ['#c99a62', '#b8875a', '#a07250', '#875e44', '#704c3a', '#5a3c31', '#47302b'],
    sand: ['#f4e2bd', '#f0cf8e', '#e4a672'], grass: ['#b8d67c', '#86b257', '#5f8a3e'],
    wall: ['#b8875a', '#9c6c48', '#7a5038', '#d0a070'],
    gen: { lava: 1, water: 1, clay: 1, salt: 0.6, rock: 1, caves: 1, ice: 0 }, green0: 34,
  },
  {
    id: 'ledge', name: '风蚀崖台', sub: '红砂岩上的风口', reach: 110, exit: -1,
    sky: ['#d8a878', '#e8bc8c', '#f2d0a4', '#f8e2c0'], skyGreen: ['#4a8ccc', '#6aa8d8', '#98c8e0', '#d0e8ec'],
    back: { kind: 'hoodoo', cols: ['#d89078', '#b86a52', '#8a4a3a'], green: ['#a89878', '#8a8058', '#6a7040'] },
    strata: ['#c0705a', '#a85e4a', '#904e40', '#784036', '#62342e', '#4e2a28', '#3e2224'],
    sand: ['#f0c8a8', '#dc9c78', '#c07858'], grass: ['#c8d080', '#94a858', '#6a8040'],
    wall: ['#a85e4a', '#8a4a3a', '#6a362c', '#c87a62'],
    gen: { lava: 0.5, water: 0.6, clay: 0.6, salt: 1.4, rock: 1.8, caves: 0.8, ice: 0 }, green0: 15,
  },
  {
    id: 'meadow', name: '高山草甸', sub: '云层边上的冷风草坡', reach: 140, exit: 1,
    sky: ['#9cb8d8', '#b4cce4', '#cce0ee', '#e8f2f6'], skyGreen: ['#5a90d0', '#7ab0e0', '#a8d0ec', '#e0f2f8'],
    back: { kind: 'peaks', cols: ['#a8b8d0', '#8094b0', '#5a6e8a'], green: ['#98b8b0', '#6a9488', '#4a7466'] },
    strata: ['#8a8070', '#786e62', '#665e56', '#56504a', '#48443e', '#3c3834', '#302e2c'],
    sand: ['#e8e4dc', '#c8c0b0', '#a89c88'], grass: ['#c8e0a0', '#8ab868', '#5a8a48'],
    wall: ['#8a8478', '#6e685e', '#545048', '#aaa496'],
    gen: { lava: 0.2, water: 0.8, clay: 0.3, salt: 0.2, rock: 1.5, caves: 1, ice: 1.4 }, green0: 20,
  },
  {
    id: 'cloud', name: '云雾林', sub: '云海之上的崖顶', top: true,
    sky: ['#f0b8a0', '#f8d0b0', '#fce4c8', '#fff4e0'], skyGreen: ['#e8a8a0', '#f4c8b0', '#fce0c8', '#fff4e0'],
    back: { kind: 'clouds', cols: ['#fff4ec', '#f0dcd8', '#d8c0c8'], green: ['#fff4ec', '#f0dcd8', '#d8c0c8'] },
    strata: ['#6a5a48', '#5a4c3e', '#4c4036', '#40362e', '#362e28', '#2e2622', '#26201e'],
    sand: ['#a8b878', '#88a060', '#6a8848'], grass: ['#a8e070', '#6ab850', '#3e8948'],
    wall: ['#6a6058', '#544c46', '#3e3834', '#88806e'],
    gen: { lava: 0, water: 1.2, clay: 0.5, salt: 0, rock: 1, caves: 1.8, ice: 0 }, green0: 50,
  },
];


// 材料按特性分组，也是排列顺序（炼药锅的材料栏、收获计数都按它排）
G.MAT_GROUPS = [
  ['转向 · 转向与缓行', ['leftFlower', 'rightFlower', 'thornSugar']],
  ['开路 · 破岩、防火、穿行', ['ironOre', 'ashMoss', 'fern']],
  ['分枝 · 长出新根', ['tamariskSprout']],
  ['自主 · 避障与寻宝', ['stoneWhisker', 'oleasterBloom']],
  ['时间 · 加速与缓时', ['windFruit', 'poplarTear']],
  ['反应材料 · 修改前一个效果<span style="float:right">芽苞 · 放第一格结种子</span>', ['thornSpike', 'elmCoin', 'poplarFluff', 'bud']],
];
G.MATERIAL_ORDER = G.MAT_GROUPS.flatMap(g => g[1]);

G.WATER = { name: '露水', desc: `养分 +${G.CFG.NUT_WATER}，时限 +${G.CFG.WATER_TIME} 秒` };

// ================= 营地岩洞（camp.js）：多余的材料丢进堆肥坑换成堆肥，再花堆肥搭东西、做工具 =================
// at：scene 场景里的空位（x：营地岩洞里的世界坐标，走过去按 F 搭）/ bench 工作台上做
// cost：每一级的价格；val：各级的数值（第 0 项是还没做的时候），text 把数值写成效果
G.CAMP_SPOTS = { compost: 46, bench: 80 }; // 一上来就有的：堆肥坑、当工作台的大石头
G.UPGRADES = {
  ladder:   { name: '绳梯', at: 'scene', x: 14, cost: [30], text: () => '从洞口顺着崖面垂到坑底：随时上下，不用再顺着树爬' },
  fire:     { name: '篝火', at: 'scene', x: 142, cost: [45], text: () => '生了火才能在洞里坐下睡觉' },
  perch:    { name: '鸟架', at: 'scene', x: 112, cost: [40, 80], val: [0, 1, 2], text: v => `清晨鸟儿带来的种子 +${v}` },
  canteen:  { name: '水囊', at: 'bench', cost: [30, 50, 90], val: [0, 2, 4, 6], text: v => `每次种植时限 +${v} 秒` },
  manure:   { name: '底肥', at: 'bench', cost: [60], val: [0, 30], text: v => `种下时开局就有 ${v} 养分` },
  guard:    { name: '护根套', at: 'bench', cost: [45, 80], val: [G.CFG.ROCK_PENALTY, 2.5, 2], text: v => `硬撞岩石扣 ${v} 秒` },
  dewRoot:  { name: '蓄水根', at: 'bench', cost: [30, 60], val: [G.CFG.WATER_TIME, 1.2, 1.3], text: v => `每格露水时限 +${v} 秒` },
  cylinder: { name: '量筒', at: 'bench', cost: [60, 110], val: [G.CFG.BOTTLE_ML, 125, 150], text: v => `新炼的毫升药剂每份 ${v} ml` },
};
G.campLv = id => G.state.camp.lv[id] || 0;
G.campVal = id => G.UPGRADES[id].val[G.campLv(id)];
// 一份材料能沤出多少堆肥：芽苞 4、地下的 3；树结的按坑底结它的植物里最低的等级：先锋 1、灌木 2、乔木 4
G.compostOf = function (id) {
  const m = G.MATERIALS[id];
  if (m.kind === 'bud') return 4;
  if (m.source) return 3;
  const tiers = G.TREE_ORDER.filter(sp => G.TREES[sp].home === 0 && G.TREES[sp].yields[id]).map(sp => G.TREES[sp].tier);
  return tiers.length ? [1, 2, 4, 4][Math.min(...tiers)] : 2;
};
