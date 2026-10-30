"""MINE-1 の 16×16 の 絵を ぜんぶ 作りなおす（各 build.py → 見本シート）。

使い方: python3 -B -I art/MINE-1/build_all.py
  - 絵: art/MINE-1/<名前>/<名前>_1x.png（16×16・1 倍）と preview.png と *_rows.txt
  - 見本: docs/art/mine-1/tiles-sheet.png・tiles-compare.png・tiles-check-1〜3-*.png
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = ['nendo', 'sekkaiseki', 'shikkui', 'kodo_waku', 'tsurara',
         'coal_ore', 'iron_ore', 'kin_ore', 'suisho_ore', 'hotaruishi', 'diamond_ore',
         'chest_hint', 'sheets']

for name in ORDER:
    path = os.path.join(HERE, name, 'build.py')
    r = subprocess.run([sys.executable, '-B', '-I', path], capture_output=True, text=True)
    status = 'OK ' if r.returncode == 0 else 'NG '
    print(status + name)
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr)
        sys.exit(1)
