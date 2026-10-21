# 界面贴图：从「UI assets pack 2 / UI books & more.png」里裁出纸张、木框、书本，放大 2 倍（与画布像素一致）存到 assets/ui/
# 用法：python tools/build_ui.py "<UI books & more.png 的路径>"
# 生成的图都给 CSS border-image 九宫格用，切片宽度见 style.css 里的注释
import os
import sys
from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ui')
os.makedirs(OUT, exist_ok=True)
sheet = Image.open(SRC).convert('RGBA')
K = 2

PAPER = (0xfe, 0xe1, 0xb8, 255)


def save(im, name):
    im.resize((im.width * K, im.height * K), Image.NEAREST).save(os.path.join(OUT, name))
    print(name, im.size)


def crop(x, y, w, h):
    return sheet.crop((x, y, x + w, y + h))


# 钉着图钉的纸（48×64）：大卡片用。切片 12
pinned = crop(608, 16, 48, 64)
save(pinned, 'paper_pin.png')

# 素纸：同一张纸去掉图钉和虚线框，HUD 小面板用。切片 6
plain = pinned.copy()
px = plain.load()
for y in range(5, 59):
    for x in range(2, 46):
        if px[x, y][:3] in ((0x3d, 0x33, 0x33), (0xd4, 0xc6, 0x92)):  # 图钉、虚线
            px[x, y] = PAPER
save(plain, 'paper.png')

# 深色木框（46×46）：药剂架格子、锅位。切片 7
save(crop(721, 65, 46, 46), 'slot.png')

# 毛边羊皮纸（48×48）：提示框。切片 6
save(crop(768, 64, 48, 48), 'parchment.png')

# 书：左右两页分开存，各自做九宫格（翻开的书 x16..111, y32..79）
book = crop(16, 32, 96, 48)
save(book.crop((0, 0, 48, 48)), 'book_l.png')
save(book.crop((48, 0, 96, 48)), 'book_r.png')

# 小图标：翻开的书（笔记按钮）
save(crop(545, 177, 14, 14), 'icon_book.png')
