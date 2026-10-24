"""#293 試作: ボス体力バーの 飾り（銀の どくろの 指輪。見本は オーナーの 参考画像）。128 × 128、正面、左上から 光。
python3 build.py で skull_1x.png と preview.png。とげ・刃・光る 目は 付けない（オーナー 2026-10-24）。いぶし銀（暗めの 銀 ＋ 黒い よごれ ＋ 小さな 反射）"""
import math, os, random, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))
from pixelstudio import Sprite

N = 128
CX = 64.0
SILVER = ["#12151e", "#1f2533", "#2f3748", "#445068", "#5f6d86", "#8493ab", "#b4c2d6", "#eef4fb"]
PIT = "#06080c"
OUT = "#04060a"
LIGHT = (-0.5, -0.6, 0.62)
rnd = random.Random(293)
s = Sprite(N, N)
buf, idx = {}, {}


def put_i(x, y, i):
    i = max(0, min(7, i)); buf[(x, y)] = SILVER[i]; idx[(x, y)] = i


def put(x, y, c):
    buf[(x, y)] = c; idx.pop((x, y), None)


def lit(nx, ny, nz, bias=0.0):
    d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    t = max(0.0, min(0.999, 0.30 + 0.55 * d + bias))
    return min(5, int(t * 8))  # 6・7 は 小さな 反射の 点だけ


