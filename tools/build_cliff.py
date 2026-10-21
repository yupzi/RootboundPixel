# 坑底两侧崖壁的美术：把 AI 生成的原图（assets/sprites/src/cliff/）缩到游戏像素尺寸（1/4）、抠掉背景、收成有限色板，打包成 js/cliff_art.js
# left：左侧高崖贴地的一段（带洞口，底边就是地面）；right：右侧矮崖 + 崖顶上压着的高岩体，中间是通往营地岩洞的大洞口（往下一直到地下）。
#   right.png 是把 right_no_mouth.png（原来的矮崖）上面拼一截岩层、留出洞口（草稿 right_draft.png），再让 AI 重画洞口得到的；
#   right_arch_mouth.png（半腰拱形洞口 + 石台）、right_tunnel_mid.png（半腰横穿的通道）是弃用的版本
# 往上：用 left 最上面 L_TILE 行（不带洞口）一正一反接着铺，和 left 顶边无缝。地下那一截不用美术（cliff.js 画成平的岩层）
# 用法：python tools/build_cliff.py
import os, io, base64, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', 'src', 'cliff')
K = 4            # 原图像素颗粒 4×4 → 游戏里 1 像素
L_GROUND = 992   # 左崖原图里地面所在的行
L_TILE = 200     # 左崖上半截（不带洞口）有多高（缩小后）


def uri(im):
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def matte(im):
    # 只留岩石：不透明、且有颜色（或者是深色描边）的像素；抠图留下的白雾去掉
    im = im.convert('RGBA'); p = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            p[x, y] = (r, g, b, 255) if a > 150 and (max(r, g, b) - min(r, g, b) > 30 or max(r, g, b) < 110) else (0, 0, 0, 0)
    return im


def shrink(im, n=28):
    s = im.resize((im.width // K, im.height // K), Image.BOX)
    q = s.convert('RGB').quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(s.getchannel('A').point(lambda v: 255 if v > 128 else 0))
    return q


INK = (62, 39, 49, 255)  # 和游戏里的描边同一个颜色（#3e2731）


def clean_face(im, side):
    # 缩小后崖面那一圈描边被平均成了深浅不一的棕色，外面还粘着抠图剩下的零星像素：
    # 每一行（只看崖体那些行：对面那一边是满的）取崖面位置，上下 5 行取中位数抹平毛刺，
    # 崖面外的全部清掉，再沿崖面重画一道 1 像素的描边（上下两行错开的地方横着连上）
    p = im.load(); W, H = im.size
    back = 0 if side < 0 else W - 1  # 崖体那一边的图边
    rows = [y for y in range(H) if p[back, y][3]]
    raw = {}
    for y in rows:
        xs = [x for x in range(W) if p[x, y][3]]
        raw[y] = max(xs) if side < 0 else min(xs)
    f = {}
    for y in rows:
        near = sorted(raw[yy] for yy in range(y - 2, y + 3) if yy in raw)
        f[y] = near[len(near) // 2]
    for y in rows:
        for x in range(W):
            if (x > f[y]) if side < 0 else (x < f[y]): p[x, y] = (0, 0, 0, 0)
    for y in rows:
        p[f[y], y] = INK
        if y - 1 in f and abs(f[y] - f[y - 1]) > 1:
            a, b = sorted((f[y], f[y - 1]))
            for x in range(a, b + 1):
                if p[x, y][3]: p[x, y] = INK
    return im


def face(im, y, side):
    # 第 y 行的崖面在哪一列：side = -1 左崖（最右边的不透明像素），1 右崖（最左边的）
    a = im.getchannel('A').load(); xs = [x for x in range(im.width) if a[x, y]]
    return max(xs) if side < 0 else min(xs)


left = clean_face(shrink(matte(Image.open(os.path.join(SRC, 'left.png'))).crop((0, 0, 576, L_GROUND))), -1)
right = clean_face(shrink(matte(Image.open(os.path.join(SRC, 'right.png')))), 1)
ra = right.getchannel('A').load()
# right 现在是「矮崖 + 崖顶上压着的高岩体 + 两者之间的洞口」一整张（洞口是 AI 在拼好的草稿上重画的），
# 洞口底（矮崖崖顶的沙面）、洞口顶（靠洞口那段岩檐的下沿）这两行在缩小后的图上量好写死；换原图要重新量
rtop, rceil = 190, 114
rface = face(right, rtop + 150, 1)

out = {
    'left': uri(left), 'right': uri(right),
    # lface：left 底边（地面）的崖面列；rtop：right 崖顶所在的行；rface：right 靠近地面处的崖面列（崖顶往下 150 行）
    'lw': left.width, 'lh': left.height, 'lface': face(left, left.height - 1, -1), 'ltile': L_TILE,
    # rceil：洞口顶所在的行；rtop 就是洞口底（矮崖崖顶）。right 图最上面 RBAND 行是纯岩层，往上一正一反铺出高岩体
    'rw': right.width, 'rh': right.height, 'rtop': rtop, 'rceil': rceil, 'rface': rface, 'rband': 90,
}
os.makedirs(os.path.join(ROOT, 'assets', 'sprites', 'cliff'), exist_ok=True)
for n, im in [('left', left), ('right', right)]:
    im.save(os.path.join(ROOT, 'assets', 'sprites', 'cliff', n + '.png'))  # 预览用
with open(os.path.join(ROOT, 'js', 'cliff_art.js'), 'w', encoding='utf-8') as f:
    f.write('// 由 tools/build_cliff.py 生成，勿手改。原图在 assets/sprites/src/cliff/（AI 生成）\n')
    f.write('G.CLIFF_ART = ' + json.dumps(out) + ';\n')
print({k: v for k, v in out.items() if not isinstance(v, str)})
