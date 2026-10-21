"""WEAPON-8 v2: らせんの かぜ の 直し（半透明・回って 見える すじ・地面の 土と 草）。

形は 今の 素材 `public/models/fx/fujin_spiral_ribbon.json`（B「らせんの おび」98 三角形）を そのまま 使い、
- 帯の 色の 置き方（半透明の 作り方）を 変える: S1 = 網（テクセルの 市松）/ S2 = アルファ 0.5
- 回りの すじ（4 本の 弧・32 三角形）を 足す
- 地面の 土・草の つぶ ＋ 土けむり（点。三角形 0）を 足す
"""
import json
import math
import os
import random

import numpy as np

import scene as SC

ROOT = os.path.abspath(os.path.join(SC.HERE, "..", "..", ".."))
RIB = json.load(open(os.path.join(ROOT, "public", "models", "fx", "fujin_spiral_ribbon.json")))
VERTS = np.array(RIB["mesh"]["vertices"], np.float64)
TRIS = RIB["mesh"]["triangles"]
USED = RIB["usedColumns"]

C = {k: SC.hexrgb(v) for k, v in RIB["colors"].items()}  # W1 W2 B1 B2 B3

GS = 1.25  # 半径の 倍（素材の 約束）
SPIN_DEG = 15.0  # 1 ステップ 15 度


def timeline(a):
    s = 0.35 if a < 2 else 0.75 if a < 4 else 1.0
    return s, (4 <= a <= 9)


def to_world(p, a, B, u, spin=True):
    """メッシュの 点 → 世界。p = (x, y, z) メッシュ（x = 進む 向き）。"""
    s, _ = timeline(a)
    x, y, z = p[0] * s, p[1] * s * GS, p[2] * s * GS
    phi = math.radians(a * SPIN_DEG) if spin else 0.0
    y, z = y * math.cos(phi) - z * math.sin(phi), y * math.sin(phi) + z * math.cos(phi)
    # メッシュ +x → u（水平）、メッシュ z → u × 上 の 右手
    ux, uz = u[0], u[2]
    side = np.array([-uz, 0.0, ux])  # u を 時計回りに 90 度（上から 見て 右）
    d = 1.0 + 0.2 * a
    root = B + np.array(u) * d
    return root + np.array(u) * x + np.array([0, 1, 0]) * y + side * z


# ------------------------------------------------------------------ 帯の 色（テクセル = 点）

def _checker(uu, vv, keep_every=2):
    """keep_every=2 → 半分 のこす（市松）、4 → 4 分の 1 のこす"""
    iu, iv = np.floor(uu).astype(int), np.floor(vv).astype(int)
    if keep_every == 2:
        return ((iu + iv) % 2) == 0
    return ((iu % 2) == 0) & ((iv % 2) == 0)


def band_shader(mode, key):
    def sh(u, v, front, xx, yy):
        n = len(u)
        col = np.zeros((n, 3), np.float32)
        al = np.ones(n, np.float32)
        vv = np.clip(v, 0, 8.999)
        row = np.floor(vv).astype(int)
        frac = u / USED
        if front:
            col[:] = C["W2"]
            col[(row == 1) | (row == 7)] = C["B1"]
            col[(row == 0) | (row == 8)] = C["B3"]
            body = (row >= 2) & (row <= 6)
            streak = (row == 4) & ((np.floor(u) % 10) < 6)
            col[streak] = C["W1"]
            if key:  # 決めの コマ: しまが 太い
                streak = ((row == 3) | (row == 4) | (row == 5)) & ((np.floor(u) % 10) < 7)
                col[streak] = C["W1"]
            soft = body & ~streak
            if mode == "S1":
                al[soft & ~_checker(u, v, 2)] = 0
            else:
                al[soft] = 0.5
        else:
            col[:] = C["B1"]
            col[(row == 1) | (row == 7)] = C["B2"]
            col[(row == 0) | (row == 8)] = C["B3"]
            soft = (row >= 1) & (row <= 7)
            if mode == "S1":
                al[soft & ~_checker(u, v, 4)] = 0
            else:
                al[soft] = 0.3
        # しっぽ 3 割は 網で ほどける（止め絵でも 前へ 進んで 見える）
        lvl = np.where(frac > 0.9, 3, np.where(frac > 0.8, 2, np.where(frac > 0.7, 1, 0)))
        cut = ((np.floor(u) + np.floor(vv)) % 4) < lvl
        al[cut] = 0
        return col, al

    return sh


