"""WEAPON-9: 虹（シャイニングの ドーム・にじの 斬撃・アイコン）の 見本を 作る 道具（3 案で 共通）。

- 部品の 絵（光の 玉・地面の リング・帯の 絵・かけら・斬撃・アイコン）は 各案の build.py が
  Pixel Art Studio（pixelstudio.Sprite）で 1 点ずつ 描く。ここは「ゲームの 中っぽい 3D の 場面」を 組むだけ。
- 場面は 小さな 3D の 絵（numpy の レイ）: 空・草の 地面（y = 0）・うかぶ 子・ドームの 部品。
  ぜんぶを 低い 解像度で 描いてから Nearest で 拡大する（ゲームの ドットと 同じ 見え方）。
- カメラ: たての 画角 75°（ゲームと 同じ）。三人称は 体の 中心を 見る。外 = 12 はなれ・中 = 4 はなれ（今）。
- 光の 部品は 足し算（暗い 色 = すける）。半透明の 点は 使わない。
- 乱数は random.Random(seed) だけ（毎回 同じ 絵）。
"""
import math
import os
import random
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))
sys.path.insert(0, os.path.join(ROOT, "art", "ART-PIPE-1", "common"))

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402
import kit  # noqa: E402  ART-PIPE-1 の シートの 道具（Sheet・font・表の 名前）
from pixelstudio import Sprite, hex2rgba  # noqa: E402,F401

DOCS = os.path.join(ROOT, "docs", "art", "WEAPON-9")
VFOV = 75.0
PW, PH = 640, 400  # 見本の 絵の 大きさ（16:10）
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0

SKY_TOP = np.array([110, 184, 240], float)
SKY_HOR = np.array([186, 226, 250], float)  # ゲームの 空 #8FD3FF の まわり
GRASS = [np.array(c, float) for c in ((96, 156, 70), (88, 146, 64), (104, 164, 76))]
GRASS_DOT = np.array((74, 124, 54), float)
FOG = np.array((178, 220, 246), float)

# シャイニングの 数（仕様 §5.2・§5.3）
R_DOME = 7.0
BODY_C = 0.9  # 体の 中心の 高さ（足から）
RISE = 2.0


def rgb(c):
    return np.array(hex2rgba(c)[:3], float)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- カメラ

class Cam:
    def __init__(self, pos, target, w, h, vfov=VFOV):
        self.pos = np.array(pos, float)
        f = np.array(target, float) - self.pos
        self.fwd = f / np.linalg.norm(f)
        r = np.cross(self.fwd, [0, 1, 0])
        self.right = r / np.linalg.norm(r)
        self.up = np.cross(self.right, self.fwd)
        self.w, self.h = w, h
        self.f = (h / 2) / math.tan(math.radians(vfov / 2))

    def rays(self):
        xs = (np.arange(self.w) + 0.5 - self.w / 2) / self.f
        ys = (np.arange(self.h) + 0.5 - self.h / 2) / self.f
        X, Y = np.meshgrid(xs, ys)
        d = self.fwd[None, None, :] + X[..., None] * self.right[None, None, :] - Y[..., None] * self.up[None, None, :]
        return d / np.linalg.norm(d, axis=2, keepdims=True)

    def project(self, P):
        """P (N,3) → x, y（画面）, z（深さ。前が +）"""
        P = np.atleast_2d(np.array(P, float)) - self.pos
        z = P @ self.fwd
        x = P @ self.right
        y = P @ self.up
        zz = np.where(z > 1e-3, z, np.nan)
        sx = self.w / 2 + x / zz * self.f
        sy = self.h / 2 - y / zz * self.f
        return sx, sy, z


