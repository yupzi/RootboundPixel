# 主角小禾的精灵表：以 Eris Esra 的 Character Templates Pack（16x32 光头小人模板）为底，
# 逐帧画上小禾的头发（棕色短发 + 刘海 + 头顶小芽）、绿上衣、腰带和小药瓶、浅色长裤、棕靴，并调成暖肤色。
# 只用侧面的待机 / 走 / 跑三套动作；跳跃、爬树等在 js/hero.js 里借用这几帧。
# 这是一次性的初始生成器：输出 assets/sprites/src/hero.aseprite（按生成步骤拆成 身体/衣服/头发/小芽 四层 + 锁定的参考层，
# 动作用 Tag 标出），之后在 Aseprite 里手改，再用 tools/import_hero.py 导出给游戏。已有 .aseprite 时不会覆盖，除非加 --force。
# 用法：python tools/build_hero.py   （模板在 assets/sprites/src/erisesra-template/；需要装 Aseprite，见 tools/aseprite.py）
# Original character template created by Eris Esra: https://erisesra.itch.io/character-templates-pack
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', 'src', 'erisesra-template')
H = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
FW = 32

# 模板的 5 种颜色
T_FILL, T_LINE, T_SH, T_HI, T_BLUSH = H('#faf3e8'), H('#2f2522'), H('#b9b3a1'), H('#e7d5c6'), H('#d19da7')
INK = H('#3e2731')
SKIN = {T_FILL: H('#f6d2ac'), T_SH: H('#d8a080'), T_HI: H('#e8b796'), T_BLUSH: H('#f6757a')}
HAIR, HAIR_HI, HAIR_DK = H('#8a5a3a'), H('#b86f50'), H('#5c3a26')
CLOTH = {  # 区域 → (亮, 暗)
    'shirt': (H('#63c74d'), H('#3e8948')),
    'pants': (H('#ead4aa'), H('#c9a46a')),
    'boot': (H('#8a5a3a'), H('#5c3a26')),  # 亮、鞋底
}
BELT, BUCKLE, PINK, WHITE = H('#5c3a26'), H('#feae34'), H('#e7609f'), H('#ffffff')
LEAF, LEAF_HI = H('#63c74d'), H('#b8d67c')

# 动作 → (模板表, 列)，都取侧面（第 2 行，朝右）
SIDE = 2
ANIM = {
    'idle': ('Idle', [0, 1, 2, 3]),
    'walk': ('Walk', [0, 1, 2, 3]),
    'run': ('Run', [0, 1, 2, 3, 4, 5]),
}

sheets = {}
def cell(name, row, col):
    if name not in sheets: sheets[name] = Image.open(os.path.join(SRC, f'16x32 {name}-Sheet.png')).convert('RGBA')
    return sheets[name].crop((col * FW, row * FW, col * FW + FW, row * FW + FW))


def opaque(px, x, y):
    return 0 <= x < FW and 0 <= y < FW and px[x, y][3] > 0


def outline(px, pts):
    for x, y in pts:
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= n[0] < FW and 0 <= n[1] < FW and not px[n][3]: px[n] = INK + (255,)


def head_box(px):
    # 头：最上面一行往下 12 行（含下巴线）；左右边界取第 6 行，避免被举起的手臂撑宽
    y0 = next(y for y in range(FW) if any(px[x, y][3] for x in range(FW)))
    row = [x for x in range(FW) if px[x, y0 + 5][3]]
    return row[0], y0, row[-1], y0 + 11


def hair_rule(dx, dy, W):
    # 头内哪些像素是头发（朝右：后脑勺在左边，刘海盖到眼睛上方）；dx/dy 相对头部左上角，W 为头宽
    if dy <= 3: return True
    if dy == 4: return dx <= W - 2
    if dy == 5: return dx <= 4 or dx in (6, W - 3)
    if dy <= 8: return dx <= 3
    return dy <= 10 and dx <= 2


def paint_hair(im):
    # 头顶和脑后往外鼓一圈，脑后垂一点发梢
    px = im.load()
    x0, y0, x1, y1 = head_box(px)
    W = x1 - x0 + 1
    hair = {(x, y) for y in range(y0, y1) for x in range(x0, x1 + 1)
            if opaque(px, x, y) and hair_rule(x - x0, y - y0, W)}
    grow = set()
    for x, y in hair:
        if y - y0 <= 1: grow.add((x, y - 1))
        if x - x0 <= 1: grow.add((x - 1, y))
    grow |= {(x0 - 1, y0 + 10), (x0, y0 + 10), (x0 - 1, y0 + 11), (x0, y0 + 11)}
    hair |= {p for p in grow if 0 <= p[0] < FW and 0 <= p[1] < FW and (not opaque(px, *p) or px[p][:3] == T_LINE)}
    top = min(y for _, y in hair)
    for x, y in hair:
        if y == top + 1 and 2 <= x - x0 <= W - 4: c = HAIR_HI  # 头顶高光
        elif any(n not in hair and opaque(px, *n) and px[n][:3] != T_LINE for n in ((x + 1, y), (x, y + 1), (x - 1, y))): c = HAIR_DK
        else: c = HAIR
        px[x, y] = c + (255,)
    outline(px, hair)
    return x0, y0, x1, y1


