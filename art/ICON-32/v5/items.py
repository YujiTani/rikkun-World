"""ICON-32 v5: 同じ カメラ（上から 約 40 度・光は 左上）・地面の かげ・光の 側の ふち・逆光。"""
import math
from lib import *

def iron_pickaxe():
    c = Canvas(); c.ground(17, 27, 13, 3.2)
    h = tube([(5, 27), (22, 10)], 1.8)
    c.extrude(WOOD, h); c.shape(WOOD, h, bias=0.05)
    c.put({p for p, v in c.c.items() if p[0] < 9 and p[1] > 23}, 1, CRIMSON)
    head = lambda x, y: tube(arc_pts(17, 21, 13, 200, 270, 12, 11), 1.2, 2.8)(x, y) or tube(arc_pts(17, 21, 13, 270, 340, 12, 11), 2.8, 1.2)(x, y)
    c.extrude(IRON, head, 0, 2); c.shape(IRON, head, spec=0.05, bias=0.05)
    c.shape(GOLD, sphere(20.5, 11.8, 2.4), spec=0.08)
    return c

def katana():
    c = Canvas(); c.ground(17, 26, 14, 3)
    spine = [(5.0, 26.5), (11, 20.3), (17.5, 13.4), (24, 6.8), (30.9, 0.9)]
    blade = tube(spine, 1.9, 0.5)
    c.extrude(STEEL, blade, 0, 1, 1)
    b = c.shape(STEEL, blade, flat=2)
    c.put({(x, y) for (x, y) in b if (x - 1, y - 1) not in b and (x, y - 1) not in b}, 4)       # 峰
    c.put({(x, y) for (x, y) in b if (x + 1, y + 1) not in b or (x, y + 1) not in b}, 5)         # 刃の ふち
    c.put({(x, y) for (x, y) in b if x + y == 32 + (x // 2) % 2 and 8 < x < 27}, 1)             # はもん（波）
    c.shape(GOLD, sphere(5.0, 26.6, 2.4, 1.9), spec=0.08)
    hl = tube([(1.6, 30.4), (4.2, 27.8)], 1.6)
    c.extrude(NAVY, hl); c.shape(NAVY, hl, bias=0.15)
    return c

def iron_ingot():
    c = Canvas(); c.ground(16, 25, 14, 3.5)
    top = [(3, 15), (14, 9), (29, 12), (18, 19)]
    left = [(3, 15), (18, 19), (18, 25), (3, 21)]
    right = [(18, 19), (29, 12), (29, 18), (18, 25)]
    c.shape(IRON, poly_f(left), flat=2); c.shape(IRON, poly_f(right), flat=1); c.shape(IRON, poly_f(top), flat=3)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][1] == 3 and ((x, y + 1) not in c.c or c.c[(x, y + 1)][1] != 3)}, 4)
    c.fix.update({(11, 11): CREAM, (12, 11): CREAM, (12, 12): CREAM, (21, 13): IRON[4]})
    return c

def tomato():
    c = Canvas(); c.ground(16, 28, 12, 2.8)
    c.shape(FRUIT, sphere(16, 18, 13, 11), spec=0.04, bias=0.08)
    for a in range(0, 360, 72):
        r = math.radians(a + 18)
        c.shape(LEAF, tube([(16, 12.5), (16 + 6.5 * math.cos(r), 12.5 + 3.6 * math.sin(r))], 2.0, 0.7), bias=0.12)
    c.shape(LEAF, sphere(16, 12.5, 1.8), bias=0.1)
    c.shape(LEAF, tube([(16, 12.5), (17.5, 8.5)], 1.0), bias=0.15)
    c.fix.update({(9, 17): CREAM, (10, 16): CREAM, (9, 18): FRUIT[4], (11, 16): FRUIT[4]})
    return c

def grass(old=None):
    c = Canvas(); c.ground(16, 28, 14, 3)
    top = [(16, 3), (29, 9.5), (16, 16), (3, 9.5)]
    left = [(3, 9.5), (16, 16), (16, 29), (3, 22.5)]
    right = [(16, 16), (29, 9.5), (29, 22.5), (16, 29)]
    L_ = c.shape(SOIL, poly_f(left), flat=2); R_ = c.shape(SOIL, poly_f(right), flat=1)
    T_ = c.shape(LEAF, poly_f(top), flat=2)
    # 横の 面: 上は 草の たれ、下は 土の 層・小石
    for S, base in ((L_, 0), (R_, -1)):
        for (x, y) in S:
            ytop = 9.5 + (x - 3) * 6.5 / 13 if x < 16 else 16 - (x - 16) * 6.5 / 13
            d = y - ytop
            drip = 3 + ((x * 7) % 3 == 0)
            if d < drip: c.c[(x, y)][0] = LEAF; c.c[(x, y)][1] = 2 + base + (1 if d < 1.5 else 0)
            elif int(d) in (9,): c.c[(x, y)][1] = 1 + base
            else: c.c[(x, y)][1] = 2 + base
    for p in ((7, 19), (8, 19), (12, 24), (21, 21), (25, 17), (22, 25)):
        if p in c.c: c.c[p][0] = STONE; c.c[p][1] = 3 if p[0] < 16 else 2
    # 上の 面: 草の 房（明るい 点と こい 根元）
    for (x, y) in T_:
        h = (x * 73 + y * 151 + x * y * 7) % 23
        if h == 0 and (x, y + 1) in T_: c.c[(x, y)][1] = 4; c.c[(x, y + 1)][1] = 1   # 草の 房: 先が 明るく 根元が こい
        elif x + y < 19: c.c[(x, y)][1] = 3
    return c

