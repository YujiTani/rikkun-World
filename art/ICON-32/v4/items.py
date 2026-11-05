"""ICON-32 v4: 見下ろしの クォータービュー・逆光・明暗 つよめ（LoL の アイコンの 「感じ」だけ 参考、絵は 自作）。"""
import math
from lib import *

def iron_pickaxe():
    c = Canvas()
    h = tube([(5, 28), (22, 11)], 1.8)
    c.extrude(WOOD, h); c.shape(WOOD, h)
    c.put({p for p, v in c.c.items() if p[0] < 10 and p[1] > 22 and (p[0] - p[1]) % 3 == 0}, 0, LACQ)
    head = lambda x, y: tube(arc_pts(17, 21, 13, 200, 270, 12, 11), 1.2, 2.8)(x, y) or tube(arc_pts(17, 21, 13, 270, 340, 12, 11), 2.8, 1.2)(x, y)
    c.extrude(IRON, head, 1, 2); c.shape(IRON, head, spec=0.05)
    c.shape(GOLD, sphere(20.5, 12.5, 2.4), spec=0.06)
    return c

def katana():
    c = Canvas()
    # 長い 刀身（左下 → 右上、ゆるい そり）
    spine = [(7.0, 25.0), (13, 18.6), (19.5, 11.6), (25.5, 5.6), (30.8, 1.2)]
    def blade(x, y):
        return tube(spine, 1.5, 0.45)(x, y)
    c.extrude(STEEL, blade, 1, 1, 1)
    b = c.shape(STEEL, blade, bias=0.1, spec=0.02)
    c.put({(x, y) for (x, y) in b if (x - 1, y - 1) not in b}, 4)  # 峰の 光
    c.put({(x, y) for (x, y) in b if x + y in (31, 32) and x > 10}, 5)
    c.shape(GOLD, sphere(6.6, 25.4, 2.5, 2.0), spec=0.05)
    hl = tube([(2.6, 29.4), (5.6, 26.4)], 1.6)
    c.extrude(NAVY, hl); hh = c.shape(NAVY, hl, bias=0.1)
    c.put({p for p in hh if (p[0] + p[1]) % 3 == 0}, 4)
    c.shape(GOLD, sphere(2.2, 30.0, 1.2))
    return c

def iron_ingot():
    c = Canvas()
    top = [(3, 16), (14, 9), (29, 13), (18, 21)]
    left = [(3, 16), (18, 21), (18, 26), (3, 21)]
    right = [(18, 21), (29, 13), (29, 18), (18, 26)]
    c.shape(IRON, poly_f(left), flat=2); c.shape(IRON, poly_f(right), flat=1); c.shape(IRON, poly_f(top), flat=3)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][1] == 3 and ((x, y + 1) not in c.c or c.c[(x, y + 1)][1] != 3)}, 4)
    c.fix.update({(11, 12): CREAM, (12, 12): CREAM, (12, 13): CREAM, (20, 14): IRON[4]})
    return c

def tomato():
    c = Canvas()
    c.shape(FRUIT, sphere(16, 18, 13, 11.5), spec=0.04, bias=0.08)
    for a in range(0, 360, 72):
        r = math.radians(a + 18)
        c.shape(LEAF, tube([(16, 13), (16 + 6.5 * math.cos(r), 13 + 4 * math.sin(r))], 2.0, 0.7), bias=0.1)
    c.shape(LEAF, sphere(16, 13, 1.8), bias=0.1)
    c.shape(LEAF, tube([(16, 13), (17.5, 9)], 1.0), bias=0.15)
    c.fix.update({(9, 17): CREAM, (10, 16): CREAM, (9, 18): FRUIT[4], (11, 16): FRUIT[4]})
    return c

def water_bucket():
    c = Canvas()
    def body(x, y):
        if not (12 <= y <= 28): return None
        t = (y - 12) / 16; hw = 12.5 - 2.5 * t
        u = (x - 16) / hw
        if abs(u) > 1: return None
        bot = 28 - 2.5 * math.sqrt(max(0, 1 - u * u))
        return (u, 0.15, math.sqrt(max(0, 1 - u * u))) if y <= 26 + 2.5 * math.sqrt(max(0, 1 - u * u)) else None
    b = c.shape(IRON, body, bias=0.1)
    c.put({(x, y) for (x, y) in b if y == 20}, 1)
    c.shape(IRON, sphere(16, 12, 12.6, 6.2, 0.2), flat=1)  # 口（見下ろし で 大きく）
    c.shape(WATER, sphere(16, 12.3, 11, 5), flat=2, bias=0)
    w = {p for p, v in c.c.items() if v[0] is WATER}
    c.put({(x, y) for (x, y) in w if y <= 9}, 1)
    c.put({(x, y) for (x, y) in w if y >= 14}, 3)
    c.shape(IRON, tube([(4, 12), (8, 3), (16, 1.2), (24, 3), (28, 12)], 0.9), bias=0.15)
    c.fix.update({(11, 12): WATER[4], (12, 12): WATER[4], (13, 11): CREAM, (6, 17): CREAM})
    return c

def rope():
    c = Canvas()
    for cy, rx, ry in ((20, 12.5, 8.5), (17, 10, 6.8), (14.5, 7, 4.7)):
        s = c.shape(ROPE, tube(arc_pts(16, cy, rx, 0, 360, 36, ry), 2.0), bias=0.05)
        c.put({(x, y) for (x, y) in s if (x + y) % 7 == 0}, 1)
    c.shape(ROPE, tube([(22, 15), (26, 8), (24, 3)], 1.8), bias=0.05)
    return c

