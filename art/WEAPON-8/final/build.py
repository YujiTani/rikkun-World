"""WEAPON-8 (#239) 仕上げ: ゲームに 入れる 素材を 作る。

python3 art/WEAPON-8/final/build.py
  → public/models/fx/fujin_spiral_ribbon.png ・ fujin_spiral_ribbon.json   B「らせんの おび」（リボンの 帯の 絵 ＋ 形の 数の 表）
  → public/models/fx/charge_light.png ・ charge_light.json                 T1「すいこまれる 光」（白黒の 1 まい ＋ 5 色の 表）
  → public/models/fx/buff_speed.png                                          I1「はやい くつ」16×16
  → docs/art/WEAPON-8/final/*.png                                            見本シート（素材 PNG ＋ JSON の 数 だけで 描く）
見本シートは「できあがった PNG と JSON」を 読んで 3D を 組み直して 描く（案の 元の 点描きでは ない）。
乱数は 使わない（毎回 同じ 絵）。
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
sys.path.insert(0, os.path.join(HERE, "..", "buff-icon"))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

import w8kit as K  # noqa: E402
from w8kit import C, Sheet, add, mul, sub, dot, norm, cross, up, render  # noqa: E402
from icons import ICONS, icon, PAL as ICON_PAL  # noqa: E402
import models as M  # noqa: E402
import charge as CH  # noqa: E402

FX = os.path.join(K.ROOT, "public", "models", "fx")
OUT = os.path.join(K.ROOT, "docs", "art", "WEAPON-8", "final")
SHOT = os.path.join(K.ROOT, "ui-gate-report", "hud-1280x800.png")
os.makedirs(OUT, exist_ok=True)

# ====================================================================== B らせんの おび

SEG = 24            # 1 本の リボンの 区切り（2 本 × 24 × 2 三角 ＋ 先の 光 2 = 98）
LEN = 2.8           # 軸の 長さ（ブロック）
RM = 0.72           # らせんの 半径
TURN = 1.5          # 軸 1.5 ブロックで 1 回り
OM = 2 * math.pi / TURN
TILT = 0.4          # 帯の うしろがわの ふちを 半径の 40% 内がわへ（円すいの はね）
WIDTH_DOTS = 9      # 帯の はば（点）= ふち 1 + ふち 1 + からだ 5 + ふち 1 + ふち 1
BAND_H = WIDTH_DOTS
TEX_W, TEX_H = 128, 32
BAND_FRONT, BAND_BACK, BAND_FRONT_KEY = 0, 9, 18  # 帯の 上から 数えた 行
TIP_SMALL = (0, 27, 3, 3)   # 先の 光（ふつう）x, y, w, h
TIP_BIG = (4, 27, 5, 5)     # 先の 光（決めの コマ）
PX = 1 / 16
WID = (WIDTH_DOTS - 2) * PX  # 帯の はば（ブロック）。ふち の 外がわ 1 点ずつは 0.5625 の 中に 入る


def ribbon_geometry():
    """s = 1 の 形。頭が 原点・進む 向き +x・うしろ -x。リボン 1 本の 頂点 = 区切り 25 × はば 2。"""
    rings = []
    for i in range(SEG + 1):
        sd = LEN * i / SEG
        nose = min(1.0, sd / 0.9) ** 0.8
        r = RM * nose * (1 - 0.3 * sd / LEN)
        a = sd * OM
        rings.append((sd, nose, r, a))
    return rings


def _path_total():
    pts = []
    for sd, nose, r, a in ribbon_geometry():
        pts.append((-sd, math.cos(a) * r, math.sin(a) * r))
    return sum(math.dist(pts[i - 1], pts[i]) for i in range(1, len(pts)))


USED = int(round(_path_total() * 16))  # 帯の つかう よこの 点（1 点 = 1/16 ブロックに ちょうど そろえる）


def ribbon_mesh():
    """頂点: [x, y, z, u(点), v(点)]・三角形の 並び。strand 1 は 半回り ずらす。"""
    rings = ribbon_geometry()
    verts, tris = [], []
    path = [0.0]
    for strand in (0, 1):
        base = len(verts)
        pts = []
        for i, (sd, nose, r, a) in enumerate(rings):
            a2 = a + strand * math.pi
            for j, wv in enumerate((-0.5, 0.5)):
                rj = r * (1 - TILT * j)  # うしろがわの ふちは 半径が 小さい（ドリルの はね。うしろから 見ても 帯が 見える）
                pts.append((-(sd + wv * WID_FULL * nose), math.cos(a2) * rj, math.sin(a2) * rj))
        # 帯の 道のり（点）= 中心の 3D の 長さ。テクスチャの よこ 128 点 = 道のり 全部
        if strand == 0:
            path = [0.0]
            for i in range(1, SEG + 1):
                a_, b_ = pts[2 * (i - 1)], pts[2 * i]
                path.append(path[-1] + math.dist(a_, b_))
            total = path[-1]
        for i in range(SEG + 1):
            u = path[i] / total * USED
            for j in range(2):
                x, y, z = pts[2 * i + j]
                verts.append([round(x, 4), round(y, 4), round(z, 4), round(u, 3), j * BAND_H])
        for i in range(SEG):
            a0, b0, a1, b1 = base + 2 * i, base + 2 * i + 1, base + 2 * i + 2, base + 2 * i + 3
            for tri in ((a0, a1, b0), (b0, a1, b1)):
                n = cross(sub(verts[tri[1]][:3], verts[tri[0]][:3]), sub(verts[tri[2]][:3], verts[tri[0]][:3]))
                c = [sum(verts[t][k] for t in tri) / 3 for k in (1, 2)]
                if dot(n, (0, c[0], c[1])) < 0:  # 外がわ（軸から 遠い 向き）が 表（CCW）に なる ように
                    tri = (tri[0], tri[2], tri[1])
                tris.append(list(tri))
    return verts, tris, total / USED * 16  # 1 点が 何 ブロックか × 16（1 ならば ちょうど 1/16）


WID_FULL = WIDTH_DOTS * PX  # 帯の はば 全部（ふち まで）


def ribbon_texture():
    im = Image.new("RGBA", (TEX_W, TEX_H), (0, 0, 0, 0))
    px = im.load()
    for band, kind, key in ((BAND_FRONT, "front", False), (BAND_BACK, "back", False), (BAND_FRONT_KEY, "front", True)):
        for c in range(USED):
            u = (c + 0.5) / USED
            nb = int(max(0.0, (u - 0.72) / 0.28) * 3 + 0.001)  # しっぽは 網で ぬく（4 段のうち 0〜3）
            for r in range(BAND_H):
                if (c + r) % 4 < nb:
                    continue
                if r in (0, BAND_H - 1):
                    col = C["B3"]
                elif r in (1, BAND_H - 2):
                    col = C["B1"] if kind == "front" else C["B2"]
                elif kind == "front":
                    col = C["W1"] if u < (0.45 if key else 0.15) else C["W2"]
                else:
                    col = C["B1"]
                px[c, band + r] = col + (255,)
    # 先の 光（小さな プラス）
    for (x0, y0, w, h), big in ((TIP_SMALL, False), (TIP_BIG, True)):
        cx, cy = x0 + w // 2, y0 + h // 2
        for dy in range(-(h // 2), h // 2 + 1):
            for dx in range(-(w // 2), w // 2 + 1):
                if dx == 0 and dy == 0:
                    px[cx, cy] = C["W1"] + (255,)
                elif dx == 0 or dy == 0:
                    px[cx + dx, cy + dy] = C["W2"] + (255,)
                elif big and abs(dx) == 1 and abs(dy) == 1:
                    px[cx + dx, cy + dy] = C["W1"] + (255,)
    return im


# ---------------------------------------------------------------- 3D を 組んで 描く（素材 PNG と JSON だけ）

class Mesh:
    def __init__(self, verts, tris, tex):
        self.v = np.array(verts, dtype=np.float64)
        self.t = np.array(tris)
        self.tex = np.array(tex)  # H, W, 4


def transform(mesh, s, phi, fade, H):
    """頭 H・大きさ s・回り phi・ほどける fade。半径だけ 1 + 0.5 fade 倍。"""
    p = mesh.v[:, :3] * s
    ys, zs = p[:, 1] * (1 + 0.5 * fade), p[:, 2] * (1 + 0.5 * fade)
    c, sn = math.cos(phi), math.sin(phi)
    y2, z2 = ys * c - zs * sn, ys * sn + zs * c
    return np.stack([p[:, 0] + H[0], y2 + H[1], z2 + H[2]], axis=1)


def raster(mesh, P, cam, key, fade, W, Hh, zbuf, img):
    """三角形を ぬる。Nearest・表と 裏で 帯を えらぶ・網（ほどける）でぬく。"""
    camp = np.array(cam.pos)
    nfade = int(fade * 3 + 0.001)
    for tri in mesh.t:
        pr = [cam.proj(tuple(P[i])) for i in tri]
        if any(p is None for p in pr):
            continue
        a = P[tri[1]] - P[tri[0]]
        b = P[tri[2]] - P[tri[0]]
        n = np.cross(a, b)
        front = np.dot(n, camp - P[tri[0]]) > 0
        xs = [p[0] for p in pr]
        ys = [p[1] for p in pr]
        x0, x1 = max(0, int(math.floor(min(xs)))), min(W - 1, int(math.ceil(max(xs))))
        y0, y1 = max(0, int(math.floor(min(ys)))), min(Hh - 1, int(math.ceil(max(ys))))
        if x1 < x0 or y1 < y0:
            continue
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = pr
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        l1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
        l2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not inside.any():
            continue
        iz = l1 / az + l2 / bz + l3 / cz
        z = 1 / iz
        u = (l1 * mesh.v[tri[0], 3] / az + l2 * mesh.v[tri[1], 3] / bz + l3 * mesh.v[tri[2], 3] / cz) * z
        v = (l1 * mesh.v[tri[0], 4] / az + l2 * mesh.v[tri[1], 4] / bz + l3 * mesh.v[tri[2], 4] / cz) * z
        row = np.clip(np.floor(v).astype(int), 0, BAND_H - 1)
        col = np.clip(np.floor(u).astype(int), 0, TEX_W - 1)
        band = BAND_BACK if not front else (BAND_FRONT_KEY if key else BAND_FRONT)
        texel = mesh.tex[band + row, col]
        ok = inside & (texel[..., 3] > 0) & (z < zbuf[y0:y1 + 1, x0:x1 + 1])
        if nfade:
            ok &= ((col + row) % 4) >= nfade
        sub_z = zbuf[y0:y1 + 1, x0:x1 + 1]
        sub_i = img[y0:y1 + 1, x0:x1 + 1]
        sub_z[ok] = z[ok]
        sub_i[ok] = texel[ok]


def draw_ribbon(mesh, tip_imgs, e, step, H, cam, W, Hh):
    st = M.state(e, step)
    P = transform(mesh, st["s"], st["phi"], st["fade"], H)
    zbuf = np.full((Hh, W), 1e9)
    img = np.zeros((Hh, W, 4), dtype=np.uint8)
    raster(mesh, P, cam, st["key"], st["fade"], W, Hh, zbuf, img)
    lay = Image.fromarray(img, "RGBA")
    if st["fade"] < 0.5:  # 先の 光（カメラに 向く 板。リボンの 手前）
        tip = tip_imgs[1] if st["key"] else tip_imgs[0]
        pos = add(H, (0.03, 0, 0))
        tmp = render([("spr", pos, tip, PX, 1)], cam)
        lay.alpha_composite(tmp)
    return lay


def build_ribbon():
    verts, tris, dot_blocks = ribbon_mesh()
    tex = ribbon_texture()
    tex.save(os.path.join(FX, "fujin_spiral_ribbon.png"))
    tip_s = tex.crop((TIP_SMALL[0], TIP_SMALL[1], TIP_SMALL[0] + TIP_SMALL[2], TIP_SMALL[1] + TIP_SMALL[3]))
    tip_b = tex.crop((TIP_BIG[0], TIP_BIG[1], TIP_BIG[0] + TIP_BIG[2], TIP_BIG[1] + TIP_BIG[3]))
    spec = {
        "_about": "風神剣 らせんの かぜ B「らせんの おび」。頂点 = [x, y, z, u, v]。x = 進む 向き（頭 = 0・うしろ = -x）、y = 上、z = よこ。大きさ s = 1（出る 0.35・のびる 0.75・決め以降 1.0）。u・v は 絵の 点（左上 = 0,0）。テクスチャ 128×32 は Nearest・ミップなし・sRGB・半透明の 点 なし（alphaTest 0.5）。",
        "texture": "fujin_spiral_ribbon.png",
        "textureSize": [TEX_W, TEX_H], "usedColumns": USED,
        "dotBlocks": round(dot_blocks / 16, 5),
        "bands": {"front": BAND_FRONT, "back": BAND_BACK, "frontKey": BAND_FRONT_KEY, "bandHeight": BAND_H,
                  "rule": "三角形の 表（外がわ・軸から 遠い 面 = gl_FrontFacing）は front（決めの コマは frontKey）、裏は back。uv の v は 帯の 中で 0〜9 を 点で 読む（そのまま 行 = 点）"},
        "tip": {"small": list(TIP_SMALL), "big": list(TIP_BIG), "blocksPerDot": PX,
                "rule": "カメラに 向く 板 1 まい（頭の 少し 前 0.03）。決めの コマだけ big"},
        "colors": {k: PAL for k, PAL in K.PAL.items()},
        "geometry": {"segments": SEG, "strands": 2, "length": LEN, "radius": RM, "turnLength": TURN,
                     "axisWidthBlocks": round(WID_FULL, 4), "noseLength": 0.9,
                     "bladeTilt": "帯の うしろがわの ふち（j=1）は 半径 × (1 - 0.4)。うしろから 見ても 帯の はばが 見える（円すいの はね）", "radiusAt": "r(sd) = 0.72 * min(1, sd/0.9)^0.8 * (1 - 0.3 * sd/2.8)", "strand2Phase": "π",
                     "angleAt": "a(sd) = sd * 2π / 1.5 （+ 回り phi）"},
        "triangles": {"ribbon": len(tris), "tip": 2, "total": len(tris) + 2},
        "drawCalls": {"ribbon": 1, "tip": 1, "note": "先の 光を リボンの 描画に まぜれば 1 回（板 2 まいを 同じ メッシュに）"},
        "motion": {
            "spinPerStep": "2π/12（1 ステップ 1/60 秒。12 ステップで 1 回り = 1 秒に 5 回り）。x 軸の まわりに メッシュを 回す だけ（形は 作りなおさない）",
            "timeline": [{"name": e["name"], "F": e["F"], "steps": e["steps"], "s": e["s"], "fade": e["fade"], "key": e["key"], "d": e["d"]} for e in M.TIMELINE],
            "scale": "メッシュを (s, s*(1+0.5*fade), s*(1+0.5*fade)) 倍（長さは そのまま・半径だけ ひろがる）",
            "fade": "ほどける ときは シェーダーで 網で ぬく: texel の ((u点 + v点) % 4) < floor(fade * 3) なら 捨てる（点滅しない・4 段）。fade 0 / 0.4 / 0.8",
            "key": "決め（F5-10）の 6 ステップは frontKey の 帯と tip.big。ほかは front と tip.small",
        },
        "mesh": {"vertices": verts, "triangles": tris},
    }
    with open(os.path.join(FX, "fujin_spiral_ribbon.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, separators=(",", ":"))
    return Mesh(verts, tris, tex), (tip_s, tip_b), spec


# ====================================================================== T1 すいこまれる 光（白黒）

LEVELS = [255, 204, 153, 102, 51]  # 色の 段 0（いちばん 明るい 芯）〜 4（いちばん 暗い）
SPRITES = {}  # name -> (x, y, w, h)


def gv(i):
    return (LEVELS[i],) * 3 + (255,)


def disc_img(r):
    n = 2 * r + 1
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    for y in range(n):
        for x in range(n):
            d = math.hypot(x - r, y - r)
            if d > r + 0.3:
                continue
            c = 0 if d < r * 0.45 else (1 if d < r * 0.8 else 2)
            if d >= r * 0.8 and (x + y) % 2:
                continue
            im.putpixel((x, y), gv(c))
    return im


def ring_img(r, thick):
    n = 2 * r + 3
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    c = n // 2
    for y in range(n):
        for x in range(n):
            d = math.hypot(x - c, y - c)
            if r - thick + 0.5 <= d <= r + 0.5:
                im.putpixel((x, y), gv(0))
    return im


def sparkle_img(big):
    if big:
        pts = {(3, 0): 1, (3, 1): 1, (3, 2): 0, (0, 3): 1, (1, 3): 1, (2, 3): 0, (3, 3): 0, (4, 3): 0, (5, 3): 1, (6, 3): 1,
               (3, 4): 0, (3, 5): 1, (3, 6): 1, (2, 2): 2, (4, 2): 2, (2, 4): 2, (4, 4): 2}
        im = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
    else:
        pts = {(2, 0): 1, (0, 2): 1, (1, 2): 0, (2, 2): 0, (3, 2): 0, (4, 2): 1, (2, 1): 0, (2, 3): 0, (2, 4): 1}
        im = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
    for (x, y), k in pts.items():
        im.putpixel((x, y), gv(k))
    return im


def tsubu_img(kind):
    """3×3。head = プラス（芯 0・うで 1）、mid = まん中 1 ＋ たて・よこ の 2 点 2、tail = まん中 2 の 1 点"""
    im = Image.new("RGBA", (3, 3), (0, 0, 0, 0))
    if kind == "head":
        for p in ((1, 1),):
            im.putpixel(p, gv(0))
        for p in ((0, 1), (2, 1), (1, 0), (1, 2)):
            im.putpixel(p, gv(1))
    elif kind == "mid":
        im.putpixel((1, 1), gv(1))
        for p in ((0, 1), (2, 1)):
            im.putpixel(p, gv(2))
    else:
        im.putpixel((1, 1), gv(2))
    return im


def build_charge():
    atlas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))

    def put(name, im, x, y):
        atlas.alpha_composite(im, (x, y))
        SPRITES[name] = [x, y, im.width, im.height]

    # 1 段目 y=0: 輪（ぱっと ひろがる 4 コマ）
    x = 0
    for name, r, th in (("ring26", 26, 1), ("ring19", 19, 1), ("ring12", 12, 2)):
        im = ring_img(r, th)
        put(name, im, x, 0)
        x += im.width
    # 2 段目 y=56: 輪 7・芯 2〜6・きらり・つぶ
    y = 56
    x = 0
    im = ring_img(7, 2)
    put("ring7", im, x, y)
    x += im.width + 1
    for r in (2, 3, 4, 5, 6):
        im = disc_img(r)
        put(f"core{r}", im, x, y)
        x += im.width + 1
    y2 = 74
    x = 0
    for name, im in (("sparkSmall", sparkle_img(False)), ("sparkBig", sparkle_img(True)),
                     ("tsubuHead", tsubu_img("head")), ("tsubuMid", tsubu_img("mid")), ("tsubuTail", tsubu_img("tail"))):
        put(name, im, x, y2)
        x += im.width + 1
    atlas.save(os.path.join(FX, "charge_light.png"))
    spec = {
        "_about": "ため中 T1「すいこまれる 光」。白黒の 1 まい 128×128（Nearest・ミップなし・半透明の 点 なし・alphaTest 0.5）。灰色の 段 = 色の 段（シェーダーで 5 色の 表に 引きなおす）。雷神剣・風神剣 共通。1 点 = 1/16 ブロック。",
        "texture": "charge_light.png",
        "textureSize": [128, 128],
        "levels": {"gray": LEVELS, "rule": "段 = round((255 - 灰色) / 51)・0〜4。色 = palette[min(4, 段 + shift)]。shift は 板ごとの uniform（ふつう 0。輪の 後半は 1）"},
        "palettes": {"fujin": CH.WIND, "raijin": CH.THUNDER, "note": "表の 順 = 段 0（芯）〜 4（いちばん 暗い）。ほかの 武器は 5 色の 表を 足すだけ"},
        "sprites": SPRITES,
        "blocksPerDot": PX,
        "use": {
            "tsubu": "つぶ: 胸から 半径 1.2〜1.6 ブロックの 球の 上の 向き（下 半分 少なめ）。寿命 18 ステップ・はじめ ゆっくり 中で 速い（r = r0 (1 - u²)）。1 つぶ = tsubuHead 1 ＋ tsubuMid 1〜2 ＋ tsubuTail 1〜2（胸の 向きの うしろへ 1.3 点ずつ・速い ほど 長い 2〜6 こ）。カメラに 向く 板（各 3×3）。2 ステップに 1 つぶ（いっぱい 後は 4 ステップに 1）",
            "core": "芯: ため に あわせて 大きく。core2（0 %）→ core5（100 %）= 2 + round(3 * F/60)。いっぱい（F ≥ 60）は core6。カメラに 向く 板",
            "ring": "いっぱいの しゅんかん 1 回だけ: a = F - 60（0〜9）で ring7（a=0〜1）→ ring12（2〜4）→ ring19（5〜6）→ ring26（7〜9）。段は a < 5 が shift 0・a ≥ 5 が shift 1（うすく なる）。a ≥ 10 で 消える。点滅しない",
            "spark": "きらり 4 つ: 胸の まわり 半径 0.75 ブロック・1 秒で 半回り・sparkBig と sparkSmall を 交互。いっぱいの 間 出つづける。「うごきを へらす」では つぶ・きらりを 出さず 芯と 輪だけ",
        },
        "counts": {"drawCalls": 2, "drawCallsNote": "つぶ・きらり 1 ／ 芯・輪 1（1 まいの 絵）",
                   "quads": "つぶ 最大 18 × 4 + きらり 4 + 芯 1 + 輪 1 = 約 80 まい（実際に 見える のは 約 60）",
                   "trianglesNote": "案の 見積もりは 約 52（つぶの 尾を 1 まいの 絵で のばす 前提）。この 絵の まま つぶを 3 まいの 点で 作ると 約 120〜160 に なる → 尾を 1 つ 板に まとめるか 数を 絞る（上限 150）"},
    }
    with open(os.path.join(FX, "charge_light.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
    return atlas, spec


def cell(atlas, name, pal, shift=0):
    x, y, w, h = SPRITES[name]
    g = np.array(atlas.crop((x, y, x + w, y + h)))
    out = np.zeros_like(g)
    mask = g[..., 3] > 0
    idx = np.clip(np.round((255 - g[..., 0].astype(int)) / 51).astype(int) + shift, 0, 4)
    pal_a = np.array([list(c) + [255] for c in pal], dtype=np.uint8)
    out[mask] = pal_a[idx[mask]]
    return Image.fromarray(out, "RGBA")


def t1_items(atlas, F, pal, chest, seed=5):
    import random
    cols = pal
    items = []
    full = F >= CH.FULL
    life = 18
    for born in range(1, F + 1):
        r = random.Random(seed * 1000 + born)
        d = CH._dir(r)  # 乱数の 順番を 案と そろえる
        r0 = 1.2 + 0.4 * r.random()
        if full and born >= CH.FULL and born % 2:
            continue
        if born % 2 and not full or (full and born < CH.FULL and born % 2):
            pass
        u = (F - born) / life
        if u < 0 or u >= 1:
            continue
        rr = r0 * (1 - u * u)
        if rr < 0.12:
            continue
        inward = mul(d, -1)
        speed = 2 * u * r0 / life
        n = 2 + min(4, int(speed * 30))
        pos = add(chest, mul(d, rr))
        for k in range(n):
            p = add(pos, mul(inward, -k * PX * 1.3 * 1.0))
            nm = "tsubuHead" if k == 0 else ("tsubuMid" if k < 3 else "tsubuTail")
            items.append(("spr", p, cell(atlas, nm, pal), PX))
    k = min(1.0, F / CH.FULL)
    rc = 2 + int(round(3 * k)) + (1 if full else 0)
    items.append(("spr", chest, cell(atlas, f"core{min(6, rc)}", pal), PX, 2))
    if full:
        a = F - CH.FULL
        if a < 10:
            nm = "ring7" if a < 2 else ("ring12" if a < 5 else ("ring19" if a < 7 else "ring26"))
            items.append(("spr", chest, cell(atlas, nm, pal, 0 if a < 5 else 1), PX, 3))
        for i in range(4):
            ang = i * math.pi / 2 + a * math.pi / 60
            p = add(chest, (0.75 * math.cos(ang), 0.15 * math.sin(ang * 2), 0.75 * math.sin(ang)))
            items.append(("spr", p, cell(atlas, "sparkBig" if i % 2 == 0 else "sparkSmall", pal), PX, 1))
    return items


# ====================================================================== I1 はやい くつ

def build_icon():
    im = icon(ICONS["I1"][1])
    im.save(os.path.join(FX, "buff_speed.png"))
    return im


# ====================================================================== 見本シート

def load_spiral_module():
    import importlib.util
    spec = importlib.util.spec_from_file_location("spiral_build", os.path.join(HERE, "..", "spiral", "build.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def ribbon_sheet(mesh, tips, spec, SP):
    sh = Sheet(1800, 1750)
    sh.text((24, 14), "B「らせんの おび」仕上げ: ゲームの 素材（PNG ＋ JSON）から 組み直して 描いた 見本", 28, K.HEAD)
    sh.text((24, 54), "見本は 素材の PNG と JSON の 数だけで 3D を 組んで ぬった（案の 点描きでは ない）。Nearest・半透明なし。1 点 = 1/16 ブロック", 15, K.SUB)
    e = M.TIMELINE[2]
    # よこ
    cam = SP.side_cam()
    bg = SP.side_background(cam)
    H = (SP.KID_X + 0.6 + e["d"], 1.1, 0.0)
    lay = draw_ribbon(mesh, tips, e, 7, H, cam, SP.SIDE_W, SP.SIDE_H)
    out = bg.copy()
    out.alpha_composite(lay)
    sh.img((24, 92), up(out, 4), "よこから（決めの コマ・昼の 空。4 倍）")
    # うしろ
    bcam = SP.behind_cam()
    Hb = (7.0, 1.1, 0.75)
    lb = draw_ribbon(mesh, tips, e, 7, Hb, bcam, SP.BW, SP.BH)
    shot = Image.open(SHOT).convert("RGBA")
    big = up(lb, SP.BK).crop((0, 0, 1280, 800))
    back = shot.copy()
    back.alpha_composite(big)
    back.paste(shot, (0, 0), SP.kid_mask())
    sh.img((24 + SP.SIDE_W * 4 + 24, 92), back.crop((300, 160, 980, 620)), "うしろ（プレイヤー目線・ゲームの スクショに 重ねた・原寸）")
    # 動き
    y2 = 92 + 20 + 470
    sh.text((24, y2), "よこから 見た 動き（素材から 組み直し）。★ = 決め 6 ステップ止め", 18, K.HEAD)
    x, step = 24, 0
    for ev in M.TIMELINE:
        Hh = (SP.KID_X + 0.6 + ev["d"], 1.1, 0.0)
        lay = draw_ribbon(mesh, tips, ev, step + 1, Hh, cam, SP.SIDE_W, SP.SIDE_H)
        sc = bg.copy()
        sc.alpha_composite(lay)
        cx = int(round(cam.proj((SP.KID_X + 0.6 + ev["d"], 1.1, 0))[0]))
        x0 = min(max(0, cx - 34), SP.SIDE_W - 60)
        sh.img((x, y2 + 28), up(sc.crop((x0, 6, x0 + 60, 66)), 3), f"{ev['name']} {ev['F']} ×{ev['steps']}", 13, K.INK)
        x += 192
        step += ev["steps"]
    # 回りの 4 コマ（決めの 大きさ）
    y3 = y2 + 28 + 20 + 190
    sh.text((24, y3), "とぶ: 回りの 4 コマ（3 ステップごと）。おびは 形が かわらず 回るだけ", 18, K.HEAD)
    x = 24
    for k in range(4):
        ev = dict(M.TIMELINE[3])
        Hh = (SP.KID_X + 0.6 + 3.0, 1.1, 0.0)
        lay = draw_ribbon(mesh, tips, ev, 3 * k, Hh, cam, SP.SIDE_W, SP.SIDE_H)
        sc = bg.copy()
        sc.alpha_composite(lay)
        sh.img((x, y3 + 28), up(sc.crop((40, 10, 156, 62)), 3), f"step {3 * k}", 13, K.INK)
        x += 360
    # 8 方向
    y4 = y3 + 28 + 20 + 160 + 10
    sh.text((24, y4), "8 方向（決めの コマ。0° = うしろ・90° = よこ・180° = 正面）。どの 向きも 厚みが ある", 18, K.HEAD)
    cells = []
    for i in range(8):
        c8 = K.orbit_cam((-1.2, 0, 0), i * 45, 20, 10, 64, 48, ppb=16)
        lay = draw_ribbon(mesh, tips, e, 7, (0.0, 0.0, 0.0), c8, 64, 48)
        bgc = Image.new("RGBA", (64, 48), (150, 205, 245, 255))
        bgc.alpha_composite(lay)
        cells.append(up(bgc, 2))
    row = Image.new("RGB", (8 * 132, 96), (60, 60, 70))
    for i, cimg in enumerate(cells):
        row.paste(cimg.convert("RGB"), (i * 132, 0))
    sh.img((24, y4 + 28), row)
    for i in range(8):
        sh.text((24 + i * 132 + 4, y4 + 28 + 100), f"{i * 45}°", 12, K.SUB)
    # 確かめの 絵 3 まい
    y5 = y4 + 28 + 124
    sh.text((24, y5), "確かめの 絵: シルエット・白黒・ぼかし", 18, K.HEAD)
    sil = K.silhouette(lay_bbox(draw_ribbon(mesh, tips, e, 7, H, cam, SP.SIDE_W, SP.SIDE_H)))
    sh.img((24, y5 + 28), up(sil, 3), "① よこ", 13)
    sh.img((24 + sil.width * 3 + 20, y5 + 28), K.gray(back.crop((440, 250, 760, 470))), "② 白黒", 13)
    sh.img((24 + sil.width * 3 + 20 + 336, y5 + 28), K.blur(back.crop((440, 250, 760, 470)), 4), "③ ぼかし", 13)
    # 素材の 絵（拡大）
    x6 = 24 + sil.width * 3 + 20 + 336 * 2
    tex = Image.open(os.path.join(FX, "fujin_spiral_ribbon.png"))
    tb = Image.new("RGBA", tex.size, (90, 100, 120, 255))
    tb.alpha_composite(tex)
    sh.img((x6, y5 + 28), up(tb, 4), "素材 fujin_spiral_ribbon.png 128×32（4 倍）。上から 表・裏・表（決め）・先の 光", 13)
    y7 = y5 + 28 + 260
    rows = [["かず", "値"]] + [
        ["絵", "128×32（2 の 累乗）・5 色 + すきとおり・半透明 0"],
        ["三角形", f"リボン {spec['triangles']['ribbon']} ＋ 先の 光 2 = {spec['triangles']['total']}（上限 150）"],
        ["描画回数", "1〜2（リボン・先の 光。上限 4）"],
        ["頂点", f"{len(spec['mesh']['vertices'])}（1 本 {len(spec['mesh']['vertices']) // 2}）"],
        ["1 点の 大きさ", f"{spec['dotBlocks']} ブロック（= 1/16 = 0.0625。道のり 全部 = {USED} 点）"],
        ["はば", f"{WIDTH_DOTS} 点 = {WID_FULL:.4f} ブロック（案は 0.42 → ふちを 入れて 9 点）"],
    ]
    sh.table((24, y7), rows, [140, 760], 13, 22)
    sh.im = sh.im.crop((0, 0, 1800, y7 + 170))
    sh.save(os.path.join(OUT, "spiral-b-final.png"))
    return back


def lay_bbox(lay):
    bb = lay.getbbox()
    return lay.crop((bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4))


def charge_sheet(atlas, spec, SP):
    cam = SP.behind_cam()
    chest = (0.0, 0.9, 0.0)
    CROP = (400, 250, 720, 590)
    shot = Image.open(SHOT).convert("RGBA")

    def scene(F, pal):
        items = t1_items(atlas, F, pal, chest)
        kz = dot(sub(chest, cam.pos), cam.fwd)
        far = [it for it in items if dot(sub(it[1], cam.pos), cam.fwd) > kz + 0.05]
        near = [it for it in items if it not in far]
        out = shot.copy()
        out.alpha_composite(up(render(far, cam), SP.BK).crop((0, 0, 1280, 800)))
        out.paste(shot, (0, 0), SP.kid_mask())
        out.alpha_composite(up(render(near, cam), SP.BK).crop((0, 0, 1280, 800)))
        return out.crop(CROP)

    cw, ch = CROP[2] - CROP[0], CROP[3] - CROP[1]
    sh = Sheet(1800, 1700)
    sh.text((24, 14), "T1「すいこまれる 光」仕上げ: 白黒の 絵 ＋ 5 色の 表（素材 charge_light.png / .json から 描いた）", 28, K.HEAD)
    sh.text((24, 54), "うしろ（プレイヤー目線）。ゲームの スクショに 重ねた 原寸。ため いっぱい = 60 ステップ。強い 点滅なし", 15, K.SUB)
    frames = [(10, "ため 10"), (30, "ため 30"), (55, "ため 55"), (60, "★いっぱい 60"), (64, "64"), (90, "いっぱい 中 90")]
    pal_w, pal_t = CH.P(CH.WIND), CH.P(CH.THUNDER)
    y = 90
    sh.text((24, y), "風神剣（白〜水色）", 18, K.INK)
    x = 24
    for F, lab in frames:
        sh.img((x, y + 26), scene(F, pal_w).crop((15, 0, cw - 15, ch)), lab, 12)
        x += cw - 30 + 8
    y += 26 + 18 + ch + 14
    sh.text((24, y), "雷神剣（白〜黄）", 18, K.INK)
    x = 24
    for F, lab in frames:
        sh.img((x, y + 26), scene(F, pal_t).crop((15, 0, cw - 15, ch)), lab, 12)
        x += cw - 30 + 8
    y += 26 + 18 + ch + 14
    # 輪の ひろがり（a = 0..9）と きらり
    sh.text((24, y), "いっぱいの しゅんかん: 輪の ひろがり（a = 0〜9 ステップ。1 回だけ）", 18, K.HEAD)
    x = 24
    for a in (0, 2, 5, 7, 9, 10):
        sh.img((x, y + 28), scene(60 + a, pal_w).crop((60, 70, cw - 60, ch - 70)), f"a={a}", 12)
        x += cw - 120 + 8
    y += 28 + 18 + ch - 140 + 14
    # 素材 と 5 色の 表
    sh.text((24, y), "素材: 白黒の 絵（128×128・5 段）", 18, K.HEAD)
    big = Image.new("RGBA", atlas.size, (60, 66, 84, 255))
    big.alpha_composite(atlas)
    sh.img((24, y + 28), up(big, 4), None)
    px0 = 24 + 512 + 30
    sh.text((px0, y), "5 色の 表（段 0 = 芯 → 4）", 18, K.HEAD)
    for r, (nm, pal) in enumerate((("風神剣", CH.WIND), ("雷神剣", CH.THUNDER))):
        sh.text((px0, y + 36 + r * 34), nm, 14)
        for i, c in enumerate(pal):
            sh.d.rectangle([px0 + 90 + i * 130, y + 34 + r * 34, px0 + 112 + i * 130, y + 56 + r * 34], fill=K.rgb(c), outline=(90, 90, 100))
            sh.text((px0 + 118 + i * 130, y + 38 + r * 34), c, 12, K.SUB)
    sh.text((px0, y + 120), "灰色の 段: " + " ・ ".join(str(v) for v in LEVELS) + "  → 段 0〜4", 14, K.INK)
    rows = [["かず", "値"],
            ["絵", "128×128（2 の 累乗）・白黒 5 段 ＋ すきとおり"],
            ["描画回数", "2（つぶ・きらり 1 ／ 芯・輪 1）"],
            ["板の 数", "つぶ 最大 18 つぶ × 最大 6 点 ＋ 芯 1 ＋ 輪 1 ＋ きらり 4"],
            ["三角形", "案の 見積もり 約 52。つぶの 点を 1 点ずつ 板に すると 増える → JSON の counts"],
            ["1 点", "1/16 ブロック（案どおり）"]]
    sh.table((px0, y + 160), rows, [110, 560], 13, 24)
    sh.im = sh.im.crop((0, 0, 1800, y + 28 + 520))
    sh.save(os.path.join(OUT, "charge-t1-final.png"))


def icon_sheet(ic):
    sh = Sheet(1400, 900)
    sh.text((24, 14), "速さバフの アイコン I1「はやい くつ」16×16（字なし）", 28, K.HEAD)
    sh.text((24, 54), f"ふち 1 点 #12304A・光は 左上・色 {len({ic.getpixel((x, y)) for x in range(16) for y in range(16) if ic.getpixel((x, y))[3]})} 色（上限 12）・半透明 なし", 15, K.SUB)

    def onbg(im, col):
        b = Image.new("RGBA", im.size, col + (255,))
        b.alpha_composite(im)
        return b

    sh.img((24, 90), onbg(up(ic, 16), (40, 46, 66)), "16 倍", 13)
    x = 24 + 256 + 24
    sh.img((x, 90), onbg(ic, (40, 46, 66)), "1 倍", 13)
    sh.img((x + 40, 90), onbg(up(ic, 2), (40, 46, 66)), "2 倍", 13)
    sil = K.silhouette(ic)
    sh.img((x, 150), up(sil, 4), "シルエット", 13)
    sh.img((x + 90, 150), up(K.gray(onbg(ic, (40, 46, 66))), 4), "白黒", 13)
    sh.img((x + 180, 150), K.blur(up(onbg(ic, (40, 46, 66)), 4), 2), "ぼかし", 13)
    # ほかの アイコンと ならべる（ハート・風神剣・ふだんの 持ち物の 色）
    import importlib.util
    bs = importlib.util.spec_from_file_location("buff_build", os.path.join(HERE, "..", "buff-icon", "build.py"))
    bm = importlib.util.module_from_spec(bs)
    bs.loader.exec_module(bm) if False else bs.loader.exec_module(bm)
    hrt, fj = bm.heart(), bm.fujin_icon()
    row = Image.new("RGBA", (16 * 3 * 2 + 40, 32), (40, 46, 66, 255))
    row.alpha_composite(up(hrt, 2), (0, 0))
    row.alpha_composite(up(ic, 2), (50, 0))
    row.alpha_composite(up(fj, 2), (100, 0))
    sh.img((24, 360), up(row, 3), "ならべる: ハート・はやい くつ・風神剣（2 倍の 3 倍）", 13)
    # HUD ① 体力の 上・左はし
    hud = Image.open(SHOT).convert("RGBA")
    p = bm.plate(ic)
    hud.alpha_composite(p, (322, 548))
    sh.img((24, 520), hud.crop((300, 520, 780, 700)), "HUD 原寸: ① 体力（ハート）の 上・左はし。2 倍・HUD の 板 ふち B1", 13)
    sh.img((24 + 500, 520), up(hud.crop((310, 540, 400, 600)), 4), "4 倍", 13)
    sh.save(os.path.join(OUT, "buff-icon-i1-final.png"))


def lay_gif(mesh, tips, SP):
    """動き: よこから 見た 全 区間 ＋ とぶ（1 ステップごと）を GIF で。"""
    cam = SP.side_cam()
    bg = SP.side_background(cam)
    frames = []
    step = 0
    for ev in M.TIMELINE:
        for k in range(ev["steps"]):
            Hh = (SP.KID_X + 0.6 + ev["d"] + k * 0.05, 1.1, 0.0)
            lay = draw_ribbon(mesh, tips, ev, step + k + 1, Hh, cam, SP.SIDE_W, SP.SIDE_H)
            sc = bg.copy()
            sc.alpha_composite(lay)
            frames.append(up(sc, 4).convert("RGB"))
        step += ev["steps"]
    frames[0].save(os.path.join(OUT, "spiral-b-motion.gif"), save_all=True, append_images=frames[1:], duration=50, loop=0)


def main():
    os.makedirs(FX, exist_ok=True)
    mesh, tips, spec = build_ribbon()
    atlas, cspec = build_charge()
    ic = build_icon()
    SP = load_spiral_module()
    ribbon_sheet(mesh, tips, spec, SP)
    charge_sheet(atlas, cspec, SP)
    icon_sheet(ic)
    lay_gif(mesh, tips, SP)
    print("triangles", spec["triangles"], "dotBlocks", spec["dotBlocks"], "verts", len(spec["mesh"]["vertices"]))


if __name__ == "__main__":
    main()