def sprout(im, x0, x1):
    # 头顶的小芽：茎 + 左右两片叶子
    px = im.load()
    cx = (x0 + x1) // 2
    top = next(y for y in range(FW) if px[cx, y][3])
    pts = []
    for (x, y), c in {(0, -1): LEAF, (0, -2): LEAF, (-1, -3): LEAF, (-2, -3): LEAF_HI,
                      (1, -3): LEAF, (2, -3): LEAF, (2, -4): LEAF_HI}.items():
        X, Y = cx + x, top + y
        if 0 <= X < FW and 0 <= Y < FW: px[X, Y] = c + (255,); pts.append((X, Y))
    outline(px, pts)


def dress(im, hb):
    # 头以下按高度分区：上衣 → 裤子，每条腿最下面两格是靴子
    px = im.load()
    hem = hb + 8
    legs = {(x, y) for y in range(hem + 1, FW) for x in range(FW) if opaque(px, x, y) and px[x, y][:3] in (T_FILL, T_SH, T_HI)}
    boots = {(x, y) for x, y in legs if (x, y + 1) not in legs or (x, y + 2) not in legs}
    for y in range(hb + 1, FW):
        for x in range(FW):
            if not opaque(px, x, y): continue
            c = px[x, y][:3]
            if c == T_LINE: continue
            zone = 'shirt' if y <= hem else ('boot' if (x, y) in boots else 'pants')
            lite, dark = CLOTH[zone]
            # 模板的腿整条用阴影色填，所以腿上两种颜色都按亮色算，只把脚底那格压暗
            if zone == 'shirt': px[x, y] = (dark if c == T_SH else lite) + (255,)
            else: px[x, y] = (dark if zone == 'boot' and (x, y + 1) not in legs else lite) + (255,)
    # 腰带 + 扣子 + 腰后的小药瓶
    belt = hb + 6
    row = [x for x in range(FW) if opaque(px, x, belt) and px[x, belt][:3] in CLOTH['shirt']]
    if row:
        for x in row: px[x, belt] = BELT + (255,)
        px[row[-1] - 1, belt] = BUCKLE + (255,)
        for y in (belt, belt + 1):
            if opaque(px, row[0], y): px[row[0], y] = PINK + (255,)
        px[row[0], belt] = WHITE + (255,)


def skin(im):
    px = im.load()
    for y in range(FW):
        for x in range(FW):
            if px[x, y][3]:
                c = px[x, y][:3]
                px[x, y] = (INK if c == T_LINE else SKIN.get(c, c)) + (255,)


def eyes(im, y0, y1):
    # 眼睛：头部里被肤色左右夹住的描边像素
    px = im.load()
    sk = set(SKIN.values())
    return [(x, y) for y in range(y0, y1) for x in range(1, FW - 1)
            if px[x, y][:3] == INK and px[x - 1, y][:3] in sk and px[x + 1, y][:3] in sk]


def body(sheet, col, blink=False):
    # 返回 (整帧, 分层)；每画一步留一张快照，用来拆出 Aseprite 的图层
    im = cell(sheet, SIDE, col)
    px = im.load()
    _, _, _, hb = head_box(px)
    shots = [im.copy()]
    dress(im, hb); shots.append(im.copy())
    x0, y0, x1, y1 = paint_hair(im); shots.append(im.copy())
    skin(im)
    if blink:
        es = eyes(im, y0, y1)
        for x, y in es:
            if (x, y + 1) in es: px[x, y] = SKIN[T_FILL] + (255,)
    shots.append(im.copy())
    sprout(im, x0, x1)
    return im, split(shots, im)


# Aseprite 图层，从下到上，对应生成的步骤：模板身体（调成暖肤色）→ 衣服 → 头发 → 小芽
LAYERS = ['身体', '衣服', '头发', '小芽']