# ------------------------------------------------------------------ 回りの すじ（弧 4 本）

ARC_RINGS = (9, 17)
ARC_SEGS = 4
ARC_SPAN = (10.0, 110.0)  # 帯から うしろへ（回る 向きの 反対）の 角度
ARC_W = 3 / 16  # はば 3 点


def arc_quads():
    """メッシュ 座標の 弧（帯の 外がわ）。戻り: [(4 点, 4 uv)]"""
    out = []
    for strand in (0, 1):
        for ring in ARC_RINGS:
            vx = VERTS[strand * 50 + ring * 2]
            x, y, z = vx[0], vx[1], vx[2]
            r = math.hypot(y, z) * 1.22
            th = math.atan2(z, y)
            for k in range(ARC_SEGS):
                t0 = k / ARC_SEGS
                t1 = (k + 1) / ARC_SEGS
                a0 = th - math.radians(ARC_SPAN[0] + (ARC_SPAN[1] - ARC_SPAN[0]) * t0)
                a1 = th - math.radians(ARC_SPAN[0] + (ARC_SPAN[1] - ARC_SPAN[0]) * t1)
                P = [
                    (x - ARC_W / 2, r * math.cos(a0), r * math.sin(a0)),
                    (x + ARC_W / 2, r * math.cos(a0), r * math.sin(a0)),
                    (x + ARC_W / 2, r * math.cos(a1), r * math.sin(a1)),
                    (x - ARC_W / 2, r * math.cos(a1), r * math.sin(a1)),
                ]
                L = r * math.radians(ARC_SPAN[1] - ARC_SPAN[0]) * 16  # 点の 長さ
                UV = [(t0 * L, 0), (t0 * L, 3), (t1 * L, 3), (t1 * L, 0)]
                out.append((P, UV, L))
    return out


ARCS = arc_quads()


def arc_shader(mode):
    def sh(u, v, front, xx, yy):
        n = len(u)
        L = ARCS[0][2]
        t = u / max(L, 1e-6)
        col = np.tile(C["W2"], (n, 1)).astype(np.float32)
        al = np.ones(n, np.float32)
        head = t < 0.3
        col[head] = C["W1"]
        mid = (t >= 0.3) & (t < 0.65)
        tail = t >= 0.65
        col[tail] = C["B1"]
        if mode == "S1":
            al[mid & ~_checker(u, v, 2)] = 0
            al[tail & ~_checker(u, v, 4)] = 0
        else:
            al[mid] = 0.6
            al[tail] = 0.3
        return col, al

    return sh


# ------------------------------------------------------------------ 地面の つぶ（土・草・土けむり）

GROUND_PAL = {
    "grass": ["#73CC52", "#4CA332", "#8B5A2B", "#6F4520", "#B8A07A"],
    "dirt": ["#A06A38", "#8B5A2B", "#6F4520", "#5A381A", "#B8A07A"],
    "stone": ["#A5A5A5", "#8E8E8E", "#757575", "#5E5E5E", "#B4B0A8"],
    "sand": ["#F0E3B2", "#E8D9A0", "#D6C487", "#BBA86E", "#EFE6C8"],
}
G = 20.0  # 重さ（ブロック/秒²）
DT = 1 / 60
MAX_POINTS = 48


