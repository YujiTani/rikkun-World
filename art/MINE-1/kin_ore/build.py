"""MINE-1B きんの いし（`kin_ore`）の 遠く用 16×16（16 ブロックより 遠くで 使う 平らな 絵。持ち物の アイコンにも 使う）。
B「とびだす つぶ」の ならび（designs.py.txt の gold_layout）を 16 点に うつした もの。地の 石 = ゲームの いまの `stone`（seed 33）。
つぶ = 小さな 粒 3 つ（2×2 小ブロック → 4×4 点 が 2 つ、1×1 → 2×2 点 が 1 つ）。左上の 1 マス（2×2 点）が 光 #FFF0B4、のこりが #EBB840（下の 層 #C98A1E は 絵に 使わない）。
ならびは gold_layout の 1 つめ（(1,1,2)・(5,5,2)・(2,6,1)）。影・ふち線 なし。calm しない。
実行: python3 art/MINE-1/kin_ore/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
import ore  # noqa: E402
from mine import *  # noqa: E402,F401

if __name__ == '__main__':
    t = ore.gold(0)
    save_tile(t, os.path.join(HERE, 'kin_ore_1x.png'))
    write_rows(os.path.join(HERE, 'kin_ore_rows.txt'), [('kin_ore', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'kin_ore（きんの いし・遠く用）  ・ 石の 地 ＋ 小さな 金の 粒 3 つ',
            [('kin_ore_1x.png', t, None)])
    report('kin_ore', t)
