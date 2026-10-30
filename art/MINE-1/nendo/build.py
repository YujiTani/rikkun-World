"""MINE-1B ねんど（`nendo`）16×16。`docs/art/design/07-mine.md` §20.5 ・ designs.py.txt の opt_a（ねんど）の まま。
地 #B07048・まだら #C4845A／#975F3D（seed 121・20 こ）。よこの すじ 4 本 = 明るい 2（y=4 の x 1〜7、y=5 の x 9〜14）＋ こい 2（y=11 の x 0〜5、y=12 の x 7〜13）。
左右に ずらして 地層に。ぜんぶ calm（0.5・0.8）。形は ゲームの いまの つち と 同じ ごつごつ（4・2・ふち 5）で 開発が 作る。
実行: python3 art/MINE-1/nendo/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
from mine import *  # noqa: E402,F401


def tile():
    t = speckle(CLAY['base'], [CLAY['lt'], CLAY['dk']], 121, 20)
    for x in range(1, 8):
        t[4, x] = hx(CLAY['lt'])
    for x in range(9, 15):
        t[5, x] = hx(CLAY['lt'])
    for x in range(0, 6):
        t[11, x] = hx(CLAY['dk'])
    for x in range(7, 14):
        t[12, x] = hx(CLAY['dk'])
    return calm(t, CLAY['base'])


if __name__ == '__main__':
    t = tile()
    save_tile(t, os.path.join(HERE, 'nendo_1x.png'))
    write_rows(os.path.join(HERE, 'nendo_rows.txt'), [('nendo', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'nendo（ねんど）  ・ 地 #B07048 ・ calm 0.5／0.8 ・ seed 121', [('nendo_1x.png', t, None)])
    report('nendo', t)
