"""BOOK-1 案 C の 挿絵 40 まいを 組む。

使い方:
  python3 docs/art/book-1/tools/compose_book_art.py <書き出した素材の フォルダ> <出す フォルダ> [id ...]
素材（アイコン・タイル・マウス・まきもの・妖怪の 3D の絵）は、試作の 作業場所の bookart-gen.html で 書き出した PNG。
出す物: <id>.png（100×75、とうめい なし）。
"""
import sys
from pathlib import Path

import book_px as B
from book_px import P, GY

S = {}


def scene(fn):
    S[fn.__name__.replace('_', '-')] = fn
    return fn


C = B.char


# ---------------- うごく ----------------
@scene
def move_walk(im):
    B.BG_day(im)
    B.dust(im, 20, GY - 2)
    B.put(im, C('walk', 1, 2, h=34), 30, GY)
    B.arrow(im, 58, 44, 92, 44)
    B.speed_lines(im, 18, 38, 3, 6)
    B.wasd(im, 4, 1)
    B.text(im, 44, 13, '~', P['keyl'])
    B.arrows4(im, 56, 1)


@scene
def move_jump(im):
    B.BG_day(im)
    B.block(im, 60, GY - 18, 'grass')
    B.ground(im)
    B.put(im, C('jump', 2, 3), 40, GY - 22)
    B.arrow(im, 34, GY - 4, 34, 14)
    B.dust(im, 40, GY - 1, 2)
    w = B.key(im, 4, 3, 'SPACE', lit=True)


@scene
def move_look(im):
    B.BG_paper(im)
    # 2 コマ: まえ ／ まわした あと
    for k, x in enumerate((4, 54)):
        B.rect(im, x - 1, 29, 44, 44, P['ink'])
        sub = B.new()
        B.BG_day(sub, gy=60)
        if k == 0:
            B.tile(sub, 'log_side', 18, 30); B.tile(sub, 'log_side', 18, 44)
            B.tile(sub, 'leaves', 10, 16); B.tile(sub, 'leaves', 26, 16); B.tile(sub, 'leaves', 18, 6)
        else:
            for i, (bx, by) in enumerate(((6, 42), (24, 42), (15, 24))):
                B.block(sub, bx, by, 'stone')
        im.alpha_composite(sub.crop((0, 0, 42, 42)), (x, 30))
    B.arrow(im, 47, 50, 53, 50, w=2, head=3)
    B.mouse(im, 44, 4, btn=None)
    B.arrow(im, 40, 12, 22, 12)
    B.arrow(im, 60, 12, 78, 12)


@scene
def move_run(im):
    B.BG_day(im)
    B.dust(im, 6, GY - 1, 4)
    B.dust(im, 14, GY - 4, 2)
    B.put(im, C('run', 2, 2), 24, GY)
    B.arrow(im, 52, 38, 96, 38)
    B.speed_lines(im, 10, 26, 4, 10)
    B.key(im, 4, 3, 'SHIFT', lit=True)
    B.wasd(im, 62, 3)


# ---------------- ほる・おく ----------------
@scene
def dig_hold(im):
    B.BG_day(im)
    B.block(im, 62, GY - 18, 'dirt', crack=2)
    B.put(im, C('idle', 2, 0), 30, GY)
    B.icon(im, 'wood_pickaxe', 44, 26, rot=-30)
    B.mouse(im, 4, 4, 'L')
    B.arrow(im, 20, 12, 30, 12, w=2, head=3)
    # ひびが すすむ 3 コマ（小さな ブロック）
    for k in range(3):
        x = 36 + k * 22
        B.block(im, x, 3, 'dirt', crack=k + 1)
        if k < 2:
            B.arrow(im, x + 19, 12, x + 21, 12, w=1, head=2)


