"""MINE-1B 坑道の わく（`kodo_waku`）16×16 ×2（横の 面・上下の 面）。`docs/art/design/07-mine.md` §20.5 ・ designs.py.txt の opt_a（frame）の まま。
横: 木 #B58650（まだら #C79A62／#A87A46・seed 151・30 こ）・木目 3 本 #A47544（x=3・8・12。5 点に 1 点 あける）・まん中に 鉄の おび（y=6〜8 #4A4650、まん中の 行 y=7 #5E5A66）・
びょう #2E2C34（y=7 の x=2・13）・ふち 1 点 #6B4421。calm しない（人が 作った 平らな 箱）。
上下: 木口（四角の 年輪 #A47544。まん中から 3 点ごと）＋ ふち #6B4421。
形は 開発が（道の かべ・天井に うめて 柱 2 本 ＋ はり。上・下の 面 = 木口、横の 面 = 横の 絵）。
実行: python3 art/MINE-1/kodo_waku/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
from mine import *  # noqa: E402,F401


def frame_tile(top):
    t = speckle(WOOD['beam'], [WOOD['lt'], '#A87A46'], 151, 30)
    if top:
        for y in range(T):
            for x in range(T):
                dd = max(abs(x - 7.5), abs(y - 7.5))
                if int(dd) % 3 == 0 and dd < 7:
                    t[y, x] = hx('#A47544')
    else:
        for x in (3, 8, 12):
            for y in range(T):
                if (y + x) % 5 != 0:
                    t[y, x] = hx('#A47544')
        t[6:9, :] = hx('#4A4650')
        t[7, :] = hx('#5E5A66')
        for x in (2, 13):
            t[7, x] = hx('#2E2C34')
    t[0, :] = hx(WOOD['post'])
    t[15, :] = hx(WOOD['post'])
    t[:, 0] = hx(WOOD['post'])
    t[:, 15] = hx(WOOD['post'])
    return t


if __name__ == '__main__':
    side, top = frame_tile(False), frame_tile(True)
    save_tile(side, os.path.join(HERE, 'kodo_waku_side_1x.png'))
    save_tile(top, os.path.join(HERE, 'kodo_waku_top_1x.png'))
    write_rows(os.path.join(HERE, 'kodo_waku_rows.txt'), [('kodo_waku_side（横の 面）', side, None), ('kodo_waku_top（上・下の 面）', top, None)])
    preview(os.path.join(HERE, 'preview.png'), 'kodo_waku（坑道の わく）  ・ 木 #B58650 ・ 鉄の おび #4A4650 ・ ふち #6B4421 ・ seed 151',
            [('kodo_waku_side_1x.png（横）', side, None), ('kodo_waku_top_1x.png（上・下）', top, None)])
    report('kodo_waku_side', side)
    report('kodo_waku_top', top)
