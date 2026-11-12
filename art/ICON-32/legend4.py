"""ICON-32: 新しい でんせつ 4 点（大地のハンマー・八咫烏・黒龍・ノームの斧）。オーナーの 見本の 形・色を 生かす。"""
import math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

HAMMER = R('262a38', '4a5266', '7c879a', 'b4bfcc', 'eef2f6')    # 大地のハンマー: 青みの ある 鉄
EARTH = R('3a2410', '7a4a18', 'c88a28', 'f0c050', 'fff0b0')     # 大地の 光（こはく色）
BRONZE = R('3e1c12', '7c3c18', 'b96a26', 'e39c44', 'ffd98c')    # ノームの 斧: 銅
CROW = R('120e22', '241a44', '3c2c70', '5e489c', '9078c8')      # 八咫烏: 黒むらさき
VIO = R('2a1460', '5a2cb8', '8c5cf0', 'c0a0ff', 'f0e6ff')       # 八咫烏の 宝石・炎
DRAGON = R('0c0e16', '191d2a', '2a3042', '424a60', '6a7690')    # 黒龍: 墨の 黒
CYAN = R('0c3a5a', '1470a0', '28b4e0', '78e4ff', 'e0fcff')      # 黒龍の 光る すじ

def rot_rect(c, u, v):
    return [(c[0] + su * u[0] + sv * v[0], c[1] + su * u[1] + sv * v[1]) for su, sv in ((1, 1), (1, -1), (-1, -1), (-1, 1))]

S = math.sqrt(0.5)

def daichi_hammer():
    c = Canvas(); c.ground(16, 28, 14, 3)
    hl = tube([(3.2, 29.0), (19.5, 12.7)], 1.25)
    c.extrude(SUMI, hl, 0, 1); h = c.shape(SUMI, hl, bias=0.0)
    c.put({p for p in h if (p[0] - p[1]) % 6 == 0}, 3, HAMMER)           # 柄の 輪
    c.shape(EARTH, sphere(3.4, 28.8, 2.1), spec=0.12)                    # 柄じりの 金の 玉
    c.shape(EARTH, sphere(17.6, 14.6, 2.0, 2.0), bias=0.1)               # 頭の 下の 金の 輪
    cc = (21.5, 10.5); U = (S, S); V = (S, -S)
    body = poly_f(rot_rect(cc, (U[0] * 9.2, U[1] * 9.2), (V[0] * 5.4, V[1] * 5.4)), (-0.35, -0.5, 0.8))
    c.extrude(HAMMER, body, 0, 2, 0); c.extrude(HAMMER, body, 0, 1, 1)
    b = c.shape(HAMMER, body, flat=2)
    def uv(x, y): dx, dy = x + .5 - cc[0], y + .5 - cc[1]; return dx * U[0] + dy * U[1], dx * V[0] + dy * V[1]
    for (x, y) in b:
        a, w = uv(x, y)
        t = 2
        if abs(a) > 6.2: t = 3                       # 両はしの 打つ 面の わく
        if abs(a) > 8.0: t = 4
        if 5.4 < abs(a) <= 6.2: t = 1                # みぞ
        if w > 4.2: t = max(t, 3) + (1 if abs(a) > 6.2 else 0)   # 上の へり（光）
        if w < -4.2: t = min(t, 1)
        if abs(a) < 4.4 and abs(w) < 3.3: t = 0      # もようの 板（ほりこみ）
        c.c[(x, y)][1] = min(4, t)
    for (x, y) in b:                                  # ほりこみの 中の 大地の しるし（こはく色に 光る）
        a, w = uv(x, y)
        if abs(a) < 3.6 and abs(w) < 2.5:
            if abs(abs(a) - 2.4) < 0.55 or (abs(w) < 0.6 and abs(a) < 2.4) or (abs(a) < 0.6):
                c.c[(x, y)] = [EARTH, 3 if abs(w) > 1.2 else 4, 99]
    for q in ((27, 14), (15, 4)): 
        if q in c.c: c.c[q][1] = 4
    return c

