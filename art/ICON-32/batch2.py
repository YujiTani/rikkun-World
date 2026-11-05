"""ICON-32 バッチ 2: のこり 48 点（食べもの・素材・家具・家の ブロック・あかり・植物）。v5 の きまり（見下ろし・5 段の 色・ふち線＋リム光・1x で 読める）。"""
import math, json, os
from lib import *
import misc as M

HERE = os.path.dirname(os.path.abspath(__file__))
PAPER = R('5a4a3a', '9a8466', 'd2bd94', 'ecdcb6', 'fff6dc')
ORANGE = R('5a2010', 'a8441a', 'e8781e', 'ffa83a', 'ffd890')
EGGPL = R('1e1030', '3e1a5e', '6a2e96', '9a52c8', 'd2a0f0')
ONION = R('6a4a2a', 'b08a5a', 'e6cfa0', 'f6ead0', 'fffaf0')
CLAY = R('4a2418', '7e4228', 'b0663e', 'd48e5e', 'f0bc8a')
PINKM = R('6a2a38', 'b05a6a', 'e898a0', 'f8c0c4', 'fff0f0')
WORM = R('5a2030', 'a04050', 'e07a7a', 'f8a8a0', 'ffe0d8')
REDP = R('4a0e14', '8e1a22', 'd83030', 'f86a50', 'ffc0a0')     # ちょうちん・おまもりの 赤
BLUEP = R('1a2a5a', '2a4a9a', '4a7ad0', '8ab4f0', 'd8ecff')    # せっけいず・やね
STRAW = R('5a4020', '8e6a34', 'c8a050', 'e8c878', 'fff0b8')
GOLDEN = GOLD

def iso(X, Y, Z, cx=16, cy=12):
    return (cx + (X - Y), cy + (X + Y) / 2 - Z)

def box(c, ramp, X, Y, Z, w, d, h, t=(3, 2, 1), cx=16, cy=12):
    P = lambda a, b, z: iso(a, b, z, cx, cy)
    top = [P(X, Y, Z + h), P(X + w, Y, Z + h), P(X + w, Y + d, Z + h), P(X, Y + d, Z + h)]
    left = [P(X, Y + d, Z), P(X + w, Y + d, Z), P(X + w, Y + d, Z + h), P(X, Y + d, Z + h)]
    right = [P(X + w, Y, Z), P(X + w, Y + d, Z), P(X + w, Y + d, Z + h), P(X + w, Y, Z + h)]
    a = c.shape(ramp, poly_f(left), flat=t[1]); b = c.shape(ramp, poly_f(right), flat=t[2]); s = c.shape(ramp, poly_f(top), flat=t[0])
    c.put({(x, y) for (x, y) in s if (x, y + 1) not in s and (x, y + 1) in (a | b)}, 4)   # 上の 面の 手前の ふち
    return s, a, b

def glint(c, *pts):
    for p in pts: c.fix[p] = CREAM

# ---------------- あかり ----------------
def torch():
    c = Canvas(); c.ground(16, 28.5, 8, 2)
    st = tube([(11, 28), (19, 12)], 1.7, 1.9); c.extrude(WOOD, st, 1, 0); c.shape(WOOD, st, bias=0.15)
    c.shape(SUMI, tube([(18.2, 13.5), (19.6, 10.8)], 2.4), bias=0.2)        # まいた 布（すす）
    c.shape(LAVA, tube([(20, 11), (21, 6), (19.5, 1.5)], 4.2, 0.8), bias=0.35)
    c.shape(GOLD, tube([(20, 10), (20.5, 6.5), (20, 4)], 2.4, 0.6), flat=4)
    glint(c, (20, 8), (20, 9))
    return c

def lantern():
    c = Canvas(); c.ground(16, 29.5, 9, 1.8)
    c.shape(GOLD, tube(arc_pts(16, 5, 4, 180, 360, 8), 0.8), bias=0.3)       # とって
    body = sphere(16, 15.5, 10, 10.5)
    s = c.shape(REDP, body, bias=0.25, spec=0.03)
    for y in (9, 12, 15, 18, 21, 24): c.put({(x, yy) for (x, yy) in s if yy == y}, 1)   # ほねの すじ
    c.put({(x, y) for (x, y) in s if abs(x - 15) <= 2 and 11 <= y <= 19 and c.c[(x, y)][1] >= 2}, 4, GOLD)   # 中の 灯り
    c.shape(SUMI, poly_f([(10, 4), (22, 4), (21.5, 7), (10.5, 7)], (0, -0.3, 0.9)), bias=0.2)   # 上の わく
    c.shape(SUMI, poly_f([(10, 24), (22, 24), (21.5, 27), (10.5, 27)], (0, -0.3, 0.9)), bias=0.2)
    c.shape(GOLD, tube([(16, 27), (16, 30)], 0.8), flat=3)
    glint(c, (10, 12), (11, 10))
    return c

