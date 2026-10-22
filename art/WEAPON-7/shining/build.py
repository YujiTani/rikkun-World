"""WEAPON-7 PR3 シャイニング（虹の ためわざ）の ドーム: 板（テクスチャ）と 想像図。

3D の 組み立ては developer。ここでは テクスチャ 5 枚（＋ にじ色の ひも 1 枚）と 置き方の 表（spec.md）、場面に 置いた 想像図（preview.png）。
- shining_core.png   32×32  まん中の 白い 光（カメラへ 向く 板・半径 1.5）
- shining_dome.png   64×64  ドームの まく ＋ ふちの 光（カメラへ 向く 板・半径 7）
- shining_ring.png   64×64  地面の 光る わ（上から 見た 絵）
- shining_band.png   64×64  にじの 帯の 形（グレー。形だけ）。にじの 色は shining_rainbow.png（1×64）
- shining_spark.png   8×8   光の かけら（白。色は インスタンスごとに かえる）
色: 白〜うす水色 3（W1 #F4FCFF・W2 #CDEFFC・B1 #8FD6F2）＋ にじ 5（赤 黄 みどり 青 むらさき。アイコンと 同じ）。
すける 板: 半透明は 4 だんだけ（alpha 48・96・160・230）。あみ（ディザ）で つなぐ。
実行: python3 art/WEAPON-7/shining/build.py
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))
from pixelstudio import Sprite  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

W1, W2, B1 = "#F4FCFF", "#CDEFFC", "#8FD6F2"
RAINBOW = ["#FF8C94", "#FFE585", "#86EBA8", "#82C6FF", "#C79CFF"]
A = [0, 48, 96, 160, 230]  # すける 4 だん（0 = なし）
LEVEL_COL = [None, B1, B1, W2, W1]
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def bayer(x, y):
    return (BAYER[y % 4][x % 4] + 0.5) / 16.0


def level_px(s, x, y, L):
    """L（0〜4 の 連続 値）を あみで 4 だんに して 打つ"""
    lo = int(math.floor(L))
    lv = lo + (1 if (L - lo) > bayer(x, y) else 0)
    lv = max(0, min(4, lv))
    if lv == 0:
        return
    s.px(x, y, LEVEL_COL[lv] + "%02X" % A[lv])


def ramp(v, v0, v1, l0, l1):
    t = max(0.0, min(1.0, (v - v0) / (v1 - v0)))
    return l0 + (l1 - l0) * t


# ---------------------------------------------------------------- 1. まん中の 白い 光 32×32
def build_core():
    s = Sprite(32, 32)
    for y in range(32):
        for x in range(32):
            r = math.hypot(x + 0.5 - 16, y + 0.5 - 16)
            if r >= 16:
                continue
            # まん中 = level 3.6（alpha 160〜230 の あいだ）→ 外へ 0。白で ぬりつぶさない（体が 見える）
            L = 3.4 * (1 - (r / 16.0)) ** 1.3 + 0.0
            if r < 4.5:
                L = 3.6  # まん中の 白（alpha 160 と 230 の あみ）
            level_px(s, x, y, L)
    return s


# ---------------------------------------------------------------- 2. ドームの まく 64×64
def build_dome():
    s = Sprite(64, 64)
    for y in range(64):
        for x in range(64):
            dx, dy = x + 0.5 - 32, y + 0.5 - 32
            r = math.hypot(dx, dy)
            if r >= 32:
                continue
            ang = math.atan2(dy, dx)
            sheen = max(0.0, math.cos(ang - math.radians(225))) * 0.7  # 左上の 光
            if r < 22:
                L = 0.10  # ほとんど すける（まばらな あみ）
            elif r < 26:
                L = ramp(r, 22, 26, 0.10, 1.6)
            elif r < 28:
                L = 2.0
            elif r < 30:
                L = 3.0
            else:
                L = 4.0
            if r >= 22:
                L = min(4.0, L + sheen * ramp(r, 24, 30, 0.2, 1.0))
            level_px(s, x, y, L)
    return s


# ---------------------------------------------------------------- 3. 地面の 光る わ 64×64
def build_ring():
    s = Sprite(64, 64)
    for y in range(64):
        for x in range(64):
            dx, dy = x + 0.5 - 32, y + 0.5 - 32
            r = math.hypot(dx, dy)
            if r >= 32:
                continue
            ang = (math.degrees(math.atan2(dy, dx)) + 360) % 360
            if r >= 29.5:
                L = 4.0
            elif r >= 27:
                L = 3.0
            elif r >= 23:
                L = ramp(r, 23, 27, 0.0, 2.2)
            else:
                L = 0.0
            # 内がわの ちいさな めもり（16 こ・1 ぼん 3 てん）
            k = (ang % 22.5)
            if 17 <= r < 24 and (k < 2.4 or k > 20.1):
                L = max(L, 2.0)
            level_px(s, x, y, L)
    return s


# ---------------------------------------------------------------- 4. にじの 帯の 形 64×64（グレー・ふちは あみ ふう の 3 だん）
GRAY = {"core": "#EBEBEB", "edge": "#969696", "none": "#000000"}


def band_cov(x, y):
    d4 = (4 * x - 3 * y) % 64  # 4 ぽん・ななめ（よこ 1 ぽんが 16 てん）
    if 4 <= d4 < 16:
        return "core"
    if d4 < 4 or 16 <= d4 < 20:
        return "edge"
    return "none"


def build_band():
    s = Sprite(64, 64)
    for y in range(64):
        for x in range(64):
            s.px(x, y, GRAY[band_cov(x, y)])
    return s


def build_rainbow():
    s = Sprite(1, 64)
    cuts = [0, 13, 26, 38, 51, 64]  # 赤 黄 みどり 青 むらさき（13・13・12・13・13 てん）
    for i, c in enumerate(RAINBOW):
        for y in range(cuts[i], cuts[i + 1]):
            s.px(0, y, c)
    return s


# ---------------------------------------------------------------- 5. 光の かけら 8×8
SPARK = [
    "...bb...",
    "...WW...",
    "...WW...",
    "bWWWWWWb",
    "bWWWWWWb",
    "...WW...",
    "...WW...",
    "...bb...",
]


def build_spark():
    s = Sprite(8, 8)
    for y, row in enumerate(SPARK):
        for x, ch in enumerate(row):
            if ch == "W":
                s.px(x, y, W1 if (3 <= x <= 4 and 3 <= y <= 4) else W2)
            elif ch == "b":
                s.px(x, y, B1)
    return s


# ---------------------------------------------------------------- 想像図（場面に 置く）
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"


def font(n):
    return ImageFont.truetype(FONT, n)


def rgba_arr(png):
    return np.asarray(Image.open(png).convert("RGBA"), dtype=np.float32)


class Tex:
    def __init__(self, path):
        self.a = rgba_arr(path)
        self.h, self.w = self.a.shape[:2]


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


THETA_LEN = 2.0  # ドームの 帯の ぼうし（球の 上から 2.0 ラジアン = 115 度）
CY = 2.9  # 体の 中心の 高さ（とどまる とき）
R = 7.0


def add_layer(out, rgb, cov):
    """足し算の 光（あみの すける 板）"""
    out += rgb * cov[..., None]


def scene(elev_deg, W=520, H=380, ppb=20.0, t=0.0, ring_r=6.4):
    E = math.radians(elev_deg)
    d = np.array([0, -math.sin(E), -math.cos(E)])
    right = np.array([1.0, 0, 0])
    up = np.array([0, math.cos(E), -math.sin(E)])
    # 画面の 原点 = 地面の まん中（原点）を 画面の した 3 ぶんの 1 に
    ox, oy = W / 2, H * 0.80 if elev_deg < 10 else H * 0.70
    xs, ys = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    sx = (xs - ox) / ppb
    sy = (oy - ys) / ppb
    O = sx[..., None] * right + sy[..., None] * up - d * 60  # 画面の 点 → 光線の 始まり
    out = np.zeros((H, W, 3), dtype=np.float32)
    # 空
    gy = ys / H
    out[:] = (np.array([16, 20, 40])[None, None, :] * (1 - gy[..., None]) + np.array([40, 52, 92])[None, None, :] * gy[..., None])
    # 地面（y = 0）
    with np.errstate(divide="ignore", invalid="ignore"):
        tg = -O[..., 1] / d[1] if abs(d[1]) > 1e-6 else np.full((H, W), np.inf)
    ground = (tg > 0) if abs(d[1]) > 1e-6 else np.zeros((H, W), bool)
    if ground.any():
        gx = O[..., 0] + tg * d[0]
        gz = O[..., 2] + tg * d[2]
        chk = ((np.floor(gx) + np.floor(gz)) % 2) == 0
        col = np.where(chk[..., None], np.array([52, 94, 62]), np.array([60, 108, 70])).astype(np.float32)
        out = np.where(ground[..., None], col, out)
    else:  # よこ から: 地面は 線の した
        gl = oy
        gmask = ys > gl
        chk = ((np.floor((xs - ox) / ppb)) % 2) == 0
        col = np.where(chk[..., None], np.array([52, 94, 62]), np.array([60, 108, 70])).astype(np.float32)
        out = np.where(gmask[..., None], col, out)
        gx = gz = None
    # 地面の わ
    if ground.any():
        ring = Tex(os.path.join(HERE, "shining_ring.png"))
        u = (gx / (2 * ring_r) + 0.5)
        v = (gz / (2 * ring_r) + 0.5)
        inside = ground & (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
        ix = np.clip((u * ring.w).astype(int), 0, ring.w - 1)
        iy = np.clip((v * ring.h).astype(int), 0, ring.h - 1)
        px = ring.a[iy, ix]
        cov = np.where(inside, px[..., 3] / 255.0, 0)
        add_layer(out, px[..., :3], cov)
    else:
        # よこ から: 地面の わは 細い 線（わの 半径 = ring_r）
        ring_col = hexrgb(W2)
        for xx in range(int(ox - ring_r * ppb), int(ox + ring_r * ppb)):
            if 0 <= xx < W:
                out[int(oy) : int(oy) + 2, xx] += ring_col * 0.5
        for xx in (int(ox - ring_r * ppb), int(ox + ring_r * ppb) - 3):
            out[int(oy) - 6 : int(oy) + 3, xx : xx + 3] += hexrgb(W1) * 0.6
    # 画面の 点への 変換
    def proj(P):
        return ox + np.dot(P, right) * ppb, oy - np.dot(P, up) * ppb

    C = np.array([0, CY, 0.0])
    cx, cy = proj(C)
    # プレイヤー（ぎりぎり 地面から 2 うかぶ。高さ 1.8・はば 0.6）
    fx, fy = proj(np.array([0, 2.0, 0.0]))
    pw, ph = 0.6 * ppb, 1.8 * ppb
    # 影（地面に まるい かげ）
    sxp, syp = proj(np.array([0, 0.0, 0.0]))
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    d_ = ImageDraw.Draw(im)
    sh_h = max(2, ppb * 0.35 * (math.sin(E) + 0.2))
    d_.ellipse([sxp - 0.5 * ppb, syp - sh_h / 2, sxp + 0.5 * ppb, syp + sh_h / 2], fill=(30, 56, 40))
    d_.rectangle([fx - pw / 2, fy - ph * 0.55, fx + pw / 2, fy], fill=(64, 110, 196))  # からだ
    d_.rectangle([fx - pw / 2 + 2, fy - ph, fx + pw / 2 - 2, fy - ph * 0.55 + 1], fill=(236, 190, 150))  # あたま
    out = np.asarray(im, dtype=np.float32).copy()
    # 白い 光（カメラへ 向く）
    core, dome = Tex(os.path.join(HERE, "shining_core.png")), Tex(os.path.join(HERE, "shining_dome.png"))

    def billboard(tex, radius):
        n = int(round(2 * radius * ppb))
        img = Image.fromarray(tex.a.astype(np.uint8)).resize((n, n), Image.NEAREST)
        a = np.asarray(img, dtype=np.float32)
        x0, y0 = int(round(cx - n / 2)), int(round(cy - n / 2))
        xa, ya = max(0, x0), max(0, y0)
        xb, yb = min(W, x0 + n), min(H, y0 + n)
        sub = a[ya - y0 : yb - y0, xa - x0 : xb - x0]
        out[ya:yb, xa:xb] += sub[..., :3] * (sub[..., 3:4] / 255.0)

    billboard(dome, R)
    # 球の 帯（前がわ の ぼうし）
    band = Tex(os.path.join(HERE, "shining_band.png"))
    rb = Tex(os.path.join(HERE, "shining_rainbow.png"))
    oc = O - C
    b = (oc * d).sum(-1)
    c_ = (oc * oc).sum(-1) - R * R
    disc = b * b - c_
    hit = disc > 0
    sq = np.sqrt(np.where(hit, disc, 0))
    for sign in (+1, -1):  # -1 = 手前（前）, +1 = おく（うしろ・うすく）
        tt = -b + sign * sq
        P = O + tt[..., None] * d - C
        theta = np.arccos(np.clip(P[..., 1] / R, -1, 1))
        m = hit & (theta <= THETA_LEN)
        u = (np.arctan2(P[..., 2], P[..., 0]) / (2 * math.pi) + 0.5 + t * 0.2) % 1.0
        v = theta / THETA_LEN
        ix = np.clip((u * 64).astype(int), 0, 63)
        iy = np.clip((v * 64).astype(int), 0, 63)
        cov = band.a[iy, ix][..., 0] / 255.0
        col = rb.a[(iy + int(t * 64)) % 64, 0][..., :3]
        k = 0.85 if sign == -1 else 0.35
        add_layer(out, col, np.where(m, cov * k, 0))
    billboard(core, 1.5)
    # かけら 24 こ（球の 中の ばしょ）
    rng = np.random.default_rng(7)
    sp = Tex(os.path.join(HERE, "shining_spark.png"))
    for i in range(24):
        while True:
            p = rng.uniform(-1, 1, 3)
            if (p ** 2).sum() <= 1:
                break
        P = C + p * (R * 0.9)
        if P[1] < 0.3:
            continue
        px_, py_ = proj(P)
        col = hexrgb(RAINBOW[i % 5]) * 0.4 + hexrgb(W1) * 0.6
        sz = 8 if (i % 3 == 0) else 4  # 8×8 の 絵を 1 倍 か 半分
        img = Image.fromarray(sp.a.astype(np.uint8)).resize((sz, sz), Image.NEAREST)
        a = np.asarray(img, dtype=np.float32)
        x0, y0 = int(px_ - sz / 2), int(py_ - sz / 2)
        if 0 <= x0 < W - sz and 0 <= y0 < H - sz:
            out[y0 : y0 + sz, x0 : x0 + sz] += (a[..., :3] * 0.5 + col * 0.5) * (a[..., 3:4] / 255.0) * 0.85
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def make_preview():
    a = scene(0, t=0.0)
    b = scene(38, t=0.0)
    out = Image.new("RGB", (a.width + b.width + 30, a.height + 70), (22, 25, 38))
    out.paste(a, (10, 50))
    out.paste(b, (a.width + 20, 50))
    d = ImageDraw.Draw(out)
    d.text((12, 8), "シャイニング 想像図（プレイヤー 1.8 ブロック・ドーム 半径 7・わの 半径 6.4。体の 中心は 地面から 2.9）", font=font(16), fill=(255, 226, 150))
    d.text((12, 30), "左: よこから　右: ななめ上（38 度）から。足し算の 光。かけら 24 こ・帯 4 ぽん。", font=font(13), fill=(170, 176, 196))
    out.save(os.path.join(HERE, "preview.png"))


def make_sheet():
    """テクスチャの 見本シート（1 倍の 4 ばい・足し算を 暗い 地に 置いた もの）"""
    names = ["shining_core", "shining_dome", "shining_ring", "shining_band", "shining_rainbow", "shining_spark"]
    K = 4
    sh = Image.new("RGB", (64 * K * 3 + 60, 64 * K * 2 + 90), (22, 25, 38))
    d = ImageDraw.Draw(sh)
    x, y = 12, 28
    for i, n in enumerate(names):
        im = Image.open(os.path.join(HERE, n + ".png")).convert("RGBA")
        bg = Image.new("RGBA", im.size, (28, 34, 70, 255))
        bg.alpha_composite(im)
        big = bg.resize((im.width * (K if im.width > 8 else 16), im.height * (K if im.width > 8 else 16)), Image.NEAREST)
        if n == "shining_rainbow":
            big = bg.resize((16, 64 * K), Image.NEAREST)
        px = 12 + (i % 3) * (64 * K + 18)
        py = 28 + (i // 3) * (64 * K + 40)
        d.text((px, py - 18), n, font=font(13), fill=(236, 232, 220))
        sh.paste(big.convert("RGB"), (px, py))
    sh.save(os.path.join(HERE, "sheet.png"))


def make_atlas():
    """core + dome を 1 まいに（カメラへ 向く 2 まいの 板を 1 描画に する。96×64: dome = x 0〜63・y 0〜63、core = x 64〜95・y 0〜31）"""
    at = Image.new("RGBA", (96, 64), (0, 0, 0, 0))
    at.paste(Image.open(os.path.join(HERE, "shining_dome.png")).convert("RGBA"), (0, 0))
    at.paste(Image.open(os.path.join(HERE, "shining_core.png")).convert("RGBA"), (64, 0))
    at.save(os.path.join(HERE, "shining_cd_atlas.png"))


def semi_levels(path):
    im = Image.open(path).convert("RGBA")
    return sorted({p[3] for p in im.getdata() if 0 < p[3] < 255})


def main():
    jobs = [
        ("shining_core.png", build_core()),
        ("shining_dome.png", build_dome()),
        ("shining_ring.png", build_ring()),
        ("shining_band.png", build_band()),
        ("shining_rainbow.png", build_rainbow()),
        ("shining_spark.png", build_spark()),
    ]
    for n, s in jobs:
        p = os.path.join(HERE, n)
        s.save_png(p)
        info = s.stats(print_=False)
        print(n, "%dx%d" % (s.w, s.h), "colors", info["colors_used"], "alpha steps", semi_levels(p))
    make_atlas()
    make_sheet()
    make_preview()


if __name__ == "__main__":
    main()