def gnome_axe():
    c = Canvas(); c.ground(16, 28.5, 14, 3)
    hl = tube([(3.0, 30.0), (22.5, 8.5)], 1.35)
    c.extrude(SUMI, hl, 0, 1); h = c.shape(SUMI, hl, bias=-0.05)
    c.put({p for p in h if (p[0] - p[1]) % 3 == 0}, 0)                   # 黒い 柄の うね
    c.shape(BRONZE, tube([(2.2, 30.8), (4.2, 28.6)], 1.7), bias=0.2)     # 柄じり
    c.shape(BRONZE, tube([(22.0, 9.0), (25.6, 5.0)], 1.6, 0.4), bias=0.1)  # 先の とげ
    cc = (19.6, 11.8); U = (S, S); V = (S, -S)
    def P(a, w): return (cc[0] + a * U[0] + w * V[0], cc[1] + a * U[1] + w * V[1])
    for sg in (1, -1):
        # 三日月の 刃: 根もとは 細く、刃先は 広く 丸い
        pts = [P(sg * 1.0, 2.6), P(sg * 4.0, 4.2), P(sg * 6.0, 8.6), P(sg * 8.2, 6.0), P(sg * 9.3, 2.5), P(sg * 9.6, 0),
               P(sg * 9.3, -2.5), P(sg * 8.2, -6.0), P(sg * 6.0, -8.6), P(sg * 4.0, -4.2), P(sg * 1.0, -2.6)]
        f = poly_f(pts, (-0.3, -0.5, 0.8))
        c.extrude(BRONZE, f, 0, 1, 0)
        b = c.shape(BRONZE, f, flat=2)
        for (x, y) in b:
            dx, dy = x + .5 - cc[0], y + .5 - cc[1]; a = (dx * U[0] + dy * U[1]) * sg; w = dx * V[0] + dy * V[1]
            t = 2
            if a > 8.3 or (a > 5.6 and abs(w) > 7.2): t = 4            # とがれた 刃（明るい）
            elif a > 7.2: t = 3
            if a < 3.2: t = 1
            if w > 3.0 and t == 2: t = 3                               # 上がわに 光
            if w < -2.5 and t < 4: t = max(0, t - 1)
            if abs(a - 5.0) < 0.5 and abs(w) < 4.5: t = 1              # ほりこみの 線
            c.c[(x, y)][1] = t
    core = poly_f([P(0, 4.6), P(3.2, 0), P(0, -4.6), P(-3.2, 0)])
    c.extrude(BRONZE, core, 0, 1, 0); k = c.shape(BRONZE, core, flat=1)   # まん中の ひし形
    star = poly_f([P(0, 2.6), P(1.7, 0), P(0, -2.6), P(-1.7, 0)])
    s = c.shape(EARTH, star, flat=3)
    c.fix[(round(cc[0] - .5), round(cc[1] - .5))] = CREAM
    return c

def yatagarasu():
    c = Canvas(); c.ground(17, 30.2, 9, 1.6)
    def M(pts, sg): return [(x, 16 + sg * (y - 16)) for x, y in pts]
    for sg in (1, -1):
        # つばさの 羽（外がわへ のびる 大きな とげ 2 まい）と 内がわの かぎづめ
        for pts, r0, bias in (([(18.6, 11.5), (22.0, 7.5), (26.5, 2.0)], 1.9, 0.35), ([(16.0, 7.0), (18.5, 4.0), (21.5, 0.5)], 1.7, 0.45), ([(18.0, 11.0), (14.5, 10.6), (11.5, 7.6)], 1.4, 0.0)):
            c.shape(CROW, tube(M(pts, sg), r0, 0.35), bias=bias)
        limb = tube(M([(20.0, 15.0), (19.0, 11.0), (16.5, 6.5), (13.0, 2.6), (10.0, 1.6)], sg), 2.5, 0.8)
        c.extrude(CROW, limb, 1, 0, 0); b = c.shape(CROW, limb, bias=0.3, spec=0.04)
        for q in M([(18, 9), (15, 5)], sg): c.fix[(q[0], int(q[1]))] = GOLD[3]     # 金の びょう
    g = (20.5, 16.0)
    for k in range(8):                                                     # 金の 日輪
        a = k * math.pi / 4; ln = 6.6 if k % 2 == 0 else 5.2
        for q in line_px(g[0] - .5, g[1] - .5, g[0] - .5 + ln * math.cos(a), g[1] - .5 + ln * math.sin(a)): c.c[q] = [GOLD, 3 if k % 2 == 0 else 2, 50]
    c.shape(GOLD, sphere(g[0], g[1], 3.7), bias=0.1)
    c.shape(VIO, sphere(g[0], g[1], 2.6), bias=0.25, spec=0.2)             # 青むらさきの 宝石
    c.fix[(19, 14)] = CREAM
    for y in range(3, 30):                                                 # つる（細い）
        if (9, y) not in c.c: c.fix[(9, y)] = (196, 186, 228, 255)
    for q in ((24, 9), (25, 23), (28, 12), (28, 20)): c.fix[q] = VIO[3]     # むらさきの 火の こ
    return c

