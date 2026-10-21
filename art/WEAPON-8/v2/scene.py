"""WEAPON-8 v2: ゲームの スクショに 3D の エフェクトを 重ねて 描く 道具（見本 専用。ゲームの コードでは ない）。

- 背景 = `bg/*.png`（試作の ワークツリーで 撮った エフェクト なしの スクショ。撮り方 `bg/capture.spec.ts.txt`）
- カメラ = `bg/meta.json`（`camera.get().position`・`player.yaw`・`camera.fov()`）。CameraRig と 同じ 式
  （向き D = (sin yaw, 0, -cos yaw)、右 R = (cos yaw, 0, sin yaw)、たての 画角 fov）。
- 小さな ソフトの ラスタライザ（z バッファ・遠近 補正の uv）。三角形・点・カメラに 向く 板 を 描く。
- キャラより 奥の 物は キャラの 形（色で ぬき出した マスク）で かくす。
"""
import json
import math
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BG = os.path.join(HERE, "bg")
META = json.load(open(os.path.join(BG, "meta.json")))


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


class Cam:
    def __init__(self, shot):
        m = META[shot]
        p = m["cam"]["position"]
        self.pos = np.array([p["x"], p["y"], p["z"]], dtype=np.float64)
        yaw = math.radians(m["player"]["yaw"])
        self.fwd = np.array([math.sin(yaw), 0.0, -math.cos(yaw)])
        self.right = np.array([math.cos(yaw), 0.0, math.sin(yaw)])
        self.up = np.array([0.0, 1.0, 0.0])
        self.W, self.H = m["w"], m["hh"]
        self.f = (self.H / 2) / math.tan(math.radians(m["fov"]) / 2)
        pp = m["player"]["position"]
        self.player = np.array([pp["x"], pp["y"], pp["z"]])
        self.waves = m["waves"]

    def view(self, p):
        d = np.asarray(p, dtype=np.float64) - self.pos
        return np.array([d @ self.right, d @ self.up, d @ self.fwd])

    def proj(self, p):
        x, y, z = self.view(p)
        return np.array([self.W / 2 + x / z * self.f, self.H / 2 - y / z * self.f]), z

    def px_per_block(self, z):
        return self.f / z


