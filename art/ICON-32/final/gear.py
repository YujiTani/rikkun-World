"""ICON-32 本番: 道具・武器・防具（なかまごとの 形 ＋ 素材の 色）。座標は 32 の マス。"""
import math
from lib import *

MAT = {  # 素材 → (頭/刃, 柄, 柄の 巻き, きらり)
    'wood': (WOOD, WOOD, LACQ, False), 'stone': (STONE, WOOD, LACQ, False), 'iron': (IRON, WOOD, CRIMSON, False),
    'kin': (GOLD, NAVY, GOLD, True), 'kongo': (GEM, NAVY, GEM, True),
}

def _grip(c, ramp, test):
    c.put({p for p, v in c.c.items() if test(*p)}, 1, ramp)
    c.put({p for p, v in c.c.items() if test(*p) and (p[0] - p[1]) % 3 == 0}, 3, ramp)

def pickaxe(mat):
    head, handle, grip, sp = MAT[mat]
    c = Canvas(); c.ground(17, 27, 13, 3.2)
    h = tube([(5, 27), (22, 10)], 1.8)
    c.extrude(handle, h); c.shape(handle, h, bias=0.08)
    _grip(c, grip, lambda x, y: x < 9 and y > 23)
    hd = lambda x, y: tube(arc_pts(17, 21, 13, 200, 270, 12, 11), 1.2, 2.8)(x, y) or tube(arc_pts(17, 21, 13, 270, 340, 12, 11), 2.8, 1.2)(x, y)
    c.extrude(head, hd, 0, 2); c.shape(head, hd, spec=0.05, bias=0.08)
    c.shape(GOLD if mat != 'kin' else CRIMSON, sphere(20.5, 11.8, 2.3), spec=0.08)
    if sp: sparkle(c, 27, 23)
    return c

def axe(mat):
    head, handle, grip, sp = MAT[mat]
    c = Canvas(); c.ground(16, 27, 13, 3.2)
    h = tube([(7, 28), (22, 7)], 1.8)
    c.extrude(handle, h); c.shape(handle, h, bias=0.08)
    _grip(c, grip, lambda x, y: x < 11 and y > 24)
    blade = poly_f([(17.5, 7.5), (19.5, 11.5), (14.5, 17.5), (7.5, 19.0), (5.0, 13.5), (8.5, 8.0), (13.5, 6.0)], (0.25, 0.2, 0.95))
    c.extrude(head, blade, 0, 2); b = c.shape(head, blade, bias=0.1)
    c.put({(x, y) for (x, y) in b if ((x - 1, y) not in b or (x, y + 1) not in b) and x - y < 3}, 4)   # 刃の ふち（光る）
    c.put({(x, y) for (x, y) in b if ((x - 2, y) not in b or (x, y + 2) not in b) and x - y < 3 and c.c[(x, y)][1] < 4}, 3)
    c.shape(head, tube([(17, 8), (22.5, 11.5)], 2.2), bias=0.0)
    if sp: sparkle(c, 26, 22)
    return c

