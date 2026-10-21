"""WEAPON-8: らせんの かぜ 3 案の 形（3D）。すべて 同じ 約束:

st = {"s": 大きさ 0..1, "phi": 回る 角, "fade": ほどける 0..1, "key": 決めの コマか}
model_X(H, st, cam) -> items（w8kit.render に わたす）
H = あたまの 位置。進む 向きは +x。
"""
import math
import random

from PIL import Image

from w8kit import C, add, mul, sub, dot, norm, cross

X = (1.0, 0.0, 0.0)
PX = 1 / 16  # 1 点 = 1/16 ブロック（タイルと 同じ。今の 真空波 1.3 ブロック 32 点に 近い）


def _ax(a):
    """進む 軸に 直角な 面の 向き（角 a）"""
    return (0.0, math.cos(a), math.sin(a))


# ================================================================= A つむじ玉（ビルボードの 重ね ＋ らせんの 点の 尾）

def vortex_sprite(R, phi, layer, key=False):
    """カメラに 向く 渦の 玉（2 本の うで）。layer 0 = 奥（こい ふち）・1 = 中（うで）・2 = 手前（芯）"""
    n = 2 * R + 3
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    p = im.load()
    c = n // 2
    for y in range(n):
        for x in range(n):
            dx, dy = x - c, y - c
            r = math.hypot(dx, dy)
            if r > R + 1.2:
                continue
            th = math.atan2(dy, dx)
            # うで: 角が r と ともに ずれる（渦）。2 本
            w = (th - phi - 0.28 * r) % math.pi
            arm = min(w, math.pi - w) < (0.62 if r < R * 0.7 else 0.45)
            col = None
            if layer == 0:
                if r <= R + 1.2 and r > R + 0.2:
                    col = C["B2"] if arm else None
                elif r <= R + 0.2:
                    col = C["B2"] if r > R * 0.6 else C["B1"]
            elif layer == 1:
                if arm and r <= R + 0.2:
                    col = C["W1"] if r < R * 0.45 else (C["W2"] if r < R * 0.8 else C["B1"])
            else:
                rc = 2.6 if not key else 3.6
                if r <= rc:
                    col = C["W1"]
                elif key and arm and r < R * 0.5:
                    col = C["W1"]
            if col:
                p[x, y] = col + (255,)
    return im


def tail_sprite(kind):
    """尾の つぶ: 0 = 直径 6・1 = 4・2 = 3・3 = 2（芯は 白、ふちは 水色）"""
    n = {0: 6, 1: 4, 2: 3, 3: 2}[kind]
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    c = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            r = math.hypot(x - c, y - c)
            if r <= n / 2:
                col = C["W1"] if (r < n / 2 - 1.2 and kind < 2) else (C["B1"] if kind < 3 else C["B2"])
                if kind == 2 and r < 0.8:
                    col = C["W2"]
                im.putpixel((x, y), col + (255,))
    return im


def model_a(H, st, cam):
    s, phi, fade, key = st["s"], st["phi"], st["fade"], st["key"]
    items = []
    R = max(3, int(round(12 * s * (1 - 0.5 * fade))))
    toward = norm(sub(cam.pos, H))
    if fade < 0.95:
        for layer, off in ((0, -0.3), (1, 0.0), (2, 0.3)):
            items.append(("spr", add(H, mul(toward, off)), vortex_sprite(R, phi, layer, key), PX))
    # 尾: 2 本の らせん（ほんとうの 3D の 位置。見る 向きで 形が かわる）
    N = 14
    L = 3.0 * s
    for strand in (0, 1):
        for i in range(1, N + 1):
            u = i / N
            sd = u * L
            r = (0.7 * (1 - 0.45 * u)) * s * (1 + 0.8 * fade)
            a = phi + strand * math.pi + sd * (2 * math.pi / 1.4)
            pos = add(sub(H, mul(X, sd)), mul(_ax(a), r))
            kind = 0 if u < 0.3 else (1 if u < 0.6 else (2 if u < 0.85 else 3))
            if fade > 0:
                kind = min(3, kind + 1 + int(fade * 2))
                if (i + strand) % 2 and fade > 0.4:
                    continue
            items.append(("spr", pos, tail_sprite(kind), PX))
    return items


# ================================================================= B らせんの おび（2 本の リボン。ドリルの 先）

