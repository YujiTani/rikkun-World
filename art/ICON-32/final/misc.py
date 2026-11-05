"""ICON-32 本番: プロトの のこり（インゴット・ダイヤ・なわ・焼きもも・トマト）と ブロックの 箱。"""
import math, os, json, sys
from lib import *
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'v5'))

def iron_ingot():
    c = Canvas(); c.ground(16, 25, 14, 3.5)
    top = [(5, 14.5), (14, 9.5), (27, 12.5), (18, 17.5)]
    left = [(3, 15), (18, 19), (18, 25), (3, 21)]; right = [(18, 19), (29, 12.5), (29, 18.5), (18, 25)]
    bevel = [(3, 15), (14, 9), (29, 12.5), (18, 19)]
    c.shape(IRON, poly_f(left), flat=2); c.shape(IRON, poly_f(right), flat=1); c.shape(IRON, poly_f(bevel), flat=3)
    c.shape(IRON, poly_f(top), flat=3)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][1] == 2 and y >= 23}, 1)          # 下の 方を こく
    edge = {(x, y) for (x, y) in c.c if c.c[(x, y)][1] == 3 and ((x, y + 1) not in c.c or c.c[(x, y + 1)][1] < 3)}
    c.put(edge, 4)
    c.put({(x, y) for (x, y) in c.c if 14 <= x <= 18 and 12 <= y <= 14 and c.c[(x, y)][1] == 3 and (x + y) % 2}, 2)  # 刻印
    c.fix.update({(9, 13): CREAM, (10, 12): CREAM, (10, 13): CREAM, (11, 12): IRON[4], (23, 13): IRON[4]})
    return c

def diamond():
    c = Canvas(); c.ground(16, 29.5, 9, 1.8)
    T = 11
    facets = [([(3, T), (8, 4), (11, T)], 4), ([(8, 4), (16, 4), (11, T)], 3), ([(16, 4), (11, T), (21, T)], 4), ([(16, 4), (24, 4), (21, T)], 3), ([(24, 4), (29, T), (21, T)], 2),
              ([(3, T), (11, T), (16, 29)], 3), ([(11, T), (16, T), (16, 29)], 2), ([(16, T), (21, T), (16, 29)], 2), ([(21, T), (29, T), (16, 29)], 1)]
    for pts, t in facets: c.shape(GEM, poly_f(pts), flat=t)
    c.put({(x, T) for x in range(4, 29)}, 4)
    c.put({(x, y) for (x, y) in c.c if y > T and abs((x - 16) - (y - T) * 0) < 0.5}, 3)
    c.fix.update({(9, 6): CREAM, (10, 6): CREAM, (9, 7): CREAM, (12, 15): GEM[4], (12, 16): CREAM, (13, 17): GEM[4]})
    sparkle(c, 26, 22, big=False)
    return c

def rope():
    c = Canvas(); c.ground(16, 27.5, 14, 3)
    for cy, rx, ry in ((20, 12.5, 7.5), (16.8, 9.8, 5.8), (14, 6.8, 4)):
        s = c.shape(ROPE, tube(arc_pts(16, cy, rx, 0, 360, 40, ry), 2.1), bias=0.1)
        c.put({(x, y) for (x, y) in s if (x + 2 * y) % 5 == 0 and c.c[(x, y)][1] >= 2}, 1)   # より（ななめの 線）
    c.shape(ROPE, tube([(22, 14), (26, 8), (24.5, 3)], 1.9), bias=0.1)
    c.put({(x, y) for (x, y) in c.c if x >= 23 and y < 12 and (x + 2 * y) % 5 == 0}, 1)
    c.shape(ROPE, sphere(24.5, 3, 2.0), flat=4)  # ほどけた はし
    return c

def momo_yaki():
    c = Canvas(); c.ground(16, 27, 13, 3)
    bone = tube([(10, 22), (5.5, 26.5)], 1.7)
    c.extrude(BONE, bone); c.shape(BONE, bone, bias=0.15)
    c.shape(BONE, sphere(3.8, 25.8, 2.0), bias=0.15); c.shape(BONE, sphere(6.4, 28.6, 2.0), bias=0.15)
    meat = lambda x, y: sphere(18, 13, 10.5, 8.8)((x - 18) * .85 + (y - 13) * .5 + 18, (y - 13) * .85 - (x - 18) * .5 + 13)
    c.extrude(MEAT, meat, 0, 2); c.shape(MEAT, meat, spec=0.05, bias=0.08)
    c.shape(MEAT, tube([(13, 17), (10, 21.5)], 3.4, 2.0), bias=0.05)
    m = {p for p, v in c.c.items() if v[0] is MEAT and v[1] >= 2}
    for k in (0, 1):  # 焼き目 2 本
        c.put({(x, y) for (x, y) in m if x - y == 6 + k * 6 and 10 < x < 26}, 1)
    c.fix.update({(13, 7): CREAM, (14, 7): CREAM, (12, 8): MEAT[4], (15, 6): MEAT[4]})
    return c

