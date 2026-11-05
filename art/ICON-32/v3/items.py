"""ICON-32 v3 の 12 点。座標は 32 の マス（小数 OK）。"""
import math
from lib import *

def iron_pickaxe():
    c = Canvas()
    c.shape(WOOD, tube([(6.5, 27.5), (21, 13)], 1.7))
    grip = {(x, y) for (x, y) in c.c if x + (32 - y) < 15}
    c.put({p for p in grip if (p[0] - p[1]) % 3 == 0}, 0, LACQ); c.put({p for p in grip if (p[0] - p[1]) % 3 != 0}, 2, LACQ)
    c.shape(IRON, tube(arc_pts(17, 21, 13, 200, 270, 12, 11), 1.1, 2.6), spec=0.04)
    c.shape(IRON, tube(arc_pts(17, 21, 13, 270, 340, 12, 11), 2.6, 1.1), spec=0.04)
    c.shape(IRON, sphere(20.5, 12.5, 2.6, 2.6))
    return c

def katana():
    c = Canvas()
    blade = poly_f([(11.5, 18.0), (26.5, 3.0), (30.0, 1.5), (29.0, 5.5), (14.0, 20.5)], (0.3, -0.5, 0.8))
    b = c.shape(STEEL, blade)
    edge = {(x, y) for (x, y) in b if (x + 1, y + 1) not in b}
    back = {(x, y) for (x, y) in b if (x - 1, y - 1) not in b}
    c.put(back, 4); c.put(edge, 1)
    c.put({(x, y) for (x, y) in b if x + y in (31, 32) and x > 17}, 5)
    c.shape(GOLD, sphere(12.0, 20.0, 3.3, 3.3, 0.5), spec=0.02)
    h = c.shape(NAVY, tube([(5.0, 27.0), (10.3, 21.7)], 1.9))
    c.put({p for p in h if (p[0] + p[1]) % 2 == 0 and (p[0] - p[1]) % 4 in (0, 1)}, 4, None)
    c.shape(GOLD, sphere(4.2, 27.8, 1.6))
    return c

def iron_ingot():
    c = Canvas()
    c.shape(IRON, poly_f([(2, 19), (9, 10), (30, 10), (30, 15), (23, 25), (2, 25)]), flat=2)
    c.put({(x, y) for (x, y) in c.c if x >= 23 and y > 10}, 1)
    top = poly_f([(3, 19), (9.5, 11), (29.5, 11), (23, 19)])
    c.put({(x, y) for (x, y) in list(c.c) if top(x + .5, y + .5)}, 3)
    c.put({(x, 19) for x in range(3, 23)}, 4)
    c.put({(x, y) for (x, y) in c.c if y == 11 and 10 <= x <= 29}, 4)
    c.fix.update({(9, 14): CREAM, (10, 14): CREAM, (9, 15): CREAM, (13, 13): CREAM})
    return c

def tomato():
    c = Canvas()
    c.shape(FRUIT, sphere(16, 19, 12.5, 10.5), spec=0.03, bias=0.08)
    c.put({(x, y) for (x, y) in c.c if x == 16 and 11 < y < 27}, 1)
    for a in (200, 250, 290, 340, 95 + 180):
        r = math.radians(a)
        c.shape(LEAF, tube([(16, 10.5), (16 + 7 * math.cos(r), 10.5 + 3.5 * math.sin(r) + 2.5)], 1.9, 0.7), bias=0.1)
    c.shape(LEAF, tube([(16, 10.5), (17.5, 5)], 1.1))
    c.fix.update({(9, 15): CREAM, (10, 14): CREAM, (9, 16): FRUIT[4], (11, 14): FRUIT[4]})
    return c

def water_bucket():
    c = Canvas()
    c.shape(IRON, tube(arc_pts(16, 11, 10, 180, 360, 16, 9), 1.0), bias=0.1)
    def body(x, y):
        if not (11 <= y <= 28): return None
        t = (y - 11) / 17; hw = 12.5 - 3 * t
        u = (x - 16) / hw
        return (u, 0.15, math.sqrt(max(0, 1 - u * u))) if abs(u) <= 1 else None
    b = c.shape(IRON, body, bias=0.12)
    c.put({(x, y) for (x, y) in b if y in (17, 25)}, 1)
    c.put({(x, y) for (x, y) in b if y in (16, 24) and x < 14}, 4)
    c.shape(IRON, sphere(16, 11.5, 12.6, 3.6, 0.2), flat=1)
    c.shape(WATER, sphere(16, 11.5, 11, 2.6), flat=2)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is WATER and y <= 10}, 1)
    c.fix.update({(11, 11): WATER[4], (12, 11): WATER[4], (13, 12): WATER[3], (6, 16): CREAM, (6, 17): IRON[4]})
    return c

