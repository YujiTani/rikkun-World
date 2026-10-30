"""MINE-1B せきたん（`coal_ore`）の 遠く用 16×16（16 ブロックより 遠くで 使う 平らな 絵。持ち物の アイコンにも 使う。いまの coal_ore の 絵と 置きかえ）。
B「とびだす つぶ」の ならび（designs.py.txt の coal_layout）を 16 点に うつした もの。地の 石 = ゲームの いまの `stone`（seed 33）。
つぶ = うすい 板（3×1 小ブロック → 5×2 点）3 まい。左はしの 2 点が つや #5E5869、のこりが #3A3442（下の 層 #2B2632 は 横から しか 見えない ので 絵に 使わない）。
ならびは coal_layout の 1 つめ（(1,1)・(5,4)・(1,6)）。影・ふち線 なし。calm しない（さがす 目じるし）。
実行: python3 art/MINE-1/coal_ore/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
import ore  # noqa: E402
from mine import *  # noqa: E402,F401

if __name__ == '__main__':
    t = ore.coal(0)
    save_tile(t, os.path.join(HERE, 'coal_ore_1x.png'))
    write_rows(os.path.join(HERE, 'coal_ore_rows.txt'), [('coal_ore', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'coal_ore（せきたん・遠く用）  ・ 石の 地 ＋ 黒い 板 3 まい',
            [('coal_ore_1x.png（あたらしい）', t, None), ('いまの coal_ore（ゲーム。おきかえる）', cur_coal(), None)])
    report('coal_ore', t)