def split(shots, final):
    # 每一层只放这一步改动过的像素，颜色取这一步刚画完（并调过肤色）时的样子——
    # 这样上面一层擦掉后，下面露出来的是完整的身体 / 衣服，而不是窟窿；最上面那层再对齐成最终颜色（眨眼也在这里落到身体层）
    def skinned(im):
        im = im.copy(); skin(im); return im.load()
    s0, s1, s2, s3 = (s.load() for s in shots)
    k0, k1, k2 = skinned(shots[0]), skinned(shots[1]), skinned(shots[2])
    f = final.load()
    out = [Image.new('RGBA', (FW, FW)) for _ in LAYERS]
    lp = [o.load() for o in out]
    for y in range(FW):
        for x in range(FW):
            p = (x, y)
            has = []
            if s0[p][3]: lp[0][p] = k0[p]; has.append(0)
            if s1[p] != s0[p]: lp[1][p] = k1[p]; has.append(1)
            if s2[p] != s1[p]: lp[2][p] = k2[p]; has.append(2)
            if f[p] != s3[p]: lp[3][p] = f[p]; has.append(3)
            if f[p][3]: lp[has[-1] if has else 0][p] = f[p]
    return out


def flatten(layers):
    im = Image.new('RGBA', (FW, FW))
    for l in layers: im.alpha_composite(l)
    return im


# 坐姿下半身的逐像素小图：K 描边、G/g 上衣亮/暗、P/p 裤子亮/暗、B/b 靴子/鞋底、S/s 皮肤亮/暗、. 不动
SIT_PAL = {'K': INK, 'G': CLOTH['shirt'][0], 'g': CLOTH['shirt'][1], 'P': CLOTH['pants'][0], 'p': CLOTH['pants'][1],
           'B': CLOTH['boot'][0], 'b': CLOTH['boot'][1], 'S': SKIN[T_FILL], 's': SKIN[T_SH]}
SIT_POSES = {
    # 双腿向前伸直（L 形），靴尖朝上；(左上角 x, y, 每行)
    'legs': (10, 25, [
        '...............KK..',
        '..............KBbK.',
        '...........KKKKBbK.',
        '.KGGGGGggPPPPPPBbK.',
        '.KpppppppPPPPPpBbK.',
        '.KpppppppppppppbbK.',
        '..KKKKKKKKKKKKKKK..',
    ]),
    # 抱着膝盖坐：膝盖顶在胸前，双手环住小腿
    'hug': (10, 21, [
        '.............KKK...',
        '............KPPPK..',
        '...........KSSPPpK.',
        '...........KsSPPpK.',
        '............KKPPpK.',
        '.............KPPpK.',
        '.............KPPpK.',
        '.KGGGGGggpppKPPpK..',
        '.KppppppppppKBBBbK.',
        '.KppppppppppKBBBbK.',
        '..KKKKKKKKKKKKKKKK.',
    ]),
}


def sit(idle, pose):
    # 坐在地上（姿势参考 assets/sprites/src/hero_sit.png）：头到腰带（第 0–24 行）原样往下挪 3 行——坐下只少了腿长、多了大腿的厚度，
    # 上衣完整不被遮住；下半身按 SIT_POSES 逐像素画（皮肤进身体层，其余进衣服层，盖住的像素从别的层擦掉）
    # idle 是待机帧的分层，返回坐姿的分层
    out = []
    for l in idle:
        im = Image.new('RGBA', (FW, FW))
        im.alpha_composite(l.crop((0, 0, FW, 25)), (0, 3))
        out.append(im)
    px = [o.load() for o in out]
    x0, y0, rows = SIT_POSES[pose]
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == '.': continue
            p = (x0 + i, y0 + j)
            for l in px: l[p] = (0, 0, 0, 0)
            px[0 if ch in 'Ss' else 1][p] = SIT_PAL[ch] + (255,)
    return out


def sit_ai(frames, k):
    # AI 生成的坐姿（assets/sprites/src/hero_sit.png，以小禾为参考）：原图每个像素先对齐到已有帧用过的颜色，
    # 再按 k×k 的格子缩小，每格取出现最多的颜色（描边占得够多就用描边，免得眼睛和轮廓被冲掉）；
    # 脚底贴住第 31 行，水平方向让头和待机帧对齐
    src = Image.open(os.path.join(ROOT, 'assets', 'sprites', 'src', 'hero_sit.png')).convert('RGBA')
    src = src.crop(src.getbbox())
    pal = sorted({p[:3] for f in frames for p in f.get_flattened_data() if p[3]})
    memo = {}
    def near(c):
        if c not in memo: memo[c] = min(pal, key=lambda q: (q[0] - c[0]) ** 2 * 3 + (q[1] - c[1]) ** 2 * 4 + (q[2] - c[2]) ** 2 * 2)
        return memo[c]
    s = src.load()
    W, H = round(src.width / k), round(src.height / k)
    small = Image.new('RGBA', (W, H)); sp = small.load()
    for y in range(H):
        for x in range(W):
            cnt, empty, n = {}, 0, 0
            for yy in range(int(y * k), min(src.height, int((y + 1) * k))):
                for xx in range(int(x * k), min(src.width, int((x + 1) * k))):
                    n += 1
                    r, g, b, a = s[xx, yy]
                    if a < 110: empty += 1; continue
                    q = near((r, g, b)); cnt[q] = cnt.get(q, 0) + 1
            if not cnt or empty > n * 0.55: continue
            sp[x, y] = (INK if cnt.get(INK, 0) >= n * 0.3 else max(cnt, key=cnt.get)) + (255,)
    head = lambda im: next(x for x in range(im.width) if any(im.getpixel((x, y))[3] for y in range(min(12, im.height))))
    im = Image.new('RGBA', (FW, FW))
    im.alpha_composite(small, (head(frames[0]) - head(small), FW - small.height))
    return im