def rope():
    c = Canvas()
    for cy, rx, ry in ((22, 11.5, 5.5), (18.5, 10.5, 5.0), (15, 9.5, 4.5)):
        ring = arc_pts(16, cy, rx, 0, 360, 32, ry)
        s = c.shape(ROPE, tube(ring, 1.9))
        c.put({(x, y) for (x, y) in s if (x + 2 * y) % 4 == 0}, 1)
    c.shape(ROPE, tube([(24, 14), (27, 9), (26, 4)], 1.7))
    c.put({(x, y) for (x, y) in c.c if x >= 24 and y < 12 and (x + 2 * y) % 4 == 0}, 1)
    return c

def kabuto():
    c = Canvas()
    s = c.shape(LACQ, poly_f([(3, 19), (29, 19), (27, 27), (5, 27)], (0, 0.3, 0.95)))
    c.put({(x, y) for (x, y) in s if y in (21, 24)}, 1)
    c.put({(x, y) for (x, y) in s if y in (22, 25) and x % 3 == 0}, 4, GOLD)
    c.shape(NAVY, lambda x, y: sphere(16, 20, 11, 10.5)(x, y) if y < 20 else None, spec=0.03, bias=0.12)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is NAVY and x in (12, 20)}, 1)
    c.shape(GOLD, poly_f([(4.5, 18.5), (27.5, 18.5), (26.5, 21), (5.5, 21)], (0, -0.4, 0.9)))
    c.shape(GOLD, tube([(14.5, 13), (10, 9), (6.5, 6), (5, 1.5)], 2.2, 1.0), spec=0.03, bias=0.05)
    c.shape(GOLD, tube([(17.5, 13), (22, 9), (25.5, 6), (27, 1.5)], 2.2, 1.0), spec=0.03, bias=0.05)
    c.shape(FRUIT, sphere(16, 13.5, 2.6), spec=0.06)
    return c

def momo_yaki():
    c = Canvas()
    c.shape(BONE, tube([(9.5, 22.5), (5.5, 26.5)], 1.6))
    c.shape(BONE, sphere(4.0, 26.0, 1.8)); c.shape(BONE, sphere(6.0, 28.2, 1.8))
    c.shape(MEAT, lambda x, y: sphere(18, 13, 10, 8.5)((x - 18) * .85 + (y - 13) * .5 + 18, (y - 13) * .85 - (x - 18) * .5 + 13), spec=0.03)
    c.shape(MEAT, tube([(13, 17), (10, 21.5)], 3.4, 2.0))
    m = {p for p, v in c.c.items() if v[0] is MEAT}
    c.put({(x, y) for (x, y) in m if (x - y) % 5 == 0 and 9 < x < 26 and 5 < y < 20}, 1)
    c.fix.update({(13, 7): CREAM, (14, 7): CREAM, (12, 8): MEAT[4]})
    return c

def yumi():
    c = Canvas()
    c.shape(LACQ, tube(arc_pts(31, 33, 28, 180, 270, 20), 1.4))
    c.put({p for p, v in c.c.items() if 11 <= p[0] <= 14 and 11 <= p[1] <= 14}, 3, LACQ)
    c.shape(LACQ, tube([(10.8, 12.6), (12.6, 10.8)], 1.9))
    g = {p for p, v in c.c.items() if 10 <= p[0] <= 13 and 10 <= p[1] <= 13}
    c.put({p for p in g if (p[0] + p[1]) % 2 == 0}, 3, ROPE); c.put({p for p in g if (p[0] + p[1]) % 2}, 1, ROPE)
    for p in line_px(3, 31, 3, 31) | line_px(4.5, 30, 30, 4.5): c.fix[p] = ROPE[4]
    c.shape(GOLD, sphere(3.5, 29.5, 1.3)); c.shape(GOLD, sphere(29.5, 3.5, 1.3))
    return c