def sword(blade, guard=GOLD, hilt=NAVY, wood=False, deco=None, sp=False, curve=True):
    c = Canvas(); c.ground(17, 26, 14, 3)
    spine = [(5.0, 26.5), (11, 20.3), (17.5, 13.4), (24, 6.8), (30.9, 0.9)] if curve else [(5, 26.5), (30.6, 1.2)]
    bl = tube(spine, 2.0 if wood else 1.6, 0.9 if wood else 0.45)
    c.extrude(blade, bl, 0, 1, 1)
    b = c.shape(blade, bl, flat=2)
    c.put({(x, y) for (x, y) in b if (x - 1, y - 1) not in b and (x, y - 1) not in b}, 4)
    c.put({(x, y) for (x, y) in b if (x + 1, y + 1) not in b or (x, y + 1) not in b}, 3 if wood else 5)
    if not wood: c.put({(x, y) for (x, y) in b if x + y == 32 + (x // 2) % 2 and 8 < x < 27}, 1)
    if deco: deco(c, b)
    if not wood: c.shape(guard, sphere(5.0, 26.6, 2.4, 1.9), spec=0.08)
    hl = tube([(1.6, 30.4), (4.4, 27.6)], 1.6)
    c.extrude(hilt, hl); hh = c.shape(hilt, hl, bias=0.15)
    c.put({p for p in hh if (p[0] + p[1]) % 2 == 0}, 4)
    if sp: sparkle(c, 8, 8)
    return c

def _bolt(c, b):  # 雷神: 刀身の よこに 金の いなずま（ジグザグ）
    pts = [(9, 15), (12, 14), (11, 11), (15, 10), (14, 7), (18, 6)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for q in line_px(x0, y0, x1, y1):
            if q not in c.c: c.c[q] = [GOLD, 4, 99]
    c.fix[(18, 6)] = CREAM

def _wind(c, b):  # 風神: 風の うず 2 つ
    for cx, cy, r in ((12, 12, 3.2), (20, 5, 2.6)):
        for q in {(round(cx + r * math.cos(a / 8)), round(cy + r * 0.8 * math.sin(a / 8))) for a in range(0, 40)}:
            if q not in c.c: c.c[q] = [WIND, 4, 99]

def _rainbow(c, b):
    bands = [FRUIT, LAVA, GOLD, LEAF, WATER, PURPLE]
    for (x, y) in b:
        r = bands[min(5, max(0, (x - 6) // 4))]; c.c[(x, y)][0] = r
        c.c[(x, y)][1] = max(2, min(4, c.c[(x, y)][1]))

def naginata(blade=STEEL, pole=LACQ, sp=False):
    c = Canvas(); c.ground(16, 27, 14, 3)
    p = tube([(2, 30), (21, 11)], 1.4)
    c.extrude(pole, p); pp = c.shape(pole, p, bias=0.15)
    c.put({q for q in pp if (q[0] + q[1]) % 6 == 0}, 4, GOLD)
    bl = tube([(21, 11), (25, 6.5), (28, 2.5), (30.5, 1.2)], 2.3, 0.5)
    c.extrude(blade, bl); b = c.shape(blade, bl, flat=2)
    c.put({(x, y) for (x, y) in b if (x + 1, y + 1) not in b or (x, y + 1) not in b}, 5)
    c.put({(x, y) for (x, y) in b if (x - 1, y - 1) not in b}, 4)
    c.shape(GOLD, sphere(20.5, 11.5, 2.2), spec=0.08)
    if sp: sparkle(c, 7, 8)
    return c

def bow(wood=LACQ, grip=ROPE, tip=GOLD, sp=False):
    c = Canvas(); c.ground(17, 27, 14, 3)
    arc = tube(arc_pts(31, 33, 27, 180, 270, 20), 2.0)
    c.extrude(wood, arc, 0, 1); c.shape(wood, arc, bias=0.25, spec=0.06)
    gp = c.shape(grip, tube([(11.2, 13.2), (13.2, 11.2)], 2.4), bias=0.15)
    c.put({q for q in gp if (q[0] + q[1]) % 3 == 0}, 1)
    for q in line_px(5.5, 30, 30, 5.5):
        if q not in c.c:
            c.fix[q] = CREAM
            if (q[0] + 1, q[1]) not in c.c: c.fix[(q[0] + 1, q[1])] = (60, 40, 50, 255)
    c.shape(tip, sphere(4.8, 30, 1.6), spec=0.1); c.shape(tip, sphere(30, 4.8, 1.6), spec=0.1)
    if sp: sparkle(c, 24, 22)
    return c

def ya():
    c = Canvas(); c.ground(16, 27, 13, 2.6)
    s = tube([(5, 27), (25, 7)], 1.0)
    c.extrude(BAMBOO, s); c.shape(BAMBOO, s, bias=0.15)
    for k in range(3):  # 羽
        f = poly_f([(4 + k * 2, 23 - k * 2), (9 + k * 2, 22 - k * 2), (6 + k * 2, 28 - k * 2)])
        c.shape(CHALK if k != 1 else CRIMSON, f, bias=0.1)
    hd = poly_f([(23, 5.5), (30, 2), (26.5, 9)], (-0.3, -0.6, 0.7))
    c.extrude(STEEL, hd); c.shape(STEEL, hd, bias=0.1, spec=0.1)
    return c

# ---------- 防具 ----------
ARM = {  # 素材 → (主, 金具, 布)
    'iron': (CRIMSON, GOLD, NAVY), 'kin': (SHADE, GOLD, GOLD), 'kongo': (NAVY, GEM, GEM),
}

def kabuto(mat='iron'):
    main, metal, cloth = ARM[mat]
    c = Canvas(); c.ground(16, 28, 14, 3)
    s = c.shape(main, lambda x, y: sphere(16, 19, 14, 9.5)(x, y) if y > 18 else None, bias=0.08)
    c.put({(x, y) for (x, y) in s if y in (22, 25)}, 1)
    c.put({(x, y) for (x, y) in s if y in (23, 26) and x % 4 == 1}, 4, metal)
    dome = NAVY if mat == 'iron' else (SHADE if mat == 'kin' else IRON)
    c.shape(dome, sphere(16, 15, 10, 9), spec=0.05, bias=0.22)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is dome and x in (12, 16, 20) and y < 18}, 2)
    c.shape(metal, lambda x, y: sphere(16, 20, 11.5, 4)(x, y) if y > 20 else None, bias=0.08)
    for sgn in (-1, 1):
        c.shape(metal, tube([(16 + 6 * sgn, 19), (16 + 11 * sgn, 13), (16 + 13 * sgn, 7), (16 + 12 * sgn, 2)], 1.7, 0.8), spec=0.05, bias=0.1)
    c.shape(FRUIT if mat != 'kongo' else GEM, sphere(16, 21.5, 2.2), spec=0.1, bias=0.2)
    if mat != 'iron': sparkle(c, 27, 24)
    return c

def yoroi(mat='iron'):
    main, metal, cloth = ARM[mat]
    c = Canvas(); c.ground(16, 29.5, 13, 2.2)
    skirt = NAVY if mat == 'iron' else main
    for y0 in (23, 26):
        sk = c.shape(skirt, poly_f([(7, y0), (25, y0), (26, y0 + 3), (6, y0 + 3)], (0, 0.2, 1)), bias=0.1)
        c.put({(x, y) for (x, y) in sk if x in (11, 16, 21)}, 0)
    c.shape(metal, poly_f([(7, 21), (25, 21), (25, 23), (7, 23)], (0, -0.3, 1)), bias=0.05, spec=0.05)
    def torso(x, y):
        if not (7 <= y <= 21): return None
        hw = 9 - (y - 7) * 0.12; u = (x - 16) / hw
        return (u * 0.9 + 0.1, -0.2, math.sqrt(max(0.05, 1 - u * u))) if abs(u) <= 1 else None
    t = c.shape(main, torso, spec=0.03, bias=0.05 if mat == 'iron' else 0.15)
    c.put({(x, y) for (x, y) in t if y in (16, 19)}, 1)
    c.put({(x, y) for (x, y) in t if y in (17,) and x % 3 == 0}, 4, metal)
    plate = STEEL if mat == 'iron' else metal
    c.shape(plate, poly_f([(10, 8), (22, 8), (21, 14), (11, 14)], (-0.2, -0.3, 1)), flat=1 if mat == 'iron' else 2)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is plate and y in (8, 13)}, 3, GOLD if mat != 'kongo' else GEM)
    c.shape(GOLD if mat != 'kongo' else CHALK, sphere(16, 11, 1.5), spec=0.1)
    for sgn in (-1, 1):
        for k in range(3):
            cx, cy = 16 + sgn * (10 + k * 0.8), 8 + k * 3
            pl = poly_f([(cx - 3.6, cy), (cx + 3.6, cy), (cx + 3.2 + sgn * .5, cy + 3), (cx - 3.2 + sgn * .5, cy + 3)], (sgn * 0.3, -0.4, 1))
            c.shape(main, pl, bias=0.14 - k * 0.05)
            c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is main and abs(x - cx) <= 3 and y == int(cy)}, 4, metal)
    c.shape(NAVY if mat == 'iron' else SHADE, poly_f([(12, 4), (20, 4), (19, 8), (13, 8)]), flat=2)
    if mat != 'iron': sparkle(c, 28, 26)
    return c

def _guard(c, main, metal, cloth, plates=True):
    A, B = (24.5, 4.5), (11.5, 18.5)
    dx, dy = B[0] - A[0], B[1] - A[1]; L2 = dx * dx + dy * dy
    arm = tube([A, B], 4.2, 5.0)
    c.extrude(cloth, arm, 0, 2); s = c.shape(main if plates else cloth, arm, bias=0.15, spec=0.03)
    if plates:  # 板の すきま（腕に 直角）と 金具の 線
        for (x, y) in s:
            t = ((x + .5 - A[0]) * dx + (y + .5 - A[1]) * dy) / L2
            f = (t * 4.5) % 1
            if f < 0.18: c.c[(x, y)][1] = 0
            elif f < 0.36 and c.c[(x, y)][1] >= 2: c.c[(x, y)][0] = metal; c.c[(x, y)][1] = 3
    hand = sphere(8.5, 23, 5.6, 4.6)
    c.extrude(main, hand, 0, 1); c.shape(main, hand, bias=0.18, spec=0.05)
    return c

def kote(mat='iron'):
    main, metal, cloth = ARM[mat]
    c = Canvas(); c.ground(16, 28, 13, 3)
    _guard(c, main, metal, NAVY if mat == 'iron' else SHADE)
    c.shape(metal, sphere(8.5, 22.5, 2.3), spec=0.1, bias=0.1)
    if mat != 'iron': sparkle(c, 27, 22)
    return c

def suneate(mat='iron'):
    main, metal, cloth = ARM[mat]
    c = Canvas(); c.ground(16, 28.5, 14, 2.6)
    for cx in (10, 21):
        def shin(x, y, cx=cx):
            if not (6 <= y <= 26): return None
            u = (x - cx) / 4.8
            return (u, -0.1, math.sqrt(max(0.05, 1 - u * u))) if abs(u) <= 1 else None
        c.extrude(main, shin, 1, 1); s = c.shape(main, shin, bias=0.15, spec=0.03)
        c.put({(x, y) for (x, y) in s if (x - cx) % 3 == 1 and y > 8}, 1)  # 縦の すじ
        for y0 in (9, 23):
            c.put({(x, y) for (x, y) in s if y == y0}, 4, metal)
        c.shape(cloth if mat != 'iron' else ROPE, sphere(cx, 15.5, 4.2, 1.0), flat=3)  # ひも
        c.shape(metal, sphere(cx, 6.5, 4.6, 3.4), spec=0.08, bias=0.1)  # ひざの 金具
    if mat != 'iron': sparkle(c, 28, 6)
    return c

def ninja_zukin():
    c = Canvas(); c.ground(16, 28, 12, 3)
    c.shape(SHADE, sphere(16, 15, 11, 11), bias=0.25, spec=0.03)
    c.shape(SKIN, poly_f([(8, 13), (24, 13), (23, 18), (9, 18)]), flat=3)
    for x0 in (11, 18):  # 目（かわいい 丸）
        c.fix.update({(x0, 15): SUMI[0], (x0 + 1, 15): SUMI[0], (x0, 16): SUMI[0], (x0 + 1, 16): SUMI[0], (x0, 15): (255, 250, 240, 255)})
    c.shape(SHADE, tube([(25, 20), (29, 26)], 1.6), bias=0.2)  # 結び目の はし
    return c

def ninja_shozoku():
    c = Canvas(); c.ground(16, 29, 13, 2.4)
    body = poly_f([(9, 6), (23, 6), (25, 27), (7, 27)], (0, -0.1, 1))
    c.shape(SHADE, tube([(9, 8), (4, 18)], 3.2), bias=0.2); c.shape(SHADE, tube([(23, 8), (28, 18)], 3.2), bias=0.15)
    t = c.shape(SHADE, lambda x, y: (lambda n: n and ((x - 16) / 9, -0.1, 0.9))(body(x, y)), bias=0.2, spec=0.02)
    c.shape(NAVY, poly_f([(13, 6), (19, 6), (16, 14)]), flat=3)  # えり
    c.shape(CRIMSON, poly_f([(7.5, 17), (24.5, 17), (24.5, 19.5), (7.5, 19.5)]), bias=0.1)  # おび
    return c

def ninja_tekko():
    c = Canvas(); c.ground(16, 28, 13, 3)
    _guard(c, SHADE, IRON, SHADE, plates=False)
    c.put({(x, y) for (x, y) in c.c if (x - y) % 4 == 0 and c.c[(x, y)][1] >= 2 and x > 11}, 1)  # まき
    c.shape(IRON, poly_f([(5, 20.5), (11.5, 19.5), (12, 25), (5.5, 26.5)], (-0.3, -0.4, 0.9)), bias=0.1, spec=0.08)
    return c

def ninja_tabi():
    c = Canvas(); c.ground(16, 28, 14, 2.6)
    for cx, cy in ((10, 18), (21, 15)):
        sole = sphere(cx + 1, cy + 6, 6.0, 3.6)
        c.extrude(SHADE, sole, 0, 1); c.shape(SHADE, sole, bias=0.2)
        c.shape(SHADE, tube([(cx - 1, cy - 8), (cx, cy + 3)], 3.4), bias=0.25)
        c.put({(x, y) for (x, y) in c.c if x == cx + 3 and cy + 4 <= y <= cy + 8}, 0)  # 指の われめ
    return c

def samurai_jingasa():
    c = Canvas(); c.ground(16, 27, 14, 3)
    cone = lambda x, y: (lambda d: ((x - 16) / 14, (y - 18) / 6 - 0.6, 0.6) if d <= 1 else None)(((x - 16) / 14.5) ** 2 + ((y - 18) / 7) ** 2)
    c.extrude(SUMI, cone, 0, 2); s = c.shape(SUMI, cone, bias=0.35, spec=0.03)
    c.put({(x, y) for (x, y) in s if ((x - 16) / 14.5) ** 2 + ((y - 18) / 7) ** 2 > 0.8}, 4, GOLD)
    c.shape(SUMI, sphere(16, 15, 6, 3.5), bias=0.4)
    c.shape(GOLD, sphere(16, 15, 2.4, 1.8), spec=0.1)
    return c

def samurai_haori():
    c = Canvas(); c.ground(16, 29, 14, 2.4)
    c.shape(CRIMSON, tube([(9, 8), (3, 19)], 3.6), bias=0.2); c.shape(CRIMSON, tube([(23, 8), (29, 19)], 3.6), bias=0.15)
    body = poly_f([(9, 5), (23, 5), (26, 28), (6, 28)])
    c.shape(CRIMSON, lambda x, y: body(x, y) and ((x - 16) / 10, -0.1, 0.9), bias=0.2, spec=0.02)
    c.shape(CHALK, poly_f([(13, 5), (16, 5), (15, 28), (13, 28)]), flat=3)  # えりの 白
    c.shape(CHALK, poly_f([(16, 5), (19, 5), (19, 28), (17, 28)]), flat=2)
    c.put({(x, y) for (x, y) in c.c if y in (20, 24) and c.c[(x, y)][0] is CRIMSON and x % 4 < 2}, 4)  # だんだら の 白
    c.shape(GOLD, sphere(16, 15, 1.5), spec=0.1)
    return c

def samurai_tekko():
    c = Canvas(); c.ground(16, 28, 13, 3)
    _guard(c, CRIMSON, GOLD, SUMI)
    c.shape(GOLD, sphere(8.5, 22.5, 2.6), spec=0.1, bias=0.1)
    c.shape(CRIMSON, sphere(8.5, 22.5, 1.0), flat=2)  # 家紋
    return c

def samurai_geta():
    c = Canvas(); c.ground(16, 28, 14, 2.6)
    for cx, cy in ((10, 15), (21, 12)):
        top = poly_f([(cx - 4, cy - 6), (cx + 4, cy - 6), (cx + 5, cy + 9), (cx - 5, cy + 9)], (0, -0.6, 0.8))
        c.extrude(WOOD, top, 0, 3, 1); c.shape(WOOD, top, bias=0.2)
        c.shape(CRIMSON, tube([(cx - 4, cy + 1), (cx, cy - 4), (cx + 4, cy + 1)], 1.1), bias=0.25)
    return c

# ---------- 道具 ----------
def fude():
    c = Canvas(); c.ground(16, 27, 12, 2.6)
    s = tube([(9, 23), (27, 5)], 1.6)
    c.extrude(BAMBOO, s); bb = c.shape(BAMBOO, s, bias=0.15)
    c.put({q for q in bb if q[0] + q[1] in (24, 32)}, 1)
    tip = tube([(9, 23), (5, 27), (3.2, 29)], 2.2, 0.6)
    c.shape(SUMI, tip, bias=0.2, spec=0.05)
    return c

def kuwa():
    c = Canvas(); c.ground(16, 27, 13, 3)
    h = tube([(5, 28), (23, 9)], 1.8)
    c.extrude(WOOD, h); c.shape(WOOD, h, bias=0.08)
    bl = poly_f([(19, 7), (27, 5), (29, 15), (21, 17.5)], (0.2, -0.2, 0.95))
    c.extrude(IRON, bl, 0, 2); b = c.shape(IRON, bl, bias=0.1, spec=0.05)
    c.put({(x, y) for (x, y) in b if (x, y + 1) not in b}, 4)
    return c

def watering_can(color=WATER, long=False):
    c = Canvas(); c.ground(15, 28, 13, 3)
    def body(x, y):
        if not (12 <= y <= 27): return None
        u = (x - 13) / 8.5
        return (u, 0.1, math.sqrt(max(0, 1 - u * u))) if abs(u) <= 1 else None
    c.shape(color, body, bias=0.15, spec=0.04)
    c.shape(color, sphere(13, 12, 8.5, 3.6, 0.3), flat=3)
    c.shape(color, sphere(13, 12, 6, 2.2), flat=1)
    sp = tube([(20, 22), (30 if long else 27, 7 if long else 11)], 1.4, 1.0)
    c.extrude(color, sp); c.shape(color, sp, bias=0.2)
    c.shape(color, sphere(30.2 if long else 27.4, 6 if long else 10, 2.0, 1.4), bias=0.2)
    c.shape(color, tube(arc_pts(8, 13, 4, 180, 360, 8, 6), 1.1), bias=0.2)
    return c

def bucket(fill=None, swirl=False):
    c = Canvas(); c.ground(16, 28.5, 13, 2.8)
    def body(x, y):
        if not (12 <= y <= 28): return None
        hw = 12.5 - 2.5 * (y - 12) / 16; u = (x - 16) / hw
        if abs(u) > 1: return None
        return (u, 0.15, math.sqrt(max(0, 1 - u * u))) if y <= 26 + 2.5 * math.sqrt(max(0, 1 - u * u)) else None
    b = c.shape(IRON, body, bias=0.12, spec=0.03)
    c.put({(x, y) for (x, y) in b if y in (16, 24)}, 1)
    c.put({(x, y) for (x, y) in b if y in (15, 23) and 6 < x < 14}, 4)
    c.shape(IRON, sphere(16, 12, 12.6, 6.2, 0.2), flat=1)
    inner = fill or SHADE
    c.shape(inner, sphere(16, 12.3, 11, 5), flat=2 if fill else 1)
    w = {p for p, v in c.c.items() if v[0] is inner}
    c.put({(x, y) for (x, y) in w if y <= 9}, 1); c.put({(x, y) for (x, y) in w if y >= 14}, 3 if fill else 2)
    if fill:
        c.fix.update({(11, 12): fill[4], (12, 12): fill[4], (13, 11): CREAM})
    if swirl:  # わきどころ の うず
        for k in range(10):
            a = k * 0.8; r = 1 + k * 0.45
            q = (round(18 + r * math.cos(a)), round(12 + r * 0.5 * math.sin(a)))
            if q in c.c: c.fix[q] = (fill or WATER)[1]
    c.shape(IRON, tube([(4, 12), (8, 3), (16, 1.2), (24, 3), (28, 12)], 0.9), bias=0.2)
    c.fix[(6, 17)] = CREAM
    return c

def mushi_ami():
    c = Canvas(); c.ground(16, 27, 13, 3)
    h = tube([(4, 29), (16, 17)], 1.4)
    c.extrude(BAMBOO, h); c.shape(BAMBOO, h, bias=0.15)
    ring = arc_pts(21, 11, 8, 0, 360, 28, 7)
    net = sphere(21, 11, 7.2, 6.2)
    c.shape(CHALK, lambda x, y: net(x, y) and (0, 0, 1), flat=2)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is CHALK and ((x + y) % 3 == 0 or (x - y) % 3 == 0)}, 1)
    c.shape(BAMBOO, tube(ring, 1.1), bias=0.2)
    return c