class Layer:
    """エフェクトの 層。色・こさ・深さ。"""

    def __init__(self, cam):
        self.cam = cam
        W, H = cam.W, cam.H
        self.rgb = np.zeros((H, W, 3), np.float32)
        self.a = np.zeros((H, W), np.float32)
        self.add = np.zeros((H, W), bool)
        self.z = np.full((H, W), np.inf, np.float32)

    # ---------------------------------------------------------- 三角形
    def tri(self, P, UV, shade, ztest=True):
        """P: 3 つの 世界の 点・UV: 3 つの (u, v)。shade(u, v, front, sx, sy) → (rgb (n,3), alpha (n,))。"""
        S, Z = [], []
        for p in P:
            s, z = self.cam.proj(p)
            if z < 0.05:
                return
            S.append(s)
            Z.append(z)
        S = np.array(S)
        Z = np.array(Z)
        x0, y0 = np.floor(S.min(0)).astype(int)
        x1, y1 = np.ceil(S.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, self.cam.W - 1), min(y1, self.cam.H - 1)
        if x1 < x0 or y1 < y0:
            return
        area = (S[1, 0] - S[0, 0]) * (S[2, 1] - S[0, 1]) - (S[2, 0] - S[0, 0]) * (S[1, 1] - S[0, 1])
        if abs(area) < 1e-6:
            return
        front = area < 0  # 画面の y は 下向き
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        px = xs + 0.5
        py = ys + 0.5

        def edge(a, b):
            return (S[b, 0] - S[a, 0]) * (py - S[a, 1]) - (S[b, 1] - S[a, 1]) * (px - S[a, 0])

        w0 = edge(1, 2) / area
        w1 = edge(2, 0) / area
        w2 = edge(0, 1) / area
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            return
        w0, w1, w2 = w0[inside], w1[inside], w2[inside]
        iz = w0 / Z[0] + w1 / Z[1] + w2 / Z[2]
        z = 1 / iz
        UV = np.asarray(UV, dtype=np.float64)
        u = (w0 * UV[0, 0] / Z[0] + w1 * UV[1, 0] / Z[1] + w2 * UV[2, 0] / Z[2]) * z
        v = (w0 * UV[0, 1] / Z[0] + w1 * UV[1, 1] / Z[1] + w2 * UV[2, 1] / Z[2]) * z
        yy, xx = ys[inside], xs[inside]
        col, al = shade(u, v, front, xx, yy)
        self._put(xx, yy, z, col, al, ztest)

    def _put(self, xx, yy, z, col, al, ztest=True, add=False):
        keep = al > 0
        if ztest:
            keep &= z < self.z[yy, xx]
        xx, yy, z, col, al = xx[keep], yy[keep], z[keep], col[keep], al[keep]
        if len(xx) == 0:
            return
        # 同じ 層の 中は 奥 → 手前の 順で なくても よい ように、不透明は 上書き・半透明は 上に まぜる
        old = self.rgb[yy, xx]
        olda = self.a[yy, xx]
        na = al + olda * (1 - al)
        mix = (col * al[:, None] + old * (olda * (1 - al))[:, None]) / np.maximum(na, 1e-6)[:, None]
        self.rgb[yy, xx] = mix
        self.a[yy, xx] = na
        self.add[yy, xx] = add
        if ztest:
            self.z[yy, xx] = np.where(al >= 0.99, z, self.z[yy, xx])
        else:
            self.z[yy, xx] = np.minimum(self.z[yy, xx], z)

    # ---------------------------------------------------------- 四角い 点（つぶ）
    def point(self, p, dots, color, alpha=1.0, dither=0):
        """dots = 1 辺の 点の 数（1 点 = 1/16 ブロック）。dither: 0 ぬかない / 1 半分 / 2 4 分の 3 ぬく（画面の 点の 市松）"""
        s, z = self.cam.proj(p)
        if z < 0.1:
            return
        size = max(2, int(round(dots / 16 * self.cam.px_per_block(z))))
        x0 = int(round(s[0] - size / 2))
        y0 = int(round(s[1] - size / 2))
        ys, xs = np.mgrid[y0:y0 + size, x0:x0 + size]
        ok = (xs >= 0) & (ys >= 0) & (xs < self.cam.W) & (ys < self.cam.H)
        xs, ys = xs[ok], ys[ok]
        n = len(xs)
        if n == 0:
            return
        al = np.full(n, alpha, np.float32)
        if dither:
            cell = max(1, int(round(size / dots)))
            q = ((xs - x0) // cell + (ys - y0) // cell)
            if dither == 1:
                al[(q % 2) == 1] = 0
        col = np.tile(np.asarray(color, np.float32), (n, 1))
        self._put(xs, ys, np.full(n, z, np.float32), col, al)

    # ---------------------------------------------------------- カメラに 向く ドット絵
    def sprite(self, p, img, dot_blocks=1 / 16, ztest=True, z_bias=0.0, add=False):
        """img = RGBA の 小さな ドット絵（1 点 = dot_blocks ブロック）。p = 絵の まん中。"""
        s, z = self.cam.proj(p)
        if z < 0.1:
            return
        k = dot_blocks * self.cam.px_per_block(z)
        arr = np.asarray(img.convert("RGBA"), np.float32)
        h, w = arr.shape[:2]
        W2, H2 = max(1, int(round(w * k))), max(1, int(round(h * k)))
        big = np.asarray(img.convert("RGBA").resize((W2, H2), Image.NEAREST), np.float32)
        x0 = int(round(s[0] - W2 / 2))
        y0 = int(round(s[1] - H2 / 2))
        ys, xs = np.mgrid[y0:y0 + H2, x0:x0 + W2]
        ok = (xs >= 0) & (ys >= 0) & (xs < self.cam.W) & (ys < self.cam.H) & (big[..., 3] > 0)
        col = big[..., :3][ok]
        al = big[..., 3][ok] / 255.0
        self._put(xs[ok], ys[ok], np.full(ok.sum(), z - z_bias, np.float32), col, al, ztest, add)


def char_mask(img, cam):
    """キャラ（ピンク・白い 髪・黒い 足・剣）の 形を 色で ぬき出す（体の まわりの 箱の 中だけ）。"""
    a = np.asarray(img.convert("RGB"), np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    pl = cam.player
    pts = []
    for dx in (-0.9, 0.9):
        for dy in (0.0, 2.4):
            for dz in (-0.9, 0.9):
                pts.append(cam.proj(pl + np.array([dx, dy, dz]))[0])
    pts = np.array(pts)
    x0, y0 = np.floor(pts.min(0)).astype(int)
    x1, y1 = np.ceil(pts.max(0)).astype(int)
    m = np.zeros(r.shape, bool)
    sub = (slice(max(y0, 0), y1), slice(max(x0, 0), x1))
    rr, gg, bb = r[sub], g[sub], b[sub]
    pink = (rr > 150) & (gg < 120) & (bb > 60)
    white = (rr > 200) & (gg > 200) & (bb > 200) & (abs(rr - bb) < 40)
    dark = (rr < 60) & (gg < 60) & (bb < 70)
    grassy = (gg > rr + 25) & (gg > bb + 10)
    sky = (bb > 200) & (bb > rr + 40) & (gg > 150)
    m[sub] = (pink | white | dark) & ~grassy & ~sky
    # 1 回 ふくらませて すきまを うめる
    mm = m.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        mm |= np.roll(np.roll(m, dy, 0), dx, 1)
    return mm


def composite(bg_img, layer, cam, char_depth=None, mask=None):
    base = np.asarray(bg_img.convert("RGB"), np.float32)
    a = layer.a.copy()
    if mask is not None and char_depth is not None:
        hide = mask & (layer.z > char_depth)
        a[hide] = 0
    out = base * (1 - a[..., None]) + layer.rgb * a[..., None]
    addm = layer.add & (a > 0)
    out[addm] = np.minimum(255, base[addm] + layer.rgb[addm] * a[addm][:, None])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def bg(shot):
    return Image.open(os.path.join(BG, shot + ".png")).convert("RGB")


def char_depth(cam):
    return cam.view(cam.player + np.array([0, 1.0, 0]))[2]
