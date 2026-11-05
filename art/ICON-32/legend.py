"""ICON-32: でんせつ（legendary）の 11 点。元に なった 物の 形・色を 生かした 1 点もの（docs/design/ICON-32.md 10 章）。"""
import math
from lib import *
import gear as G

RUSSET = R('1e2230', '384050', '5a6878', '8a98a8', 'c8d0d8')   # 明珍の 黒鉄（くろがね）
INDIGO = R('10142a', '1c2448', '2c3a6a', '465a90', '7088b8')   # 忍びの 藍（真っ黒に しない）

def _blade(c, ramp, spine, w0, w1, bands=None):
    bl = tube(spine, w0, w1)
    c.extrude(ramp, bl, 0, 1, 1); b = c.shape(ramp, bl, flat=2)
    c.put({(x, y) for (x, y) in b if (x - 1, y - 1) not in b and (x, y - 1) not in b}, 4)
    c.put({(x, y) for (x, y) in b if (x + 1, y + 1) not in b or (x, y + 1) not in b}, 5)
    return b

def raijin_ken():
    """雷神: 太鼓の 輪（巴の もよう）を つばに、刀身に 金の いなずま"""
    c = Canvas(); c.ground(17, 26, 14, 3)
    b = _blade(c, PURPLE, [(8, 23.5), (31, 0.8)], 1.9, 0.6)
    pts = [(12, 15), (15, 15), (14, 12), (18, 11.5), (17, 8), (21, 7.5), (20, 4.5)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for q in line_px(x0, y0, x1, y1): c.c[q] = [GOLD, 4, 99]
    c.fix[(20, 4)] = CREAM
    for k in range(6):  # 太鼓の 輪
        a = k * math.pi / 3; cx, cy = 7 + 4.6 * math.cos(a), 24.5 + 4.0 * math.sin(a)
        c.shape(LACQ, sphere(cx, cy, 1.9), bias=0.15)
        c.fix[(round(cx), round(cy))] = GOLD[3]  # 巴の 点
    hl = tube([(1.6, 30.4), (5.0, 27.0)], 1.6); c.extrude(SUMI, hl); h = c.shape(SUMI, hl, bias=0.3)
    c.put({p for p in h if (p[0] + p[1]) % 2 == 0}, 4, GOLD)
    return c

def fujin_ken():
    """風神: 風ぶくろ（口を しばった ふくろ）を つばに、みどりの 刀身と 白い 風の すじ"""
    c = Canvas(); c.ground(17, 26, 14, 3)
    b = _blade(c, WIND, [(9, 22.5), (16, 15), (23, 7.5), (31, 1)], 1.9, 0.5)
    bag = sphere(7.5, 24.5, 5.4, 4.6)
    c.extrude(LEAF, bag, 0, 1); c.shape(LEAF, bag, bias=0.15, spec=0.04)
    c.shape(GOLD, tube([(10, 20.5), (12.5, 19)], 0.9), bias=0.2)  # しばった ひも
    for cx, cy, r, a0 in ((14, 9, 3.2, 90), (21, 14, 2.8, 270), (24, 21, 2.2, 90)):  # 風の すじ（うず）
        for q in {(round(cx + r * math.cos(math.radians(a))), round(cy + r * 0.7 * math.sin(math.radians(a)))) for a in range(a0, a0 + 270, 12)}:
            if q not in c.c: c.c[q] = [CHALK, 4, 99]
    return c

def niji():
    """天の浮橋（にじの はし）: 弧を えがく 刀身に 7 色の 帯（長さに そって）、つばに 雲"""
    c = Canvas(); c.ground(17, 27, 14, 3)
    spine = arc_pts(31, 33, 28, 186, 262, 16)
    bl = tube(spine, 2.6, 0.8)
    c.extrude(STEEL, bl, 0, 1, 1); b = c.shape(STEEL, bl, flat=2)
    bands = [FRUIT, LAVA, GOLD, LEAF, WATER, NAVY, PURPLE]
    for (x, y) in b:
        d = math.hypot(x + .5 - 31, y + .5 - 33) - 28   # 弧からの きょり（-2.6〜2.6）
        k = min(6, max(0, int((d + 2.6) / 5.2 * 7)))
        c.c[(x, y)][0] = bands[k]; c.c[(x, y)][1] = 3
    c.put({(x, y) for (x, y) in b if (x - 1, y - 1) not in b}, 4)
    for cx, cy in ((4.5, 26.5), (7.5, 27.5), (6, 24.5)):  # 雲の つば
        c.shape(CHALK, sphere(cx, cy, 2.4), bias=0.25)
    hl = tube([(1.4, 30.6), (3.6, 28.6)], 1.4); c.shape(STEEL, hl, bias=0.2)
    return c

def samurai_jingasa():
    """明珍の 陣笠: 平たい 円すいの 黒うるし・金の 家紋・てっぺんの 八幡座・うらの 朱"""
    c = Canvas(); c.ground(16, 27, 14, 3)
    c.shape(LACQ, lambda x, y: sphere(16, 18.5, 14.5, 6.2)(x, y) if y > 22 else None, flat=2)  # うらの 朱が ふちに 見える
    cone = lambda x, y: (lambda d: ((x - 16) / 14, (y - 17) / 6 - 0.6, 0.6) if d <= 1 else None)(((x - 16) / 14.5) ** 2 + ((y - 17) / 7) ** 2)
    s = c.shape(SUMI, cone, bias=0.4, spec=0.04)
    c.put({(x, y) for (x, y) in s if ((x - 16) / 14.5) ** 2 + ((y - 17) / 7) ** 2 > 0.82}, 4, GOLD)
    for k in range(3):  # 家紋: 三つ星（金）
        cx, cy = 16 + 3.2 * math.cos(k * 2.094 - 1.57), 19 + 2.2 * math.sin(k * 2.094 - 1.57)
        c.shape(GOLD, sphere(cx, cy, 1.4), flat=4)
    c.shape(GOLD, sphere(16, 12.5, 2.4, 1.8), spec=0.12)  # 八幡座
    return c

def samurai_haori():
    """陣羽織: そでなし・広い うでの 穴・金の ふち・かたに 家紋"""
    c = Canvas(); c.ground(16, 29, 14, 2.4)
    body = poly_f([(6, 6), (12, 4), (20, 4), (26, 6), (27, 12), (24, 13), (26, 28), (6, 28), (8, 13), (5, 12)])
    s = c.shape(CRIMSON, lambda x, y: body(x, y) and ((x - 16) / 11, -0.1, 0.9), bias=0.25, spec=0.03)
    c.put({(x, y) for (x, y) in s if any((x + dx, y + dy) not in s for dx, dy in ((1, 0), (-1, 0), (0, 1)))}, 4, GOLD)
    c.shape(SUMI, poly_f([(13, 4), (19, 4), (17, 27), (15, 27)]), bias=0.35)  # 前の あわせ
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is SUMI and x in (14, 18)}, 4, GOLD)
    for cx in (9.5, 22.5):  # かたの 家紋（白い 丸に 金）
        c.shape(CHALK, sphere(cx, 9, 2.6), flat=3)
        c.shape(GOLD, sphere(cx, 9, 1.2), flat=3)
    return c