def mizumori():
    c = Canvas(); c.ground(16, 27, 14, 3)
    top = [(3, 15), (14, 9), (29, 13), (18, 19)]; left = [(3, 15), (18, 19), (18, 25), (3, 21)]; right = [(18, 19), (29, 13), (29, 18), (18, 25)]
    c.shape(WOOD, poly_f(left), flat=2); c.shape(WOOD, poly_f(right), flat=1); c.shape(WOOD, poly_f(top), flat=3)
    c.shape(WATER, poly_f([(9, 14), (14, 11.5), (23, 13.5), (18, 16)]), flat=3)
    c.fix.update({(15, 13): CREAM, (16, 13): CREAM})
    return c

def dotsuki():
    c = Canvas(); c.ground(16, 28, 10, 3)
    def log_(x, y):
        if not (8 <= y <= 26): return None
        u = (x - 16) / 6.5
        return (u, 0.1, math.sqrt(max(0, 1 - u * u))) if abs(u) <= 1 else None
    c.shape(WOOD, log_, bias=0.15)
    c.shape(WOOD, sphere(16, 8, 6.5, 2.8, 0.2), flat=3)
    c.put({(x, y) for (x, y) in c.c if ((x - 16) ** 2 / 20 + (y - 8) ** 2 / 3) < 1 and (x + y) % 3 == 0}, 2)  # 年輪
    for cx in (6, 26):
        c.shape(WOOD, tube([(cx, 12), (cx, 20)], 1.6), bias=0.2)
    c.shape(ROPE, sphere(16, 18, 6.6, 1.0), flat=3)
    return c

def chalk():
    c = Canvas(); c.ground(16, 25, 12, 2.6)
    s = tube([(7, 23), (25, 9)], 3.0)
    c.extrude(CHALK, s, 0, 1); c.shape(CHALK, s, bias=0.15)
    c.shape(CHALK, sphere(25, 9, 3.0, 3.0, 0.4), flat=4)
    return c
