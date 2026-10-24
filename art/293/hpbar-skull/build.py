"""#293 試作: ボス体力バーの 飾り（銀の どくろの 指輪。見本は オーナーの 参考画像）。128 × 128、正面、左上から 光。
python3 build.py で skull_1x.png と preview.png。とげ・刃・光る 目は 付けない（オーナー 2026-10-24）"""
import math, os, random, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))
from pixelstudio import Sprite

N = 128
CX = 64.0
SILVER = ["#171b26", "#262d3d", "#3a4458", "#566279", "#7a889f", "#a3b1c6", "#cfdae8", "#f2f7fc"]
PIT = "#07090e"  # くぼみの 奥
OUT = "#05070b"
LIGHT = (-0.5, -0.6, 0.62)
rnd = random.Random(293)
s = Sprite(N, N)
buf = {}
idx = {}  # 銀の 段の 番号（よごれ用）


def shade_i(nx, ny, nz, bias=0.0):
    d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    t = max(0.0, min(0.999, 0.34 + 0.62 * d + bias))
    return int(t * len(SILVER))


def put_i(x, y, i):
    i = max(0, min(len(SILVER) - 1, i))
    buf[(x, y)] = SILVER[i]; idx[(x, y)] = i


def put(x, y, c):
    buf[(x, y)] = c; idx.pop((x, y), None)


def dome(px, py, cx, cy, rx, ry):
    u, v = (px - cx) / rx, (py - cy) / ry
    r = u * u + v * v
    if r > 1: return None
    return (u * 0.95, v * 0.95, math.sqrt(1 - r))


# ---- ずがい（まるく ひろい）
for y in range(N):
    for x in range(N):
        px, py = x + 0.5, y + 0.5
        n = dome(px, py, CX, 50, 50, 43)
        if n is None and 60 <= py <= 104:
            # ほお ・あご: 下へ すぼまる
            t = (py - 60) / 44
            w = 40 - 17 * t ** 1.1
            dx = (px - CX) / w
            if abs(dx) <= 1:
                n = (dx * 0.95, 0.15 + 0.5 * t, math.sqrt(1 - dx * dx) * (0.9 - 0.25 * t))
        if n is None: continue
        b = 0.0
        # ほおぼねの 出っぱり（明るい）と その 下の こけた ほお（暗い）
        for sx in (-1, 1):
            cb = dome(px, py, CX + sx * 33, 71, 13, 7)
            if cb: n = (n[0] + cb[0] * 0.4, n[1] + cb[1] * 0.4, n[2] + 0.2)
            hx, hy = (px - (CX + sx * 30)) / 11, (py - 88) / 12
            if hx * hx + hy * hy < 1: b -= 0.28 * (1 - (hx * hx + hy * hy))
        put_i(x, y, shade_i(*n, bias=b))
# 頭頂の つや・まん中の すじ
for y in range(N):
    for x in range(N):
        if (x, y) not in buf: continue
        e = ((x - 44) / 15) ** 2 + ((y - 27) / 7) ** 2
        if e <= 1: put_i(x, y, 7 if e < 0.22 else 6)
        e2 = ((x - 88) / 6) ** 2 + ((y - 32) / 11) ** 2
        if e2 <= 1: put_i(x, y, 6)
        if abs(x + 0.5 - CX) < 0.8 and 16 < y < 36: put_i(x, y, 2)
        elif abs(x + 0.5 - CX - 1.6) < 0.8 and 18 < y < 36: put_i(x, y, 7)
# ---- 目の くぼみ（深く 暗い。光らない）
for sx in (-1, 1):
    cx, cy, a = CX + sx * 23, 63, sx * 0.28
    ca, sa = math.cos(a), math.sin(a)
    for y in range(N):
        for x in range(N):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            ux, uy = (dx * ca + dy * sa) / 18.5, (-dx * sa + dy * ca) / 14.5
            r = ux * ux + uy * uy
            if r <= 1.0 and (x, y) in buf:
                if r > 0.8: put_i(x, y, 1 if uy < 0.1 else 5)   # ふち: 上は かげ、下は 光を 受ける
                elif r > 0.55: put(x, y, "#10141d")
                else: put(x, y, PIT)
# ---- 鼻（逆ハート）
for y in range(N):
    for x in range(N):
        px, py = x + 0.5 - CX, y + 0.5
        inside = False
        if 71 <= py <= 83:
            t = (py - 71) / 12
            inside = abs(px) <= 1.2 + 6.5 * t
        for sx in (-1, 1):
            if (px - sx * 4.4) ** 2 + (py - 83) ** 2 <= 4.8 ** 2: inside = True
        if inside and (x, y) in buf: put(x, y, PIT)
# ---- 歯（上の 列・下の 列）。口は 暗い
for y in range(91, 118):
    t = (y - 91) / 27
    half = 24 - 6 * t
    for x in range(int(CX - half), int(CX + half) + 1):
        put(x, y, PIT)
def row(y0, y1, half, step, off):
    n = int(2 * half // step)
    for k in range(n):
        x0 = int(CX - half + 1 + k * step + off)
        for yy in range(y0, y1):
            t = (yy - y0) / (y1 - y0)
            for xx in range(x0, x0 + step - 1):
                i = 7 if t < 0.25 else 6 if t < 0.55 else 5 if t < 0.8 else 3
                if xx == x0: i += 1
                if xx == x0 + step - 2: i -= 2
                put_i(xx, yy, i)
row(93, 104, 22, 5, 0)
row(105, 115, 17, 5, 1)
# ---- よごれ: 暗い ところの そばで 少し 暗く（いぶし銀）
dark = {p for p, c in buf.items() if c in (PIT, "#10141d")}
for (x, y), i in list(idx.items()):
    if i >= 3 and rnd.random() < 0.10:
        near = any((x + dx, y + dy) in dark for dx in (-3, 0, 3) for dy in (-3, 0, 3))
        if near: put_i(x, y, i - 2)
for (x, y), i in list(idx.items()):
    pass
for (x, y) in list(buf):
    s.px(x, y, buf[(x, y)])
s.shift(0, 4)
s.outline(OUT, where="outside")
s.preview(os.path.join(os.path.dirname(__file__), "preview.png"), scale=6, bg="#58708a", labels=False)
s.save_png(os.path.join(os.path.dirname(__file__), "skull_1x.png"))
s.stats()