def kabuto():
    c = Canvas()
    s = c.shape(CRIMSON, lambda x, y: sphere(16, 18, 14, 10)(x, y) if y > 17 else None, bias=-0.05)
    c.put({(x, y) for (x, y) in s if y == 24}, 1)
    c.shape(NAVY, sphere(16, 16, 10.5, 8.5), spec=0.05, bias=0.18)
    c.shape(GOLD, lambda x, y: sphere(16, 19.5, 11.5, 4.2)(x, y) if y > 19.5 else None, bias=0.05)
    for sgn in (-1, 1):
        c.shape(GOLD, tube([(16 + 2 * sgn, 15), (16 + 7 * sgn, 9), (16 + 11 * sgn, 6), (16 + 13 * sgn, 1.5)], 2.0, 0.9), spec=0.04, bias=0.08)
    c.shape(FRUIT, sphere(16, 15.5, 2.8), spec=0.08, bias=0.15)
    c.fix.update({(15, 14): CREAM})
    return c

def momo_yaki():
    c = Canvas()
    bone = tube([(10, 22), (5.5, 26.5)], 1.6)
    c.extrude(BONE, bone); c.shape(BONE, bone, bias=0.1)
    c.shape(BONE, sphere(4.0, 26.0, 1.9), bias=0.1); c.shape(BONE, sphere(6.2, 28.4, 1.9), bias=0.1)
    meat = lambda x, y: sphere(18, 13, 10.5, 8.8)((x - 18) * .85 + (y - 13) * .5 + 18, (y - 13) * .85 - (x - 18) * .5 + 13)
    c.extrude(MEAT, meat, 1, 2); c.shape(MEAT, meat, spec=0.04, bias=0.05)
    c.shape(MEAT, tube([(13, 17), (10, 21.5)], 3.4, 2.0))
    m = {p for p, v in c.c.items() if v[0] is MEAT and v[1] > 1}
    c.put({(x, y) for (x, y) in m if (x - y) % 6 == 0 and 11 < x < 25 and 6 < y < 18}, 1)
    c.fix.update({(13, 7): CREAM, (14, 7): CREAM, (12, 8): MEAT[4]})
    return c

def yumi():
    c = Canvas()
    arc = tube(arc_pts(31, 33, 28, 180, 270, 20), 1.5)
    c.extrude(LACQ, arc); c.shape(LACQ, arc, bias=0.2, spec=0.05)
    g = tube([(10.8, 12.6), (12.6, 10.8)], 2.0)
    gp = c.shape(ROPE, g, bias=0.1)
    c.put({p for p in gp if (p[0] + p[1]) % 3 == 0}, 1)
    for p in line_px(4.5, 30, 30, 4.5): c.fix[p] = ROPE[4]
    c.shape(GOLD, sphere(3.5, 29.5, 1.4), spec=0.1); c.shape(GOLD, sphere(29.5, 3.5, 1.4), spec=0.1)
    return c

def yoroi():
    c = Canvas()
    # 正面 3/4: 胴は 左が 光、右に 細い 横の 面
    def torso(x, y):
        if not (8 <= y <= 28): return None
        hw = 9.5 - (y - 8) * 0.08
        u = (x - 15) / hw
        if abs(u) > 1: return None
        return (u * 0.9 + 0.15, -0.15, math.sqrt(max(0.05, 1 - u * u)))
    c.extrude(CRIMSON, torso, 2, 0, 0)
    t = c.shape(CRIMSON, torso, spec=0.03)
    for y0 in (15, 20, 25):
        c.put({(x, y) for (x, y) in t if y == y0}, 0)
        c.put({(x, y) for (x, y) in t if y == y0 + 1}, 3)
    c.put({(x, y) for (x, y) in t if y in (16, 21) and x in (10, 15, 20)}, 4, GOLD)
    c.shape(GOLD, poly_f([(9, 9), (21, 9), (19.5, 14), (10.5, 14)]), spec=0.05, bias=0.1)  # 胸の 金の 板
    c.shape(FRUIT, sphere(15, 11.5, 1.6), spec=0.1, bias=0.2)
    for cx, cy in ((6, 10), (25, 10)):
        sh = sphere(cx, cy, 4.6, 3.6)
        c.extrude(CRIMSON, sh, 0, 1); c.shape(CRIMSON, sh, spec=0.05, bias=0.05)
        c.put({(x, y) for (x, y) in c.c if abs(x - cx) <= 3 and y == cy + 1}, 4, GOLD)
    c.shape(NAVY, poly_f([(11, 5), (19, 5), (18, 9), (12, 9)]), flat=2)
    return c

def diamond():
    c = Canvas()
    facets = [([(3, 12), (8, 5), (12, 12)], 4), ([(8, 5), (24, 5), (20, 12), (12, 12)], 3), ([(24, 5), (29, 12), (20, 12)], 2),
              ([(3, 12), (12, 12), (16, 29)], 3), ([(12, 12), (20, 12), (16, 29)], 2), ([(20, 12), (29, 12), (16, 29)], 1)]
    for pts, t in facets: c.shape(GEM, poly_f(pts), flat=t)
    c.put({(x, 12) for x in range(4, 29)}, 4)
    c.fix.update({(9, 7): CREAM, (10, 7): CREAM, (9, 8): CREAM, (8, 7): GEM[4], (11, 7): GEM[4], (9, 6): GEM[4], (14, 18): GEM[4], (14, 19): CREAM})
    return c

from items_v3_grass import grass  # noqa
ALL = ['iron_pickaxe', 'katana', 'iron_ingot', 'tomato', 'grass', 'water_bucket', 'rope', 'kabuto', 'momo_yaki', 'yumi', 'yoroi', 'diamond']