def yoroi():
    c = Canvas()
    c.shape(LACQ, tube([(6, 10), (4, 16)], 3.0, 2.4), bias=-0.1); c.shape(LACQ, tube([(26, 10), (28, 16)], 3.0, 2.4), bias=-0.1)
    b = c.shape(LACQ, poly_f([(9, 7), (23, 7), (24, 26), (8, 26)]), bias=0)
    def torso(x, y):
        if not (7 <= y <= 27 and 8 <= x <= 24): return None
        u = (x - 16) / 8.5; return (u, -0.1, math.sqrt(max(0, 1 - u * u)))
    c.shape(LACQ, torso, bias=-0.12)
    for y0 in (12, 16, 20, 24):
        c.put({(x, y0) for x in range(8, 25)}, 0)
        c.put({(x, y0 + 1) for x in range(8, 25) if x % 3 == 1}, 4, GOLD)
    c.shape(NAVY, poly_f([(12, 6), (20, 6), (18.5, 10), (13.5, 10)]), flat=2)
    c.shape(GOLD, sphere(16, 8, 1.4))
    for side in (6, 26): c.put({(x, y) for (x, y) in c.c if abs(x - side) <= 2 and y in (13, 15)}, 4, GOLD)
    return c

def diamond():
    c = Canvas()
    facets = [([(4, 11), (9, 5), (13, 11)], 4), ([(9, 5), (23, 5), (19, 11), (13, 11)], 3), ([(23, 5), (28, 11), (19, 11)], 2),
              ([(4, 11), (13, 11), (16, 28)], 3), ([(13, 11), (19, 11), (16, 28)], 2), ([(19, 11), (28, 11), (16, 28)], 1)]
    for pts, t in facets: c.shape(GEM, poly_f(pts), flat=t)
    c.put({(x, 11) for x in range(5, 28)}, 4)
    c.fix.update({(10, 7): CREAM, (11, 7): CREAM, (10, 8): CREAM, (9, 7): GEM[4], (12, 7): GEM[4], (10, 6): GEM[4]})
    return c

def grass(old):
    top, side = old['tile:grass_top'], old['tile:grass_side']
    c = Canvas(); cx, cy, w, h, H = 16, 3.0, 13.0, 6.5, 14.0
    def T(x, y):
        X, Y = x - cx, y - cy; u, v = (X / w + Y / h) / 2, (Y / h - X / w) / 2
        return (0, -1, 1) if 0 <= u < 1 and 0 <= v < 1 else None
    def Lf(x, y):
        if not (cx - w <= x < cx): return None
        y0 = cy + h + (x - cx + w) * h / w; return (-1, 0, .6) if 0 <= y - y0 < H else None
    def Rf(x, y):
        if not (cx <= x < cx + w): return None
        y0 = cy + 2 * h - (x - cx) * h / w; return (1, 0, .6) if 0 <= y - y0 < H else None
    ramp = R('1e3a2e', '2f6a3a', '4fa045', '8cd05a', 'd2f07a')
    st = c.shape(ramp, T, flat=2); sl = c.shape(ramp, Lf, flat=2); sr = c.shape(ramp, Rf, flat=2)
    for (x, y) in st:
        X, Y = x + .5 - cx, y + .5 - cy; u, v = (X / w + Y / h) / 2, (Y / h - X / w) / 2
        c.fix[(x, y)] = tuple(top[min(15, int(v * 16)) * 16 + min(15, int(u * 16))])
    for S, k, x0, sg in ((sl, .86, cx - w, 1), (sr, .68, cx, -1)):
        for (x, y) in S:
            uu = (x + .5 - x0) / w; y0 = cy + h + (x + .5 - x0) * h / w if sg > 0 else cy + 2 * h - (x + .5 - cx) * h / w
            col = side[min(15, int((y + .5 - y0) / H * 16)) * 16 + min(15, int(uu * 16))]
            c.fix[(x, y)] = tuple(int(col[q] * k) for q in range(3)) + (255,)
    edge = {(x, y) for (x, y) in st if (x, y + 1) not in st}
    for p in edge: c.fix[p] = ramp[3]
    return c

ALL = ['iron_pickaxe', 'katana', 'iron_ingot', 'tomato', 'grass', 'water_bucket', 'rope', 'kabuto', 'momo_yaki', 'yumi', 'yoroi', 'diamond']