# Aseprite 里预览用的帧时长（秒），按游戏里的节奏取近似值；游戏本身不读它（走 / 跑按移动距离换帧）
DUR = {'idle': 0.25, 'walk': 0.1, 'run': 0.05, 'blink': 0.12, 'sit': 0.25}
OUT = os.path.join(ROOT, 'assets', 'sprites', 'src', 'hero.aseprite')


def guide():
    # 参考层：地面线（第 31 行，脚底踩在这一行）和中线（x=16，脚底中点），隔一格点一个
    im = Image.new('RGBA', (FW, FW)); px = im.load()
    for x in range(0, FW, 2): px[x, FW - 1] = (255, 60, 60, 255)
    for y in range(0, FW, 2): px[16, y] = (60, 140, 255, 255)
    return im


def lua_str(s):
    return '"' + s.replace('\\', '/').replace('"', '\\"') + '"'


def write_aseprite(layered, names, tmp):
    for i, ls in enumerate(layered):
        for k, l in enumerate(ls):
            if l.getbbox(): l.save(os.path.join(tmp, f'f{i}_l{k}.png'))
    guide().save(os.path.join(tmp, 'guide.png'))
    pal = sorted({p[:3] for ls in layered for l in ls for p in l.get_flattened_data() if p[3]})
    dur = [0.1] * len(layered)
    for k, ids in names.items():
        for i in ids: dur[i] = DUR[k]
    lua = f'''
local N, tmp = {len(layered)}, {lua_str(tmp)}
local names = {{ {", ".join(lua_str(n) for n in LAYERS)} }}
local spr = Sprite({FW}, {FW}, ColorMode.RGB)
for i = 2, N do spr:newEmptyFrame() end
local dur = {{ {", ".join(map(str, dur))} }}
for i = 1, N do spr.frames[i].duration = dur[i] end
local ref = spr.layers[1]
ref.name = "参考"
for k = 1, #names do
  local l = spr:newLayer(); l.name = names[k]
  for i = 1, N do
    local f = tmp .. "/f" .. (i - 1) .. "_l" .. (k - 1) .. ".png"
    if app.fs.isFile(f) then spr:newCel(l, i, Image{{ fromFile = f }}, Point(0, 0)) end
  end
end
local g = Image{{ fromFile = tmp .. "/guide.png" }}
for i = 1, N do spr:newCel(ref, i, g, Point(0, 0)) end
ref.opacity = 90
ref.isEditable = false
'''
    for k, ids in names.items():
        lua += f'do local t = spr:newTag({ids[0] + 1}, {ids[-1] + 1}); t.name = {lua_str(k)} end\n'
    lua += f'local p = Palette({len(pal) + 1})\np:setColor(0, Color{{ r = 0, g = 0, b = 0, a = 0 }})\n'
    for i, (r, g, b) in enumerate(pal): lua += f'p:setColor({i + 1}, Color{{ r = {r}, g = {g}, b = {b} }})\n'
    lua += f'spr:setPalette(p)\nspr:saveAs({lua_str(OUT)})\n'
    script = os.path.join(tmp, 'build.lua')
    with open(script, 'w', encoding='utf-8') as f: f.write(lua)
    aseprite.run('--script', script)


if __name__ == '__main__':
    import sys, tempfile
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import aseprite
    if os.path.exists(OUT) and '--force' not in sys.argv:
        raise SystemExit(f'{OUT} 已存在，里面可能有手改的内容；确实要从模板重新生成请加 --force')
    layered, names = [], {}
    for k, (sheet, cols) in ANIM.items():
        names[k] = []
        for c in cols:
            names[k].append(len(layered)); layered.append(body(sheet, c)[1])
    names['blink'] = [len(layered)]; layered.append(body('Idle', 0, blink=True)[1])
    names['sit'] = [len(layered)]; layered.append(sit(layered[names['idle'][0]], 'legs'))
    with tempfile.TemporaryDirectory() as tmp: write_aseprite(layered, names, tmp)
    print(len(layered), 'frames →', OUT, '；接着运行 python tools/import_hero.py')
