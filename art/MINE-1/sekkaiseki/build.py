"""MINE-1B せっかいせき（`sekkaiseki`）16×16。`docs/art/design/07-mine.md` §20.5 ・ designs.py.txt の opt_a（lime）の まま。
地 #D3CCBE・まだら #BAB1A0／#DED8CC（seed 131・24 こ）。なみの しま 2 本（#BAB1A0。y=5〜6 と y=12〜13 を 3 点・4 点ごとに 上下）＋ 小さな かいがら 2 つ（#A59B89。(9,1) と (2,8)）。calm。
形は ゲームの いまの いし と 同じ（6・3・7）で 開発が 作る。
実行: python3 art/MINE-1/sekkaiseki/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
from mine import *  # noqa: E402,F401


def tile():
    t = speckle(LIME['base'], [LIME['dk'], LIME['lt']], 131, 24)
    for x in range(T):
        t[5 + ((x // 3) % 2), x] = hx(LIME['dk'])
        t[12 + (((x + 1) // 4) % 2), x] = hx(LIME['dk'])
    stamp(t, 9, 1, ['.SS.', 'S..S'], {'S': LIME['sh']})
    stamp(t, 2, 8, ['.SS.', 'S..S'], {'S': LIME['sh']})
    return calm(t, LIME['base'])


if __name__ == '__main__':
    t = tile()
    save_tile(t, os.path.join(HERE, 'sekkaiseki_1x.png'))
    write_rows(os.path.join(HERE, 'sekkaiseki_rows.txt'), [('sekkaiseki', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'sekkaiseki（せっかいせき）  ・ 地 #D3CCBE ・ calm 0.5／0.8 ・ seed 131', [('sekkaiseki_1x.png', t, None)])
    report('sekkaiseki', t)