def third_cam(dist, yaw_deg, feet_y, w, h, pitch_deg=15.0):
    """三人称: 体の 中心（足 + 0.9）を 見る。yaw 0 = +z を 向く（うしろから）"""
    tgt = np.array([0.0, feet_y + BODY_C, 0.0])
    yaw, p = math.radians(yaw_deg), math.radians(pitch_deg)
    d = np.array([math.sin(yaw) * math.cos(p), -math.sin(p), math.cos(yaw) * math.cos(p)])
    pos = tgt - d * dist
    pos[1] = max(pos[1], 0.6)
    return Cam(pos, tgt, w, h)


def first_cam(yaw_deg, feet_y, w, h, pitch_deg=14.0):
    yaw, p = math.radians(yaw_deg), math.radians(pitch_deg)
    eye = np.array([0.0, feet_y + 1.6, 0.0])
    d = np.array([math.sin(yaw) * math.cos(p), -math.sin(p), math.cos(yaw) * math.cos(p)])
    return Cam(eye, eye + d, w, h)


# ---------------------------------------------------------------- 1 まいの 場面

class Frame:
    """低い 解像度の 場面。col = 空・地面・子（ふつうの 絵）、add = 光の 部品（足し算）、z = 深さ"""

    def __init__(self, cam, light=0.0, light_tint=(1.0, 0.97, 0.9), light_r=8.0, seed=3):
        self.cam = cam
        H, W = cam.h, cam.w
        d = cam.rays()
        self.d = d
        o = cam.pos
        self.col = np.zeros((H, W, 3))
        self.add = np.zeros((H, W, 3))
        self.z = np.full((H, W), np.inf)
        # 空（6 段の 帯）
        up = np.clip(d[..., 1], 0, 1)
        band = np.floor(np.clip(up / 0.5, 0, 0.999) * 6) / 5
        self.col[:] = SKY_HOR + (SKY_TOP - SKY_HOR) * band[..., None]
        # 地面 y = 0
        gm = d[..., 1] < -1e-4
        t = np.where(gm, -o[1] / np.where(gm, d[..., 1], -1), np.inf)
        P = o[None, None, :] + d * np.where(gm, t, 0.0)[..., None]
        self.ground_t = t
        self.gx, self.gz = np.where(gm, P[..., 0], 1e6), np.where(gm, P[..., 2], 1e6)
        bx, bz = np.floor(self.gx), np.floor(self.gz)
        hsh = (bx * 73856093 + bz * 19349663 + seed * 83492791).astype(np.int64) % 3
        g = np.zeros((H, W, 3))
        for k in range(3):
            g[hsh == k] = GRASS[k]
        sx, sz = np.floor(self.gx * 16), np.floor(self.gz * 16)
        dots = ((sx * 2654435761 + sz * 40503 + 7).astype(np.int64) % 13) == 0
        g[dots] = GRASS_DOT
        # 着地の まわりを 明るく（3 段。色つき）
        if light > 0:
            r = np.hypot(self.gx, self.gz)
            step = np.where(r < light_r / 3, 1.0, np.where(r < light_r * 2 / 3, 0.66, np.where(r < light_r, 0.33, 0)))
            g = g * (1 + light * step[..., None] * np.array(light_tint)[None, None, :])
        # 遠くは 霧
        fog = np.clip((t - 22) / 30, 0, 1)
        fog = np.floor(fog * 4) / 4
        g = g + (FOG - g) * fog[..., None]
        self.col[gm] = g[gm]
        self.z[gm] = t[gm]

    # ---- ふつうの 絵（子）
    def sprite(self, img, center, wb, hb, additive=False, z_bias=0.0):
        """ビルボード（カメラに 正面）。img = PIL RGBA（1 点 = wb / img.width ブロック）"""
        sx, sy, z = self.cam.project([center])
        if not (z[0] > 0.05) or np.isnan(sx[0]):
            return
        s = self.cam.f / z[0]
        pw, ph = max(1, round(wb * s)), max(1, round(hb * s))
        if pw > 4 * self.cam.w:
            return
        im = img.resize((pw, ph), Image.NEAREST)
        a = np.asarray(im, float)
        x0, y0 = int(round(sx[0] - pw / 2)), int(round(sy[0] - ph / 2))
        self._paste(a, x0, y0, z[0] + z_bias, additive)

    def _paste(self, a, x0, y0, depth, additive):
        H, W = self.cam.h, self.cam.w
        ph, pw = a.shape[:2]
        xa, ya = max(0, x0), max(0, y0)
        xb, yb = min(W, x0 + pw), min(H, y0 + ph)
        if xa >= xb or ya >= yb:
            return
        sub = a[ya - y0:yb - y0, xa - x0:xb - x0]
        m = (sub[..., 3] > 0) & (self.z[ya:yb, xa:xb] > depth)
        if additive == "over":
            self.col[ya:yb, xa:xb][m] = sub[..., :3][m]
        elif additive:
            self.add[ya:yb, xa:xb][m] += sub[..., :3][m]
        else:
            self.col[ya:yb, xa:xb][m] = sub[..., :3][m]
            self.z[ya:yb, xa:xb][m] = depth

    # ---- 光の 部品
    def decal(self, img, radius_b, k=1.0, over_colors=()):
        """地面に 寝かせた 絵（上から 見た 絵。まん中 = 原点、半径 radius_b ブロック が 絵の はし）"""
        a = np.asarray(img, float)
        n = a.shape[0]
        u = np.floor((self.gx + radius_b) / (2 * radius_b) * n)
        v = np.floor((radius_b - self.gz) / (2 * radius_b) * n)
        ok = np.isfinite(self.ground_t) & (u >= 0) & (u < n) & (v >= 0) & (v < n) & (self.z >= self.ground_t - 1e-3)
        ui, vi = u[ok].astype(int), v[ok].astype(int)
        px = a[vi, ui]
        m = px[:, 3] > 0
        idx = np.argwhere(ok)[m]
        pc = px[m, :3]
        ovm = np.zeros(len(pc), bool)
        for oc in over_colors:
            ovm |= np.all(pc == np.array(oc), 1)
        self.add[idx[~ovm, 0], idx[~ovm, 1]] += pc[~ovm] * k
        self.col[idx[ovm, 0], idx[ovm, 1]] = pc[ovm]

    def sphere(self, C, R, shade, faces=("front", "back")):
        """球の まく。shade(hit, n, ndv, ilat, ilon, front) → (色 (N,3), mask)。1 点 = 1/8 ブロックの 升目に そろえる"""
        o = self.cam.pos
        d = self.d
        oc = o - np.array(C, float)
        b = (d * oc[None, None, :]).sum(2)
        c = (oc * oc).sum() - R * R
        disc = b * b - c
        hitm = disc > 0
        sq = np.sqrt(np.where(hitm, disc, 0))
        for face in faces:
            t = -b - sq if face == "front" else -b + sq
            m = hitm & (t > 0.05) & (t < self.z)
            if not m.any():
                continue
            P = o[None, None, :] + d * t[..., None]
            P = P[m]
            ok = P[:, 1] >= 0.0
            if not ok.any():
                continue
            Q = (P - np.array(C)) / R
            lat = np.arcsin(np.clip(Q[:, 1], -1, 1))
            lon = np.arctan2(Q[:, 2], Q[:, 0])
            nlon = max(8, round(2 * math.pi * R * 8))
            nlat = max(4, round(math.pi * R * 8))
            ilon = np.floor((lon + math.pi) / (2 * math.pi) * nlon).astype(int)
            ilat = np.floor((lat + math.pi / 2) / math.pi * nlat).astype(int)
            # 升目の まん中の 向き（ドットに そろえる）
            clon = (ilon + 0.5) / nlon * 2 * math.pi - math.pi
            clat = (ilat + 0.5) / nlat * math.pi - math.pi / 2
            n = np.stack([np.cos(clat) * np.cos(clon), np.sin(clat), np.cos(clat) * np.sin(clon)], 1)
            dv = d[m]
            ndv = np.abs((n * dv).sum(1))
            res = shade(P, n, ndv, ilat, ilon, face == "front", nlat, nlon)
            col, cm = res[0], res[1]
            ov = res[2] if len(res) > 2 else np.zeros(len(cm), bool)
            cm = cm & ok
            ia = np.argwhere(m)[cm & ~ov]
            self.add[ia[:, 0], ia[:, 1]] += col[cm & ~ov]
            io = np.argwhere(m)[cm & ov]
            self.col[io[:, 0], io[:, 1]] = col[cm & ov]
            self.add[io[:, 0], io[:, 1]] = 0

    def ribbon(self, pts, width_b, colors, texel=8.0, k=1.0, over=False):
        """カメラに 正面の 帯（線を 太さ width で なぞる）。colors (N,3)。中は max で 重ねる（帯どうしは 足し算）"""
        sx, sy, z = self.cam.project(pts)
        H, W = self.cam.h, self.cam.w
        lay = np.zeros((H, W, 3))
        for i in range(len(pts)):
            if not (z[i] > 0.2) or np.isnan(sx[i]):
                continue
            s = self.cam.f / z[i]
            wb = width_b[i] if hasattr(width_b, "__len__") else width_b
            r = max(0.5, wb * s / 2)
            px = max(1.0, s / texel)  # 1 点の 大きさ（画面の 点）
            # 升目に そろえる（ドット）
            cx, cy = round(sx[i] / px) * px, round(sy[i] / px) * px
            x0, x1 = int(cx - r), int(cx + r) + 1
            y0, y1 = int(cy - r), int(cy + r) + 1
            xa, xb, ya, yb = max(0, x0), min(W, x1), max(0, y0), min(H, y1)
            if xa >= xb or ya >= yb:
                continue
            zm = self.z[ya:yb, xa:xb] > z[i]
            sub = lay[ya:yb, xa:xb]
            sub[zm] = np.maximum(sub[zm], colors[i]) if not over else colors[i]
        if over:
            mm = lay.sum(2) > 0
            self.col[mm] = lay[mm]
            self.add[mm] = 0
        else:
            self.add += lay * k

    def dots(self, pts, colors, size_b=0.25, k=1.0, over=False):
        """光の かけら（四角い 点。THREE.Points と 同じ）"""
        sx, sy, z = self.cam.project(pts)
        H, W = self.cam.h, self.cam.w
        for i in range(len(pts)):
            if not (z[i] > 0.2) or np.isnan(sx[i]):
                continue
            p = max(1, round(size_b * self.cam.f / z[i]))
            x0, y0 = int(sx[i] - p / 2), int(sy[i] - p / 2)
            xa, xb, ya, yb = max(0, x0), min(W, x0 + p), max(0, y0), min(H, y0 + p)
            if xa >= xb or ya >= yb:
                continue
            zm = self.z[ya:yb, xa:xb] > z[i]
            if over:
                self.col[ya:yb, xa:xb][zm] = colors[i]
                self.add[ya:yb, xa:xb][zm] = 0
            else:
                self.add[ya:yb, xa:xb][zm] += colors[i] * k

    def image(self, scale_to=None):
        out = np.clip(self.col + self.add, 0, 255).astype(np.uint8)
        im = Image.fromarray(out, "RGB")
        if scale_to:
            im = im.resize(scale_to, Image.NEAREST)
        return im

    def effect_mask(self):
        if not hasattr(self, "_base"):
            return self.add.sum(2) > 24
        return (self.add.sum(2) > 24) | (np.abs(self.col - self._base).sum(2) > 1)

    def mark_base(self):
        self._base = self.col.copy()