def andon():
    c = Canvas(); c.ground(16, 28.5, 11, 2.6)
    s, a, b = box(c, PAPER, -5, -5, 0, 10, 10, 13, t=(2, 4, 3), cy=17)
    for (x, y) in a | b:
        if (x * 3 + y * 0) % 7 == 0 or y in (14, 24): c.c[(x, y)] = [WOOD, 1, 90]   # わくの 木
    c.put({(x, y) for (x, y) in a | b if c.c[(x, y)][0] is PAPER and 12 < y < 24 and 9 < x < 23}, 4, GOLD)  # 中の 灯り
    box(c, WOOD, -6, -6, 13, 12, 12, 1.5, cy=17)
    box(c, WOOD, -6, -6, -2, 12, 12, 2, cy=17)
    return c

# ---------------- 植物・たね ----------------
def _seed_bag(draw, seed_col):
    c = Canvas(); c.ground(16, 29, 12, 2.4)
    bag = poly_f([(6, 6), (24, 4), (26, 27), (8, 28)], (-0.15, -0.1, 0.95))
    c.extrude(PAPER, bag, 1, 1); s = c.shape(PAPER, bag, bias=0.25)
    c.put({(x, y) for (x, y) in s if y <= 7}, 1)                                  # おりかえし
    c.put({(x, y) for (x, y) in s if y == 8}, 4)
    draw(c)
    for (x, y) in ((26, 27), (28, 28), (27, 25), (29, 26)):                          # こぼれた たね
        c.shape(seed_col, sphere(x + .5, y + .5, 1.1, 0.8), flat=3)
    return c

def seed_onion():
    return _seed_bag(lambda c: (c.shape(ONION, sphere(16, 18, 5, 4.6), bias=0.2, spec=0.05), c.shape(LEAF, tube([(16, 14), (16.5, 10)], 1.0), bias=0.2)), STRAW)

def seed_tomato():
    def d(c):
        c.shape(FRUIT, sphere(16, 18, 5, 4.6), bias=0.2, spec=0.06); c.shape(LEAF, sphere(16, 13.8, 2.4, 1.2), bias=0.2)
    return _seed_bag(d, STRAW)

def seed_pumpkin():
    def d(c):
        s = c.shape(ORANGE, sphere(16, 18, 6, 4.4), bias=0.2, spec=0.05); c.put({(x, y) for (x, y) in s if x in (13, 19)}, 2)
        c.shape(LEAF, tube([(16, 14), (17, 12)], 0.9), bias=0.2)
    return _seed_bag(d, BONE)

def seed_eggplant():
    def d(c):
        c.shape(EGGPL, tube([(13, 22), (19, 15)], 3.2, 2.2), bias=0.2, spec=0.06); c.shape(LEAF, sphere(19.5, 14.5, 2.4, 1.6), bias=0.2)
    return _seed_bag(d, STRAW)

def onion():
    c = Canvas(); c.ground(16, 28.5, 11, 2.4)
    for dx in (-3, 0, 3): c.shape(ONION, tube([(16, 27), (16 + dx, 30)], 0.5), flat=1)   # ね
    s = c.shape(ONION, lambda x, y: sphere(16, 18, 11, 10)(x, y) if y > 10 or abs(x - 16) < (y - 3) * 1.3 else None, bias=0.2, spec=0.05)
    c.put({(x, y) for (x, y) in s if abs(x - 16) in (4, 8) and y > 12 and c.c[(x, y)][1] >= 2}, 2)
    c.shape(LEAF, tube([(16, 9), (14, 4), (12, 1.5)], 1.6, 0.8), bias=0.2)
    c.shape(LEAF, tube([(16, 9), (19, 3), (21, 1)], 1.4, 0.7), bias=0.25)
    glint(c, (10, 14), (11, 13))
    return c

