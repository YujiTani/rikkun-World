"""MINE-1B ほたるいし（`hotaruishi`）の 遠く用 16×16（16 ブロックより 遠くで 使う 平らな 絵。持ち物の アイコンにも 使う）。
B「とびだす つぶ」の ならび（designs.py.txt の hot_layout）を 16 点に うつした もの。**地は ほたるいし だけ こい 青灰** #5E6672（まだら #535A66／#6A7380・seed 161・34 こ・calm）。
つぶ = ほたるの むれ 5 つ。1 つ = 芯 1 マス（#EEF8B2）＋ まわりの 3×3 の わ（十字 #C9E56E・かど #93BD52）→ 5×5 点（四すみの 外がわ 1 点だけ けずって まるく）。
ならびは hot_layout の 2 つめ（芯 (2,1)・(6,1)・(1,4)・(5,5)・(2,7)。わどうしが かさならない）。影・ふち線 なし。calm しない。
光る 強さ（芯 1.0・十字 0.85・かど 0.55）は 絵の 色で 分かる（同じ 色の 点が 光る 点）。
実行: python3 art/MINE-1/hotaruishi/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
import ore  # noqa: E402
from mine import *  # noqa: E402,F401

if __name__ == '__main__':
    t = ore.hotaru(1)
    save_tile(t, os.path.join(HERE, 'hotaruishi_1x.png'))
    write_rows(os.path.join(HERE, 'hotaruishi_rows.txt'), [('hotaruishi', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'hotaruishi（ほたるいし・遠く用）  ・ こい 青灰の 地 ＋ ほたるの むれ 5 つ',
            [('hotaruishi_1x.png', t, None)])
    report('hotaruishi', t)
