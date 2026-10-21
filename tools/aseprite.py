# 找到 Aseprite 的可执行文件并在批处理模式下调用它（build_hero.py / import_hero.py 共用）
# 优先用环境变量 ASEPRITE，其次 PATH，再其次常见安装位置（Steam / 官方安装包）
import os, shutil, subprocess

CANDIDATES = [
    r'C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe',
    r'C:\Program Files\Steam\steamapps\common\Aseprite\Aseprite.exe',
    r'C:\Program Files\Aseprite\Aseprite.exe',
]


def exe():
    for p in [os.environ.get('ASEPRITE'), shutil.which('aseprite'), *CANDIDATES]:
        if p and os.path.isfile(p): return p
    raise SystemExit('找不到 Aseprite：请设置环境变量 ASEPRITE 指向 Aseprite.exe')


def run(*args):
    r = subprocess.run([exe(), '-b', *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode: raise SystemExit(f'Aseprite 出错（{r.returncode}）：\n{r.stdout}\n{r.stderr}')
    return r.stdout