def water_bucket():
    c = Canvas(); c.ground(16, 28.5, 13, 2.8)
    def body(x, y):
        if not (12 <= y <= 28): return None
        hw = 12.5 - 2.5 * (y - 12) / 16; u = (x - 16) / hw
        if abs(u) > 1: return None
        return (u, 0.15, math.sqrt(max(0, 1 - u * u))) if y <= 26 + 2.5 * math.sqrt(max(0, 1 - u * u)) else None
    b = c.shape(IRON, body, bias=0.1)
    c.put({(x, y) for (x, y) in b if y == 20}, 1)
    c.shape(IRON, sphere(16, 12, 12.6, 6.2, 0.2), flat=1)
    c.shape(WATER, sphere(16, 12.3, 11, 5), flat=2)
    w = {p for p, v in c.c.items() if v[0] is WATER}
    c.put({(x, y) for (x, y) in w if y <= 9}, 1); c.put({(x, y) for (x, y) in w if y >= 14}, 3)
    c.shape(IRON, tube([(4, 12), (8, 3), (16, 1.2), (24, 3), (28, 12)], 0.9), bias=0.2)
    c.fix.update({(11, 12): WATER[4], (12, 12): WATER[4], (13, 11): CREAM, (6, 17): CREAM})
    return c

def rope():
    c = Canvas(); c.ground(16, 27.5, 14, 3)
    for cy, rx, ry in ((20, 12.5, 7.5), (17, 10, 6), (14.5, 7, 4.2)):
        s = c.shape(ROPE, tube(arc_pts(16, cy, rx, 0, 360, 36, ry), 2.0), bias=0.08)
        c.put({(x, y) for (x, y) in s if (x + y) % 7 == 0}, 1)
    c.shape(ROPE, tube([(22, 15), (26, 8), (24, 3)], 1.8), bias=0.08)
    return c

def kabuto():
    c = Canvas(); c.ground(16, 28, 14, 3)
    s = c.shape(CRIMSON, lambda x, y: sphere(16, 19, 14, 9.5)(x, y) if y > 18 else None, bias=0.05)  # しころ
    c.put({(x, y) for (x, y) in s if y in (22, 25)}, 1)
    c.shape(NAVY, sphere(16, 15, 10, 9), spec=0.05, bias=0.22)  # はち
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is NAVY and x in (12, 16, 20) and y < 18}, 2)
    c.shape(GOLD, lambda x, y: sphere(16, 20, 11.5, 4)(x, y) if y > 20 else None, bias=0.08)  # まびさし
    for sgn in (-1, 1):  # 角は 横から 外へ（前の かざりに かさねない）
        c.shape(GOLD, tube([(16 + 6 * sgn, 19), (16 + 11 * sgn, 13), (16 + 13 * sgn, 7), (16 + 12 * sgn, 2)], 1.7, 0.8), spec=0.05, bias=0.1)
    c.shape(FRUIT, sphere(16, 21.5, 2.2), spec=0.1, bias=0.2)  # 前の かざり（まびさしの 上）
    return c

def momo_yaki():
    c = Canvas(); c.ground(16, 27, 13, 3)
    bone = tube([(10, 22), (5.5, 26.5)], 1.6)
    c.extrude(BONE, bone); c.shape(BONE, bone, bias=0.1)
    c.shape(BONE, sphere(4.0, 26.0, 1.9), bias=0.1); c.shape(BONE, sphere(6.2, 28.4, 1.9), bias=0.1)
    meat = lambda x, y: sphere(18, 13, 10.5, 8.8)((x - 18) * .85 + (y - 13) * .5 + 18, (y - 13) * .85 - (x - 18) * .5 + 13)
    c.extrude(MEAT, meat, 0, 2); c.shape(MEAT, meat, spec=0.04, bias=0.05)
    c.shape(MEAT, tube([(13, 17), (10, 21.5)], 3.4, 2.0))
    m = {p for p, v in c.c.items() if v[0] is MEAT and v[1] > 1}
    c.put({(x, y) for (x, y) in m if (x - y) % 6 == 0 and 11 < x < 25 and 6 < y < 18}, 1)
    c.fix.update({(13, 7): CREAM, (14, 7): CREAM, (12, 8): MEAT[4]})
    return c