# ---------------------------------------------------------------- 子（うかぶ。両手を 上）

KID_ROWS = [
    "..h........h..",
    "..hs......sh..",
    "..hs......sh..",
    "...hs....sh...",
    "...hhkkkkhh...",
    "....kkkkkk....",
    "...kkffffkk...",
    "...kfeffefk...",
    "...kffffffk...",
    "....ffccff....",
    "....hhhhhh....",
    "...hhhhhhhh...",
    "...hhwhhwhh...",
    "...hhhhhhhh...",
    "...hhhhhhhh...",
    "....hhhhhh....",
    "....pp..pp....",
    "....pp..pp....",
    "....pp..pp....",
    "....pp..pp....",
    "....bb..bb....",
]
KID_PAL = {"h": (232, 112, 160), "s": (250, 214, 180), "k": (70, 50, 60), "f": (250, 214, 180), "e": (40, 30, 40),
           "c": (236, 150, 150), "w": (250, 236, 244), "p": (60, 70, 110), "b": (40, 44, 70)}


def kid_img():
    w, h = len(KID_ROWS[0]), len(KID_ROWS)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(KID_ROWS):
        for x, ch in enumerate(row):
            if ch in KID_PAL:
                im.putpixel((x, y), KID_PAL[ch] + (255,))
    return im


