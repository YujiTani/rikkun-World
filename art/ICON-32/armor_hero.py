"""伝説の 防具（伊賀 4・明珍 4）の 描きなおし: 大きな シルエット、こい 芯と 明るい ふちの 強い 差、
差し色（青むらさき / 深い 赤＋金）を はっきり、金属に 白い 光。v5 の Canvas（ふち線・リム光）を つかう。"""
import math
from lib import Canvas, sphere, tube, poly_f, line_px, R, GOLD, STEEL, IRON, SUMI, CREAM, CRIMSON, LACQ, WOOD, SHADE, CHALK
import gear as G

VIOLET = R('1e1a40', '3a3080', '6050d0', '9a8cf8', 'd8d0ff')
NINJA = R('0e0e1c', '1a1a30', '2a2c4a', '4a5078', '7e8ab8')   # 忍びの 黒（青み）
MAIL = R('14161e', '262a38', '424a60', '6e7890', 'b0b8c8')
BLACKLQ = R('100c14', '201a26', '342a3a', '5a4a60', 'a898b0')  # 黒うるし
GLOWV = (190, 170, 255, 255)

def ninja_zukin():
    """伊賀の 頭巾: 黒い 頭巾に 2 本の 角、ひたいに 鉄の 鉢金（青むらさきの しるし）、目の すきまに 光る 目、ながれる えりまき"""
    c = Canvas(); c.ground(16, 29, 12, 2.4)
    c.shape(VIOLET, tube([(20, 23), (25, 26), (30, 25), (31, 22)], 2.0, 0.8), bias=0.35, spec=0.05)  # えりまきの はし（うしろ）
    for sg in (-1, 1):
        c.shape(NINJA, tube([(16 + 5 * sg, 8), (16 + 9 * sg, 3), (16 + 11.5 * sg, 0.5)], 2.6, 0.6), bias=0.1, spec=0.05)
    c.shape(NINJA, sphere(16, 14, 10.5, 10), bias=0.1, spec=0.05)
    hb = c.shape(STEEL, poly_f([(7, 8), (25, 8), (25, 11.5), (7, 11.5)], (0, -0.4, 0.9)), bias=0.2, spec=0.08)  # 鉢金
    c.put({(x, y) for (x, y) in hb if y == 8}, 4)
    for x in (8, 24): c.fix[(x, 10)] = IRON[1]
    c.shape(VIOLET, poly_f([(14.5, 8.5), (17.5, 8.5), (16, 11.5)]), flat=4)    # しるし
    c.shape(SUMI, poly_f([(8, 12.5), (24, 12.5), (23, 16), (9, 16)]), flat=0)  # 目の すきま（やみ）
    for x0 in (11, 19):  # 光る 目
        c.fix.update({(x0, 14): GLOWV, (x0 + 1, 14): CREAM, (x0 + 2, 14): GLOWV, (x0 + 1, 13): VIOLET[3]})
    sc = c.shape(VIOLET, sphere(16, 22, 11.5, 4.4), bias=0.3, spec=0.05)
    c.put({(x, y) for (x, y) in sc if y == 22 and x % 3 == 0}, 1)
    return c

def ninja_shozoku():
    """伊賀の 忍着: 黒い 胴に くさりかたびら、鉄の かた当て、青むらさきの えりまきと おび、せなかに ななめの 小太刀"""
    c = Canvas(); c.ground(16, 29.5, 13, 2.2)
    c.shape(BLACKLQ, tube([(3, 29), (28, 3)], 1.6), bias=0.3, spec=0.05)      # 小太刀の さや（うしろ、ななめ）
    c.shape(VIOLET, tube([(25.5, 5.5), (30, 1.2)], 1.5), bias=0.3)            # つか
    c.shape(GOLD, sphere(25, 6, 1.6), spec=0.15)
    body = poly_f([(8, 7), (24, 7), (25, 27), (7, 27)])
    c.shape(NINJA, lambda x, y: body(x, y) and ((x - 16) / 9, -0.15, 0.9), bias=0.05, spec=0.03)
    m = c.shape(MAIL, poly_f([(11.5, 7), (20.5, 7), (16, 17)]), flat=2)        # むねの V に くさり
    c.put({(x, y) for (x, y) in m if (x + y) % 2 == 0}, 4)
    for sg in (-1, 1):  # 鉄の かた当て
        c.shape(MAIL, sphere(16 + 9 * sg, 9.5, 4.2, 3.2), bias=0.15, spec=0.12)
    c.shape(VIOLET, poly_f([(7, 18), (25, 18), (25, 21), (7, 21)]), bias=0.35, spec=0.04)   # おび
    c.shape(VIOLET, tube([(12, 21), (9, 27)], 1.2, 0.7), bias=0.3)             # むすびの たれ
    c.shape(VIOLET, sphere(12.5, 19.5, 2.0), bias=0.4, spec=0.1)
    c.shape(VIOLET, sphere(16, 6.5, 7.5, 2.6), bias=0.35, spec=0.05)          # えりまき
    return c

