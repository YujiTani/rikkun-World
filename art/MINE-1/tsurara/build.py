"""MINE-1B つらら（`tsurara`）16×16（十字の 板の 絵。すける 背景）。`docs/art/design/07-mine.md` §20.6 ・ designs.py.txt の opt_a（icicle_plate）の まま。
細い 3 本（左から x=1・6・10。はば 4→2・3→2・4→2、長さ 12・8・10 行。天井の 下に 上から ぶらさがる）。
根もと（いちばん 上の 行）#C9C1B2・からだ #D9E3E6・左はし #E9EEEE・右はし #AEBFC8・**先の 2 行 #F4F9FA（はば 2 の 白く まるい 先。1 点の とがった 先に しない）**。
実行: python3 art/MINE-1/tsurara/build.py
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
from mine import *  # noqa: E402,F401

ICICLES = [(1, [4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2]), (6, [3, 3, 3, 3, 2, 2, 2, 2]), (10, [4, 4, 3, 3, 3, 3, 3, 2, 2, 2])]


def plate(icicles=ICICLES):
    """icicles = [(左の x, [上から 1 行ずつの はば])]。左の はし = 明るい、右の はし = 影、上 = 根もと、下の 2 行 = 白い 先（はば 2 いじょう）"""
    ic = np.zeros((T, T, 4), np.int32)
    for x0, widths in icicles:
        w0 = widths[0]
        n = len(widths)
        for y, w in enumerate(widths):
            s0 = x0 + (w0 - w + 1) // 2
            for i in range(w):
                if y == 0:
                    col = ICE['root']
                elif y >= n - 2:
                    col = ICE_TIP
                elif i == 0 and w >= 3:
                    col = ICE['lt']
                elif i == w - 1 and w >= 2:
                    col = ICE['sh']
                else:
                    col = ICE['main']
                ic[y, s0 + i] = (*hx(col), 255)
    return ic


if __name__ == '__main__':
    ic = plate()
    rgb, alpha = ic[..., :3], ic[..., 3]
    save_tile(rgb, os.path.join(HERE, 'tsurara_1x.png'), alpha)
    write_rows(os.path.join(HERE, 'tsurara_rows.txt'), [('tsurara', rgb, alpha)])
    preview(os.path.join(HERE, 'preview.png'), 'tsurara（つらら）  ・ 十字の 板 ・ 三角形 8 ・ すける 背景（市松 ／ ヒントの 下じき）', [('tsurara_1x.png', rgb, alpha)])
    report('tsurara', rgb, alpha)
    # 先の 2 行が はば 2 以上（1 点の とがった 先に なって いない）
    for x0, widths in ICICLES:
        assert widths[-1] >= 2 and widths[-2] >= 2