def model_b(H, st, cam):
    s, phi, fade, key = st["s"], st["phi"], st["fade"], st["key"]
    items = []
    L = 2.8 * s
    Rm = 0.72 * s * (1 + 0.5 * fade)
    wid = 0.42 * s
    om = 2 * math.pi / 1.5
    ds = PX / 2 / math.sqrt(1 + (Rm * om) ** 2)
    n = int(L / ds)
    nw = int(wid / PX) + 2
    for strand in (0, 1):
        for k in range(n):
            sd = k * ds
            u = sd / L
            nose = min(1.0, sd / (0.9 * s)) ** 0.8
            r = Rm * nose * (1 - 0.3 * u)
            a = phi + strand * math.pi + sd * om
            nrm = _ax(a)
            # しっぽと ほどける ときは 網で ぬく（4 段。進む 向きに 1 点 ごと）
            cut = max(0.0, (u - 0.72) / 0.28) * 0.75 + fade * 0.75
            ks = int(sd / PX)
            for j in range(nw):
                wv = j / (nw - 1) - 0.5
                # おびは 軸の 向きに はばを 持つ（ねじった リボン）
                pos = add(sub(H, mul(X, sd + wv * wid * nose)), mul(nrm, r))
                front = dot(nrm, sub(cam.pos, pos)) > 0
                edge = j in (0, nw - 1)
                if cut > 0 and ((ks + j) % 4) < int(cut * 4 + 0.001):
                    continue
                if front:
                    col = C["B1"] if edge else (C["W1"] if (key and u < 0.45) or u < 0.15 else C["W2"])
                else:
                    col = C["B2"] if edge else C["B1"]
                items.append(("dot", pos, col, PX))
    # 先の 光（ドリルの 先）
    if fade < 0.5:
        items.append(("dot", add(H, mul(X, 0.02)), C["W1"], PX * (2 if key else 1)))
    return items


# ================================================================= C かぜの わ の れつ（かたむいた 輪が 1 つずつ ずれて 回る）

def model_c(H, st, cam):
    s, phi, fade, key = st["s"], st["phi"], st["fade"], st["key"]
    items = []
    rings = 4
    tilt = math.radians(28)
    for i in range(rings):
        sd = i * 0.75 * s
        R = (0.78 - 0.13 * i) * s * (1 + 0.5 * fade)
        c = sub(H, mul(X, sd))
        psi = phi + i * math.pi / 3
        tdir = _ax(psi)
        nrm = norm(add(mul(X, math.cos(tilt)), mul(tdir, math.sin(tilt))))
        u = norm(cross(nrm, (0.0, 0.0, 1.0)) if abs(nrm[2]) < 0.9 else cross(nrm, (0.0, 1.0, 0.0)))
        v = cross(nrm, u)
        steps = int(2 * math.pi * R / (PX * 0.5)) + 8
        for k in range(steps):
            a = 2 * math.pi * k / steps
            # 切れ目 1 つ（回る 向きが 見える）
            g = (a - psi) % (2 * math.pi)
            if g < 0.7:
                continue
            p = add(c, add(mul(u, R * math.cos(a)), mul(v, R * math.sin(a))))
            front = dot(sub(p, c), sub(cam.pos, c)) > 0
            if fade > 0 and front and (k % 4) < int(fade * 4):
                continue
            head = g > 2 * math.pi - 1.2  # 切れ目の 前 = 風の 先（明るい）
            if front:
                col = C["W1"] if (head or (key and i == 0)) else (C["W2"] if i < 2 else C["B1"])
                size = PX * (2.2 if i == 0 else 1.7)
            else:
                col = C["B2"] if i < 2 else C["B3"]
                size = PX * 1.2
            items.append(("dot", p, col, size))
    return items


MODELS = {"A": model_a, "B": model_b, "C": model_c}

# ================================================================= 時間（3 案 共通。F = はなした ステップ）
# 区間: 出る → のびる → 決め★ → とぶ（くり返し）→ ほどける
TIMELINE = [
    {"name": "出る", "F": "F1-2", "steps": 2, "s": 0.35, "fade": 0.0, "key": False, "d": 0.6},
    {"name": "のびる", "F": "F3-4", "steps": 2, "s": 0.75, "fade": 0.0, "key": False, "d": 1.1},
    {"name": "★決め", "F": "F5-10", "steps": 6, "s": 1.0, "fade": 0.0, "key": True, "d": 2.2},
    {"name": "とぶ 1", "F": "F11-", "steps": 3, "s": 1.0, "fade": 0.0, "key": False, "d": 3.6},
    {"name": "とぶ 2", "F": "", "steps": 3, "s": 1.0, "fade": 0.0, "key": False, "d": 4.4},
    {"name": "ほどける 1", "F": "おわり", "steps": 3, "s": 1.0, "fade": 0.4, "key": False, "d": 5.6},
    {"name": "ほどける 2", "F": "", "steps": 3, "s": 1.0, "fade": 0.8, "key": False, "d": 6.2},
]
SPIN = 2 * math.pi / 12  # 1 ステップの 回り（12 ステップで 1 回り = 1 秒に 5 回り）


def state(e, step):
    return {"s": e["s"], "phi": step * SPIN, "fade": e["fade"], "key": e["key"]}
