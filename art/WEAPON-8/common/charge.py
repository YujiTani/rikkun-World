"""WEAPON-8: ため中の 見た目 3 案（雷神剣・風神剣 共通。色は 5 段の パレットを 差しかえる）。

charge_items(plan, F, pal, cam, chest) -> items（w8kit.render に わたす）
F = ためF（押した ステップ = 1）。いっぱい = FULL（雷神剣と 同じ 60）。
pal = 5 色（0 = いちばん 明るい 芯 … 4 = いちばん 暗い）。ゲームでは 白黒の 絵 ＋ 5 色の 表（uniform）で 色を かえる。
"""
import math
import random

from PIL import Image

from w8kit import add, mul, sub, norm, cross

FULL = 60
PX = 1 / 16

WIND = ["#F4FCFF", "#CDEFFC", "#8FD6F2", "#4FA8D8", "#2B6699"]
THUNDER = ["#FFF8DC", "#FFE98A", "#F0C24A", "#9A7430", "#4E3C1A"]


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def P(pal):
    return [hx(c) for c in pal]


def _dir(rng):
    # 球の 上の 向き（下 半分は 少なめ: 地面から わかない）
    while True:
        v = (rng.uniform(-1, 1), rng.uniform(-0.5, 1), rng.uniform(-1, 1))
        l2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2
        if 0.2 < l2 <= 1:
            l = math.sqrt(l2)
            return (v[0] / l, v[1] / l, v[2] / l)


def disc(r, cols, ring_only=False):
    """カメラに 向く まるい 光（芯）。r = 半径（点）"""
    n = 2 * r + 1
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    for y in range(n):
        for x in range(n):
            d = math.hypot(x - r, y - r)
            if d > r + 0.3:
                continue
            if ring_only:
                if d > r - 1.2:
                    im.putpixel((x, y), cols[1] + (255,))
                continue
            c = cols[0] if d < r * 0.45 else (cols[1] if d < r * 0.8 else cols[2])
            if d >= r * 0.8 and (x + y) % 2:
                continue  # ふちは 網
            im.putpixel((x, y), c + (255,))
    return im


def ring_sprite(r, col, thick=1):
    n = 2 * r + 3
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    c = n // 2
    for y in range(n):
        for x in range(n):
            d = math.hypot(x - c, y - c)
            if r - thick + 0.5 <= d <= r + 0.5:
                im.putpixel((x, y), col + (255,))
    return im


def sparkle(cols, big=False):
    """きらり ✦（光の しるし。ふち なし）"""
    if big:
        pts = {(3, 0): 1, (3, 1): 1, (3, 2): 0, (0, 3): 1, (1, 3): 1, (2, 3): 0, (3, 3): 0, (4, 3): 0, (5, 3): 1, (6, 3): 1,
               (3, 4): 0, (3, 5): 1, (3, 6): 1, (2, 2): 2, (4, 2): 2, (2, 4): 2, (4, 4): 2}
        im = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
    else:
        pts = {(2, 0): 1, (0, 2): 1, (1, 2): 0, (2, 2): 0, (3, 2): 0, (4, 2): 1, (2, 1): 0, (2, 3): 0, (2, 4): 1}
        im = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
    for (x, y), k in pts.items():
        im.putpixel((x, y), cols[k] + (255,))
    return im