def samurai_tekko():
    """明珍の 手甲: 鉄さび地の 板に 筋（すじ）と 金の びょう"""
    c = Canvas(); c.ground(16, 28, 13, 3)
    G._guard(c, RUSSET, GOLD, SUMI)
    hand = sphere(8.5, 23, 5.6, 4.6)
    for q in ((6, 21), (11, 21), (6, 25), (11, 25)): c.fix[q] = GOLD[4]   # びょう
    c.shape(GOLD, sphere(8.5, 23, 1.8), spec=0.12)
    return c

def samurai_geta():
    """明珍の 下駄（1 つ）: 木の 台・下に 2 まいの 歯・赤い 鼻緒（V 字）・金の 前つぼ"""
    c = Canvas(); c.ground(16, 28.5, 14, 2.6)
    for ty in (8.5, 19.5):  # 歯（台の 下に 見える）
        c.shape(WOOD, poly_f([(5, ty + 5), (27, ty - 1), (27, ty + 3), (5, ty + 9)]), flat=0)
    top = poly_f([(3, 15), (25, 4), (29, 8), (7, 22)], (-0.1, -0.7, 0.7))
    c.extrude(WOOD, top, 0, 3, 1); c.shape(WOOD, top, bias=0.25)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][1] >= 3 and (x - 1, y - 1) not in c.c}, 4)
    c.shape(CRIMSON, tube([(10, 16.5), (19.5, 9)], 1.4), bias=0.0, spec=0.05)  # 鼻緒
    c.shape(CRIMSON, tube([(19.5, 9), (22.5, 13.5)], 1.4), bias=0.0)
    c.shape(GOLD, sphere(19.5, 8.5, 1.4), spec=0.1)
    return c