def pumpkin():
    c = Canvas(); c.ground(16, 28.5, 14, 3)
    for cx, rx in ((8.5, 6.5), (23.5, 6.5), (12, 7), (20, 7), (16, 6.5)):
        c.shape(ORANGE, sphere(cx, 18, rx, 9.5), bias=0.15 if cx == 16 else 0.05, spec=0.04)
    c.shape(LEAF, tube([(16, 10), (17, 6), (19.5, 4)], 1.6, 1.2), bias=0.1)
    c.shape(LEAF, tube([(19, 6), (24, 5), (26, 8)], 1.3, 0.6), bias=0.25)
    glint(c, (12, 13), (13, 12))
    return c

def eggplant():
    c = Canvas(); c.ground(16, 28, 13, 2.6)
    b = tube([(6, 25), (11, 20), (18, 13), (22, 9)], 5.6, 3.2)
    c.extrude(EGGPL, b, 0, 1); c.shape(EGGPL, b, bias=0.1, spec=0.06)
    for a in (-60, 0, 60, 120):
        r = math.radians(a - 45); c.shape(LEAF, tube([(23, 8), (23 + 5 * math.cos(r), 8 + 4 * math.sin(r))], 1.6, 0.6), bias=0.2)
    c.shape(LEAF, tube([(24, 7), (27, 3)], 1.1), bias=0.2)
    glint(c, (9, 19), (10, 18), (13, 15))
    return c

def mushi():
    c = Canvas(); c.ground(16, 27, 13, 2.6)
    pts = [(6, 22), (10, 24), (15, 23), (19, 19), (21, 14), (24, 10)]
    for k, (x, y) in enumerate(pts):
        c.shape(BONE, sphere(x, y, 4.0 - k * 0.15), bias=0.2, spec=0.04)
    c.shape(ORANGE, sphere(26, 8, 3.6), bias=0.25, spec=0.08)
    c.fix.update({(27, 7): SUMI[0], (25, 7): SUMI[0]})
    return c

def harapan_mimizu():
    """はらぱんみみず（epic）: 頭から しっぽまで ぜんぶ 見える S 字の みみず。まん中の おなかが ぱんぱんに ふくらむ、頭の 近くに うすい 色の 帯（環帯）、にこにこ顔、きらり"""
    c = Canvas(); c.ground(16, 28.5, 12, 2.4)
    pts = [(5, 26.5), (9, 27.5), (14, 26), (17, 22), (15.5, 17), (12, 13.5), (12, 9), (16, 6), (21, 5.5)]
    s = c.shape(WORM, tube(pts, 1.4, 2.6), bias=0.25, spec=0.05)          # しっぽ（細い）→ 頭（太い）
    c.put({(x, y) for (x, y) in s if (x * 2 + y * 3) % 5 == 0 and c.c[(x, y)][1] >= 2}, 2)   # ふし
    c.shape(WORM, sphere(16, 19.5, 5.2, 4.6), bias=0.3, spec=0.08)        # ぱんぱんの おなか
    c.shape(PINKM, tube([(11, 11.5), (13.5, 9.5)], 2.0), flat=4)           # 環帯（うすい 帯）
    c.shape(WORM, sphere(22.5, 6, 3.4, 3.0), bias=0.3, spec=0.06)          # 頭
    c.fix.update({(22, 5): SUMI[0], (24, 5): SUMI[0], (23, 7): WORM[1], (21, 7): (255, 150, 160, 255)})
    glint(c, (14, 17), (15, 16))
    sparkle(c, 27, 13)
    return c

# ---------------- 食べもの ----------------
def egg(ramp=BONE, sp=False):
    c = Canvas(); c.ground(16, 28.5, 10, 2.4)
    c.shape(ramp, lambda x, y: sphere(16, 17, 9.5, 11.5)(x, y) if y > 17 or abs(x - 16) <= 9.5 * max(0, 1 - ((17 - y) / 12.5) ** 2) ** 0.5 * (0.75 + 0.25 * (y - 4.5) / 12.5) else None, bias=0.2, spec=0.05)
    glint(c, (11, 11), (12, 10), (11, 12))
    if sp: sparkle(c, 25, 7)
    return c

def kin_tamago(): return egg(GOLD, True)