def debris(a, B, u, ground_y, kind="grass", seed=239):
    """a = らせんの 年。戻り: [(位置, 点の 数, 色, dither)] と 生きている 数"""
    pal = [SC.hexrgb(h) for h in GROUND_PAL[kind]]
    u = np.array(u, np.float64)
    side = np.array([-u[2], 0.0, u[0]])
    out = []
    for t in range(3, a + 1):
        rnd = random.Random(seed * 1000 + t)
        nose = B + u * (1.0 + 0.2 * t)
        n_chip = 2 if t % 2 == 0 else 1
        for c in range(n_chip):
            life = rnd.randint(12, 20)
            k = a - t
            if k > life:
                rnd.random(); rnd.random(); rnd.random(); rnd.random()
                continue
            back = 0.4 + 1.2 * rnd.random()
            lat = (rnd.random() * 2 - 1) * 0.8
            p0 = nose - u * back + side * lat
            p0[1] = ground_y + 0.05
            sgn = 1 if rnd.random() < 0.7 else -1  # 回る 向きへ よく とぶ
            v_lat = sgn * (1.5 + 2.0 * rnd.random())
            v_up = 5.0 + 3.0 * rnd.random()
            v_fwd = 3.0 + 4.0 * rnd.random()
            tt = k * DT
            p = p0 + side * v_lat * tt + u * v_fwd * tt
            p[1] = p0[1] + v_up * tt - 0.5 * G * tt * tt
            if p[1] < ground_y:
                continue
            grass = (c == 1) or (t % 3 == 0)
            col = pal[0] if grass else pal[2]
            dots = 2 if grass else 3
            dith = 0
            if k > life * 0.65:
                col = pal[1] if grass else pal[3]
                dith = 1
            out.append((p, dots, col, dith))
        # 土けむり（3 ステップに 1 つ）
        if t % 4 == 0:
            k = a - t
            life = 14
            if k <= life:
                lat = (rnd.random() * 2 - 1) * 0.5
                p = nose - u * 0.9 + side * lat
                p = p.copy()
                p = p + u * 2.0 * k * DT
                p[1] = ground_y + 0.12 + 0.8 * k * DT
                dots = 3 + int(3 * k / life)
                out.append((p, dots, pal[4], 1))
    return out[:MAX_POINTS], len(out)


# ------------------------------------------------------------------ 1 まい 描く

def render(shot, a, mode="S1", arcs=True, ground=True, yaw_dir=0.0, kind="grass", tip=True):
    cam = SC.Cam(shot)
    B = cam.player + np.array([0, 1.4, 0])
    u = np.array([math.sin(math.radians(yaw_dir)), 0.0, -math.cos(math.radians(yaw_dir))])
    lay = SC.Layer(cam)
    s, key = timeline(a)
    sh = band_shader(mode, key)
    for tri in TRIS:
        P = [to_world(VERTS[i][:3], a, B, u) for i in tri]
        UV = [VERTS[i][3:5] for i in tri]
        lay.tri(P, UV, sh)
    if arcs and a >= 2:
        ash = arc_shader(mode)
        for P, UV, L in ARCS:
            W = [to_world(np.array(p), a, B, u) for p in P]
            lay.tri([W[0], W[1], W[2]], [UV[0], UV[1], UV[2]], ash)
            lay.tri([W[0], W[2], W[3]], [UV[0], UV[2], UV[3]], ash)
    n_pts = 0
    if ground:
        pts, n_pts = debris(a, B, u, cam.player[1], kind)
        for p, dots, col, dith in pts:
            lay.point(p, dots, col, 1.0, dith)
    if tip:
        from PIL import Image
        tex = Image.open(os.path.join(ROOT, "public", "models", "fx", "fujin_spiral_ribbon.png")).convert("RGBA")
        r = RIB["tip"]["big" if key else "small"]
        spr = tex.crop((r[0], r[1], r[0] + r[2], r[1] + r[3]))
        lay.sprite(to_world(np.array([0.03, 0, 0]), a, B, u), spr, dot_blocks=2 / 16)
    img = SC.composite(SC.bg(shot), lay, cam, SC.char_depth(cam), SC.char_mask(SC.bg(shot), cam))
    return img, n_pts


TRI_COUNT = {"ribbon": 96, "arcs": len(ARCS) * 2, "tip": 2}