@scene
def dig_crack(im):
    B.BG_day(im, hills=False)
    B.block(im, 6, GY - 18, 'dirt', crack=3)
    B.arrow(im, 27, 50, 36, 50, w=2, head=3)
    B.mouse(im, 40, 34, 'L', rings=2)
    B.arrow(im, 55, 50, 64, 50, w=2, head=3)
    # こわれて かけらが とぶ
    for dx, dy, s in ((70, 38, 4), (80, 30, 3), (88, 42, 4), (76, 48, 3), (92, 34, 2), (84, 52, 3)):
        B.rect(im, dx, dy, s, s, P['d2']); B.rect(im, dx, dy, s, 1, P['d1'])
    B.star(im, 78, 18, big=True)
    B.star(im, 92, 22)


@scene
def dig_place(im):
    B.BG_day(im)
    B.put(im, C('idle', 2, 0), 6, GY)
    B.icon(im, 'dirt', 24, 30)
    B.mouse(im, 4, 4, 'R')
    # ねらった わく → ブロック
    d = B.ImageDraw.Draw(im)
    for i in range(0, 18, 3):
        for (x, y) in ((48 + i, GY - 18), (48 + i, GY - 1), (48, GY - 18 + i), (65, GY - 18 + i)):
            B.rect(im, x, y, 2, 1 if y in (GY - 18, GY - 1) else 2, P['yel'])
    B.arrow(im, 68, 50, 76, 50, w=2, head=3)
    B.block(im, 79, GY - 18, 'dirt')
    B.sparkle(im, 96, 38)


@scene
def dig_select(im):
    B.BG_paper(im)
    # もちものの ならび 9 マス（小さく）
    items = ['wood_pickaxe', 'katana', 'dirt', 'torch', 'tomato']
    x0 = 5
    for i in range(9):
        B.slot(im, x0 + i * 10, 50, 10, lit=(i == 4))
    for i, it in enumerate(items):
        sm = B.asset('icon_' + it).resize((8, 8), B.Image.NEAREST)
        im.alpha_composite(sm, (x0 + 1 + i * 10, 51))
    B.arc_arrow(im, 35, 50, 10, 200, 340)
    B.key(im, 6, 6, '1'); B.text(im, 20, 9, '~'); B.key(im, 28, 6, '9')
    B.mouse(im, 64, 3, btn=None)
    B.rect(im, 68, 4, 4, 5, P['yel']); B.rect(im, 69, 5, 2, 3, P['yel2'])
    B.arrow(im, 82, 6, 82, 0, w=2, head=3)
    B.arrow(im, 82, 12, 82, 19, w=2, head=3)


