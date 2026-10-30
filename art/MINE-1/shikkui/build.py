"""MINE-1B しっくい（`shikkui`）16×16。`docs/art/design/07-mine.md` §20.5 ・ designs.py.txt の opt_a（plaster）の まま。
地 #E8E2D1・こての あと #EFEADD／#D4CBB7（seed 141・18 こ）。上の はし 1 行と 左の はし 1 列が 目地 #C9BFA9（ならべると 目地の 線に なる）。calm しない（人が 作った 平らな 箱）。
あたたかい 白（ゆき #D2E8F5 の 青い 白・いし と ちがう）。
実行: python3 art/MINE-1/shikkui/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'common'))
from mine import *  # noqa: E402,F401


def tile():
    t = speckle(PLASTER['base'], [PLASTER['lt'], PLASTER['dk']], 141, 18)
    t[0, :] = hx(PLASTER['line'])
    t[:, 0] = hx(PLASTER['line'])
    return t


if __name__ == '__main__':
    t = tile()
    save_tile(t, os.path.join(HERE, 'shikkui_1x.png'))
    write_rows(os.path.join(HERE, 'shikkui_rows.txt'), [('shikkui', t, None)])
    preview(os.path.join(HERE, 'preview.png'), 'shikkui（しっくい）  ・ 地 #E8E2D1 ・ 目地 #C9BFA9（上と 左の はし 1 点）・ seed 141', [('shikkui_1x.png', t, None)])
    report('shikkui', t)
