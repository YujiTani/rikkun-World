"""MINE-1B すいしょうの いし（`suisho_ore`）の 遠く用 16×16（16 ブロックより 遠くで 使う 平らな 絵。持ち物の アイコンにも 使う）。
B「とびだす つぶ」の ならび（designs.py.txt の cry_layout）を 16 点に うつした もの。地の 石 = ゲームの いまの `stone`（seed 33）。
つぶ = 太い はしら 1 本（2×2 小ブロック → 4×4 点。左上が 光 #E0F7FC、のこりが #8CDAF2）＋ 細い はしら 3 本（1×1 → 2×2 点。先の 光 #E0F7FC）。
くぼみ（ほら）は 地の 石の 色の まま なので 絵には 出ない（影を 描かない。ゲームの 面の 明るさで 出る）。下の 層 #55A6D2 は 絵に 使わない。
ならびは cry_layout の 2 つめ（太い はしらの 左上 (3,2)。細い はしらは そこから (+3,0)・(+2,+3)・(0,+3)）。ふち線 なし。calm しない。
実行: python3 art/MINE-1/suisho_ore/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
import ore  # noqa: E402
from mine import *  # noqa: E402,F401

if __name__ == '__main__':
    t = ore.crystal(1)
    save_tile(t, os.path.join(HERE, 'suisho_ore_1x.png'))
    write_rows(os.path.join(HERE, 'suisho_ore_rows.txt'), [('suisho_ore', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'suisho_ore（すいしょうの いし・遠く用）  ・ 石の 地 ＋ 水色の はしら 4 本',
            [('suisho_ore_1x.png', t, None)])
    report('suisho_ore', t)
