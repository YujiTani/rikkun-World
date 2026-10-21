"""WEAPON-8 v2: ため中の 光を「剣を 持つ 手」に 集める（T1 の 直し H1「手もとの 光」）。

- 芯は 手（にぎり）に。いっぱいでも 直径 4 点（0.25 ブロック）＋ 網の にじみ 1〜2 点。体を かくさない。
- つぶは 手へ 集まる。体の 方（手から 見て 体の まん中の 向き ±70°）からは 出さない。
- いっぱいの 瞬間: 手もとに 小さな 輪が 1 回 ひろがる ＋ 刃の 根もとから 先へ 光が 1 回 すーっと 走る。
- いっぱい中: 剣の 先に きらり 1 つ（止まった まま。点滅しない）＋ 手の まわりを 小さな つぶ 2 つが ゆっくり 回る。
手と 剣先の 画面の 位置は スクショから 読んだ 値（試作の 人形の 手の 位置。本番は 人形の 手の 骨から とる）。
"""
import math
import random

import numpy as np
from PIL import Image

import scene as SC

PALS = {
    "fujin": ["#F4FCFF", "#CDEFFC", "#8FD6F2", "#4FA8D8", "#2B6699"],
    "raijin": ["#FFF8DC", "#FFE98A", "#F0C24A", "#9A7430", "#4E3C1A"],
}
HAND = {"back": ((590, 400), (620, 372)), "side": ((532, 405), (462, 370))}


def _rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def core_sprite(level, pal):
    """level 0..1 → 芯の 半径 0.5〜1.5 点 ＋ にじみ 1 点（網）"""
    n = 9
    j, i = np.mgrid[0:n, 0:n]
    X = i - n // 2
    Y = j - n // 2
    r = np.hypot(X, Y)
    R = 0.5 + 1.0 * level
    out = np.zeros((n, n, 4), np.uint8)
    halo = (r <= R + 1.6) & (((X + Y) % 2) == 0)
    out[halo, :3] = _rgb(pal[2])
    out[halo, 3] = 255
    body = r <= R + 0.5
    out[body, :3] = _rgb(pal[1])
    out[body, 3] = 255
    c = r <= max(0.5, R - 0.6)
    out[c, :3] = _rgb(pal[0])
    out[c, 3] = 255
    return Image.fromarray(out, "RGBA")


def ring_sprite(radius, pal, idx):
    n = 2 * int(radius) + 5
    j, i = np.mgrid[0:n, 0:n]
    X = i - n // 2
    Y = j - n // 2
    r = np.hypot(X, Y)
    m = np.abs(r - radius) < 0.6
    if idx >= 2:
        m &= ((X + Y) % 2) == 0
    out = np.zeros((n, n, 4), np.uint8)
    out[m, :3] = _rgb(pal[min(4, 1 + idx)])
    out[m, 3] = 255
    return Image.fromarray(out, "RGBA")


def star_sprite(pal, big=True):
    n = 7 if big else 5
    c = n // 2
    out = np.zeros((n, n, 4), np.uint8)
    for k in range(n):
        d = abs(k - c)
        col = pal[0] if d == 0 else pal[1] if d == 1 else pal[2]
        for (x, y) in ((k, c), (c, k)):
            out[y, x, :3] = _rgb(col)
            out[y, x, 3] = 255
    return Image.fromarray(out, "RGBA")


def unproject(cam, sxy, depth):
    x = (sxy[0] - cam.W / 2) / cam.f * depth
    y = -(sxy[1] - cam.H / 2) / cam.f * depth
    return cam.pos + cam.right * x + cam.up * y + cam.fwd * depth


def render(shot, view, F, palette="fujin", seed=7):
    cam = SC.Cam(shot)
    pal = PALS[palette]
    cols = [SC.hexrgb(h) for h in pal]
    dep = SC.char_depth(cam) - 0.25
    (hx, hy), (tx, ty) = HAND[view]
    H = unproject(cam, (hx, hy), dep)
    T = unproject(cam, (tx, ty), dep)
    body = unproject(cam, SC.Cam(shot).proj(cam.player + np.array([0, 1.0, 0]))[0], dep)
    lay = SC.Layer(cam)
    R, U = cam.right, cam.up
    # 体の 向き（画面の 上で）: つぶは ここ ±70° から 出さない
    bv = body - H
    body_ang = math.atan2(bv @ U, bv @ R)
    level = min(1.0, F / 60)
    n_pts = 0
    # つぶ（ためF ごとに 1 つ 生まれ 18 ステップで 手に つく）
    for t in range(max(1, F - 17), F + 1):
        rnd = random.Random(seed * 100 + t)
        age = F - t
        u = age / 18
        ang = rnd.uniform(-math.pi, math.pi)
        dd = (ang - body_ang + math.pi) % (2 * math.pi) - math.pi
        if abs(dd) < math.radians(70):
            ang = body_ang + math.pi + dd  # 体の 反対がわへ
        r0 = 0.8 + 0.3 * rnd.random()
        r = r0 * (1 - u * u)
        if r < 0.1 or (F >= 60 and t % 2 == 0):
            continue
        dirv = R * math.cos(ang) + U * math.sin(ang)
        p = H + dirv * r
        lay.point(p, 1, cols[0])
        n_pts += 1
        if u > 0.3:
            lay.point(p + dirv * (1 / 16) * (1 + u), 1, cols[1])
            lay.point(p + dirv * (2 / 16) * (1 + u), 1, cols[2])
            n_pts += 2
    # 芯
    lay.sprite(H, core_sprite(level, pal), z_bias=0.05, ztest=False)
    # いっぱいの 瞬間: 輪 ＋ 刃の 光
    if 60 <= F <= 71:
        k = F - 60
        rad = 3 + k * 0.5
        lay.sprite(H, ring_sprite(rad, pal, k // 4), ztest=False)
    if 60 <= F <= 65:
        s = (F - 60 + 1) / 6
        for k in range(3):
            q = max(0.0, min(1.0, s - k * 0.06))
            lay.point(H + (T - H) * q, 2 if k == 0 else 1, cols[0] if k == 0 else cols[1])
    if F >= 66:
        lay.sprite(T, star_sprite(pal, True), ztest=False)
        a0 = math.radians((F - 60) * 3)
        for k in range(2):
            aa = a0 + k * math.pi
            lay.point(H + (R * math.cos(aa) + U * math.sin(aa)) * 0.32, 2, cols[1])
    global LAST
    LAST = lay
    img = SC.composite(SC.bg(shot), lay, cam)
    return img, (hx, hy), n_pts