KID = None


def put_kid(fr, feet_y):
    global KID
    if KID is None:
        KID = kid_img()
    hb = 1.8
    wb = hb * KID.width / KID.height
    fr.sprite(KID, (0, feet_y + hb / 2, 0), wb, hb)


# ---------------------------------------------------------------- シャイニングの 形（時間 → 半径・高さ）

def shining_state(step):
    """§5.2: うかぶ 1〜40・とどまる 41〜200・おりる 201〜240。step 0 = ための おわり"""
    if step <= 0:
        return dict(feet=0.0, r=0.0, k=0.0)
    if step <= 40:
        e = ease(step / 40)
        return dict(feet=RISE * e, r=R_DOME * e, k=e)
    if step <= 200:
        return dict(feet=RISE, r=R_DOME, k=1.0)
    if step <= 240:
        e = ease((240 - step) / 40)
        return dict(feet=RISE * e, r=R_DOME * e, k=e)
    return dict(feet=0.0, r=0.0, k=0.0)


def ground_ring_radius(r, feet):
    yc = feet + BODY_C
    return math.sqrt(max(0.0, r * r - yc * yc))


# ---------------------------------------------------------------- 描く 手つだい（Sprite）

def stamp_disc(s, cx, cy, r, color, only=None):
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                s.px(x, y, color, only=only)