@scene
def dig_bag(im):
    B.BG_in(im)
    B.put(im, C('idle', 0, 0), 8, GY + 4)
    B.key(im, 6, 4, 'E', lit=True)
    B.arrow(im, 20, 10, 38, 10, w=2, head=3)
    B.panel(im, 42, 3, 54, 54)
    items = ['katana', 'wood_pickaxe', 'kuwa', 'dirt', 'log', 'tomato', 'seed_tomato', 'torch', 'watering_can']
    for i, it in enumerate(items):
        x, y = 45 + (i % 3) * 17, 6 + (i // 3) * 17
        B.slot(im, x, y, 16)
        im.alpha_composite(B.asset('icon_' + it), (x, y))


# ---------------- たたかう ----------------
@scene
def fight_swing(im):
    B.BG_day(im)
    sp = C('katana_kesa', 2, 8)
    B.put(im, sp, 14, GY)
    hx_, hy = B.front_point(sp, 14, GY, 0.35, 0.65)
    B.katana_line(im, hx_ - 1, hy, hx_ + 13, hy + 10)
    yk = B.yokai('karakasa', 34)
    B.put(im, yk, 64, GY)
    B.star(im, 58, 26, big=True); B.star(im, 70, 18); B.star(im, 54, 40)
    B.mouse(im, 4, 4, 'L')


def stance(im, x, which, h=36):
    m = {'jodan': 'katana_walk_jodan', 'chudan': 'katana_walk_chudan', 'gedan': 'katana_walk_gedan'}[which]
    sp = C(m, 2, 0, h=h)
    B.put(im, sp, x, GY)
    return sp


@scene
def fight_stance(im):
    B.BG_day(im, hills=False)
    xs = (4, 36, 68)
    for x, w, (dx, dy) in zip(xs, ('jodan', 'chudan', 'gedan'), ((6, -12), (12, -3), (11, 7))):
        sp = stance(im, x, w)
        hx_, hy = B.front_point(sp, x, GY, 0.4, 0.62)
        B.katana_line(im, hx_ - 1, hy, hx_ - 1 + dx, hy + dy)
    B.arc_arrow(im, 50, 46, 34, 205, 335)
    B.key(im, 4, 3, 'R', lit=True)


@scene
def fight_chudan(im):
    B.BG_day(im)
    sp = C('katana_thrust', 2, 3)
    B.put(im, sp, 10, GY)
    hx_, hy = B.front_point(sp, 10, GY, 0.35, 0.6)
    B.katana_line(im, hx_ - 1, hy, hx_ + 18, hy)
    B.speed_lines(im, 4, 30, 3, 8)
    B.arrow(im, 62, 37, 94, 37)
    B.mouse(im, 4, 4, 'L')


@scene
def fight_jodan(im):
    B.BG_day(im)
    sp = C('katana_kesa', 2, 5)
    B.put(im, sp, 18, GY)
    hx_, hy = B.front_point(sp, 18, GY, 0.0, 0.45)
    B.katana_line(im, hx_ - 1, hy, hx_ - 8, hy - 12)
    B.arc_arrow(im, 42, 40, 30, 250, 400)
    B.mouse(im, 4, 4, 'L')


@scene
def fight_gedan(im):
    B.BG_day(im)
    sp = C('katana_kiriage', 2, 7)
    B.put(im, sp, 22, GY)
    hx_, hy = B.front_point(sp, 22, GY, 0.0, 0.35)
    B.katana_line(im, hx_ - 1, hy, hx_ + 9, hy - 10)
    B.arrow(im, 60, 56, 90, 14)
    B.mouse(im, 4, 4, 'L')


@scene
def fight_naginata(im):
    B.BG_paper(im)
    for row, (wp, reach) in enumerate((('katana', 24), ('naginata', 60))):
        y = 34 + row * 38
        B.rect(im, 0, y, B.W, 2, P['g2'])
        sp = C('idle', 2, 0, h=28)
        B.put(im, sp, 4, y)
        B.icon(im, wp, 18, y - 22)
        B.arrow(im, 24, y - 8, 24 + reach, y - 8, w=2, head=4)
        yk = B.yokai('chochin', 20)
        B.put(im, yk, 28 + reach, y)


@scene
def fight_yumi(im):
    B.BG_paper(im)
    for row, (f, dist) in enumerate(((2, 24), (3, 62))):
        y = 34 + row * 38
        B.rect(im, 0, y, B.W, 2, P['g2'])
        B.put(im, C('bow_shot', 2, f, h=28), 2, y)
        B.dotted(im, 24, y - 16, 24 + dist, y - 12)
        B.icon(im, 'ya', 18 + dist, y - 21)
    B.mouse(im, 84, 2, 'L')


@scene
def fight_armor(im):
    B.BG_in(im)
    for i, it in enumerate(('kabuto', 'yoroi', 'kote', 'suneate')):
        B.icon(im, it, 3 + (i % 2) * 18, 6 + (i // 2) * 20)
    B.mouse(im, 42, 30, 'L', rings=2)
    B.arrow(im, 56, 38, 66, 38, w=2, head=3)
    sp = C('idle', 0, 0)
    B.put(im, sp, 72, GY + 4)
    cx = 72 + sp.width // 2
    im.alpha_composite(B.outline(B.asset('icon_kabuto')), (cx - 9, GY + 4 - sp.height - 6))
    im.alpha_composite(B.outline(B.asset('icon_yoroi')), (cx - 9, GY + 4 - sp.height + 12))
    B.sparkle(im, 96, 10)


@scene
def fight_wear(im):
    B.BG_paper(im)
    for k, (x, frac, col) in enumerate(((6, 1.0, 'grn'), (40, 0.3, 'red'))):
        B.slot(im, x, 20, 26)
        im.alpha_composite(B.outline(B.asset('icon_wood_pickaxe')), (x + 4, 22))
        B.rect(im, x + 2, 44, 22, 4, P['panel2'])
        B.rect(im, x + 3, 45, max(2, round(20 * frac)), 2, P[col])
    B.arrow(im, 33, 32, 39, 32, w=2, head=3)
    B.arrow(im, 68, 32, 76, 32, w=2, head=3)
    B.icon(im, 'hammer', 78, 22)
    B.sparkle(im, 94, 18)


@scene
def fight_night(im):
    B.BG_night(im)
    B.moon(im, 84, 9, 6)
    # おうち（屋根 ＋ かべ ＋ あかりの まど ＋ 戸）
    d = B.ImageDraw.Draw(im)
    d.polygon([(56, 30), (78, 16), (100, 30)], fill=B.hx('#5a6378'))
    B.rect(im, 60, 30, 36, 29, B.hx('#c9a27a'))
    B.rect(im, 70, 40, 10, 19, B.hx('#6e4428'))
    B.rect(im, 84, 36, 8, 7, P['yel'])
    B.put(im, C('walk', 2, 2, h=34), 40, GY)
    B.arrow(im, 50, 22, 66, 22, w=2, head=3)
    yk = B.yokai('chochin', 16)
    B.put(im, yk, 4, GY - 2)


# ---------------- つくる・やく ----------------
def craft_cards(im, x, y, items, lit=None):
    B.panel(im, x, y, 58, 40)
    for i, it in enumerate(items):
        cx, cy = x + 3 + (i % 3) * 18, y + 3 + (i // 3) * 18
        B.slot(im, cx, cy, 17, lit=(it == lit))
        im.alpha_composite(B.asset('icon_' + it), (cx, cy))
    return


@scene
def craft_open(im):
    B.BG_in(im)
    B.key(im, 6, 4, 'E', lit=True)
    B.arrow(im, 20, 10, 32, 10, w=2, head=3)
    craft_cards(im, 36, 8, ['bokuto', 'katana', 'wood_pickaxe', 'kuwa', 'torch', 'hammer'], lit='katana')
    B.sparkle(im, 76, 6)
    B.put(im, C('idle', 0, 0), 6, GY + 4)


@scene
def craft_glow(im):
    B.BG_in(im)
    craft_cards(im, 20, 8, ['bokuto', 'katana', 'wood_pickaxe', 'kuwa', 'torch', 'hammer'], lit='bokuto')
    B.sparkle(im, 20, 6)
    B.hand(im, 28, 24)
    B.rings(im, 38, 50, 1)


@scene
def craft_hammer(im):
    B.BG_paper(im)
    B.slot(im, 6, 20, 30, lit=True)
    im.alpha_composite(B.outline(B.asset('icon_bokuto')), (11, 26))
    B.icon(im, 'hammer', 26, 10)
    B.arrow(im, 42, 35, 60, 35)
    B.icon(im, 'bokuto', 72, 26)
    B.sparkle(im, 70, 22); B.sparkle(im, 92, 44); B.star(im, 88, 18)


@scene
def craft_furnace(im):
    B.BG_in(im)
    B.put(im, C('idle', 2, 0), 4, GY)
    B.icon(im, 'furnace', 50, GY - 18)
    B.fire(im, 55, GY - 10)
    B.fire(im, 52, GY - 26); B.fire(im, 60, GY - 30)
    B.mouse(im, 80, 4, 'R')
    B.arrow(im, 78, 14, 70, 24, w=2, head=3)


@scene
def craft_fuel(im):
    B.BG_in(im)
    for i, it in enumerate(('coal_ore', 'oil', 'log')):
        y = 4 + i * 20
        B.icon(im, it, 4, y)
        B.arrow(im, 24, y + 9, 56, 40, w=2, head=3)
    B.icon(im, 'furnace', 66, 32)
    B.fire(im, 71, 40)
    B.fire(im, 68, 22); B.fire(im, 76, 18)


@scene
def craft_drop(im):
    B.BG_day(im)
    B.put(im, C('idle', 2, 0), 10, GY)
    B.key(im, 4, 3, 'Q', lit=True)
    # 土 1 こ ぽとり（小さな ブロック ＋ うごきの 線）
    B.rect(im, 50, 36, 8, 8, P['d2']); B.rect(im, 50, 36, 8, 2, P['g2'])
    B.rect(im, 49, 35, 10, 1, P['ink']); B.rect(im, 49, 44, 10, 1, P['ink'])
    B.rect(im, 49, 35, 1, 10, P['ink']); B.rect(im, 58, 35, 1, 10, P['ink'])
    for k in range(3):
        B.rect(im, 51 + k * 3, 28 - k, 1, 5, P['white'])
    B.arrow(im, 54, 46, 54, 56, w=2, head=3)
    B.icon(im, 'dirt', 70, GY - 18)
    B.text(im, 90, 46, '1', P['ink'])


@scene
def craft_tansu(im):
    B.BG_in(im)
    d = B.ImageDraw.Draw(im)
    x, y = 50, 16
    B.rect(im, x, y, 40, GY - y, B.hx('#9c6a3c'))
    B.rect(im, x, y, 40, 2, B.hx('#b98a55'))
    for k in range(3):
        B.rect(im, x + 3, y + 5 + k * 13, 34, 10, B.hx('#b98a55'))
        B.rect(im, x + 17, y + 9 + k * 13, 6, 2, P['gold'])
    # ひきだし 1 つ あいた
    B.rect(im, x - 4, y + 5, 38, 11, B.hx('#c9a06a'))
    B.rect(im, x - 4, y + 5, 38, 2, B.hx('#6e4428'))
    for i, it in enumerate(('tomato', 'log', 'stone')):
        B.icon(im, it, 4, 3 + i * 19)
        B.arrow(im, 24, 12 + i * 19, 44, 20, w=2, head=3)


@scene
def craft_log(im):
    B.BG_in(im)
    B.key(im, 6, 4, 'L', lit=True)
    B.icon(im, 'scroll', 6, 22)
    B.arrow(im, 26, 31, 34, 31, w=2, head=3)
    # ひらいた まきもの
    B.rect(im, 38, 10, 58, 44, B.hx('#f6e7c1'))
    B.rect(im, 36, 8, 4, 48, B.hx('#9c6a3c')); B.rect(im, 94, 8, 4, 48, B.hx('#9c6a3c'))
    for k, it in enumerate(('tomato', 'katana', 'dirt')):
        y = 13 + k * 13
        sm = B.asset('icon_' + it).resize((8, 8), B.Image.NEAREST)
        im.alpha_composite(sm, (43, y))
        B.rect(im, 55, y + 3, 34 - k * 6, 2, B.hx('#b9a27a'))


@scene
def craft_nearby(im):
    B.BG_in(im)
    B.put(im, C('idle', 1, 0), 4, GY)
    B.icon(im, 'tansu', 28, GY - 18)
    d = B.ImageDraw.Draw(im)
    d.ellipse((0, 18, 52, 70), outline=P['gold2'])
    B.dotted(im, 46, 34, 66, 22)
    B.panel(im, 64, 6, 34, 34)
    B.icon(im, 'hammer', 72, 14)
    B.sparkle(im, 92, 10)


# ---------------- そだてる ----------------
@scene
def grow_till(im):
    B.BG_day(im, hills=False)
    B.icon(im, 'kuwa', 4, 4)
    B.mouse(im, 24, 5, 'R')
    B.block(im, 10, GY - 18, 'grass')
    B.arrow(im, 32, 50, 46, 50, w=2, head=3)
    B.block(im, 50, GY - 18, 'farm')
    B.sparkle(im, 68, 38)
    # すみ: 手 ＋ 3 かい
    B.hand(im, 78, 6, point=False)
    B.rings(im, 76, 18, 3)


@scene
def grow_sow(im):
    B.BG_day(im, hills=False)
    B.icon(im, 'seed_tomato', 4, 4)
    B.mouse(im, 24, 5, 'R')
    B.block(im, 48, GY - 18, 'farm')
    for x in (51, 57, 63):
        B.rect(im, x - 1, GY - 22, 5, 4, P['ink'])
        B.rect(im, x, GY - 21, 3, 2, B.hx('#f2e2a8'))
    B.arrow(im, 30, 26, 50, 36, w=2, head=3)


@scene
def grow_wet(im):
    B.BG_day(im)
    B.block(im, 0, GY - 18, 'water')
    B.block(im, 18, GY - 18, 'farmwet')
    B.block(im, 72, GY - 18, 'farm')
    B.tile(im, 'crop_tomato_2', 19, GY - 34)
    B.tile(im, 'crop_tomato_0', 73, GY - 34)
    B.drop(im, 34, GY - 40); B.drop(im, 4, GY - 26)


@scene
def grow_harvest(im):
    B.BG_day(im, hills=False)
    B.block(im, 4, GY - 18, 'farm')
    B.tile(im, 'crop_tomato_3', 5, GY - 34)
    B.block(im, 4 + 18, GY - 18, 'farm')
    B.tile(im, 'crop_tomato_1', 23, GY - 34)
    B.text(im, 28, GY - 44, '?', P['ink'])
    B.mouse(im, 8, 4, 'L')
    B.arrow(im, 46, 40, 62, 40, w=2, head=3)
    B.hand(im, 70, 40, point=False)
    B.icon(im, 'tomato', 72, 24)
    B.sparkle(im, 92, 22)


@scene
def grow_eat(im):
    B.BG_paper(im)
    B.icon(im, 'onion', 4, 8); B.icon(im, 'tomato', 4, 28)
    B.mouse(im, 26, 20, 'R')
    B.arrow(im, 42, 28, 54, 28, w=2, head=3)
    for i in range(4):
        B.heart(im, 58 + (i % 2) * 10, 14 + (i // 2) * 10, full=True)
    B.sparkle(im, 84, 12)


@scene
def grow_seeds(im):
    B.BG_paper(im)
    cells = [(1, 1), (51, 1), (1, 38), (51, 38)]
    for k, (x, y) in enumerate(cells):
        sub = B.new()
        B.BG_day(sub, gy=56, hills=False)
        if k == 0:
            B.tile(sub, 'kakashi_head', 12, 18); B.tile(sub, 'kakashi', 12, 34)
            B.block(sub, 0, 38, 'farm'); B.block(sub, 30, 38, 'farm')
        elif k == 1:
            B.tile(sub, 'wild_tomato', 14, 22)
            B.icon(sub, 'seed_tomato', 30, 10)
        elif k == 2:
            # 草を こわす: 草の かぶ ＋ ひび ＋ ほし
            for gx in range(8, 24, 3):
                B.rect(sub, gx, 40 - (gx % 5) - 6, 2, (gx % 5) + 6, P['g2'] if gx % 2 else P['g3'])
            B.star(sub, 22, 22)
            B.crack_lines(sub, 6, 30, 1)
            B.icon(sub, 'seed_onion', 28, 8)
        else:
            yk = B.yokai('karakasa', 24)
            B.put(sub, yk, 4, 54)
            B.icon(sub, 'seed_pumpkin', 26, 18)
        im.alpha_composite(sub.crop((0, 18, 48, 54)), (x, y))
        B.rect(im, x, y + 36, 48, 1, P['gold2'])


@scene
def grow_light(im):
    B.rect(im, 0, 0, 50, 75, P['sky'])
    B.ground(im, GY, 0, 50)
    sub = B.new()
    B.BG_night(sub)
    im.alpha_composite(sub.crop((50, 0, 100, 75)), (50, 0))
    B.rect(im, 49, 0, 2, 75, P['gold2'])
    B.sun(im, 14, 12)
    B.block(im, 16, GY - 18, 'farm', clip=(0, 50))
    B.tile(im, 'crop_tomato_2', 17, GY - 34)
    B.moon(im, 90, 10, 5)
    B.block(im, 68, GY - 18, 'farm')
    B.tile(im, 'crop_tomato_2', 69, GY - 34)
    B.icon(im, 'torch', 84, GY - 22)
    B.arrow(im, 40, 34, 40, 22, w=2, head=3)
    B.arrow(im, 62, 34, 62, 22, w=2, head=3)


@scene
def grow_can_fill(im):
    B.BG_day(im, hills=False)
    B.block(im, 50, GY - 18, 'water'); B.block(im, 68, GY - 18, 'water')
    B.icon(im, 'watering_can', 56, 18)
    B.drop(im, 62, 34); B.drop(im, 70, 30)
    B.mouse(im, 6, 6, 'R')
    B.arrow(im, 22, 16, 50, 24, w=2, head=3)


@scene
def grow_can_water(im):
    B.BG_day(im, hills=False)
    B.icon(im, 'watering_can', 22, 14, flip=True)
    for x, y in ((24, 34), (30, 40), (36, 34)):
        B.drop(im, x, y)
    B.block(im, 20, GY - 18, 'farmwet')
    B.mouse(im, 4, 4, 'R')
    B.sun(im, 80, 16)
    B.text(im, 77, 30, '1', P['ink'])
    B.block(im, 60, GY - 18, 'farmwet')


@scene
def grow_sprinkler(im):
    B.BG_day(im, hills=False)
    for x in (5, 23, 59, 77):
        B.block(im, x, GY - 18, 'farmwet')
    B.icon(im, 'sprinkler', 41, GY - 18)
    d = B.ImageDraw.Draw(im)
    for r in (14, 22):
        d.arc((50 - r, 32 - r, 50 + r, 32 + r), 200, 340, fill=P['water'], width=2)
    for x, y in ((24, 26), (70, 26), (14, 36), (82, 36)):
        B.drop(im, x, y)


@scene
def grow_pet(im):
    B.BG_day(im, hills=False)
    B.block(im, 40, GY - 18, 'farm')
    B.tile(im, 'crop_tomato_3', 41, GY - 34)
    # にっこり（目 ＋ くち）
    B.px(im, 46, GY - 24, P['line']); B.px(im, 51, GY - 24, P['line'])
    B.rect(im, 47, GY - 21, 4, 1, P['line'])
    B.hand(im, 46, 14, point=False)
    B.arc_arrow(im, 50, 18, 10, 200, 340)
    B.mouse(im, 4, 4, 'R')
    B.heart(im, 70, 18); B.heart(im, 80, 28)


@scene
def grow_bucket(im):
    B.BG_day(im, hills=False)
    B.block(im, 0, GY - 18, 'water')
    B.icon(im, 'bucket', 2, 18)
    B.arrow(im, 22, 26, 34, 26, w=2, head=3)
    B.icon(im, 'water_bucket', 36, 18)
    B.arrow(im, 56, 26, 64, 36, w=2, head=3)
    B.block(im, 60, GY - 18, 'water')
    B.block(im, 78, GY - 18, 'farmwet')
    B.drop(im, 84, GY - 26)


ORDER = ['move-walk', 'move-jump', 'move-look', 'move-run', 'dig-hold', 'dig-crack', 'dig-place', 'dig-select', 'dig-bag',
         'fight-swing', 'fight-stance', 'fight-chudan', 'fight-jodan', 'fight-gedan', 'fight-naginata', 'fight-yumi', 'fight-armor', 'fight-wear', 'fight-night',
         'craft-open', 'craft-glow', 'craft-hammer', 'craft-furnace', 'craft-fuel', 'craft-drop', 'craft-tansu', 'craft-log', 'craft-nearby',
         'grow-till', 'grow-sow', 'grow-wet', 'grow-harvest', 'grow-eat', 'grow-seeds', 'grow-light', 'grow-can-fill', 'grow-can-water', 'grow-sprinkler', 'grow-pet', 'grow-bucket']


def main():
    B.ASSETS = Path(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    ids = sys.argv[3:] or ORDER
    assert len(ORDER) == 40 and set(ORDER) == set(S), set(ORDER) ^ set(S)
    for i in ids:
        im = B.new()
        S[i](im)
        B.finish(im).convert('RGB').save(out / f'{i}.png', optimize=True)
    print(len(ids), 'まい')


if __name__ == '__main__':
    main()
