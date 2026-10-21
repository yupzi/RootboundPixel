# 营地岩洞（坑底右崖半腰那个洞口进去）的美术：把 AI 生成的原图（assets/sprites/src/camp/）缩到游戏像素尺寸、收成有限色板，打包成 js/camp_art.js
# bg：岩洞内景（480×270，往下挪到地面线对齐游戏里的 FLOOR，和炼药的洞穴一样）。洞口在左边，洞顶偏右有个天窗漏下一束光
# 其余是道具（透明底，正午顶光的砂岩配色，游戏里再按洞里的亮度图压暗）：按目标宽 / 高缩小，底边就是地面。顺便量出代码要用的几个点：
#   鸟架横杆上能歇鸟的位置（seats）、火塘里火苗的底（flame）
# old_sunset/ 里是最早那版夕照的原图，ground_openair.png 是后来露天营地的地面，cave_bg_tunnel.png 是左边改成低矮隧道的洞内底图（都弃用了），
# cave_bg_arch.png 和现在的 cave_bg.png 一样，留着备查
# 用法：python tools/build_camp.py
import os, io, base64, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', 'src', 'camp')
VW, VH, FLOOR = 480, 270, 190
BG_FLOOR = 340  # 原图（960×540）里地面那条亮边上，脚踩的那一行


def uri(im):
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def quant(im, n):
    a = im.getchannel('A')
    q = im.convert('RGB').quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(a.point(lambda v: 255 if v > 128 else 0))
    return q


def components(im, thr=200):
    # 不透明像素的连通块，返回 (像素数, bbox)，大的在前
    a = im.getchannel('A').load(); W, H = im.size; seen = bytearray(W * H); out = []
    for y in range(H):
        for x in range(W):
            if a[x, y] < thr or seen[y * W + x]: continue
            st, box, n = [(x, y)], [x, y, x, y], 0
            seen[y * W + x] = 1
            while st:
                cx, cy = st.pop(); n += 1
                if cx < box[0]: box[0] = cx
                if cy < box[1]: box[1] = cy
                if cx > box[2]: box[2] = cx
                if cy > box[3]: box[3] = cy
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and a[nx, ny] >= thr: seen[ny * W + nx] = 1; st.append((nx, ny))
            out.append((n, (box[0], box[1], box[2] + 1, box[3] + 1)))
    return sorted(out, reverse=True)


def prop(name, w=None, h=None, n=20):
    # 只留够大的连通块（抠图边上的零星杂点不算），裁到它们的范围，按目标宽或高（等比）缩小，收色
    im = Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')
    cs = components(im.resize((im.width // 4, im.height // 4), Image.NEAREST))
    big = [b for c, b in cs if c >= cs[0][0] * 0.01]
    box = [min(b[0] for b in big) * 4, min(b[1] for b in big) * 4, max(b[2] for b in big) * 4, max(b[3] for b in big) * 4]
    im = im.crop(box)
    k = w / im.width if w else h / im.height
    s = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)
    return quant(s, n)


def opaque(im):
    a = im.getchannel('A').load()
    return lambda x, y: 0 <= x < im.width and 0 <= y < im.height and a[x, y] > 0


def runs(im, y):
    # 第 y 行最长的一段连续不透明像素 (x0, x1)
    o, best, x = opaque(im), (0, -1), 0
    while x < im.width:
        if o(x, y):
            x0 = x
            while x < im.width and o(x, y): x += 1
            if x - 1 - x0 > best[1] - best[0]: best = (x0, x - 1)
        else: x += 1
    return best


def bars(im, y0, y1):
    # y0..y1 之间最长的一道横杆：返回 (行, x0, x1)，行是横杆最上面一行
    y, x0, x1 = max(((y,) + runs(im, y) for y in range(y0, y1)), key=lambda r: r[2] - r[1])
    while y > 0 and runs(im, y - 1)[1] - runs(im, y - 1)[0] > (x1 - x0) * 0.7: y -= 1
    return y, x0, x1


# ---- 底图：岩洞内景缩到一半，往下挪，让地面线落在 FLOOR；顶上空出来的几行用原图最上面一行补（和 build_cave.py 一样） ----
src = Image.open(os.path.join(SRC, 'cave_bg.png')).convert('RGB').resize((VW, VH), Image.BOX)
dy = FLOOR - BG_FLOOR // 2
bg = Image.new('RGB', (VW, VH))
bg.paste(src, (0, dy))
top = src.crop((0, 0, VW, 1))
for y in range(dy): bg.paste(top, (0, y))
bg = bg.quantize(40, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')

# ---- 道具 ----
P = {
    'bench': prop('bench', w=60),
    'compost': prop('compost', w=46),
    'fire': prop('firepit', w=40),
    'perch1': prop('perch1', h=70),
    'perch2': prop('perch2', h=80),
    'ladder': prop('stakes', w=34),
}
meta = {k: {'w': im.width, 'h': im.height} for k, im in P.items()}

# 鸟架：横杆上歇鸟的位置（相对图的左上角）。一级一道横杆；二级上下两道
p1, p2 = P['perch1'], P['perch2']
y, x0, x1 = bars(p1, 0, p1.height // 2)
meta['perch1']['seats'] = [[x0 + round((x1 - x0) * 0.3), y]]
ya, a0, a1 = bars(p2, 0, p2.height // 2)
yb, b0, b1 = bars(p2, ya + 6, p2.height * 3 // 4)
meta['perch2']['seats'] = [[a0 + round((a1 - a0) * 0.25), ya], [b0 + round((b1 - b0) * 0.25), yb]]

# 篝火：火苗从火塘中间、离地 4 成多高的地方往上烧
f = P['fire']
meta['fire']['flame'] = [f.width // 2, round(f.height * 0.55)]

out = {'bg': uri(bg), 'floor': FLOOR, 'img': {k: uri(im) for k, im in P.items()}, 'meta': meta}
os.makedirs(os.path.join(ROOT, 'assets', 'sprites', 'camp'), exist_ok=True)
for old in os.listdir(os.path.join(ROOT, 'assets', 'sprites', 'camp')): os.remove(os.path.join(ROOT, 'assets', 'sprites', 'camp', old))
bg.save(os.path.join(ROOT, 'assets', 'sprites', 'camp', 'bg.png'))  # 预览用
for k, im in P.items(): im.save(os.path.join(ROOT, 'assets', 'sprites', 'camp', k + '.png'))
with open(os.path.join(ROOT, 'js', 'camp_art.js'), 'w', encoding='utf-8') as fo:
    fo.write('// 由 tools/build_camp.py 生成，勿手改。原图在 assets/sprites/src/camp/（AI 生成）\n')
    fo.write('G.CAMP_ART = ' + json.dumps(out) + ';\n')
print(json.dumps(meta))
