# 把网页版的资源同步到 TapTap 制造（Maker）项目 ../RootboundPixel-Maker：
#   地下设计地图（用 Node 跑 js/strata_gen.js 原代码合成，保证和网页版一格不差）、美术模块里嵌的 PNG 和尺寸、
#   界面图片、音乐、离线合成的音效（网页版是 WebAudio 实时合成）、裁剪过的像素字体（只留用到的字）。
# 用法：python tools/maker_export.py          （改了地图 / 美术 / 音效 / 界面文字以后重跑）
import os, re, io, json, base64, shutil, subprocess, wave, struct, math
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAKER = os.path.join(os.path.dirname(ROOT), 'RootboundPixel-Maker')
OUT = os.path.join(MAKER, 'assets')
JS = os.path.join(ROOT, 'js')


def out(*p):
    path = os.path.join(OUT, *p)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


# ---------------- 用 Node 跑网页版的数据模块 ----------------
NODE = r'''
const fs = require('fs'), path = require('path');
const dir = process.argv[1];
const G = {}, store = {};
const sandbox = { G, window: null, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } }, location: { search: '' }, console };
sandbox.window = sandbox;
const run = f => new Function(...Object.keys(sandbox), fs.readFileSync(path.join(dir, f), 'utf8'))(...Object.values(sandbox));
for (const f of ['util.js', 'data.js', 'strata.js', 'strata_gen.js', 'sprites.js', 'cliff_art.js', 'cave_art.js', 'camp_art.js', 'hero_sheet.js']) run(f);
const strata = {};
for (const id in G.STRATA) strata[id] = { layers: G.STRATA[id].layers, grid: G.Strata.compose(G.STRATA[id]).join('') };
process.stdout.write(JSON.stringify({ strata, art: { CLIFF_ART: G.CLIFF_ART, CAVE_ART: G.CAVE_ART, CAMP_ART: G.CAMP_ART, HERO_SHEET: G.HERO_SHEET } }));
'''


def run_node():
    r = subprocess.run(['node', '-e', NODE, JS], capture_output=True, text=True, encoding='utf-8')
    if r.returncode:
        raise SystemExit('node failed:\n' + r.stderr)
    return json.loads(r.stdout)


# 美术模块：data: URI 解成 PNG 文件，换成资源路径
def export_art(art):
    def walk(v, name):
        if isinstance(v, str) and v.startswith('data:image/png;base64,'):
            rel = 'sprites/art/' + name + '.png'
            with open(out(*rel.split('/')), 'wb') as f:
                f.write(base64.b64decode(v.split(',', 1)[1]))
            return rel
        if isinstance(v, dict):
            return {k: walk(x, name + '_' + k) for k, x in v.items()}
        if isinstance(v, list):
            return [walk(x, name + '_' + str(i)) for i, x in enumerate(v)]
        return v
    res = {k: walk(v, k.lower()) for k, v in art.items()}
    with open(out('Data', 'art.json'), 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False)


def export_strata(strata):
    with open(out('Data', 'strata.json'), 'w', encoding='utf-8') as f:
        json.dump(strata, f, ensure_ascii=False)


# ---------------- 图片、音乐 ----------------
def copy_tree(src, dst, exts):
    n = 0
    for name in os.listdir(src):
        if os.path.splitext(name)[1].lower() in exts:
            shutil.copyfile(os.path.join(src, name), out(dst, name)); n += 1
    return n


# ---------------- 音效：照搬 js/sprites.js 的振荡器合成 ----------------
SFX = {
    'collect': [[660, 0.06, 'square'], [990, 0.08, 'square']],
    'water': [[520, 0.08, 'sine'], [780, 0.1, 'sine']],
    'potion': [[300, 0.05, 'triangle'], [600, 0.08, 'triangle'], [900, 0.06, 'triangle']],
    'rock': [[90, 0.15, 'sawtooth'], [60, 0.15, 'square']],
    'smash': [[180, 0.06, 'square'], [120, 0.08, 'square']],
    'burn': [[200, 0.08, 'sawtooth'], [110, 0.2, 'sawtooth']],
    'branch': [[440, 0.05, 'square'], [550, 0.05, 'square']],
    'trigger': [[880, 0.05, 'square'], [660, 0.05, 'square'], [1100, 0.07, 'square']],
    'brew': [[260, 0.08, 'triangle'], [390, 0.08, 'triangle'], [520, 0.08, 'triangle'], [780, 0.18, 'triangle']],
    'click': [[700, 0.03, 'square']],
    'fail': [[200, 0.08, 'square'], [150, 0.12, 'square']],
    'end': [[523, 0.1, 'triangle'], [659, 0.1, 'triangle'], [784, 0.2, 'triangle']],
    'fruit': [[1320, 0.04, 'triangle']],
    'pour': [[540, 0.06, 'sine']],
    'grow': [[262, 0.12, 'triangle'], [330, 0.12, 'triangle'], [392, 0.12, 'triangle'], [523, 0.14, 'triangle'], [659, 0.22, 'triangle']],
    'tick': [[1000, 0.05, 'square']],
    'plop': [[220, 0.05, 'sine'], [440, 0.07, 'triangle']],
    'orb': [[1200, 0.03, 'triangle']],
    'charge': [[330, 0.04, 'triangle']],
    'pop': [[520, 0.04, 'square'], [1040, 0.09, 'triangle']],
    'levelup': [[392, 0.07, 'square'], [523, 0.07, 'square'], [659, 0.07, 'square'], [784, 0.07, 'square'], [1047, 0.22, 'triangle']],
    'crit': [[784, 0.05, 'square'], [1175, 0.05, 'square'], [1568, 0.14, 'triangle']],
}
RATE = 44100