# ---- 横はばの 形（上: 縦長の まるい ずがい、こめかみで くびれ、ほおぼねで 張り、あごへ 細く）
KEYS = [(44, 38), (54, 37), (62, 32), (68, 34), (75, 37), (83, 35), (92, 30), (101, 25), (109, 20), (114, 15)]
def hw(y):
    if y < 44:
        t = (y - 5.5) / 38.5
        return 38 * math.sqrt(max(0.0, 1 - (1 - t) ** 2)) if t > 0 else 0
    for (y0, w0), (y1, w1) in zip(KEYS, KEYS[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0); t = t * t * (3 - 2 * t)
            return w0 + (w1 - w0) * t
    return 0


for y in range(N):
    py = y + 0.5
    w = hw(py)
    if w < 1: continue
    for x in range(N):
        dx = (x + 0.5 - CX) / w
        if abs(dx) > 1: continue
        nz = math.sqrt(1 - dx * dx)
        if py < 44: ny = (py - 44) / 38.5 * 0.9
        else: ny = 0.1 + (py - 44) / 70 * 0.5
        b = 0.0
        for sx in (-1, 1):
            # ほおぼねの 出っぱり（明るい）／その 下の こけた ほお（暗い）
            hx, hy = (x + 0.5 - (CX + sx * 30)) / 10, (py - 76) / 5.5
            if hx * hx + hy * hy < 1: b += 0.22 * (1 - hx * hx - hy * hy) + 0.0
            hx, hy = (x + 0.5 - (CX + sx * 25)) / 10, (py - 92) / 11
            if hx * hx + hy * hy < 1: b -= 0.34 * (1 - (hx * hx + hy * hy))
            # こめかみの くぼみ
            hx, hy = (x + 0.5 - (CX + sx * 35)) / 6, (py - 60) / 9
            if hx * hx + hy * hy < 1: b -= 0.2 * (1 - (hx * hx + hy * hy))
        put_i(x, y, lit(dx * 0.95, ny, nz, bias=b - 0.04))

# ---- 眉の 骨（目の 上の 明るい 帯）
for sx in (-1, 1):
    for y in range(N):
        for x in range(N):
            if (x, y) not in buf: continue
            ux = (x + 0.5 - (CX + sx * 21)) / 18
            top = 55.5 + 2.2 * sx * -ux * 0.0 + (ux * ux) * 3.5 + sx * ux * 1.2  # 外へ 少し さがる
            if abs(ux) <= 1 and top - 4.2 <= y + 0.5 <= top:
                put_i(x, y, 5 if y + 0.5 < top - 1.5 else 4)
            elif abs(ux) <= 1 and top - 7 <= y + 0.5 < top - 4.2:
                put_i(x, y, max(2, idx[(x, y)] - 1))
# ---- 目の くぼみ（上が 平らで 少し ななめ。奥へ 暗く）
for sx in (-1, 1):
    cx, cy, a = CX + sx * 21, 65, sx * 0.2
    ca, sa = math.cos(a), math.sin(a)
    for y in range(N):
        for x in range(N):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            ux, uy = (dx * ca + dy * sa) / 16.5, (-dx * sa + dy * ca) / 12.5
            r = ux * ux + uy * uy
            if r <= 1.0 and uy > -0.62 and (x, y) in buf:
                d = 1 - r
                if d < 0.14: put_i(x, y, 1 if uy < 0.2 else 5)      # ふち: 下は 光を 受ける
                elif d < 0.3: put(x, y, "#141925")
                elif d < 0.5: put(x, y, "#0c0f17")
                else: put(x, y, PIT)
# ---- 鼻（逆ハート）
for y in range(N):
    for x in range(N):
        px, py = x + 0.5 - CX, y + 0.5
        inside = False
        if 74 <= py <= 86:
            t = (py - 74) / 12
            inside = abs(px) <= 1 + 6 * t
        for sx in (-1, 1):
            if (px - sx * 3.9) ** 2 + (py - 86) ** 2 <= 4.2 ** 2: inside = True
        if inside and (x, y) in buf: put(x, y, PIT)
# ---- 口と 歯
for y in range(92, 116):
    t = (y - 92) / 24
    half = 29 - 8 * t
    for x in range(int(CX - half), int(CX + half) + 1):
        put(x, y, PIT)
TEETH = set()
def teeth(y0, y1, n, step, off=0.0):
    x_start = CX - n * step / 2 + off
    for k in range(n):
        x0 = int(round(x_start + k * step))
        for yy in range(y0, y1):
            t = (yy - y0) / (y1 - y0)
            for xx in range(x0, x0 + step - 1):
                i = 6 if t < 0.25 else 5 if t < 0.6 else 4 if t < 0.85 else 3
                if xx == x0: i += 1
                if xx == x0 + step - 2: i -= 1
                if yy == y0: i -= 1  # 歯ぐきの よごれ
                put_i(xx, yy, i); TEETH.add((xx, yy))
teeth(93, 105, 9, 6)
teeth(106, 113, 7, 5, 0.0)
# ---- 額の すじ（まん中から 少し ずれた 浅い みぞ）
for y in range(11, 36):
    x = int(CX + 4 + 0.8 * math.sin(y / 6))
    if (x, y) in buf: put_i(x, y, 1 if y > 14 else 3)
    if (x + 1, y) in buf: put_i(x + 1, y, 5)
# ---- よごれ（暗い ところの そば）と 小さな 反射
dark = {p for p, c in buf.items() if c in (PIT, "#141925", "#0c0f17")}
for (x, y), i in list(idx.items()):
    if i >= 2 and (x, y) not in TEETH and rnd.random() < 0.16:
        if any((x + dx, y + dy) in dark for dx in (-3, 0, 3) for dy in (-3, 0, 3)): put_i(x, y, i - 2)
for (x, y), i in list(idx.items()):
    if rnd.random() < 0.025 and i >= 2 and (x, y) not in TEETH: put_i(x, y, i - 1)
for (cx, cy, w, h, i) in [(49, 20, 4, 2, 7), (45, 25, 2, 2, 6), (84, 28, 2, 3, 6), (30, 54, 2, 2, 6), (97, 54, 2, 2, 6), (31, 74, 3, 1, 6), (96, 74, 3, 1, 6), (53, 55, 5, 1, 6)]:
    for yy in range(cy, cy + h):
        for xx in range(cx, cx + w):
            if (xx, yy) in idx: put_i(xx, yy, i)
for (x, y) in list(buf): s.px(x, y, buf[(x, y)])
s.shift(0, 5)
s.outline(OUT, where="outside")
s.preview(os.path.join(os.path.dirname(__file__), "preview.png"), scale=6, bg="#58708a", labels=False)
s.save_png(os.path.join(os.path.dirname(__file__), "skull_1x.png"))
s.stats()