def momo_nama():
    c = M.momo_yaki()
    for v in c.c.values():
        if v[0] is MEAT: v[0] = PINKM
    for p in list(c.c):  # 焼き目を なくす
        if c.c[p][0] is PINKM and c.c[p][1] == 1 and c.c[p][2] >= 0: c.c[p][1] = 2
    c.fix = {k: (PINKM[4] if v != CREAM else v) for k, v in c.fix.items()}
    return c

# ---------------- 素材 ----------------
def yokai_orb():
    c = Canvas(); c.ground(16, 29, 10, 2)
    for k in range(3):  # ゆらゆらの 火の 玉の しっぽ
        c.shape(PURPLE, tube([(10 + k * 6, 10), (8 + k * 6, 5), (11 + k * 5, 1.5)], 1.6, 0.4), bias=0.4)
    c.shape(PURPLE, sphere(16, 17, 11, 10.5), bias=0.25, spec=0.06)
    c.fix.update({(12, 16): SUMI[0], (12, 17): SUMI[0], (20, 16): SUMI[0], (20, 17): SUMI[0], (13, 16): CREAM, (21, 16): CREAM})
    for x in range(14, 19): c.fix[(x, 21 + (x in (14, 18)) * -1)] = SUMI[0]
    glint(c, (9, 12), (10, 11))
    return c

def paper():
    c = Canvas(); c.ground(16, 26, 14, 3)
    for z, dx in ((0, 0.6), (1.2, -0.5), (2.4, 0)):
        box(c, CHALK, -10 + dx, -7, z, 18, 13, 1.0, t=(4, 2, 1), cy=13)
    for k in range(4):  # 字の 線
        p0 = iso(-6, -4 + k * 2.5, 3.4, cy=13); p1 = iso(4, -4 + k * 2.5, 3.4, cy=13)
        for q in line_px(*p0, *p1):
            if q in c.c: c.c[q] = [SUMI, 2, 90]
    return c

def oil():
    c = Canvas(); c.ground(16, 29, 11, 2.2)
    c.shape(GOLD, sphere(16, 19, 10, 9.5), bias=0.2, spec=0.08)
    c.shape(GOLD, tube([(16, 10), (16, 6)], 3.2), bias=0.25)
    c.shape(WOOD, tube([(16, 6.5), (16, 3)], 2.6), bias=0.2)
    c.shape(STRAW, tube(arc_pts(16, 9, 3.6, 0, 180, 8, 1.2), 0.7), bias=0.2)   # ひも
    glint(c, (10, 14), (11, 13), (10, 15))
    return c

