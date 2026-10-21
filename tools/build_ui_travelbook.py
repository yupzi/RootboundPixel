# 皮革界面贴图：从 Complete_UI_Book_Styles_Pack_Free_v1.0 / 01_TravelBookLite / Sprites 里切零件，放大 2 倍，皮革从粉红改成棕色，存成 assets/ui/tb_*.png
# 用法：python tools/build_ui_travelbook.py "<…/01_TravelBookLite/Sprites 的路径>" assets/ui
import sys
from PIL import Image
src, out = sys.argv[1] + '/UI_TravelBook_', sys.argv[2]
def load(n): return Image.open(src + n + '.png').convert('RGBA')
def x2(im): return im.resize((im.width * 2, im.height * 2), Image.NEAREST)
def recolor(im, m):
    im = im.copy(); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            k = '%02x%02x%02x' % (r, g, b)
            if a and k in m: px[x, y] = tuple(int(m[k][i:i+2], 16) for i in (0, 2, 4)) + (a,)
    return im
LEATHER = {'b75b5f': '6e4a3e', '9c4351': '563832'}
cover = recolor(load('BookCover01a'), LEATHER)
# （整张皮革 leather.png 没用上，不再导出）
# 小块皮革：取四个 16px 角 + 一段边，拼成 48x48，九宫格用
s = Image.new('RGBA', (48, 48)); W, H = cover.size
s.paste(cover.crop((0, 0, 24, 24)), (0, 0)); s.paste(cover.crop((W-24, 0, W, 24)), (24, 0))
s.paste(cover.crop((0, H-24, 24, H)), (0, 24)); s.paste(cover.crop((W-24, H-24, W, H)), (24, 24))
x2(s).save(out + '/tb_leather_s.png')
for n, f in [('Slot01a', 'slot'), ('Slot01b', 'slot_on'), ('Slot01c', 'slot_off'), ('Select01a', 'cursor'),
             ('Popup01a', 'label'), ('Frame01a', 'row'), ('FrameSelect01a', 'row_on'), ('Bar01a', 'bar'), ('CommandHold01a', 'hold')]:
    x2(load(n)).save(out + '/tb_' + f + '.png')
print('ok')