def osc(kind, f, t):
    ph = (t * f) % 1.0
    if kind == 'sine':
        return np.sin(2 * np.pi * ph)
    if kind == 'square':
        return np.where(ph < 0.5, 1.0, -1.0)
    if kind == 'sawtooth':
        return 2 * ph - 1
    return 1 - 4 * np.abs(ph - 0.5)  # triangle（从 1 开始，和 WebAudio 的相位差半个周期，听不出来）


def render_sfx(notes):
    total = 0.0; t0 = 0.0
    for f, d, _ in notes:
        total = max(total, t0 + d); t0 += d * 0.8
    buf = np.zeros(int(total * RATE) + 64)
    t0 = 0.0
    for f, d, kind in notes:
        n = int(d * RATE)
        t = np.arange(n) / RATE
        # gain：0.06 → 指数下降到 0.0001（exponentialRampToValueAtTime）
        g = 0.06 * (0.0001 / 0.06) ** (t / d)
        s = int(t0 * RATE)
        buf[s:s + n] += osc(kind, f, t) * g
        t0 += d * 0.8
    return buf


def write_wav(path, buf):
    data = np.clip(buf, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes((data * 32767).astype('<i2').tobytes())


def export_sfx():
    for name, notes in SFX.items():
        write_wav(out('Sounds', 'sfx_' + name + '.wav'), render_sfx(notes))
    return len(SFX)


# ---------------- 字体：只留 Lua 代码和数据里用到的字 ----------------
def export_font():
    from fontTools.ttLib import TTFont
    from fontTools import subset
    chars = set(chr(c) for c in range(32, 127))
    chars.update('…—–·×÷°←→↑↓◀▶▲▼●○■□★☆♥♪“”‘’「」『』（）、。，！？：；《》【】～％＋－')
    for base in (os.path.join(MAKER, 'scripts'), os.path.join(OUT, 'Data')):
        for dp, _, files in os.walk(base):
            for fn in files:
                if fn.endswith(('.lua', '.json')):
                    with open(os.path.join(dp, fn), encoding='utf-8') as f:
                        chars.update(f.read())
    src = os.path.join(ROOT, 'assets', 'fonts', 'fusion-pixel-12px-zh_hans.woff2')
    font = TTFont(src)
    font.flavor = None
    opts = subset.Options()
    opts.layout_features = ['*']; opts.name_IDs = ['*']; opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(c for c in chars if ord(c) >= 32))
    sub.subset(font)
    dst = out('Fonts', 'fusion-pixel-12px.ttf')
    font.save(dst)
    shutil.copyfile(os.path.join(ROOT, 'assets', 'fonts', 'OFL.txt'), out('Fonts', 'fusion-pixel-OFL.txt'))
    return len(chars), os.path.getsize(dst)


# 图片清单：Maker 里图片是边玩边下的（先给占位图），软件画布要读像素，启动时按这份清单等真图下载好
def export_image_list():
    imgs = []
    for dp, _, files in os.walk(OUT):
        for fn in files:
            if fn.lower().endswith('.png'):
                imgs.append(os.path.relpath(os.path.join(dp, fn), OUT).replace(os.sep, '/'))
    imgs.sort()
    with open(out('Data', 'images.json'), 'w', encoding='utf-8') as f:
        json.dump(imgs, f, ensure_ascii=False)
    return len(imgs)


def main():
    d = run_node()
    export_strata(d['strata'])
    export_art(d['art'])
    n_ui = copy_tree(os.path.join(ROOT, 'assets', 'ui'), 'ui', {'.png'})
    shutil.copyfile(os.path.join(ROOT, 'assets', 'sprites', 'hero.png'), out('sprites', 'hero.png'))
    n_au = copy_tree(os.path.join(ROOT, 'assets', 'audio'), 'audio', {'.mp3'})
    n_sfx = export_sfx()
    nc, fs = export_font()
    n_img = export_image_list()
    print(f'strata: {list(d["strata"])}  ui: {n_ui}  audio: {n_au}  sfx: {n_sfx}  font: {nc} chars, {fs // 1024} KB  images: {n_img}')


if __name__ == '__main__':
    main()