def star(cols, s=1.0):
    """★（いっぱいの しるし）。11×11 を s 倍（整数 点で）"""
    R = 5.4 * s
    n = int(2 * R) + 3
    c = n // 2
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = R if i % 2 == 0 else R * 0.45
        pts.append((c + rr * math.cos(a), c + rr * math.sin(a)))

    def inside(x, y):
        k, j, ins = len(pts), len(pts) - 1, False
        for i in range(k):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                ins = not ins
            j = i
        return ins

    for y in range(n):
        for x in range(n):
            if inside(x + 0.5, y + 0.5):
                d = math.hypot(x - c, y - c + 1)
                im.putpixel((x, y), (cols[0] if d < R * 0.35 else cols[1]) + (255,))
    # ふち（暗い 色。外がわ 1 点）
    out = im.copy()
    for y in range(n):
        for x in range(n):
            if im.getpixel((x, y))[3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < n and 0 <= yy < n and im.getpixel((xx, yy))[3]:
                    out.putpixel((x, y), cols[3] + (255,))
                    break
    return out


def streak(pos, inward, speed, cols, items):
    """内へ とぶ つぶ: 先 = 明るい、うしろへ 2〜3 点の 尾（速い ほど 長い）"""
    n = 2 + min(4, int(speed * 30))
    for k in range(n):
        p = add(pos, mul(inward, -k * PX * 1.3))
        items.append(("dot", p, cols[0] if k == 0 else (cols[1] if k < 3 else cols[2]), PX * (2.0 if k == 0 else 1.4)))


# ================================================================= T1 すいこまれる 光（ロックマン型）

def t1(F, cols, cam, chest, seed=5):
    items = []
    full = F >= FULL
    rng = random.Random(seed)
    life = 18
    rate = 2 if not full else 1  # 2 ステップに 1 こ（いっぱい 後は ゆっくり）
    for born in range(-life, F + 1, 1):
        r = random.Random(seed * 1000 + born)
        if full and born >= FULL and born % 2:
            continue
        u = (F - born) / life
        if u < 0 or u >= 1 or born < 1:
            continue
        d = _dir(r)
        r0 = 1.2 + 0.4 * r.random()
        rr = r0 * (1 - u * u)  # はじめ ゆっくり → 中へ 速く
        if rr < 0.12:
            continue
        pos = add(chest, mul(d, rr))
        streak(pos, mul(d, -1), 2 * u * r0 / life, cols, items)
    # 芯: ため に あわせて 大きく（2 → 5 点）
    k = min(1.0, F / FULL)
    rc = 2 + int(round(3 * k))
    items.append(("spr", chest, disc(rc + (1 if full else 0), cols), PX, 2))
    if full:
        a = F - FULL
        if a < 10:  # いっぱいの しゅんかん: 輪が 1 回 ひろがる
            items.append(("spr", chest, ring_sprite(int(5 + a * 2.2), cols[0] if a < 5 else cols[1]), PX, 3))
        # まわりを ゆっくり 回る きらり 4 つ（1 秒で 1/2 回り）
        for i in range(4):
            ang = i * math.pi / 2 + a * math.pi / 60
            p = add(chest, (0.75 * math.cos(ang), 0.15 * math.sin(ang * 2), 0.75 * math.sin(ang)))
            items.append(("spr", p, sparkle(cols, big=(i % 2 == 0)), PX, 1))
    return items


# ================================================================= T2 らせんで 集まる（うずの 2 本の うで）

def t2(F, cols, cam, chest, seed=7):
    items = []
    full = F >= FULL
    life = 24
    for born in range(max(1, F - life), F + 1):
        if born % 2:
            continue
        u = (F - born) / life
        arm = (born // 2) % 2
        r0 = 1.7
        rr = r0 * (1 - u) ** 1.3
        if rr < 0.1:
            continue
        ang = arm * math.pi + born * 0.21 + u * 2.6 * math.pi  # 内へ 来る ほど 速く 回る
        h = (1 - u) * 0.9 * (1 if arm == 0 else -0.5)
        pos = add(chest, (rr * math.cos(ang), h * rr / r0, rr * math.sin(ang)))
        nxt = add(chest, ((rr * 0.85) * math.cos(ang + 0.35), h * rr * 0.85 / r0, (rr * 0.85) * math.sin(ang + 0.35)))
        dv = norm(sub(nxt, pos))
        streak(pos, dv, 0.25, cols, items)
    k = min(1.0, F / FULL)
    items.append(("spr", chest, disc(2 + int(round(2 * k)), cols), PX, 2))
    if full:
        a = F - FULL
        # 腰の 高さの 水平の 輪（地面と 平行。カメラに 向けない）＋ 光る 玉 3 つが 回る
        ry = chest[1] - 0.35
        R = 0.8 if a >= 6 else 0.35 + 0.075 * a
        n = 64
        for i in range(n):
            t = 2 * math.pi * i / n
            p = (chest[0] + R * math.cos(t), ry, chest[2] + R * math.sin(t))
            items.append(("dot", p, cols[1] if i % 2 == 0 else cols[2], PX * 1.3))
        for j in range(3):
            t = j * 2 * math.pi / 3 + a * 0.08
            p = (chest[0] + R * math.cos(t), ry, chest[2] + R * math.sin(t))
            items.append(("spr", p, disc(2, cols), PX, 1))
        # 上へ のぼる 小さな つぶ（ふわっと）
        for j in range(6):
            r = random.Random(seed * 77 + j)
            t = r.random() * 2 * math.pi
            hh = ((a * 0.03 + r.random()) % 1.0) * 1.4
            p = (chest[0] + 0.6 * math.cos(t), ry + hh, chest[2] + 0.6 * math.sin(t))
            items.append(("dot", p, cols[1], PX * 1.2))
    return items


# ================================================================= T3 光の 輪が しぼむ ＋ いっぱいで ★

def t3(F, cols, cam, chest, seed=9):
    items = []
    full = F >= FULL
    period = 12 if not full else 24
    for born in range(max(1, F - period), F + 1):
        if born % period != 1 % period:
            continue
        u = (F - born) / period
        R = int(round(22 * (1 - u * u))) + 3
        col = cols[2] if u < 0.4 else (cols[1] if u < 0.8 else cols[0])
        items.append(("spr", chest, ring_sprite(R, col, 2 if u > 0.6 else 1), PX, 1))
    # 輪の 上の つぶ 6 こ（輪と いっしょに しぼむ）
    rng = random.Random(seed)
    for j in range(6):
        b = F - (F - 1) % period
        u = (F - b) / period
        ang = j * math.pi / 3 + rng.random() * 0.3
        rr = (22 * (1 - u * u) + 3) * PX
        p = add(chest, mul(add(mul(cam.right, math.cos(ang)), mul(cam.up, math.sin(ang))), rr))
        items.append(("dot", p, cols[0], PX * 1.5))
    k = min(1.0, F / FULL)
    items.append(("spr", chest, disc(2 + int(round(2 * k)), cols), PX, 2))
    if full:
        a = F - FULL
        s = [0.5, 0.9, 1.3, 1.2, 1.1, 1.0][a] if a < 6 else 1.0  # ぽんっと 出て 少し もどる
        head = add(chest, (0, 1.25, 0))
        items.append(("spr", head, star(cols, s), PX, 3))
    return items


PLANS = {"T1": t1, "T2": t2, "T3": t3}