def kokuryu():
    c = Canvas(); c.ground(16, 28.5, 14, 2.6)
    cx, cy, r = 27.5, 27.5, 23.5
    def Q(deg, rr=r): return (cx + rr * math.cos(math.radians(deg)), cy + rr * math.sin(math.radians(deg)))
    _s0, _s1 = Q(181, r + .5), Q(269, r + .5)
    # 刃の ような 先（両はし）
    for d0, sg in ((198, -1), (252, 1)):
        tip = Q(d0 + sg * 17, r + 0.5)
        f = poly_f([Q(d0, r - 2.8), Q(d0, r + 3.2), tip])
        c.extrude(DRAGON, f, 0, 1, 0); b = c.shape(STEEL, f, flat=1)
        c.put({p for p in b if (p[0] - 1, p[1]) not in b or (p[0], p[1] - 1) not in b}, 3)
    # 竜の 角（外がわの とげ）と ひれ
    for deg, ln, sg in ((208, 5.0, -1), (218, 4.0, -1), (242, 5.0, 1), (232, 4.0, 1)):
        c.shape(DRAGON, tube([Q(deg, r + 1), Q(deg + sg * 9, r + ln)], 1.3, 0.3), bias=0.5)
    for deg, sg in ((212, -1), (238, 1)):
        c.shape(DRAGON, tube([Q(deg, r - 1.5), Q(deg + sg * 8, r - 5.0)], 1.2, 0.3), bias=0.3)
    limb = tube([Q(a) for a in range(196, 255, 4)], 2.6)
    c.extrude(DRAGON, limb, 0, 1, 0); b = c.shape(DRAGON, limb, bias=0.2)
    for a10 in range(1975, 2535, 6):                                      # 弓に そって 走る 水色の 光
        a = a10 / 10
        if 221 < a < 229: continue
        q = Q(a, r + 0.2); p = (math.floor(q[0]), math.floor(q[1]))
        if p in c.c: c.c[p] = [CYAN, 4 if int(a) % 9 < 5 else 3, 98]
    grip = tube([Q(221), Q(229)], 3.0)
    c.shape(DRAGON, grip, bias=0.2); 
    g = Q(225, r + 0.2); c.shape(CYAN, sphere(g[0], g[1], 1.7), bias=0.3, spec=0.25)   # 竜の 目
    for q in line_px(_s0[0], _s0[1], _s1[0], _s1[1]):
        if q not in c.c: c.fix[q] = CYAN[2]
    for q in ((8, 6), (5, 12), (12, 4)): c.fix[q] = CYAN[3]                 # 光の つぶ
    return c

FEATHER = R('7a88b8', 'b4c4e4', 'dce8f8', 'f4f8ff', 'ffffff')   # 天使の 羽（青みの 白）
HALO = R('8a5a1e', 'd9a030', 'f8d458', 'fff0a0', 'fffbe0')      # 金の 輪

