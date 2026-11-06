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
    """雷神: 黒い 刀身に 銀の 刃、太鼓の 輪（巴）の つば、刀身の まわりに 黄色と 白の いなずま（オーナー見本の 感じ）"""
    c = Canvas(); c.ground(17, 26, 14, 3)
    for cx, cy, r, a0 in ((19, 12, 8.5, 200), (17, 14, 6.5, 20)):  # うすい うずの オーラ
        for q in {(round(cx + r * math.cos(math.radians(t))), round(cy + r * 0.8 * math.sin(math.radians(t)))) for t in range(a0, a0 + 120, 8)}:
            if 0 <= q[0] < 32 and 0 <= q[1] < 32: c.c[q] = [PURPLE, 2, 1]
    b = _blade(c, SUMI, [(8, 23.5), (31, 0.8)], 1.9, 0.6)
    for (x, y) in b:  # 銀の 刃（右下がわ）
        if (x + 1, y + 1) not in b and (x + 1, y) not in b: c.c[(x, y)] = [STEEL, 4, 99]
    def bolt(pts, col):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for q in line_px(x0, y0, x1, y1): c.c[q] = [col, 4, 99]
    bolt([(13, 13), (11, 10), (14, 9), (12, 5), (15, 4)], GOLD)      # 左の いなずま
    bolt([(19, 18), (22, 17), (21, 14), (25, 13), (24, 10), (28, 9)], GOLD)  # 右の いなずま
    bolt([(16, 11), (18, 9), (17, 7), (20, 6)], GOLD)                 # 刀身に そう 白い 光
    for q in ((15, 4), (28, 9), (20, 6), (12, 5), (25, 13)): c.fix[q] = CREAM
    for k in range(6):  # 太鼓の 輪
        a = k * math.pi / 3; cx, cy = 7 + 4.6 * math.cos(a), 24.5 + 4.0 * math.sin(a)
        c.shape(LACQ, sphere(cx, cy, 1.9), bias=0.15)
        c.fix[(round(cx), round(cy))] = GOLD[3]
    hl = tube([(1.6, 30.4), (5.0, 27.0)], 1.6); c.extrude(SUMI, hl); h = c.shape(SUMI, hl, bias=0.3)
    c.put({p for p in h if (p[0] + p[1]) % 2 == 0}, 4, GOLD)
    return c

GALE = R('1c3a14', '3a7a20', '78b838', 'b8e070', 'eaffc8')   # 風神: 見本の うすい みどりの 風

def fujin_ken():
    """風神: 雷神剣と 同じ 形の 兄弟。銀の 刀身、金と 黒の つば（風ぶくろ）、刀身に まきつく うすい みどりの 風の リボン（オーナー見本の 感じ）"""
    c = Canvas(); c.ground(17, 26, 14, 3)
    back = []
    for cx, cy, r, a0, a1 in ((19, 12, 9, 150, 330), (18, 13, 6, 330, 500)):
        back.append([(cx + r * math.cos(math.radians(t)), cy + r * 0.75 * math.sin(math.radians(t))) for t in range(a0, a1, 15)])
    for pts in back[:1]:  # 刀身の うしろの 風（こい みどり）
        c.shape(GALE, tube(pts, 0.9), bias=0.2)
    b = _blade(c, STEEL, [(8, 23.5), (31, 0.8)], 1.9, 0.6)
    for (x, y) in b:  # 刃の 白い 光
        if (x + 1, y + 1) not in b and (x + 1, y) not in b: c.c[(x, y)] = [CHALK, 4, 99]
    for pts in back[1:]:  # 刀身の まえの 風（明るい みどり）
        c.shape(GALE, tube(pts, 0.9), bias=0.6, spec=0.1)
    for q in ((10, 10), (27, 12), (24, 18), (14, 8)): c.fix[q] = CREAM  # 風の きらめき
    bag = sphere(7, 25, 4.6, 4.0)  # つば: 風ぶくろ（黒）と 金の ひも
    c.extrude(SUMI, bag, 0, 1); c.shape(SUMI, bag, bias=0.2, spec=0.06)
    c.shape(GOLD, tube([(4, 23), (10, 27)], 0.8), bias=0.3)
    hl = tube([(1.6, 30.4), (4.0, 28.0)], 1.6); c.extrude(SUMI, hl); h = c.shape(SUMI, hl, bias=0.3)
    c.put({p for p in h if (p[0] + p[1]) % 2 == 0}, 4, GOLD)
    return c

MAGENTA = R('3a1038', '7a1c6a', 'c03aa0', 'e870c8', 'ffc0ec')   # 虹: オーナーの 見本（玉虫色の 刀身）の 色だけ 参考
PINK = R('4a1830', '9a3060', 'e06090', 'f898b8', 'ffd8e6')