def ninja_tekko():
    """伊賀の 手甲: 黒い 手甲に 鉄の 板と 青むらさきの まき、こぶしから 3 本の 鉄の つめ（手甲鉤）"""
    c = Canvas(); c.ground(16, 28, 13, 3)
    for k in range(3):  # つめ（うしろ → 前）
        y0 = 20 + k * 2.4
        cl = tube([(10, y0), (22, y0 - 4 + k * 1.2), (29.5, y0 - 9 + k * 2.6)], 1.2, 0.3)
        c.extrude(STEEL, cl, 0, 1); b = c.shape(STEEL, cl, flat=3)
        c.put({(x, y) for (x, y) in b if (x, y - 1) not in b}, 5)
    G._guard(c, NINJA, VIOLET, MAIL)
    c.shape(IRON, sphere(8.5, 23, 5.6, 4.6), bias=0.25, spec=0.1)
    c.shape(VIOLET, sphere(8.5, 23, 2.0), bias=0.35, spec=0.15)
    return c

def ninja_tabi():
    """伊賀の 脚絆と 足袋（1 つ）: 黒い たび、すねに 鉄の 板、青むらさきの 脚絆の まき（はっきり 2 色）、二つに わかれた つまさき"""
    c = Canvas(); c.ground(17, 28.5, 13, 2.6)
    shaft = tube([(11, 2.5), (12, 18)], 5.0)
    c.extrude(NINJA, shaft, 1, 0); s = c.shape(NINJA, shaft, bias=0.1)
    for (x, y) in s:
        if (y - (x - 6) // 2) % 4 in (0, 1): c.c[(x, y)] = [VIOLET, 3 if (y - (x - 6) // 2) % 4 == 0 else 2, 90]   # まき
    foot = sphere(15, 22, 9.8, 5.2)
    c.extrude(NINJA, foot, 0, 1); c.shape(NINJA, foot, bias=0.12, spec=0.05)
    c.shape(NINJA, sphere(25.8, 22.5, 3.0, 3.6), bias=0.4, spec=0.05)
    for y in range(19, 27): c.fix[(23, y)] = OUTC
    c.shape(VIOLET, poly_f([(5, 26), (29, 26), (29, 27.5), (5, 27.5)]), flat=2)   # そこ
    return c

from lib import OUT as OUTC

def samurai_jingasa():
    """明珍の 陣笠: 大きく 平たい 黒うるしの 笠、太い 金の ふち、うらの 朱、大きな 金の 家紋、つよい 光の すじ"""
    c = Canvas(); c.ground(16, 27, 15, 3)
    c.shape(CRIMSON, lambda x, y: sphere(16, 18, 15.5, 6.8)(x, y) if y > 20 else None, flat=3)
    cone = lambda x, y: (lambda d: ((x - 16) / 14, (y - 16.5) / 6 - 0.6, 0.6) if d <= 1 else None)(((x - 16) / 15.5) ** 2 + ((y - 16.5) / 7.5) ** 2)
    s = c.shape(BLACKLQ, cone, bias=-0.1)
    c.put({(x, y) for (x, y) in s if ((x - 16) / 15.5) ** 2 + ((y - 16.5) / 7.5) ** 2 > 0.8}, 3, GOLD)
    c.put({(x, y) for (x, y) in s if ((x - 16) / 15.5) ** 2 + ((y - 16.5) / 7.5) ** 2 > 0.8 and y < 14}, 4, GOLD)
    for (x, y) in s:  # 光の すじ（左上）
        if 0.36 < ((x - 11) / 6) ** 2 + ((y - 14) / 3) ** 2 < 0.62 and x < 12 and y < 15: c.c[(x, y)][1] = 4
    for k in range(3):
        cx, cy = 16 + 3.4 * math.cos(k * 2.094 - 1.57), 19 + 2.3 * math.sin(k * 2.094 - 1.57)
        c.shape(GOLD, sphere(cx, cy, 1.6), bias=0.3, spec=0.2)
    c.shape(GOLD, sphere(16, 11.5, 2.6, 2.0), bias=0.2, spec=0.2)
    return c

def samurai_haori():
    """明珍の 陣羽織: 深い 赤の 大きな はおり（かたが はる）、黒と 金の ふち、むねに 金の 家紋、すそに 金の ししゅう、かたに 鉄の 金具"""
    c = Canvas(); c.ground(16, 29.5, 15, 2.2)
    body = poly_f([(3, 8), (11, 3.5), (21, 3.5), (29, 8), (28.5, 13), (25, 13.5), (26.5, 28), (5.5, 28), (7, 13.5), (3.5, 13)])
    s = c.shape(CRIMSON, lambda x, y: body(x, y) and ((x - 16) / 10, -0.15, 0.9), bias=0.15, spec=0.04)
    edge = {(x, y) for (x, y) in s if any((x + dx, y + dy) not in s for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
    c.put(edge, 4, GOLD)
    c.shape(BLACKLQ, poly_f([(12.5, 3.5), (19.5, 3.5), (17.5, 28), (14.5, 28)]), bias=-0.1)   # 前の あわせ（黒）
    c.put({(x, y) for (x, y) in c.c if c.c[(x, y)][0] is BLACKLQ and x in (13, 14, 18, 19) and c.c[(x, y)][2] == c.parts - 1 and ((x - 1, y) not in c.c or c.c[(x - 1, y)][0] is not BLACKLQ or (x + 1, y) not in c.c or c.c[(x + 1, y)][0] is not BLACKLQ)}, 4, GOLD)
    for cx in (7.5, 24.5):  # かたの 鉄の 金具
        c.shape(STEEL, sphere(cx, 8.5, 2.3), bias=0.2, spec=0.15)
    for k in range(3):  # 家紋（金の 三つ星）を 左むねに
        cx, cy = 9.5 + 1.8 * math.cos(k * 2.094 - 1.57), 18 + 1.6 * math.sin(k * 2.094 - 1.57)
        c.shape(GOLD, sphere(cx, cy, 1.3), flat=4)
    for (x, y) in list(c.c):  # すその ししゅう（金の 波）
        if c.c[(x, y)][0] is CRIMSON and 23 <= y <= 26 and y == 24 + round(1.2 * math.sin(x * 0.9)): c.c[(x, y)] = [GOLD, 3, 97]
    return c

def samurai_tekko():
    """明珍の 手甲: 深い 赤の 布に 黒うるしの 板（金の ふち）、こぶしに 金の 家紋（にぎりやすい 手甲）"""
    c = Canvas(); c.ground(16, 28, 13, 3)
    G._guard(c, BLACKLQ, GOLD, CRIMSON)
    for (x, y), v in c.c.items():  # 板の すきまは 赤い 布が 見える
        if v[0] is BLACKLQ and v[1] == 0: v[0] = CRIMSON; v[1] = 2
    c.shape(CRIMSON, sphere(8.5, 23, 5.6, 4.6), bias=0.35, spec=0.06)
    c.shape(GOLD, sphere(8.5, 23, 2.4), bias=0.3, spec=0.2)
    c.shape(CRIMSON, sphere(8.5, 23, 0.9), flat=1)
    return c

def samurai_geta():
    """明珍の 下駄（1 つ）: 大きく。こい 木の 台、2 まいの 歯、太い 深紅の 鼻緒（V）、金の 前つぼ"""
    DW = R('2a1410', '4a2a1a', '7a4628', 'a86a38', 'd8a060')
    c = Canvas(); c.ground(16, 28.5, 15, 2.6)
    for ty in (8.5, 19.5):
        c.shape(DW, poly_f([(3, ty + 6), (28, ty - 1.5), (28, ty + 2.5), (3, ty + 10)]), flat=0)
    top = poly_f([(1.5, 16), (25, 3.5), (30.5, 8), (6, 23)], (-0.1, -0.7, 0.7))
    c.extrude(DW, top, 0, 3, 1); t = c.shape(DW, top, bias=0.3)
    c.put({(x, y) for (x, y) in t if (x - 1, y - 1) not in t or (x, y - 1) not in t}, 4)
    c.shape(CRIMSON, tube([(9, 17), (20, 8.5)], 1.8), bias=0.3, spec=0.08)
    c.shape(CRIMSON, tube([(20, 8.5), (24, 14)], 1.8), bias=0.25, spec=0.06)
    c.shape(GOLD, sphere(20, 8, 1.8), bias=0.2, spec=0.2)
    return c

IDS = {k: globals()[k] for k in ('ninja_zukin', 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi', 'samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta')}
