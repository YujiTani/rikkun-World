"""MINE-1B てつ（`iron_ore`）の 遠く用 16×16（16 ブロックより 遠くで 使う 平らな 絵。持ち物の アイコンにも 使う。いまの iron_ore の 絵と 置きかえ）。
B「とびだす つぶ」の ならび（designs.py.txt の iron_layout）を 16 点に うつした もの。地の 石 = ゲームの いまの `stone`（seed 33）。
つぶ = まるい こぶ 2 つ（3×3 小ブロック → 5×5 点）。＋ の 形が 明るい（まん中 #CC8452・うで #A85E38）、四すみは 下の 層 #82462A。
四すみの 外がわ 1 点だけ けずって まるく した（元の 5×5 の 四角も 作れる: common/ore.py の LUMP）。ならびは iron_layout の 3 つめ（(1,5)・(5,1)）。影・ふち線 なし。calm しない。
実行: python3 art/MINE-1/iron_ore/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
import ore  # noqa: E402
from mine import *  # noqa: E402,F401

if __name__ == '__main__':
    t = ore.iron(2)
    save_tile(t, os.path.join(HERE, 'iron_ore_1x.png'))
    write_rows(os.path.join(HERE, 'iron_ore_rows.txt'), [('iron_ore', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'iron_ore（てつ・遠く用）  ・ 石の 地 ＋ さびいろの こぶ 2 つ',
            [('iron_ore_1x.png（あたらしい）', t, None), ('いまの iron_ore（ゲーム。おきかえる）', cur_iron(), None)])
    report('iron_ore', t)
