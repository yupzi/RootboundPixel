# 把 assets/sprites/src/hero.aseprite（小禾精灵的源文件，在 Aseprite 里手改）导出成游戏用的精灵表
# 输出 assets/sprites/hero.png（预览用）与 js/hero_sheet.js（data URI，避免 file:// 下画布被污染）
# 帧横排成一行、每帧 FW×FW；动作按 Aseprite 的 Tag 分组（Tag 名就是 hero.js 里的动作名），参考层不导出
# 用法：python tools/import_hero.py
# Original character template created by Eris Esra: https://erisesra.itch.io/character-templates-pack
import os, sys, io, json, base64, tempfile
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aseprite

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', 'src', 'hero.aseprite')

with tempfile.TemporaryDirectory() as tmp:
    png, data = os.path.join(tmp, 'sheet.png'), os.path.join(tmp, 'sheet.json')
    aseprite.run('--ignore-layer', '参考', SRC, '--sheet', png, '--sheet-type', 'horizontal',
                 '--data', data, '--format', 'json-array', '--list-tags')
    sheet = Image.open(png).convert('RGBA')
    with open(data, encoding='utf-8') as f: meta = json.load(f)

FW = meta['frames'][0]['sourceSize']['w']
assert FW == meta['frames'][0]['sourceSize']['h'], '帧必须是正方形'
names = {t['name']: list(range(t['from'], t['to'] + 1)) for t in meta['meta']['frameTags']}

sheet.save(os.path.join(ROOT, 'assets', 'sprites', 'hero.png'))
buf = io.BytesIO(); sheet.save(buf, 'PNG', optimize=True)
uri = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
with open(os.path.join(ROOT, 'js', 'hero_sheet.js'), 'w', encoding='utf-8') as f:
    f.write('// 由 tools/import_hero.py 从 assets/sprites/src/hero.aseprite 导出，勿手改。\n')
    f.write('// Original character template created by Eris Esra: https://erisesra.itch.io/character-templates-pack\n')
    f.write(f'G.HERO_SHEET = {{ fw: {FW}, anim: {json.dumps(names)},\n')
    f.write(f"  src: '{uri}' }};\n")
print(len(meta['frames']), 'frames,', ', '.join(f'{k}×{len(v)}' for k, v in names.items()), ',', len(uri) // 1024, 'KB')