def ring_band(s, cx, cy, r_in, r_out, color, dither_out=0.0, seed=0, only=None):
    """輪（r_in〜r_out べた）。dither_out > 0 なら 外がわへ 網で うすく"""
    bay = BAYER
    for y in range(int(cy - r_out - dither_out) - 1, int(cy + r_out + dither_out) + 2):
        for x in range(int(cx - r_out - dither_out) - 1, int(cx + r_out + dither_out) + 2):
            if not (0 <= x < s.w and 0 <= y < s.h):
                continue
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if r_in <= d <= r_out:
                s.px(x, y, color, only=only)
            elif dither_out > 0 and r_out < d <= r_out + dither_out:
                t = (d - r_out) / dither_out
                if bay[y % 4][x % 4] >= t:
                    s.px(x, y, color, only=only)
            elif dither_out > 0 and r_in - dither_out <= d < r_in:
                t = (r_in - d) / dither_out
                if bay[y % 4][x % 4] >= t:
                    s.px(x, y, color, only=only)


def sprite_img(s, frame=1):
    return s.composite(frame).convert("RGBA") if hasattr(s.composite(frame), "convert") else s.composite(frame)


# ---------------------------------------------------------------- 確かめの 絵

def silhouette_from(fr, size):
    m = fr.effect_mask()
    out = np.where(m[..., None], np.array([20, 22, 30]), np.array([232, 228, 218])).astype(np.uint8)
    return Image.fromarray(out, "RGB").resize(size, Image.NEAREST)