def niji():
    """虹（天浮橋）: 大きく そった 刀身に 玉虫色の うず もよう（マゼンタ・ピンク・むらさき・青・水色・みどり）、刃に 白い 光、黒い つばと つか"""
    c = Canvas(); c.ground(17, 27, 14, 3)
    spine = arc_pts(32, 31, 26, 190, 266, 18)        # 強い そり
    bl = tube(spine, 2.4, 0.6)
    c.extrude(PURPLE, bl, 0, 1, 1); b = c.shape(PURPLE, bl, flat=3)
    hues = [MAGENTA, PINK, PURPLE, WATER, WIND, LEAF]
    for (x, y) in b:   # うず: 2 つの 波を かさねて 色を えらぶ（乱数なし）
        v = math.sin(x * 0.55 + y * 0.35 + 2.2 * math.sin(y * 0.45 - x * 0.2)) + 0.6 * math.sin((x - y) * 0.4)
        k = int((v + 1.6) / 3.2 * 6) % 6
        c.c[(x, y)][0] = hues[k]
        c.c[(x, y)][1] = 2 if (x * 3 + y) % 4 else 3
    d = {(x, y): math.hypot(x + .5 - 32, y + .5 - 31) - 26 for (x, y) in b}
    c.put({p for p, v in d.items() if v < -1.2}, 2)                       # 峰がわ すこし こく
    edge = {(x, y) for (x, y) in b if (x + 1, y + 1) not in b and ((x, y + 1) not in b or (x + 1, y) not in b)}
    for p in edge: c.c[p][1] = 5                                          # 刃の 白い 光
    tsuba = sphere(6.6, 25.4, 3.2, 2.6)
    c.extrude(SUMI, tsuba, 0, 1); c.shape(SUMI, tsuba, bias=0.0, spec=0.03)  # 黒い つば
    for q in ((5, 24), (8, 24), (5, 27), (8, 27)): c.fix[q] = GOLD[3]       # すかしの 金
    hl = tube([(1.6, 30.4), (4.6, 27.4)], 1.7); c.extrude(SUMI, hl); h = c.shape(SUMI, hl, bias=0.1)
    c.put({p for p in h if (p[0] + p[1]) % 2 == 0}, 4)                     # つか巻き
    return c

def samurai_jingasa():
    """明珍の 陣笠: 平たい 円すいの 黒うるし・金の 家紋・てっぺんの 八幡座・うらの 朱"""
    c = Canvas(); c.ground(16, 27, 14, 3)
    c.shape(LACQ, lambda x, y: sphere(16, 18.5, 14.5, 6.2)(x, y) if y > 22 else None, flat=2)  # うらの 朱が ふちに 見える
    cone = lambda x, y: (lambda d: ((x - 16) / 14, (y - 17) / 6 - 0.6, 0.6) if d <= 1 else None)(((x - 16) / 14.5) ** 2 + ((y - 17) / 7) ** 2)
    s = c.shape(SUMI, cone, bias=0.12, spec=0.06)
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
    for cx in (9.5, 22.5):  # かたの 金具（明珍の 見本: ところどころに 金属の かざり）
        c.shape(STEEL, sphere(cx, 8.5, 2.4), bias=0.15, spec=0.12)
        c.shape(GOLD, sphere(cx, 8.5, 1.0), flat=3)
    for (x, y) in list(c.c):  # すその ししゅう（金の つる もよう）
        if c.c[(x, y)][0] is CRIMSON and 21 <= y <= 25 and (x * 2 + y * 3) % 7 == 0: c.c[(x, y)] = [GOLD, 3, 97]
    return c

def samurai_tekko():
    """明珍の 手甲: 鉄さび地の 板に 筋（すじ）と 金の びょう"""
    c = Canvas(); c.ground(16, 28, 13, 3)
    G._guard(c, RUSSET, GOLD, CRIMSON)
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

VIOLET = R('1e1a40', '3a3080', '5a50b8', '8a80e0', 'c4bcff')   # 伊賀の 差し色（青むらさき。オーナーの 見本から）
MAIL = R('1a1c28', '2e3242', '4a5062', '6e7486', '9aa0b0')     # くさりかたびら