def string():
    c = Canvas(); c.ground(16, 27, 12, 2.6)
    box(c, WOOD, -8, -8, 0, 16, 16, 2, cy=10)                                 # 糸まきの 下の わく
    s = c.shape(CHALK, sphere(16, 13.5, 8.5, 8.5), bias=0.25)
    c.put({(x, y) for (x, y) in s if (y - x // 3) % 3 == 0}, 2)
    box(c, WOOD, -8, -8, 15, 16, 16, 2, cy=10)
    c.shape(CHALK, tube([(23, 16), (28, 20), (26, 26)], 0.7), flat=3)
    return c

def cloth():
    c = Canvas(); c.ground(16, 26, 14, 3)
    for z, col in ((0, REDP), (3, BLUEP), (6, REDP)):
        s, a, b = box(c, col, -10, -6, z, 20, 12, 2.6, cy=12)
        c.put({(x, y) for (x, y) in s if (x + 2 * y) % 6 == 0}, 4)
    return c

def clay():
    c = Canvas(); c.ground(16, 27, 14, 3)
    s = c.shape(CLAY, lambda x, y: sphere(16, 18, 13, 9)(x, y) if y > 11 else sphere(16, 18, 12, 9)(x, y), bias=0.15, spec=0.04)
    for cx, cy in ((12, 15), (19, 17), (22, 21)):  # 指の あと
        c.put({(x, y) for (x, y) in s if (x - cx) ** 2 + (y - cy) ** 2 <= 2.2}, 1)
        c.put({(x, y) for (x, y) in s if (x - cx - 1) ** 2 + (y - cy - 1) ** 2 <= 1}, 3)
    return c

def crystal():
    c = Canvas(); c.ground(16, 28, 13, 2.6)
    for (bx, by, tx, ty, w) in ((9, 26, 6, 10, 3.2), (23, 26, 26, 12, 3.0), (16, 27, 16, 3, 4.4)):
        dx, dy = tx - bx, ty - by; L = math.hypot(dx, dy); nx, ny = -dy / L * w, dx / L * w
        c.shape(CRYS, poly_f([(bx - nx, by - ny), (tx - nx * 0.9 - dx * 0.15, ty - ny * 0.9 - dy * 0.15), (tx, ty), (bx, by)]), flat=4)
        c.shape(CRYS, poly_f([(bx, by), (tx, ty), (tx + nx * 0.9 - dx * 0.15, ty + ny * 0.9 - dy * 0.15), (bx + nx, by + ny)]), flat=2)
    sparkle(c, 22, 7, big=False)
    return c

def sumi():
    c = Canvas(); c.ground(16, 27, 14, 3)
    for X, Y, L in ((-10, -4, 18), (-8, 2, 16)):
        s, a, b = box(c, SUMI, X, Y, 0, L, 5, 5, t=(3, 2, 1), cy=12)
        c.put({(x, y) for (x, y) in s | a if (x * 5 + y * 3) % 9 == 0}, 4)   # つやの 点
    return c

def hemp():
    c = Canvas(); c.ground(16, 28, 12, 2.4)
    for k in range(-4, 5):
        c.shape(STRAW, tube([(16 + k * 1.4, 2), (16 + k * 0.4, 15), (16 + k * 1.6, 28)], 0.9), bias=0.1 + 0.05 * (k % 2))
    c.shape(WOOD, poly_f([(9, 13), (23, 13), (23, 17), (9, 17)], (0, -0.2, 0.9)), bias=0.3)   # しばった ひも
    return c

def kin():
    c = M.iron_ingot()
    for v in c.c.values():
        if v[0] is IRON: v[0] = GOLD
    c.fix = {k: (GOLD[4] if v != CREAM else v) for k, v in c.fix.items()}
    sparkle(c, 25, 5)
    return c

def ishibai():
    c = Canvas(); c.ground(16, 28.5, 13, 2.6)
    s = c.shape(PAPER, lambda x, y: sphere(16, 19, 12, 10)(x, y) if y > 9 else None, bias=0.15, spec=0.03)
    c.shape(PAPER, tube([(8, 10), (24, 10)], 2.2), bias=0.3)
    c.shape(CHALK, sphere(16, 9.5, 7, 3.2), flat=4)                                   # 白い こな
    c.put({(x, y) for (x, y) in s if abs(x - 16) <= 3 and 15 <= y <= 21}, 1, STONE)   # 袋の しるし
    for p in ((7, 5), (12, 3), (20, 4), (25, 6)): c.fix[p] = CHALK[4]
    return c

# ---------------- くらし・家具 ----------------
def tansu():
    c = Canvas(); c.ground(16, 29, 14, 3)
    s, a, b = box(c, WOOD, -8, -6, 0, 16, 12, 13, cy=17)
    for (x, y) in a | b:
        if (y - 14) % 4 == 0: c.c[(x, y)] = [WOOD, 0, 90]
    for k in range(3):  # 黒い 金具
        for X in (-3, 4):
            p = iso(X, 6, 2 + k * 4, cy=17); c.shape(SUMI, sphere(p[0], p[1] - 1, 1.3), flat=1)
    return c

def table(L=14, round_=False):
    c = Canvas(); c.ground(16, 27, 14, 3)
    for X, Y in ((-6, -5), (L - 8, -5), (-6, 4), (L - 8, 4)):
        box(c, WOOD, X, Y, 0, 2, 2, 8, cy=14)
    if round_:
        c.extrude(WOOD, sphere(16, 12, 13, 7), 0, 2); c.shape(WOOD, sphere(16, 12, 13, 7), flat=3)
        c.put({p for p in c.c if c.c[p][1] == 3 and ((p[0] - 16) / 13) ** 2 + ((p[1] - 12) / 7) ** 2 < 0.4}, 4)
    else:
        box(c, WOOD, -7, -6, 8, L, 12, 2, cy=14)
    return c

def long_table(): return table(22)
def round_table(): return table(14, True)

def chair():
    c = Canvas(); c.ground(16, 28, 11, 2.6)
    for X, Y in ((-5, -5), (3, -5), (-5, 3), (3, 3)): box(c, WOOD, X, Y, 0, 2, 2, 7, cy=14)
    box(c, WOOD, -5, -5, 12, 10, 2, 8, cy=14) if False else None
    box(c, WOOD, -5, -5, 7, 10, 2, 13, cy=14)                                   # せもたれ
    s, a, b = box(c, BLUEP, -5, -3, 7, 10, 8, 2, cy=14)                           # ざぶとん
    return c

def stool():
    c = Canvas(); c.ground(16, 28, 10, 2.4)
    for X, Y in ((-4, -4), (2, -4), (-4, 2), (2, 2)): box(c, WOOD, X, Y, 0, 2, 2, 9, cy=13)
    c.extrude(BLUEP, sphere(16, 13, 9, 5), 0, 2); c.shape(BLUEP, sphere(16, 13, 9, 5), bias=0.3, spec=0.05)
    return c

def shelf():
    c = Canvas(); c.ground(16, 29.5, 13, 2.4)
    s, a, b = box(c, WOOD, -8, -3, 0, 16, 6, 17, cy=21)
    books = [REDP, BLUEP, LEAF, GOLD, PURPLE, ORANGE]
    for (x, y) in a:
        r = (y - 8) % 6
        if 1 <= r <= 4: c.c[(x, y)] = [books[(x + (y - 8) // 6) % 6], 3 if r < 3 else 2, 90]
    return c

def ofuro():
    c = Canvas(); c.ground(16, 28, 14, 3)
    s, a, b = box(c, WOOD, -9, -9, 0, 18, 18, 9, cy=10)
    for (x, y) in a | b:
        if x % 3 == 0: c.c[(x, y)][1] = max(0, c.c[(x, y)][1] - 1)
    inner = [iso(-7, -7, 9, cy=10), iso(7, -7, 9, cy=10), iso(7, 7, 9, cy=10), iso(-7, 7, 9, cy=10)]
    w = c.shape(WATER, poly_f(inner), flat=3)
    c.put({(x, y) for (x, y) in w if (x + y) % 5 == 0}, 4)
    for k, (x0) in enumerate((11, 16, 21)):  # ゆげ
        c.shape(CHALK, tube([(x0, 6), (x0 - 1.5, 3), (x0 + 0.5, 0.5)], 0.7), flat=4)
    return c

def futon():
    c = Canvas(); c.ground(16, 26, 15, 3)
    box(c, CHALK, -10, -7, 0, 20, 14, 3, t=(4, 2, 1), cy=13)                     # しきぶとん
    s, a, b = box(c, REDP, -6, -7, 3, 16, 14, 2.4, cy=13)                         # かけぶとん
    c.put({(x, y) for (x, y) in s if (x + 2 * y) % 7 == 0}, 4, GOLD)
    box(c, CHALK, -9, -5, 3, 3, 10, 2.6, t=(4, 3, 2), cy=13)                      # まくら
    return c

def omamori(torn=False):
    c = Canvas(); c.ground(16, 29.5, 10, 2)
    body = poly_f([(8, 9), (24, 9), (24, 27), (8, 27)] if not torn else [(8, 9), (24, 9), (24, 22), (21, 27), (18, 23), (14, 28), (11, 24), (8, 27)], (-0.2, -0.1, 0.95))
    c.extrude(REDP, body, 1, 1); s = c.shape(REDP, body, bias=0.1 if torn else 0.25)
    c.put({(x, y) for (x, y) in s if (x + y) % 4 == 0 and 10 < y < 26}, 4 if not torn else 1, GOLD if not torn else None)   # にしき もよう
    c.shape(CHALK, poly_f([(12, 14), (20, 14), (20, 22), (12, 22)]), flat=3 if not torn else 2)   # おふだ の まど
    for x, y0 in ((15, 16), (17, 16)):
        for y in range(y0, y0 + 4): c.fix[(x, y)] = REDP[1]
    c.shape(GOLD, tube([(13, 9), (12, 3), (16, 1.5), (20, 3), (19, 9)], 0.9), bias=0.3 if not torn else 0)
    if torn:
        for p in ((10, 12), (22, 15), (14, 25)): c.fix[p] = SUMI[0]
    else:
        glint(c, (10, 11))
    return c

def omamori_torn(): return omamori(True)

def waraji():
    """わらじ（1 つ。大きく）: わらで あんだ 底、赤い ひも"""
    c = Canvas(); c.ground(16, 28, 15, 3)
    sole = lambda x, y: sphere(16, 16, 9, 14)((x - 16) * .8 + (y - 16) * .6 + 16, (y - 16) * .8 - (x - 16) * .6 + 16)
    c.extrude(STRAW, sole, 0, 2); s = c.shape(STRAW, sole, bias=0.2)
    c.put({(x, y) for (x, y) in s if (x - y) % 3 == 0}, 2)                      # あみめ
    c.put({(x, y) for (x, y) in s if (x + y) % 6 == 0 and (x - y) % 3}, 1)
    for a, b in (((9, 11), (17, 6)), ((17, 6), (24, 15)), ((11, 21), (17, 6))):   # ひも
        c.shape(REDP, tube([a, b], 1.0), bias=0.25)
    c.shape(REDP, sphere(17, 6, 1.6), bias=0.3)
    return c

def haniwa():
    c = Canvas(); c.ground(16, 29.5, 10, 2)
    c.shape(CLAY, tube([(16, 11), (16, 27)], 6.0, 7.0), bias=0.2)
    for sg in (-1, 1): c.shape(CLAY, tube([(16 + 5 * sg, 15), (16 + 9 * sg, 13 - 2 * sg), (16 + 9.5 * sg, 9 - 2 * sg)], 1.8), bias=0.2)
    c.shape(CLAY, sphere(16, 8.5, 6, 6), bias=0.25, spec=0.03)
    for (x, y, rx, ry) in ((13.5, 8, 1.2, 0.9), (18.5, 8, 1.2, 0.9), (16, 11.5, 1.6, 1.0)):
        c.shape(SUMI, sphere(x, y, rx, ry), flat=0)
    return c

def kite():
    c = Canvas(); c.ground(16, 29.5, 10, 2)
    k = poly_f([(16, 1), (28, 12), (16, 23), (4, 12)], (-0.1, -0.1, 0.95))
    s = c.shape(CHALK, k, bias=0.25)
    c.put({(x, y) for (x, y) in s if abs(x - 16) + abs(y - 12) < 6}, 3, REDP)
    for q in line_px(16, 1, 16, 23) | line_px(4, 12, 28, 12):
        if q in c.c: c.c[q] = [WOOD, 1, 90]
    for k2, (x, y) in enumerate(((15, 24), (17, 26), (15, 28), (17, 30))):
        c.shape(REDP if k2 % 2 == 0 else CHALK, sphere(x + .5, y + .5, 1.2), flat=3)
    return c

def sprinkler():
    c = Canvas(); c.ground(16, 28.5, 12, 2.6)
    c.shape(STONE, lambda x, y: sphere(16, 19, 10, 5)(x, y) or (((x - 16) / 10, 0.4, 0.8) if abs(x - 16) <= 10 and 19 <= y <= 25 else None) or sphere(16, 25, 10, 4)(x, y), bias=0.2)
    c.shape(STONE, sphere(16, 19, 8.2, 3.6), flat=1)
    c.shape(IRON, tube([(16, 19), (16, 12)], 1.6), bias=0.2, spec=0.1)
    for sg in (-1, 1):  # 水の 弧
        for q in {(round(16 + sg * t), round(11 - 5 * math.sin(math.pi * t / 14))) for t in [i * 0.5 for i in range(29)]}:
            c.shape(WATER, sphere(q[0] + .5, q[1] + .5, 0.9), flat=3)
    for p in ((3, 14), (29, 14), (5, 18), (27, 18)): c.fix[p] = WATER[4]
    return c

def toriya():
    c = Canvas(); c.ground(16, 29, 14, 3)
    s, a, b = box(c, WOOD, -8, -6, 0, 16, 12, 9, cy=13)
    for (x, y) in a | b:
        if x % 3 == 0: c.c[(x, y)][1] = max(0, c.c[(x, y)][1] - 1)
    d = iso(0, 6, 0, cy=13); c.shape(SUMI, poly_f([(d[0] - 3, d[1]), (d[0] + 1, d[1] - 2), (d[0] + 1, d[1] - 8), (d[0] - 3, d[1] - 6)]), flat=0)   # 入り口
    rf = [iso(-9, -7, 9, cy=13), iso(9, -7, 9, cy=13), iso(9, 0, 15, cy=13), iso(-9, 0, 15, cy=13)]
    rf2 = [iso(-9, 0, 15, cy=13), iso(9, 0, 15, cy=13), iso(9, 7, 9, cy=13), iso(-9, 7, 9, cy=13)]
    c.shape(BLUEP, poly_f(rf), flat=3); r2 = c.shape(BLUEP, poly_f(rf2), flat=2)
    c.put({(x, y) for (x, y) in r2 if (x + y) % 3 == 0}, 1)
    return c

def sekkeizu():
    c = Canvas(); c.ground(16, 28, 14, 2.6)
    sh = poly_f([(4, 8), (26, 4), (28, 22), (6, 26)], (-0.1, -0.2, 0.95))
    s = c.shape(BLUEP, sh, bias=0.15)
    for q in line_px(9, 11, 22, 9) | line_px(22, 9, 23, 18) | line_px(23, 18, 11, 21) | line_px(11, 21, 9, 11) | line_px(16, 10, 17, 20) | line_px(10, 15, 22, 14):
        if q in s: c.c[q] = [CHALK, 4, 90]
    c.shape(PAPER, tube([(5, 26), (29, 21.5)], 2.2), bias=0.2, spec=0.05)                # まいた はし
    c.shape(REDP, sphere(25, 19, 1.3), flat=3)
    return c

# ---------------- 家の ブロック（16×16 の 絵を 面に はった 箱 / うすい 板） ----------------
OLD = json.load(open(os.path.join(HERE, 'ref', 'old48.json')))
def _tex(iid):
    px = [tuple(p) for p in OLD[iid]['px']]
    return {'top': px, 'side': px}

def _cube(iid):
    M.TILES[iid] = _tex(iid)
    return M.block(iid)

def house_floor(): return _cube('house_floor')
def house_wall(): return _cube('house_wall')
def house_roof(): return _cube('house_roof')

def _panel(iid):
    """しょうじ・戸: たてた 板（左の 面に 絵、うすい 厚み）"""
    t = OLD[iid]['px']; c = Canvas(); c.ground(16, 28.5, 12, 2.6)
    A = iso(-8, 2, 0, cy=12); B = iso(8, 2, 0, cy=12)
    H = 17; K = 21
    face = [iso(-8, 2, 0, cy=K), iso(8, 2, 0, cy=K), iso(8, 2, H, cy=K), iso(-8, 2, H, cy=K)]
    side = [iso(8, -1, 0, cy=K), iso(8, 2, 0, cy=K), iso(8, 2, H, cy=K), iso(8, -1, H, cy=K)]
    top = [iso(-8, -1, H, cy=K), iso(8, -1, H, cy=K), iso(8, 2, H, cy=K), iso(-8, 2, H, cy=K)]
    c.shape(WOOD, poly_f(side), flat=1); c.shape(WOOD, poly_f(top), flat=3)
    f = c.shape(STONE, poly_f(face), flat=2)
    x0, y0 = face[0]
    for (x, y) in f:
        u = (x + .5 - x0) / 16; v = ((y + .5) - (y0 - H + (x + .5 - x0) / 2)) / H
        col = t[min(15, max(0, int(v * 16))) * 16 + min(15, max(0, int(u * 16)))]
        c.fix[(x, y)] = tuple(int(k * 0.92) for k in col[:3]) + (255,)
    return c

def shoji(): return _panel('shoji')
def house_door(): return _panel('house_door')

IDS = ['torch', 'lantern', 'andon', 'seed_onion', 'seed_tomato', 'seed_pumpkin', 'seed_eggplant', 'onion', 'pumpkin', 'eggplant', 'mushi', 'harapan_mimizu',
       'egg', 'kin_tamago', 'momo_nama', 'yokai_orb', 'paper', 'oil', 'string', 'cloth', 'clay', 'crystal', 'sumi', 'hemp', 'kin', 'ishibai',
       'tansu', 'table', 'long_table', 'round_table', 'chair', 'stool', 'shelf', 'ofuro', 'futon', 'omamori', 'omamori_torn', 'waraji', 'haniwa', 'kite',
       'sprinkler', 'toriya', 'sekkeizu', 'house_floor', 'house_wall', 'house_roof', 'shoji', 'house_door']
