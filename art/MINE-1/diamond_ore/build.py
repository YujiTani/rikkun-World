"""MINE-1B ダイヤの いし（`diamond_ore`）の 遠く用 16×16（16 ブロックより 遠くで 使う 平らな 絵。持ち物の アイコンにも 使う）。
B「とびだす つぶ」の ならび（designs.py.txt の dia_layout）を 16 点に うつした もの。地の 石 = ゲームの いまの `stone`（seed 33）。
つぶ = ひし形の 石 1 つ（|u|＋|v| ≦ 2 の 13 マス。1 マス = 2 点 四方 → 10×10 点）＋ 1×1 の かけら 1 つ（2×2 点）。
ひし形の 中: 左上 = 光 #FBFDFF・ななめの 列 = 地 #E3E8F8・右下 = かげ #AEB6DE、右上に ピンク #FFD3EA・左下に きいろ #FFF1B0 の きらっ（1 マス ずつ）。下の 層 #7880B8 は 絵に 使わない。
ならびは dia_layout の 3 つめ（ひし形の まん中 (4,5)・かけら (7,1)）。ダイヤは 光らない。影・ふち線 なし。calm しない。
実行: python3 art/MINE-1/diamond_ore/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
import ore  # noqa: E402
from mine import *  # noqa: E402,F401

if __name__ == '__main__':
    t = ore.diamond(2)
    save_tile(t, os.path.join(HERE, 'diamond_ore_1x.png'))
    write_rows(os.path.join(HERE, 'diamond_ore_rows.txt'), [('diamond_ore', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'diamond_ore（ダイヤの いし・遠く用）  ・ 石の 地 ＋ 白と うすい むらさきの ひし形',
            [('diamond_ore_1x.png', t, None)])
    report('diamond_ore', t)