def ninja_zukin():
    """伊賀の 頭巾: 角の ような 2 つの とんがり・目だけ 出す・青むらさきの えりまき"""
    c = Canvas(); c.ground(16, 28.5, 12, 2.6)
    for sgn in (-1, 1):  # 角
        c.shape(INDIGO, tube([(16 + 5 * sgn, 9), (16 + 8.5 * sgn, 3), (16 + 9.5 * sgn, 1)], 2.4, 0.8), bias=0.3)
    c.shape(INDIGO, sphere(16, 14, 10.5, 10), bias=0.3, spec=0.03)
    c.shape(SKIN, poly_f([(8, 12), (24, 12), (23, 16.5), (9, 16.5)]), flat=3)
    for x0 in (11, 18):
        c.fix.update({(x0, 14): (255, 250, 240, 255), (x0 + 1, 14): SUMI[0], (x0, 15): SUMI[0], (x0 + 1, 15): SUMI[0]})
    sc = c.shape(VIOLET, lambda x, y: sphere(16, 23, 11.5, 4.2)(x, y), bias=0.2, spec=0.03)   # えりまき
    c.put({(x, y) for (x, y) in sc if y == 23}, 1)
    c.shape(VIOLET, tube([(23, 24), (28, 28.5)], 1.8, 1.2), bias=0.2)   # はし
    return c

def ninja_shozoku():
    """伊賀の 忍着: 藍の うわぎ・むねに くさりかたびら・青むらさきの えりまき・せなかの 小太刀と 長い 半マント"""
    c = Canvas(); c.ground(16, 29.5, 13, 2.2)
    c.shape(SUMI, poly_f([(5, 9), (27, 9), (29, 29), (3, 29)]), bias=0.2)                 # 半マント（うしろ）
    c.shape(SUMI, tube([(23, 10), (29, 2)], 1.3), bias=0.3); c.shape(LACQ, tube([(27, 4.5), (29.5, 1.5)], 1.3), bias=0.3)   # 小太刀の つか
    c.shape(INDIGO, tube([(9, 9), (5, 18)], 3.0), bias=0.3); c.shape(INDIGO, tube([(23, 9), (27, 18)], 3.0), bias=0.25)
    body = poly_f([(9, 7), (23, 7), (24, 26), (8, 26)])
    c.shape(INDIGO, lambda x, y: body(x, y) and ((x - 16) / 9, -0.1, 0.9), bias=0.3, spec=0.02)
    m = c.shape(MAIL, poly_f([(12, 8), (20, 8), (18.5, 16), (13.5, 16)]), flat=2)          # くさりかたびら
    c.put({(x, y) for (x, y) in m if (x + y) % 2 == 0}, 3)
    c.shape(VIOLET, sphere(16, 7.5, 8, 2.8), bias=0.25, spec=0.04)                        # えりまき
    c.shape(VIOLET, poly_f([(7.5, 17), (24.5, 17), (24.5, 19.5), (7.5, 19.5)]), bias=0.2)  # おび
    return c

def ninja_tekko():
    """伊賀の 手甲: ごつい 鉄の 板・青むらさきの まき・手首から 出る 小太刀"""
    c = Canvas(); c.ground(16, 28, 13, 3)
    bl = tube([(10, 23), (29, 26)], 1.3, 0.4)
    c.extrude(STEEL, bl); b = c.shape(STEEL, bl, flat=3)
    c.put({(x, y) for (x, y) in b if (x + 1, y + 1) not in b}, 5)
    G._guard(c, MAIL, VIOLET, INDIGO)
    c.shape(IRON, sphere(8.5, 23, 5.8, 4.8), bias=0.15, spec=0.08)
    c.shape(VIOLET, sphere(8.5, 23, 2.0), bias=0.2)
    return c

def ninja_tabi():
    """伊賀の 脚絆と 足袋（1 つ）: 藍の たび・すねに まいた 脚絆・ななめの 青むらさきの かざり（左右ちがい）"""
    c = Canvas(); c.ground(17, 28.5, 13, 2.6)
    shaft = tube([(11, 3), (12, 18)], 4.8)
    c.extrude(INDIGO, shaft, 1, 0); s = c.shape(INDIGO, shaft, bias=0.3, spec=0.03)
    c.put({(x, y) for (x, y) in s if (y + x // 3) % 3 == 0}, 1)                              # 脚絆の まき
    for q in line_px(7, 12, 16, 6) | line_px(7, 13, 16, 7): 
        if q in c.c: c.c[q] = [VIOLET, 3, 98]                                                # ななめの かざり
    foot = sphere(15, 22, 9.5, 5.2)
    c.extrude(INDIGO, foot, 0, 1); c.shape(INDIGO, foot, bias=0.3, spec=0.03)
    c.shape(INDIGO, sphere(25.5, 22.5, 3.0, 3.6), bias=0.35)
    for y in range(19, 27): c.fix[(23, y)] = INDIGO[0]
    c.shape(SUMI, poly_f([(6, 26), (28, 26), (28, 27.5), (6, 27.5)]), flat=2)
    return c

IDS = ['raijin_ken', 'fujin_ken', 'niji', 'samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta', 'ninja_zukin', 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi']