def ninja_zukin():
    """黒頭巾: 藍の ずきん・目だけ 出す・うしろの 結び目"""
    c = Canvas(); c.ground(16, 28, 12, 3)
    c.shape(INDIGO, tube([(23, 18), (28, 25)], 1.8), bias=0.3); c.shape(INDIGO, tube([(23, 18), (29, 20)], 1.6), bias=0.3)
    c.shape(INDIGO, sphere(15.5, 15, 11, 11), bias=0.3, spec=0.03)
    c.shape(SKIN, poly_f([(8, 13), (23, 13), (22, 17.5), (9, 17.5)]), flat=3)
    for x0 in (11, 18):
        c.fix.update({(x0, 15): SUMI[0], (x0 + 1, 15): SUMI[0], (x0, 16): SUMI[0], (x0 + 1, 16): SUMI[0]})
        c.fix[(x0, 15)] = (255, 250, 240, 255)
    return c

def ninja_shozoku():
    """忍び装束: 藍の うわぎ（前を 合わせる）・おび・くないの え"""
    c = Canvas(); c.ground(16, 29, 13, 2.4)
    c.shape(INDIGO, tube([(9, 8), (4, 18)], 3.2), bias=0.3); c.shape(INDIGO, tube([(23, 8), (28, 18)], 3.2), bias=0.25)
    body = poly_f([(9, 6), (23, 6), (25, 27), (7, 27)])
    c.shape(INDIGO, lambda x, y: body(x, y) and ((x - 16) / 9, -0.1, 0.9), bias=0.3, spec=0.02)
    for q in line_px(11, 6, 18, 17) | line_px(21, 6, 15, 15): c.c[q] = [INDIGO, 1, 98]   # 前の 合わせ
    c.shape(SUMI, poly_f([(7.5, 17), (24.5, 17), (24.5, 19.5), (7.5, 19.5)]), bias=0.35)
    c.shape(STEEL, tube([(19, 18), (24, 13)], 0.9), bias=0.2, spec=0.1)   # くない
    c.shape(LACQ, sphere(18.5, 18.5, 1.1), flat=3)
    return c

def ninja_tekko():
    """忍びの 手甲: 藍の 布・こはぜ・かくした 小太刀が しゅっと 出る"""
    c = Canvas(); c.ground(16, 28, 13, 3)
    bl = tube([(10, 23), (29, 26)], 1.3, 0.4)   # 小太刀（手首から よこへ）
    c.extrude(STEEL, bl); b = c.shape(STEEL, bl, flat=3)
    c.put({(x, y) for (x, y) in b if (x + 1, y + 1) not in b}, 5)
    G._guard(c, INDIGO, IRON, INDIGO, plates=False)
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is INDIGO and (x - y) % 4 == 0 and x > 11}, 1)
    for q in ((14, 16), (16, 14), (18, 12)): c.fix[q] = GOLD[3]   # こはぜ
    c.shape(IRON, poly_f([(5, 20.5), (11.5, 19.5), (12, 25), (5.5, 26.5)], (-0.3, -0.4, 0.9)), bias=0.1, spec=0.08)
    return c

def ninja_tabi():
    """忍びの 足袋（1 つ）: 藍の たび・親ゆびが わかれる・白い こはぜ"""
    c = Canvas(); c.ground(17, 28.5, 13, 2.6)
    shaft = tube([(11, 4), (12, 18)], 4.6)
    c.extrude(INDIGO, shaft, 1, 0); c.shape(INDIGO, shaft, bias=0.3, spec=0.03)
    foot = sphere(15, 22, 9.5, 5.2)
    c.extrude(INDIGO, foot, 0, 1); c.shape(INDIGO, foot, bias=0.3, spec=0.03)
    c.shape(INDIGO, sphere(25.5, 22.5, 3.0, 3.6), bias=0.35)            # 親ゆび
    for y in range(19, 27): c.fix[(23, y)] = INDIGO[0]                  # われめ
    for k in range(4): c.fix[(15, 6 + k * 3)] = CHALK[3]; c.fix[(15, 7 + k * 3)] = CHALK[2]   # こはぜ
    c.shape(SUMI, poly_f([(6, 26), (28, 26), (28, 27.5), (6, 27.5)]), flat=2)   # 底
    return c

IDS = ['raijin_ken', 'fujin_ken', 'niji', 'samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta', 'ninja_zukin', 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi']
