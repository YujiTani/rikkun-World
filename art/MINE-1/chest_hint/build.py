"""MINE-1B ヒントの たからばこ（`chest_hint`）16×16。照準の 下の ヒント「あける」に 出す 宝箱の 絵（仕様 MINE-1 §3.1。たんす・かまどの「ひらく」と 同じ 出し方）。
宝箱 v2 の 形（`docs/art/design/07-mine.md` §20.7・chest2.py.txt）を **前から 少し 上の むき**に した もの。**段階 1「きの たからばこ」の 色で 1 まいだけ**（段ごとに かえない。PO 決め）。
1 小ブロック = 1 点（からだ はば 16・高さ 4、ふた 高さ 3）。上の 帯 2 行（ふたの 上の 面。かどを けずって かまぼこ）＋ ふたの 前 3 行 ＋ ふたと からだの さかい 1 行 ＋ からだ 4 行 = 10 行（y=3〜12）。
色（chest2.py の PAL[1] と 同じ。新しい 色なし）: からだ #9A5E32・ふた #A8693A・てつの おび #4A4650（x=3・12 の たて 1 点。ふたの 上の 帯から からだの 下まで）・
かけがねの 板 #5E5A66（2×3 点。ふたから たれる）・かぎあな #1E1C22（2×1 点）・さかいの 線 #5E3A1E（中の 色。ふたと からだを 分ける。ふち線では ない）。
すける 背景（ヒントの 下じきは 暗い 紺 #10141F）。ふち線・影 なし。6 色。
実行: python3 art/MINE-1/chest_hint/build.py
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
from mine import *  # noqa: E402,F401

PAL = dict(W=CHEST1['wood'], L=CHEST1['lid'], S=CHEST1['strap'], P=CHEST1['plate'], K=CHEST1['hole'], I=CHEST1['inside'])

ROWS = [
    '................',
    '................',
    '................',
    '..LSLLLLLLLLSL..',   # 3: ふたの 上の 面（せまい。x 2〜13）
    '.LLSLLLLLLLLSLL.',   # 4: ふたの 上の 面（ひろい。x 1〜14）
    'LLLSLLLLLLLLSLLL',   # 5: ふたの 前
    'LLLSLLLPPLLLSLLL',   # 6
    'LLLSLLLPPLLLSLLL',   # 7
    'IIISIIIPPIIISIII',   # 8: ふたと からだの さかい
    'WWWSWWWKKWWWSWWW',   # 9: からだ（かぎあな）
    'WWWSWWWWWWWWSWWW',   # 10
    'WWWSWWWWWWWWSWWW',   # 11
    'WWWSWWWWWWWWSWWW',   # 12
    '................',
    '................',
    '................',
]


def tile():
    rgb = np.zeros((T, T, 3), np.int32)
    alpha = np.zeros((T, T), np.int32)
    for y, row in enumerate(ROWS):
        assert len(row) == T, (y, len(row))
        for x, ch in enumerate(row):
            if ch in PAL:
                rgb[y, x] = hx(PAL[ch])
                alpha[y, x] = 255
    return rgb, alpha


if __name__ == '__main__':
    rgb, alpha = tile()
    save_tile(rgb, os.path.join(HERE, 'chest_hint_1x.png'), alpha)
    write_rows(os.path.join(HERE, 'chest_hint_rows.txt'), [('chest_hint', rgb, alpha)])
    preview(os.path.join(HERE, 'preview.png'), 'chest_hint（ヒントの たからばこ）  ・ 段階 1 の 色 ・ 前から 少し 上 ・ すける 背景', [('chest_hint_1x.png', rgb, alpha)], repeat=False)
    report('chest_hint', rgb, alpha)