def yumi():
    c = Canvas(); c.ground(17, 27, 14, 3)
    arc = tube(arc_pts(31, 33, 27, 180, 270, 20), 2.0)
    c.extrude(LACQ, arc, 0, 1); c.shape(LACQ, arc, bias=0.25, spec=0.06)
    gp = c.shape(ROPE, tube([(11.2, 13.2), (13.2, 11.2)], 2.4), bias=0.15)
    for p in line_px(5.5, 30, 30, 5.5):
        if p not in c.c: c.fix[p] = CREAM; c.fix[(p[0] + 1, p[1])] = (60, 40, 50, 255) if (p[0] + 1, p[1]) not in c.c else c.fix.get((p[0] + 1, p[1]), (60, 40, 50, 255))
    c.shape(GOLD, sphere(4.8, 30, 1.6), spec=0.1); c.shape(GOLD, sphere(30, 4.8, 1.6), spec=0.1)
    return c

def yoroi():
    c = Canvas(); c.ground(16, 29.5, 13, 2.2)
    # 草ずり（こしの 板 2 段、紺の 布＋金の 糸）
    for y0 in (23, 26):
        sk = c.shape(NAVY, poly_f([(7, y0), (25, y0), (26, y0 + 3), (6, y0 + 3)], (0, 0.2, 1)), bias=0.1)
        c.put({(x, y) for (x, y) in sk if x in (11, 16, 21)}, 0)
    c.shape(GOLD, poly_f([(7, 21), (25, 21), (25, 23), (7, 23)], (0, -0.3, 1)), bias=0.05, spec=0.05)  # おび
    def torso(x, y):
        if not (7 <= y <= 21): return None
        hw = 9 - (y - 7) * 0.12; u = (x - 16) / hw
        return (u * 0.9 + 0.1, -0.2, math.sqrt(max(0.05, 1 - u * u))) if abs(u) <= 1 else None
    t = c.shape(CRIMSON, torso, spec=0.03, bias=0.05)
    c.put({(x, y) for (x, y) in t if y in (16, 19)}, 1)
    c.shape(STEEL, poly_f([(10, 8), (22, 8), (21, 14), (11, 14)], (-0.2, -0.3, 1)), flat=1)  # 胸の 板
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is STEEL and y in (8, 13)}, 3, GOLD)
    c.shape(GOLD, sphere(16, 11, 1.5), spec=0.1)
    for sgn in (-1, 1):  # 大そで: 板 3 まい
        for k in range(3):
            cx, cy = 16 + sgn * (10 + k * 0.8), 8 + k * 3
            pl = poly_f([(cx - 3.6, cy), (cx + 3.6, cy), (cx + 3.2 + sgn * .5, cy + 3), (cx - 3.2 + sgn * .5, cy + 3)], (sgn * 0.3, -0.4, 1))
            c.shape(CRIMSON, pl, bias=0.12 - k * 0.05)
            c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is CRIMSON and abs(x - cx) <= 3 and y == int(cy)}, 4, GOLD)
    c.shape(NAVY, poly_f([(12, 4), (20, 4), (19, 8), (13, 8)]), flat=2)  # えり
    return c

def diamond():
    c = Canvas(); c.ground(16, 29, 9, 2)
    facets = [([(3, 12), (8, 5), (12, 12)], 4), ([(8, 5), (24, 5), (20, 12), (12, 12)], 3), ([(24, 5), (29, 12), (20, 12)], 2),
              ([(3, 12), (12, 12), (16, 28)], 3), ([(12, 12), (20, 12), (16, 28)], 2), ([(20, 12), (29, 12), (16, 28)], 1)]
    for pts, t in facets: c.shape(GEM, poly_f(pts), flat=t)
    c.put({(x, 12) for x in range(4, 29)}, 4)
    c.fix.update({(9, 7): CREAM, (10, 7): CREAM, (9, 8): CREAM, (8, 7): GEM[4], (11, 7): GEM[4], (9, 6): GEM[4], (14, 18): GEM[4], (14, 19): CREAM})
    return c

ALL = ['iron_pickaxe', 'katana', 'iron_ingot', 'tomato', 'grass', 'water_bucket', 'rope', 'kabuto', 'momo_yaki', 'yumi', 'yoroi', 'diamond']