def gray(im):
    return im.convert("L").convert("RGB")


def blur(im, r=4):
    return im.convert("RGB").filter(ImageFilter.GaussianBlur(r))


def iso_extrude(icon, cell=6, depth=2):
    """アイコンの 点を 少し 厚みの ある 立体に（手に 持つ 絵の 方向。今の 刀と 同じ 押し出し）"""
    w, h = icon.size
    W = w * cell + h * cell // 2 + depth * cell + 8
    H = h * cell + depth * cell + 8
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    px = icon.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] == 0:
                continue
            X = 4 + x * cell + depth * cell
            Y = 4 + y * cell
            side = tuple(int(v * 0.55) for v in c[:3])
            for k in range(depth, 0, -1):
                d.rectangle([X - k * cell // 2, Y + k * cell // 2, X - k * cell // 2 + cell - 1, Y + k * cell // 2 + cell - 1], fill=side)
            d.rectangle([X, Y, X + cell - 1, Y + cell - 1], fill=c[:3])
    return out


def slot(icon, bg_hex="#9A2E4A", scale=4, frame="rainbow"):
    """もちものの マス（武器の 背景 ＋ レジェンダリーの にじの ふち）に のせる"""
    n = 16 * scale + 12
    im = Image.new("RGB", (n, n), (30, 30, 40))
    d = ImageDraw.Draw(im)
    cols = [(110, 231, 160), (90, 180, 255), (224, 124, 240), (255, 226, 120)]
    for i in range(n):
        for j in range(n):
            if i < 3 or j < 3 or i >= n - 3 or j >= n - 3:
                k = ((i + j) // 10) % len(cols) if frame == "rainbow" else 0
                im.putpixel((i, j), cols[k])
    d.rectangle([3, 3, n - 4, n - 4], fill=tuple(int(bg_hex[k:k + 2], 16) for k in (1, 3, 5)))
    big = icon.resize((16 * scale, 16 * scale), Image.NEAREST)
    im.paste(big, (6, 6), big)
    return im


def icon_from_rows(rows, pal):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in pal:
                im.putpixel((x, y), tuple(int(pal[ch][k:k + 2], 16) for k in (1, 3, 5)) + (255,))
    return im


def current_icons():
    """今の 雷神剣・風神剣の アイコン（src/ui/itemArtW7.ts の 行を 読む）"""
    src = open(os.path.join(ROOT, "src", "ui", "itemArtW7.ts"), encoding="utf-8").read()
    import re
    out = []
    for pal_name, rows_name in (("PAL", "RAIJIN_KEN"), ("PAL_FUJIN", "FUJIN_KEN")):
        pm = re.search(r"const " + pal_name + r" = \{([^}]*)\}", src).group(1)
        pal = {k: "#%06X" % int(v, 16) for k, v in re.findall(r"(\w): 0x([0-9a-fA-F]{6})", pm)}
        rm = re.search(r"const " + rows_name + r" = \[([^\]]*)\]", src).group(1)
        rows = re.findall(r"'([^']*)'", rm)
        out.append(icon_from_rows(rows, pal))
    return out


def thunder_b_key():
    p = os.path.join(ROOT, "art", "ART-PIPE-1", "thunder-b", "key_scene.png")
    return Image.open(p).convert("RGB")


def count_colors(imgs):
    cs = set()
    for im in imgs:
        a = np.asarray(im.convert("RGBA"))
        for c in a.reshape(-1, 4):
            if c[3] > 0:
                cs.add(tuple(c[:3]))
    return len(cs)


def semi_alpha(imgs):
    n = 0
    for im in imgs:
        a = np.asarray(im.convert("RGBA"))[..., 3]
        n += int(((a > 0) & (a < 255)).sum())
    return n