def tomato():
    c = Canvas(); c.ground(16, 28, 12, 2.8)
    c.shape(FRUIT, sphere(16, 18, 13, 11), spec=0.04, bias=0.08)
    c.put({(x, y) for (x, y) in c.c if abs(x - 16) == 5 and 14 < y < 26}, 2)  # ふくらみの すじ
    for a in range(0, 360, 72):
        r = math.radians(a + 18)
        c.shape(LEAF, tube([(16, 12.5), (16 + 6.5 * math.cos(r), 12.5 + 3.6 * math.sin(r))], 2.0, 0.7), bias=0.12)
    c.shape(LEAF, sphere(16, 12.5, 1.8), bias=0.1)
    c.shape(LEAF, tube([(16, 12.5), (17.5, 8.5)], 1.0), bias=0.15)
    c.fix.update({(9, 17): CREAM, (10, 16): CREAM, (9, 18): FRUIT[4], (11, 16): FRUIT[4]})
    return c

# ---------- ブロック（タイルから 箱） ----------
TILES = json.load(open(os.path.join(HERE, '..', 'ref', 'tiles.json')))
CROSS = {'flower_y', 'flower_o', 'flower_p', 'nobana'}

def _tile(px, u, v):
    return px[min(15, int(v * 16)) * 16 + min(15, int(u * 16))]

def block(iid):
    t = TILES[iid]; c = Canvas()
    if iid in CROSS:  # 草花は 板の 絵を 2 倍＋地面の かげ
        c.ground(16, 29, 10, 2.4)
        img = {}
        for y in range(32):
            for x in range(32):
                col = t['side'][(y // 2) * 16 + x // 2]
                if col[3] > 0: img[(x, y)] = tuple(col)
        for p, col in img.items(): c.c[p] = [STONE, 2, 0]; c.fix[p] = col
        return c
    c.ground(16, 28.5, 14, 3)
    cx, cy, w, h, H = 16, 3.0, 13.0, 6.5, 13.0
    top = poly_f([(cx, cy), (cx + w, cy + h), (cx, cy + 2 * h), (cx - w, cy + h)])
    left = poly_f([(cx - w, cy + h), (cx, cy + 2 * h), (cx, cy + 2 * h + H), (cx - w, cy + h + H)])
    right = poly_f([(cx, cy + 2 * h), (cx + w, cy + h), (cx + w, cy + h + H), (cx, cy + 2 * h + H)])
    sl = c.shape(STONE, left, flat=2); sr = c.shape(STONE, right, flat=2); st = c.shape(STONE, top, flat=2)
    def warm(col, k):
        r, g, b = col[0] * k, col[1] * k, col[2] * k
        if k < 1: b = min(255, b + (1 - k) * 40)  # かげは 青へ
        return (int(min(255, r)), int(min(255, g)), int(min(255, b)), 255)
    for (x, y) in st:
        X, Y = x + .5 - cx, y + .5 - cy; u, v = (X / w + Y / h) / 2, (Y / h - X / w) / 2
        c.fix[(x, y)] = warm(_tile(t['top'], u, v), 1.05)
    for (x, y) in sl:
        u = (x + .5 - cx + w) / w; y0 = cy + h + (x + .5 - cx + w) * h / w
        c.fix[(x, y)] = warm(_tile(t['side'], u, (y + .5 - y0) / H), 0.85)
    for (x, y) in sr:
        u = (x + .5 - cx) / w; y0 = cy + 2 * h - (x + .5 - cx) * h / w
        c.fix[(x, y)] = warm(_tile(t['side'], u, (y + .5 - y0) / H), 0.66)
    for (x, y) in st:  # 上の 面の 手前の ふちを 明るく
        if (x, y + 1) not in st:
            col = c.fix[(x, y)]; c.fix[(x, y)] = tuple(min(255, int(v * 1.25 + 12)) for v in col[:3]) + (255,)
    return c

def block_ids():
    return list(TILES)
