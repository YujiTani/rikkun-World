"""WEAPON-9: 3 案で 形を 変える 小さな 部品（にじの 斬撃・虹の アイコン）を Pixel Art Studio で 描く。"""
import math

import kit9
from kit9 import Sprite

BAY = kit9.BAYER

# ---------------------------------------------------------------- にじの 斬撃（1 点 = 1/16 ブロック、64×44）

SLASH_FRAMES = [("出る ×2", 0.0, 0.55, 0.8, 0.0), ("★決め ×4", 0.0, 1.0, 1.0, 0.0), ("のこり ×4", 0.45, 1.0, 0.8, 0.0), ("きえかけ ×4", 0.72, 1.0, 0.55, 0.5)]


def slash(style, pal, tail, head, sc, thin):
    s = Sprite(64, 44)
    cx, cy, R = 32, 38, 30
    Tmax = {"A": 12, "B": 7, "C": 3}[style] * sc
    for y in range(44):
        for x in range(64):
            dx, dy = x + 0.5 - cx, cy - (y + 0.5)
            r = math.hypot(dx, dy)
            th = math.degrees(math.atan2(dy, dx))
            if not (15 <= th <= 165):
                continue
            q = (165 - th) / 150
            if not (tail <= q <= head):
                continue
            u = (q - tail) / max(1e-3, head - tail)
            w = Tmax * (u ** 0.7) * (1.0 if u < 0.9 else max(0.35, 1 - (u - 0.9) * 6))
            e = R - r
            if e < 0 or e > w or w < 0.6:
                continue
            f = e / max(w, 1e-3)
            if thin > 0 and BAY[y % 4][x % 4] < thin:
                continue
            if style == "A":
                c = pal["W"] if f < 0.2 else pal["M"] if f < 0.45 else pal["B"] if f < 0.7 else pal["G"]
                if f > 0.85 and BAY[y % 4][x % 4] < 0.5:
                    continue
            elif style == "B":
                qq = (q + 0.15) % 1.0
                c = pal["G"] if qq < 0.36 else pal["B"] if qq < 0.68 else pal["M"]
                if 0.3 < f < 0.6:
                    c = pal["W"]
                if u < 0.25 and BAY[y % 4][x % 4] > u * 4:
                    continue
            else:
                c = pal["W"] if f < 0.6 else pal["C2"]
            s.px(x, y, c)
    if style == "C":
        cols = [pal["G"], pal["B"], pal["M"], pal["G"]]
        for i, qd in enumerate((0.2, 0.45, 0.7, 0.92)):
            if not (tail <= qd <= head) or (thin > 0 and i % 2 == 0):
                continue
            th = math.radians(165 - qd * 150)
            x0, y0 = cx + (R - 1) * math.cos(th), cy - (R - 1) * math.sin(th)
            for ox, oy in ((0, -2), (-1, -1), (0, -1), (1, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
                s.px(round(x0) + ox, round(y0) + oy, pal["W"] if (ox, oy) == (0, 0) else cols[i])
        if head > 0.95 and thin == 0:
            hx, hy = cx + (R - 1) * math.cos(math.radians(16)), cy - (R - 1) * math.sin(math.radians(16))
            for k in range(-3, 4):
                s.px(round(hx) + k, round(hy), pal["W"] if abs(k) < 2 else pal["C2"])
                s.px(round(hx), round(hy) + k, pal["W"] if abs(k) < 2 else pal["C2"])
    return s


def slash_set(style, pal, out_dir):
    res = []
    for lab, tail, head, sc, thin in SLASH_FRAMES:
        s = slash(style, pal, tail, head, sc, thin)
        res.append((lab, s.composite(1)))
    strip = kit9.Image.new("RGBA", (64 * 4, 44), (0, 0, 0, 0))
    for i, (_, im) in enumerate(res):
        strip.paste(im, (64 * i, 0))
    strip.save(f"{out_dir}/slash_1x.png")
    return res


# ---------------------------------------------------------------- 虹の アイコン（16×16。左下 = 柄、右上 = 切っ先）

ICON_BASE = {"K": "#241A44", "N": "#2E3A78", "n": "#4C64B8", "Y": "#F2C230", "y": "#B8860B"}


def icon(style, pal):
    """a = x − y（刃の 長さの 向き）、c = x + y（刃の はば の 向き。小さい = 左上 = 光の 側）"""
    P = dict(ICON_BASE)
    P.update(pal)
    grid = {}
    for y in range(16):
        for x in range(16):
            a, c = x - y, x + y
            role = None
            if 0 <= a <= 13:
                lo, hi = (14, 17) if a <= 10 else (15, 16) if a <= 12 else (15, 15)
                if lo <= c <= hi:
                    role = ("blade", a, c - 14)
            elif a in (-2, -1) and 11 <= c <= 19:
                role = ("guard", a, c)
            elif -11 <= a <= -3 and c in (15, 16):
                role = ("grip", a, c)
            elif a in (-13, -12) and 14 <= c <= 17:
                role = ("pommel", a, c)
            if role:
                grid[(x, y)] = role
    s = Sprite(16, 16)
    for (x, y), (kind, a, k) in grid.items():
        if kind == "guard":
            col = P["Y"] if k <= 15 else P["y"]
        elif kind == "grip":
            col = P["n"] if (a % 2 == 0) else P["N"]
        elif kind == "pommel":
            col = P["Y"] if k <= 15 else P["y"]
        else:
            col = blade_color(style, P, a, k)
        s.px(x, y, col)
    # 外がわ 1 点の ふち
    s.outline(P["K"], where="outside")
    if style == "C":  # 左上の 小さな にじの きらり（ふち なし）
        for (x, y, ch) in ((4, 2, "W"), (3, 2, "G"), (5, 2, "M"), (4, 1, "B"), (4, 3, "B")):
            s.px(x, y, P[ch])
    if style == "B":  # 切っ先の 光
        s.px(15, 0, P["W"])
    return s


def blade_color(style, P, a, k):
    if style == "A":  # にじの 刃文（刃を よこぎる しま）
        seg = ["G", "B", "M"][(a // 3) % 3]
        if k == 0:
            return P["L"]
        if k == 3:
            return P[seg.lower() + "2"]
        return P[seg]
    if style == "B":  # 柄 → 切っ先へ 緑 → 青 → 赤むらさき、まん中に 白い しん
        seg = "G" if a <= 3 else "B" if a <= 8 else "M"
        if k == 0:
            return P["L"]
        if k == 1:
            return P["W"]
        if k == 3:
            return P[seg.lower() + "2"]
        return P[seg]
    # C: すきとおる 水晶の 刃。しんに にじの つぶ
    if k == 0:
        return P["L"]
    if k == 3:
        return P["C3"]
    if k == 1:
        return P[["G", "C1", "B", "C1", "M", "C1"][a % 6]] if a % 2 == 0 else P["C1"]
    return P["C2"]
