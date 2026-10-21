# 隐藏洞穴的美术：把 AI 生成的原图（assets/sprites/src/cave/）缩到游戏像素尺寸、收成有限色板，打包成 js/cave_art.js（data URI，避免 file:// 下画布被污染）
# bg：洞穴内景底图（480×270，往下挪到地面线对齐游戏里的 FLOOR）；tree：枯树；pot：炼药锅（纯侧视）+ 液面遮罩（运行时按材料换色）
# 用法：python tools/build_cave.py
import os, io, base64, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', 'src', 'cave')
VW, VH, FLOOR = 480, 270, 190
BG_FLOOR = 298  # 原图里地面亮线所在的行（960×540）


def uri(im):
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def quant(im, n):
    # 收色：RGB 量化成 n 色（不抖动），保留透明度
    a = im.getchannel('A') if im.mode == 'RGBA' else None
    q = im.convert('RGB').quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    if a is None: return q
    q = q.convert('RGBA'); q.putalpha(a.point(lambda v: 255 if v > 140 else 0))
    return q


def components(im, thr=200):
    # 不透明像素的连通块，返回 bbox 列表（大的在前）
    a = im.getchannel('A').load(); W, H = im.size; seen = set(); out = []
    for y in range(H):
        for x in range(W):
            if a[x, y] < thr or (x, y) in seen: continue
            st, box, n = [(x, y)], [x, y, x, y], 0
            seen.add((x, y))
            while st:
                cx, cy = st.pop(); n += 1
                box = [min(box[0], cx), min(box[1], cy), max(box[2], cx), max(box[3], cy)]
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and a[nx, ny] >= thr: seen.add((nx, ny)); st.append((nx, ny))
            if n > 200: out.append((n, (box[0], box[1], box[2] + 1, box[3] + 1)))
    return [b for _, b in sorted(out, reverse=True)]


def shrink(im, k):
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    return im.resize((w, h), Image.BOX)


# ---- 背景：缩到一半，往下挪，让地面线落在 FLOOR；顶上空出来的几行用原图最上面一行补 ----
src = Image.open(os.path.join(SRC, 'bg.png')).convert('RGB').resize((VW, VH), Image.BOX)
dy = FLOOR - BG_FLOOR // 2
bg = Image.new('RGB', (VW, VH))
bg.paste(src, (0, dy))
top = src.crop((0, 0, VW, 1))
for y in range(dy): bg.paste(top, (0, y))
bg = quant(bg, 40)

# ---- 枯树：朝右上方的洞口伸过去 ----
t = Image.open(os.path.join(SRC, 'tree.png')).convert('RGBA')
t = t.crop(components(t)[0])
tree = quant(shrink(t, 72 / t.height), 14)

# ---- 炼药锅：只留最大的一块（锅身）。原图是规整的像素画，用最近邻缩小保持锐利 ----
# 液面遮罩从原图的绿色像素取：先在原图上标出来再缩小，避免两像素高的液面被平均掉
p = Image.open(os.path.join(SRC, 'cauldron.png')).convert('RGBA')
p = p.crop(components(p)[0])
size = (34, round(p.height * 34 / p.width))
pot = quant(p.resize(size, Image.NEAREST), 16)
full = Image.new('L', p.size)
sp, fp = p.load(), full.load()
for y in range(p.height):
    for x in range(p.width):
        R, Gc, B, A = sp[x, y]
        if A > 140 and Gc > R + 25 and Gc > B + 10: fp[x, y] = 255  # 绿色的液面
small = full.resize(size, Image.BOX).load()
mask = Image.new('RGBA', size)
mp, pp = mask.load(), pot.load()
for y in range(size[1]):
    for x in range(size[0]):
        if small[x, y] > 70 and pp[x, y][3]: mp[x, y] = (255, 255, 255, 255)
out = {'bg': uri(bg), 'tree': uri(tree), 'pot': uri(pot), 'potMask': uri(mask), 'size': {'tree': tree.size, 'pot': pot.size}}
os.makedirs(os.path.join(ROOT, 'assets', 'sprites', 'cave'), exist_ok=True)
for n, im in [('bg', bg), ('tree', tree), ('pot', pot), ('pot_mask', mask)]:
    im.save(os.path.join(ROOT, 'assets', 'sprites', 'cave', n + '.png'))  # 预览用
with open(os.path.join(ROOT, 'js', 'cave_art.js'), 'w', encoding='utf-8') as f:
    f.write('// 由 tools/build_cave.py 生成，勿手改。原图在 assets/sprites/src/cave/（AI 生成）\n')
    f.write('G.CAVE_ART = ' + json.dumps(out) + ';\n')
print('tree', tree.size, 'pot', pot.size)