def tenshi_yumi():
    """天使の弓: 白い 弓に 金の かざり、にぎりから 左右に ひろがる 天使の つばさ、上に 金の 輪"""
    c = Canvas(); c.ground(16, 30.2, 10, 1.6)
    def M(pts, sg): return [(x, 16 + sg * (y - 16)) for x, y in pts]
    # つばさ（にぎりの うしろから ひだりへ。羽を 3 まい ずつ、上は 大きく）
    for pts, r0, bias in (([(13.0, 15.0), (8.0, 11.0), (2.5, 4.5)], 2.6, 0.5), ([(13.0, 16.0), (7.5, 14.0), (2.0, 10.5)], 2.3, 0.35), ([(13.0, 17.0), (8.0, 17.5), (3.5, 16.5)], 1.9, 0.2)):
        c.shape(FEATHER, tube(pts, r0, 0.5), bias=bias)
    for pts, r0, bias in (([(13.0, 18.0), (9.0, 21.0), (5.0, 25.5)], 2.0, 0.25), ([(13.0, 18.0), (10.5, 22.5), (9.0, 27.0)], 1.6, 0.1)):
        c.shape(FEATHER, tube(pts, r0, 0.5), bias=bias)
    for sg in (1, -1):
        limb = tube(M([(15.0, 15.0), (16.5, 10.5), (19.5, 6.0), (23.5, 2.8), (26.5, 2.2)], sg), 2.2, 0.8)
        c.extrude(FEATHER, limb, 1, 0, 0); c.shape(FEATHER, limb, bias=0.4, spec=0.05)
        for q in M([(17, 9), (21, 4)], sg): c.fix[(q[0], int(q[1]))] = HALO[2]
        c.shape(HALO, tube(M([(24.5, 2.6), (27.5, 2.0)], sg), 1.2, 0.5), bias=0.3)   # 金の 先
    c.shape(HALO, sphere(14.5, 16.0, 3.0, 3.4), bias=0.15)                 # 金の にぎり
    c.shape(WATER, sphere(14.5, 16.0, 1.7), bias=0.3, spec=0.25)           # 空色の 宝石
    c.fix[(13, 14)] = CREAM
    for y in range(3, 30):                                                 # つる
        if (27, y) not in c.c: c.fix[(27, y)] = (250, 236, 170, 255)
    ring = arc_pts(8.5, 3.2, 4.2, 0, 360, 24, ry=1.5)                       # 金の 輪（天使の わ）
    for (x, y) in ring: c.fix[(round(x), round(y))] = HALO[2]
    for q in ((4, 21), (22, 13), (23, 20)): c.fix[q] = CREAM               # きらめき
    return c

IDS = ['daichi_hammer', 'yatagarasu', 'kokuryu', 'tenshi_yumi', 'gnome_axe']

if __name__ == '__main__':
    from PIL import Image
    out = sys.argv[1]
    imgs = [globals()[i]().render() for i in IDS]
    for i, im in zip(IDS, imgs): im.save(os.path.join(out, i + '.png'))
    bgs = [(120, 86, 58, 255), (86, 150, 70, 255), (28, 30, 56, 255)]
    z = 8; sh = Image.new('RGBA', (5 * (32 * z + 8) + 8, 3 * (32 * z + 8) + 8), (0, 0, 0, 255))
    for r_, bg in enumerate(bgs):
        for k, im in enumerate(imgs):
            cell = Image.new('RGBA', (32 * z, 32 * z), bg); cell.alpha_composite(im.resize((32 * z, 32 * z), Image.NEAREST))
            sh.paste(cell, (8 + k * (32 * z + 8), 8 + r_ * (32 * z + 8)))
    sh.save(os.path.join(out, 'sheet_x8.png'))
    s1 = Image.new('RGBA', (5 * 40 + 8, 3 * 40 + 8), (0, 0, 0, 255))
    for r_, bg in enumerate(bgs):
        for k, im in enumerate(imgs):
            cell = Image.new('RGBA', (32, 32), bg); cell.alpha_composite(im); s1.paste(cell, (8 + k * 40, 8 + r_ * 40))
    s1.save(os.path.join(out, 'sheet_x1.png'))
