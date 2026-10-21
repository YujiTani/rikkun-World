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
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

import w8kit as K  # noqa: E402
from w8kit import C, Sheet, add, mul, sub, dot, norm, cross, up, render  # noqa: E402
from icons import ICONS, icon, PAL as ICON_PAL  # noqa: E402
import models as M  # noqa: E402
import charge as CH  # noqa: E402
sys.path.append(os.path.join(HERE, "..", "v2"))  # 見本の 背景・カメラ・v2 の 絵の 関数

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
SPIN_STEPS = 24      # 仕様 §3.1: 1 回り 24 ステップ（15 より ゆっくり。15 度/ステップ。おびが 2 本なので 12 ステップで 同じ 形）
RADIAL_SCALE = 1.25  # ゲームで 半径を 大きく する 倍（直径 1.44 → 1.8。仕様 §3.1 の 1.6〜2.0）。素材の JSON に 入れた（開発の 拡大 では ない）
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


M.SPIN = 2 * math.pi / SPIN_STEPS  # 案の 12 ステップ → 仕様の 24 ステップ


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


# ====================================================================== S2 らせんの かぜ（すける・回りの すじ・地面の 土と 草）

ARC_RINGS = (9, 17)
ARC_SEGS = 4
ARC_SPAN = (10.0, 110.0)   # 帯から うしろへ（回る 向きの 反対）の 角度
ARC_W = 3 / 16             # はば 3 点
ARC_TEX = (12, 27, 32, 3)  # 弧の 絵: x, y, w, h
ALPHA = {"bodyFront": 128, "bodyBack": 77, "arcMid": 153, "arcTail": 77}  # 0.5・0.3・0.6・0.3（絵の アルファ。ほかは 255）


def ribbon_texture():
    im = Image.new("RGBA", (TEX_W, TEX_H), (0, 0, 0, 0))
    px = im.load()
    for band, kind, key in ((BAND_FRONT, "front", False), (BAND_BACK, "back", False), (BAND_FRONT_KEY, "front", True)):
        for c in range(USED):
            frac = (c + 0.5) / USED
            lvl = 3 if frac > 0.9 else 2 if frac > 0.8 else 1 if frac > 0.7 else 0  # しっぽ 3 割は 網で ほどける
            for r in range(BAND_H):
                if (c + r) % 4 < lvl:
                    continue
                a = 255
                if kind == "front":
                    col = C["W2"]
                    if r in (1, 7):
                        col = C["B1"]
                    if r in (0, 8):
                        col = C["B3"]
                    if 2 <= r <= 6:
                        streak = (r in (3, 4, 5) and c % 10 < 7) if key else (r == 4 and c % 10 < 6)
                        if streak:
                            col = C["W1"]  # しま（点線）。回って 見える。不透明
                        else:
                            a = ALPHA["bodyFront"]
                else:
                    col = C["B1"]
                    if r in (1, 7):
                        col = C["B2"]
                    if r in (0, 8):
                        col = C["B3"]
                    if 1 <= r <= 7:
                        a = ALPHA["bodyBack"]
                px[c, band + r] = tuple(col) + (a,)
    # 弧の すじ（頭 = 白・不透明 → うしろへ うすく）
    ax, ay, aw, ah = ARC_TEX
    for c in range(aw):
        t = c / aw
        if t < 0.3:
            col, a = C["W1"], 255
        elif t < 0.65:
            col, a = C["W2"], ALPHA["arcMid"]
        else:
            col, a = C["B1"], ALPHA["arcTail"]
        for r in range(ah):
            px[ax + c, ay + r] = tuple(col) + (a,)
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


def arc_mesh(verts):
    """帯の 外がわの 弧 4 本（リボン 2 本 × 2 か所）。頂点 [x, y, z, u, v]（u・v は テクスチャ 全体の 点）。"""
    av, at = [], []
    ax, ay, aw, ah = ARC_TEX
    for strand in (0, 1):
        for ring in ARC_RINGS:
            vx = verts[strand * 50 + ring * 2]
            x, y, z = vx[0], vx[1], vx[2]
            r = math.hypot(y, z) * 1.22
            th = math.atan2(z, y)
            for k in range(ARC_SEGS):
                t0, t1 = k / ARC_SEGS, (k + 1) / ARC_SEGS
                a0 = th - math.radians(ARC_SPAN[0] + (ARC_SPAN[1] - ARC_SPAN[0]) * t0)
                a1 = th - math.radians(ARC_SPAN[0] + (ARC_SPAN[1] - ARC_SPAN[0]) * t1)
                P = [(x - ARC_W / 2, r * math.cos(a0), r * math.sin(a0)), (x + ARC_W / 2, r * math.cos(a0), r * math.sin(a0)),
                     (x + ARC_W / 2, r * math.cos(a1), r * math.sin(a1)), (x - ARC_W / 2, r * math.cos(a1), r * math.sin(a1))]
                UV = [(ax + t0 * aw, ay), (ax + t0 * aw, ay + ah), (ax + t1 * aw, ay + ah), (ax + t1 * aw, ay)]
                b = len(av)
                for p, uv in zip(P, UV):
                    av.append([round(p[0], 4), round(p[1], 4), round(p[2], 4), round(uv[0], 3), round(uv[1], 3)])
                at += [[b, b + 1, b + 2], [b, b + 2, b + 3]]
    return av, at


def build_ribbon():
    verts, tris, dot_blocks = ribbon_mesh()
    tex = ribbon_texture()
    tex.save(os.path.join(FX, "fujin_spiral_ribbon.png"))
    av, at = arc_mesh(verts)
    import spiral as SPm
    mx = 0
    for a in range(0, 61):
        mx = max(mx, SPm.debris(a, np.array([0.0, 1.4, 0.0]), np.array([0.0, 0.0, -1.0]), 0.0, "grass")[1])
    spec = {
        "_about": "風神剣 らせんの かぜ S2「すける らせんの おび」（オーナー決定 2026-10-21）。帯 2 本 ＋ 回りの すじ 4 本 ＋ 先の 光 ＋ 地面の 土と 草の つぶ。頂点 = [x, y, z, u, v]。x = 進む 向き（頭 = 0・うしろ = -x）、y = 上、z = よこ。大きさ s = 1。u・v は 絵の 点（左上 = 0,0）。テクスチャ 128×32 は Nearest・ミップなし・sRGB。**半透明の 点を 使う**（PIPELINE 2.1「半透明の 点は 作らない」の 例外。オーナー OK ずみ）: 絵の アルファ 255 / 153 / 128 / 77 の 4 段だけ（なめらかな グラデは 使わない）。",
        "texture": "fujin_spiral_ribbon.png",
        "textureSize": [TEX_W, TEX_H], "usedColumns": USED,
        "dotBlocks": round(dot_blocks / 16, 5),
        "alpha": {"levels": ALPHA, "rule": "アルファは 絵に 入って いる（材質の opacity は 1）。からだ（表 0.5・裏 0.3）・弧の 中ほど 0.6・弧の しっぽ 0.3。ふち B3・白い しま・弧の 頭・先の 光は 255（不透明）。alphaTest 0.01 で 網の 穴だけ 捨てる。depthWrite false"},
        "bands": {"front": BAND_FRONT, "back": BAND_BACK, "frontKey": BAND_FRONT_KEY, "bandHeight": BAND_H,
                  "rule": "三角形の 表（外がわ = gl_FrontFacing）は front（決めの コマは frontKey）、裏は back。uv の v は 帯の 中で 0〜9（点）。表の しま = 帯の まん中に そった 白い 点線（決めの コマは 3 点の はば）"},
        "tip": {"small": list(TIP_SMALL), "big": list(TIP_BIG), "blocksPerDot": 2 / 16,
                "rule": "カメラに 向く 板 1 まい（頭の 少し 前 0.03）。決め（a 4〜9）だけ big。1 点 = 2/16 ブロックで 出す"},
        "arcs": {"texture": list(ARC_TEX), "rule": "かたい 板 16 まい（弧 4 区切り × 4 本）。帯と 同じ 向きで 回す。表裏 とも 同じ 絵（両面）。uv は 絵 全体の 点。a ≥ 2 から 出す",
                 "vertices": av, "triangles": at},
        "colors": {k: PAL for k, PAL in K.PAL.items()},
        "geometry": {"segments": SEG, "strands": 2, "length": LEN, "radius": RM, "turnLength": TURN,
                     "axisWidthBlocks": round(WID_FULL, 4), "noseLength": 0.9,
                     "bladeTilt": "帯の うしろがわの ふち（j=1）は 半径 × (1 - 0.4)", "arcRadius": "帯の 半径 × 1.22（帯の 外がわ）",
                     "radiusAt": "r(sd) = 0.72 * min(1, sd/0.9)^0.8 * (1 - 0.3 * sd/2.8)", "strand2Phase": "π",
                     "angleAt": "a(sd) = sd * 2π / 1.5 （+ 回り phi）"},
        "triangles": {"ribbon": len(tris), "arcs": len(at), "tip": 2, "total": len(tris) + len(at) + 2},
        "drawCalls": {"total": 4, "order": "① 裏の 面（帯 2 本の 裏）→ ② 表の 面 ＋ 弧 → ③ 先の 光 → ④ 地面の つぶ（THREE.Points）", "note": "①② は 同じ メッシュを side: BackSide / FrontSide で 2 回 描く"},
        "motion": {
            "spinPerStep": "2π/24 = 15 度（AC20 の 24 度 以下）。x 軸の まわりに メッシュを 回す だけ。「動きを減らす」では a 0〜60 ずっと 0 度",
            "advance": "帯の 根もと = 体の 点 B から 進む 向きへ 1.0 + 0.2 × a ブロック（見た目の 位置）",
            "gameScale": {"radius": RADIAL_SCALE, "length": 1.0, "diameterBlocks": round(2 * RM * RADIAL_SCALE, 2), "rule": "メッシュを (s, s*(1+0.5*fade)*1.25, s*(1+0.5*fade)*1.25) 倍。弧も 同じ 倍。この 倍は 素材の 約束（開発が 足さない）"},
            "timeline": [{"name": e["name"], "F": e["F"], "steps": e["steps"], "s": e["s"], "fade": e["fade"], "key": e["key"], "d": e["d"]} for e in M.TIMELINE],
            "fade": "ほどける ときは シェーダーで 網で 捨てる: texel の ((u点 + v点) % 4) < floor(fade * 3)。fade 0 / 0.4 / 0.8（点滅しない）",
            "key": "決め（a 4〜9）の 6 ステップは frontKey の 帯と tip.big",
        },
        "ground": {
            "_about": "通った 地面から 土と 草の 切れはしが とぶ。見た目だけ（ブロックは こわさない・地面に のこさない）。THREE.Points（正方形の 点）。点の 大きさ = 1 点 = 1/16 ブロック × dots。",
            "palettes": {k: v for k, v in SPm.GROUND_PAL.items()},
            "paletteUse": "[0] = 草の 切れはし（はじめ）・[1] = 草（おちる ころ・網）・[2] = 土の かたまり（はじめ）・[3] = 土（おちる ころ・網）・[4] = 土けむり。地面の ブロックで えらぶ: くさ → grass・つち・どろ → dirt・いし → stone・すな → sand",
            "rules": {"gravityBlocksPerSec2": SPm.G, "maxPoints": SPm.MAX_POINTS, "startAge": 3,
                      "perStep": "a ≥ 3 の 各 ステップで 切れはし 2 こ（a 偶数）または 1 こ。寿命 12〜20 ステップ。草 = 2 点・土 = 3 点（正方形の 辺）。3 つに 1 つは 草（c=1 か a%3==0）。寿命の 65% を すぎたら 色を [1]/[3] にして 網（画面の 点の 市松の 半分を ぬく）",
                      "launch": "うしろ 0.4〜1.6・よこ ±0.8 に 出て、上へ 5〜8 ブロック/秒・前へ 3〜7・よこへ 1.5〜3.5（回る 向きへ 7 割）。地面より 下に なったら 消す",
                      "smoke": "4 ステップに 1 つ 土けむり（[4]）。寿命 14 ステップ・3 点 → 6 点へ ふくらむ・網・前へ 2.0 ブロック/秒・上へ ゆっくり"},
            "maxLiveBeforeCap": mx, "pointsNote": "同時に 出る 点は 48 まで（cap）。なければ 10 こに へらす",
        },
        "counts": {"drawCalls": 4, "triangles": len(tris) + len(at) + 2, "colors": 5, "alphaLevels": 4, "points": SPm.MAX_POINTS},
        "mesh": {"vertices": verts, "triangles": tris},
    }
    with open(os.path.join(FX, "fujin_spiral_ribbon.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, separators=(",", ":"))
    return tex, spec


# ====================================================================== K1 みかづきの 刃

BLADE_COLORS = 4  # 絵に 実際に 使う 色（W1 の 芯は 使わない）


def build_blade():
    import blade as BLm
    atlas = Image.new("RGBA", (128, 64), (0, 0, 0, 0))
    rects = {}
    for i, deg in enumerate((0, 45, 90)):
        for f in range(2):
            im = BLm.k1(math.radians(deg), f)
            atlas.alpha_composite(im, (22 * i, 22 * f))
            rects[f"{deg}_{f}"] = [22 * i, 22 * f, 22, 22]
    atlas.save(os.path.join(FX, "fujin_blade.png"))
    # 8 向き（絵の 向き θ 度 → どの 絵を どう 反転）。反転は 点を ずらさない ので 絵は 同じ
    dirs = {"0": ["0", False, False], "45": ["45", False, False], "90": ["90", False, False], "135": ["45", True, False],
            "180": ["0", True, False], "-135": ["45", True, True], "-90": ["90", False, True], "-45": ["45", False, True]}
    # 反転が 描きなおしと ぴったり 同じか たしかめる
    bad = 0
    for k, (src, fx, fy) in dirs.items():
        for f in range(2):
            ref = np.array(BLm.k1(math.radians(int(k)), f))
            x, y, w, h = rects[f"{src}_{f}"]
            t = atlas.crop((x, y, x + w, y + h))
            if fx:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            if fy:
                t = t.transpose(Image.FLIP_TOP_BOTTOM)
            bad += int((np.array(t) != ref).any(axis=2).sum())
    spec = {
        "_about": "ふつうの 攻撃の 風の 刃 K1「みかづきの 刃」（オーナー決定 2026-10-21）。カメラに 正面の 板 1 まい（ビルボード）。絵は 22×22 の 板（= 1.375 ブロック。三日月の 長さは 約 0.75 ブロック）。1 点 = 1/16 ブロック。Nearest・ミップなし・sRGB・半透明の 点 なし（alphaTest 0.5）。",
        "texture": "fujin_blade.png", "textureSize": [128, 64], "blocksPerDot": PX, "quadBlocks": 22 / 16,
        "sprites": rects,
        "directions": {"_rule": "絵の 向き θ = 画面の 上で 進む 向きを 45° ずつに まるめた 角（度。右 = 0・上 = 90）。うしろへ はなれる（進む 向きと カメラの 前が 0.7 以上 そろう）は 90（アーチ）・近づく（-0.7 以下）は -90。板は 回さない。表の 'src' の 絵を flipX / flipY で 使う（点は ずれない）",
                       "table": {k: {"sprite": v[0], "flipX": v[1], "flipY": v[2]} for k, v in dirs.items()},
                       "flipCheckMismatchPixels": bad},
        "frames": {"count": 2, "stepsPerFrame": 3, "rule": "コマ（_0 と _1）は 3 ステップごとに 入れかえ。ちがう のは うしろの すじの 点の 位置だけ"},
        "timeline": {"appear": {"steps": 2, "scale": 0.6, "rule": "出る 2 ステップは 0.6 倍（そのあと 1.0 倍）"}, "fly": {"steps": 14},
                     "fade": {"steps": 4, "ditherLevels": [0, 1, 2, 3], "rule": "さいご 4 ステップは 網で 捨てる: texel の ((x + y) % 4) < レベル。点滅しない。合計 20 ステップ（5 マス・0.25 マス/ステップ）"},
                     "reducedMotion": "「動きを減らす」でも 同じ（回らない・点滅しない ので 変えない）"},
        "visualOffset": "見た目だけ 進む 向きの 右（剣の 手の 側）へ 0.4 ブロック ずらす（当たりの 半径 0.5 の 中。頭で かくれない ため）",
        "colors": {k: v for k, v in K.PAL.items()},
        "counts": {"drawCalls": 1, "drawCallsNote": "8 つ 同時でも 1 回（InstancedMesh）。今の 十字 2 まい × 8 = 最大 16 回より 軽い", "triangles": 16, "trianglesNote": "板 8 まい × 2。同時に 出る 数は 真空波の 上限 8", "colors": BLADE_COLORS},
    }
    with open(os.path.join(FX, "fujin_blade.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
    return atlas, spec


# ====================================================================== 手もとの 光（白黒）

LEVELS = [255, 204, 153, 102, 51]  # 色の 段 0（いちばん 明るい 芯）〜 4
GRAY_PAL = ["#%02X%02X%02X" % (v, v, v) for v in LEVELS]
SPRITES = {}
RING_N = 12      # ためF 60〜71 の 12 ステップ
CORE_N = 6       # 芯の 大きさの 段（0 → 5）


def build_charge():
    import handcharge as HCm
    atlas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    x = y = rowh = 0

    def put(name, im):
        nonlocal x, y, rowh
        if x + im.width > 128:
            x, y, rowh = 0, y + rowh + 1, 0
        atlas.alpha_composite(im, (x, y))
        SPRITES[name] = [x, y, im.width, im.height]
        x += im.width + 1
        rowh = max(rowh, im.height)

    for i in range(CORE_N):
        put(f"core{i}", HCm.core_sprite(i / (CORE_N - 1), GRAY_PAL))
    for k in range(RING_N):
        put(f"ring{k}", HCm.ring_sprite(3 + k * 0.5, GRAY_PAL, k // 4))
    put("star", HCm.star_sprite(GRAY_PAL, True))
    atlas.save(os.path.join(FX, "charge_light.png"))
    spec = {
        "_about": "ため中の 光「手もとの 光」（オーナー決定 2026-10-21。T1「すいこまれる 光」を 作りなおした）。白黒の 1 まい 128×128（Nearest・ミップなし・半透明の 点 なし・alphaTest 0.5）。灰色の 段 = 色の 段（シェーダーで 5 色の 表に 引きなおす）。雷神剣・風神剣 共通。1 点 = 1/16 ブロック。",
        "texture": "charge_light.png", "textureSize": [128, 128],
        "levels": {"gray": LEVELS, "rule": "段 = round((255 - 灰色) / 51)・0〜4。色 = palette[段]"},
        "palettes": {"fujin": CH.WIND, "raijin": CH.THUNDER, "note": "表の 順 = 段 0（芯）〜 4。ほかの 武器は 5 色の 表を 足すだけ"},
        "sprites": SPRITES, "blocksPerDot": PX,
        "use": {
            "anchor": "芯・輪・つぶの 行き先 = 剣を 持つ 手（にぎり）。きらり・光の 走り 先 = 剣先。位置は 人形の 骨と 剣の 先から とる（仕様 §3.5）。カメラに 向く 板",
            "core": f"芯 = core0〜core{CORE_N - 1} を ためF で えらぶ: 段 = round(5 × min(F, 60) / 60)。半径 0.5 → 1.5 点 ＋ 網の にじみ（いっぱいでも 直径 約 4 点 = 0.25 ブロック）。下がらない。ためF 60〜 は core5 で 止まる",
            "ring": f"いっぱいの しゅんかん 1 回だけ（ためF 60〜71 の 12 ステップ）: k = ためF - 60（0〜11）で ring{{k}}。半径 3 → 8.5 点・k 0〜3 = 線 1 点・k 4〜7 = うすい 色の 線・k 8〜11 = 網。72 から 出さない",
            "bladeLight": "ためF 60〜65: 手から 剣先へ 光が 1 回 走る（Points）。s = (F - 60 + 1)/6。3 つぶ: 先 = 2 点（段 0）・うしろ 1 点（段 1）・1 点（段 1）。位置 = 手 + (剣先 - 手) × (s - 0.06 × k)",
            "star": "ためF 66〜: 剣先に star（7×7・止まった まま。点滅しない）。ためF 60〜65 の 間は 出さない",
            "tsubu": "つぶ（THREE.Points）: ためF ごとに 1 つ 生まれ 18 ステップで 手に つく。まわり 0.8〜1.1 ブロックの 向きは 画面の 上で ランダム、ただし 体の 方（手から 体の まん中への 向き ±70°）からは 出さず 反対がわへ。半径 = r0 (1 - u²)（u = 年/18）。1 つぶ = 頭 1 点（段 0）。u > 0.3 から うしろへ 1 点（段 1）・2 点（段 2）の 尾（内向きの 反対）。ためF ≥ 60 では 偶数の 生まれは 出さない（つぶは 集まりつづける）",
            "orbit": "ためF ≥ 66: 手の まわり 0.32 ブロックを 小さな つぶ（2 点・段 1）2 つが 1 回り 120 ステップで 回る",
        },
        "reducedMotion": "「動きを減らす」: つぶ 0 こ・輪 なし・手の まわりを 回る つぶ なし。芯の 大きさ・光の 走り・剣先の きらり（止まった まま）は 出す。区間・fade は 同じ",
        "counts": {"drawCalls": 2, "drawCallsNote": "芯・輪・きらりの 板 3 まいを 1 つの メッシュ ／ つぶ・光の 走り・まわる つぶ = THREE.Points 1 つ", "quads": 3, "triangles": 6, "points": "__P__", "colors": 5, "grayLevelsUsed": "__G__"},
    }
    return atlas, spec


def charge_points_max(atlas):
    """つぶの 同時数の 最大（F = 1〜140 を ゆるく 数える。手もとの 光の 規則どおり）"""
    import handcharge as HCm
    import scene as SCm
    n = {"c": 0}
    orig = SCm.Layer.point

    def counter(self, *a, **k):
        n["c"] += 1
        return orig(self, *a, **k)
    SCm.Layer.point = counter
    mx = 0
    try:
        for F in range(1, 141, 1):
            n["c"] = 0
            HCm.render("ch_back_F30", "back", F, "fujin")
            mx = max(mx, n["c"])
    finally:
        SCm.Layer.point = orig
    return mx


def finish_charge(atlas, spec):
    install_charge_sprites(atlas)
    mxp = charge_points_max(atlas)
    spec["counts"]["points"] = mxp
    spec["counts"]["grayLevelsUsed"] = len({int(v) for v in np.array(atlas)[..., 0][np.array(atlas)[..., 3] > 0]})
    spec["counts"]["pointsNote"] = "同時に 出る 点の 最大（F = 1〜140 を 数えた）。上限の 目安 48 を こえる ときは 尾の 点を へらす"
    with open(os.path.join(FX, "charge_light.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
    return mxp


def cell(atlas, name, pal, shift=0):
    x, y, w, h = SPRITES[name]
    g = np.array(atlas.crop((x, y, x + w, y + h)))
    out = np.zeros_like(g)
    mask = g[..., 3] > 0
    idx = np.clip(np.round((255 - g[..., 0].astype(int)) / 51).astype(int) + shift, 0, 4)
    pal_a = np.array([list(c) + [255] for c in pal], dtype=np.uint8)
    out[mask] = pal_a[idx[mask]]
    return Image.fromarray(out, "RGBA")


def install_charge_sprites(atlas):
    """見本の 描きかえ: v2 の 絵の 関数を、できあがった 素材（白黒の 絵 ＋ 5 色の 表）から 引く 関数に 置きかえる"""
    import handcharge as HCm

    def rgbs(pal):
        return [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in pal]
    HCm.core_sprite = lambda level, pal: cell(atlas, f"core{int(round(level * (CORE_N - 1)))}", rgbs(pal))
    HCm.ring_sprite = lambda radius, pal, idx: cell(atlas, f"ring{int(round((radius - 3) / 0.5))}", rgbs(pal))
    HCm.star_sprite = lambda pal, big=True: cell(atlas, "star", rgbs(pal))


# ====================================================================== I1 はやい くつ

def build_icon():
    im = icon(ICONS["I1"][1])
    im.save(os.path.join(FX, "buff_speed.png"))
    return im


# ====================================================================== 見本シート


def icon_sheet(ic):
    sh = Sheet(1700, 900)
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
    # 板の 色の ていあん: 暗い 板だと ふち（#12304A）が 沈む → 中くらいの 青の 板（#4FA8D8）に すると ふちが はっきり 出る
    alt = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    ImageDraw.Draw(alt).rounded_rectangle([0, 0, 71, 71], radius=8, fill=(79, 168, 216, 255), outline=(244, 252, 255, 255), width=2)
    alt.alpha_composite(up(ic, 2), (20, 20) if False else (20, 20))
    cur = bm.plate(ic)
    sh.img((24 + 500, 820 - 160), up(cur, 3), "いまの 案の 板（暗い）3 倍", 13) if False else None
    sh.img((24 + 500 + 400, 520), up(alt, 4), "ていあん: 中くらいの 青い 板（#4FA8D8・ふち 白）4 倍。ふちが 沈まない", 13)
    sh.save(os.path.join(OUT, "buff-icon-i1-final.png"))



# ====================================================================== 見本シート（素材 PNG ＋ JSON から 組み直して 描く）

def crop(im, box, w=None):
    c = im.crop(box)
    if w:
        c = c.resize((w, int(c.height * w / c.width)), Image.LANCZOS if w < c.width else Image.NEAREST)
    return c


def eff_silhouette(lay, box, w):
    a = (lay.a > 0.05)
    im = Image.new("RGB", (lay.a.shape[1], lay.a.shape[0]), (232, 228, 218))
    im.paste(Image.new("RGB", im.size, (20, 22, 30)), (0, 0), Image.fromarray((a * 255).astype(np.uint8)))
    return crop(im, box, w)


def checks(sh, x, y, img, lay, box, w, now_img=None, now_label=""):
    sh.text((x, y), "確かめの 絵（シルエット・白黒・ぼかし ＋ 今の 物と ならべる）", 15, K.HEAD)
    y += 22
    tiles = [("① まっ黒の シルエット（エフェクト だけ）", eff_silhouette(lay, box, w)), ("② 白黒", K.gray(crop(img, box, w))),
             ("③ ぼかし（目を 細めて）", crop(img, box, w).filter(ImageFilter.GaussianBlur(4)))]
    if now_img is not None:
        tiles.append((now_label, now_img))
    xx = x
    for lab, t in tiles:
        sh.img((xx, y), t, lab, 12)
        xx += w + 12
    return y + 18 + tiles[0][1].height + 8


class SpiralAsset:
    def __init__(self):
        self.spec = json.load(open(os.path.join(FX, "fujin_spiral_ribbon.json"), encoding="utf-8"))
        self.tex = np.array(Image.open(os.path.join(FX, "fujin_spiral_ribbon.png")).convert("RGBA"))
        self.v = np.array(self.spec["mesh"]["vertices"], np.float64)
        self.t = self.spec["mesh"]["triangles"]
        self.av = np.array(self.spec["arcs"]["vertices"], np.float64)
        self.at = self.spec["arcs"]["triangles"]

    def band_shader(self, key):
        T = self.tex

        def sh(u, v, front, xx, yy):
            band = BAND_BACK if not front else (BAND_FRONT_KEY if key else BAND_FRONT)
            row = np.clip(np.floor(v).astype(int), 0, BAND_H - 1)
            col = np.clip(np.floor(u).astype(int), 0, TEX_W - 1)
            t = T[band + row, col]
            return t[:, :3].astype(np.float32), t[:, 3].astype(np.float32) / 255

        return sh

    def arc_shader(self):
        T = self.tex

        def sh(u, v, front, xx, yy):
            row = np.clip(np.floor(v).astype(int), ARC_TEX[1], ARC_TEX[1] + ARC_TEX[3] - 1)
            col = np.clip(np.floor(u).astype(int), ARC_TEX[0], ARC_TEX[0] + ARC_TEX[2] - 1)
            t = T[row, col]
            return t[:, :3].astype(np.float32), t[:, 3].astype(np.float32) / 255

        return sh


def render_spiral(A, shot, a, kind="grass", yaw=0.0):
    import spiral as SPm
    import scene as SCm
    cam = SCm.Cam(shot)
    B = cam.player + np.array([0, 1.4, 0])
    u = np.array([math.sin(math.radians(yaw)), 0.0, -math.cos(math.radians(yaw))])
    lay = SCm.Layer(cam)
    s, key = SPm.timeline(a)
    # ① 裏の 面 → ② 表の 面 ＋ 弧（Layer は 不透明を 上書き・半透明を まぜる。裏を 先に 描く）
    for want_front in (False, True):
        sh0 = A.band_shader(key)

        def pick(u_, v_, front, xx, yy, sh0=sh0, wf=want_front):
            col, al = sh0(u_, v_, front, xx, yy)
            return col, (al if front == wf else al * 0)
        for tri in A.t:
            P = [SPm.to_world(A.v[i][:3], a, B, u) for i in tri]
            UV = [A.v[i][3:5] for i in tri]
            lay.tri(P, UV, pick)
    if a >= 2:
        ash = A.arc_shader()
        for tri in A.at:
            P = [SPm.to_world(A.av[i][:3], a, B, u) for i in tri]
            UV = [A.av[i][3:5] for i in tri]
            lay.tri(P, UV, ash)
    pts, n = SPm.debris(a, B, u, cam.player[1], kind)
    for p, dots, col, dith in pts:
        lay.point(p, dots, col, 1.0, dith)
    r = A.spec["tip"]["big" if key else "small"]
    tip = Image.fromarray(A.tex[r[1]:r[1] + r[3], r[0]:r[0] + r[2]], "RGBA")
    lay.sprite(SPm.to_world(np.array([0.03, 0, 0]), a, B, u), tip, dot_blocks=2 / 16)
    img = SCm.composite(SCm.bg(shot), lay, cam, SCm.char_depth(cam), SCm.char_mask(SCm.bg(shot), cam))
    return img, lay, n


def spiral_sheet(A):
    import scene as SCm
    sh = Sheet(1660, 2200)
    sh.text((20, 14), "S2 らせんの かぜ 仕上げ: 素材（fujin_spiral_ribbon.png / .json）から 組み直して ゲームの スクショに 重ねた 見本", 22, K.HEAD)
    sh.text((20, 46), "すける からだ（表 0.5・裏 0.3）・不透明の ふちと 白い しま・回りの すじ 4 本・地面の 土と 草。1 点 = 1/16 ブロック。", 14)
    shots = [("bg_back", 4, (230, 150, 870, 630), "うしろ a=4（出た すぐ あと）"), ("bg_back", 14, (230, 150, 870, 630), "うしろ a=14（とんでいる）"),
             ("bg_side", 18, (380, 200, 1180, 700), "ななめ横 a=18")]
    y = 76
    x = 20
    keep = {}
    for shot, a, box, lab in shots:
        img, lay, n = render_spiral(A, shot, a)
        keep[(shot, a)] = (img, lay)
        yy = max(locals().get("yy", 0) if x > 20 else 0, sh.img((x, y), crop(img, box, 520), f"{lab}  つぶ {n} こ", 12))
        x += 540
    y = yy + 14
    sh.text((20, y), "横から 見た 動き（a = らせんの 年。出る 0-1 → のびる 2-3 → 決め 4-9 → とぶ）", 16, K.HEAD)
    y += 24
    x = 20
    for a in (1, 3, 6, 10, 14, 18, 22):
        img, _, n = render_spiral(A, "bg_side", a)
        cam = SCm.Cam("bg_side")
        c = cam.proj(cam.player + np.array([0, 1.4, 0]) + np.array([0, 0, -(1 + 0.2 * a)]))[0]
        cx, cy = int(c[0]), int(c[1])
        yy = sh.img((x, y), crop(img, (cx - 260, cy - 200, cx + 200, cy + 200), 222), f"a={a}  つぶ {n}", 12)
        x += 232
    y = yy + 14
    sh.text((20, y), "部品の 拡大 ＋ 素材", 16, K.HEAD)
    y += 24
    img, lay = keep[("bg_side", 18)]
    yy = sh.img((20, y), crop(img, (700, 290, 1000, 520), 450), "拡大: 白い しま（不透明）と すけた からだ・弧の すじ（頭 白 → しっぽ うすく）・土と 草", 12)
    tex = Image.open(os.path.join(FX, "fujin_spiral_ribbon.png")).convert("RGBA")
    tb = Image.new("RGBA", tex.size, (90, 100, 120, 255))
    tb.alpha_composite(tex)
    sh.img((490, y), up(tb, 8).crop((0, 0, 8 * 128, 8 * 32)).resize((900, 225), Image.NEAREST), "素材 128×32（すきとおりは 灰色の 下に）: 上から 表・裏・表（決め）・先の 光・弧", 12)
    gx = 1400
    for r, (nm, pal) in enumerate(json.loads(open(os.path.join(FX, "fujin_spiral_ribbon.json"), encoding="utf-8").read())["ground"]["palettes"].items()):
        sh.text((gx - 90, y + 4 + r * 30), nm, 13)
        for i, c in enumerate(pal):
            sh.d.rectangle([gx + i * 36, y + r * 30, gx + i * 36 + 30, y + r * 30 + 24], fill=K.rgb(c), outline=(90, 90, 100))
    sh.text((gx - 90, y + 130), "地面の つぶの 色（下の ブロックで えらぶ）", 12, K.SUB)
    y = yy + 14
    box = (700, 260, 1100, 560)
    y = checks(sh, 20, y, img, lay, box, 360, None) + 4
    sp = A.spec
    rows = [["かず", "値"],
            ["絵", "128×32（2 の 累乗）・5 色・アルファ 4 段（255 / 153 / 128 / 77）"],
            ["三角形", f"帯 {sp['triangles']['ribbon']} ＋ 弧 {sp['triangles']['arcs']} ＋ 先の 光 2 = {sp['triangles']['total']}（上限 150）"],
            ["描画回数", "4（裏の 面 → 表の 面＋弧 → 先の 光 → つぶ。上限 4）"],
            ["つぶ", f"THREE.Points 最大 48（同時に 出る 候補は 最大 {sp['ground']['maxLiveBeforeCap']}）。数を へらす ときは 10 こ"],
            ["回り", "1 ステップ 15 度（24 ステップで 1 回り）・半径 1.25 倍（直径 1.8）"],
            ["1 点", f"{sp['dotBlocks']} ブロック（≒ 1/16）"]]
    sh.table((20, y), rows, [140, 1100], 13, 22)
    sh.im = sh.im.crop((0, 0, 1660, y + 7 * 22 + 20))
    sh.save(os.path.join(OUT, "spiral-s2-final.png"))
    gif = []
    for a in range(0, 31, 2):
        im, _, _ = render_spiral(A, "bg_side", a)
        gif.append(crop(im, (380, 200, 1180, 700), 640).convert("P", palette=Image.ADAPTIVE, colors=128))
    gif[0].save(os.path.join(OUT, "spiral-s2-motion.gif"), save_all=True, append_images=gif[1:], duration=67, loop=0)
    print("-> spiral-s2-motion.gif")


def install_blade(atlas, spec):
    import blade as BLm
    rects = spec["sprites"]
    tbl = spec["directions"]["table"]

    def k1(theta, frame=0, n=22):
        d = int(round(math.degrees(theta)))
        d = -135 if d == 225 else d
        e = tbl[str(d)]
        x, y, w, h = rects[f"{e['sprite']}_{frame % 2}"]
        t = atlas.crop((x, y, x + w, y + h))
        if e["flipX"]:
            t = t.transpose(Image.FLIP_LEFT_RIGHT)
        if e["flipY"]:
            t = t.transpose(Image.FLIP_TOP_BOTTOM)
        return t
    BLm.KINDS["K1"] = k1
    return k1


def blade_sheet(atlas, spec, k1):
    import blade as BLm
    import scene as SCm
    sh = Sheet(1660, 1900)
    sh.text((20, 14), "K1 みかづきの 刃 仕上げ: 素材（fujin_blade.png / .json）から 描いた 見本", 22, K.HEAD)
    sh.text((20, 46), "小さな 三日月 1 まい＋うしろに すじ 2 本。カメラに 正面の 板（22×22 点 = 1.375 ブロック）・8 向きは 3 つの 絵の 反転・見た目だけ 右へ 0.4。", 14)
    y = 76
    sh.text((20, y), "素材 128×64（5 倍）: 左から 0° ・45° ・90° / 上 = コマ 1・下 = コマ 2", 14, K.HEAD)
    big = Image.new("RGBA", (128, 64), (60, 64, 80, 255))
    big.alpha_composite(atlas)
    sh.img((20, y + 22), up(big, 5).crop((0, 0, 330, 220)), None)
    # 8 向き
    x = 20 + 360
    sh.text((x, y), "8 向き（θ = 進む 向き）: 反転で 作る 絵", 14, K.HEAD)
    xx = x
    for th in (0, 45, 90, 135, 180, -135, -90, -45):
        sp = k1(math.radians(th), 0)
        b = Image.new("RGB", (22 * 4, 22 * 4), (60, 64, 80))
        bb = sp.resize(b.size, Image.NEAREST)
        b.paste(bb, (0, 0), bb)
        sh.img((xx, y + 22), b, f"{th}°", 11)
        xx += 96
    y += 22 + 18 + 22 * 5 + 20 + 120
    sh.text((20, y), "ゲームの スクショに 重ねた 絵", 14, K.HEAD)
    y += 22
    x = 20
    for shot, t, lab in (("ww_back_b", 1.5, "うしろ 1.5 マス"), ("ww_back_b", 3.5, "うしろ 3.5 マス"), ("ww_side", 1.2, "ななめ横 1.2 マス"), ("ww_side", 2.8, "ななめ横 2.8 マス")):
        img, s, th = BLm.render(shot, "K1", t)
        cx, cy = int(s[0]), int(s[1])
        sh.img((x, y), crop(img, (cx - 180, cy - 130, cx + 180, cy + 130), 390), f"{lab}（絵の 向き {th:.0f}°）", 12)
        x += 404
    y += 18 + 282 + 14
    sh.text((20, y), "横から 見た 動き: 出る（0.6 倍）→ とぶ（コマ 3 ステップごと）→ さいご 4 ステップ 網で うすく（レベル 1・2・3）", 14, K.HEAD)
    y += 22
    x = 20
    for i, t in enumerate((0.25, 0.5, 1.5, 2.5, 3.5, 4.5)):
        sc = 0.6 if i == 0 else 1.0
        img, s, th = BLm.render("ww_side", "K1", t, frame=i % 2, scale=sc)
        if i == 5:
            lay = BLm.LAST
            m = ((np.indices(lay.a.shape).sum(0)) % 4) < 2
            lay.a[m] = 0
            cam = SCm.Cam("ww_side")
            img = SCm.composite(SCm.bg("ww_side"), lay, cam, SCm.char_depth(cam), SCm.char_mask(SCm.bg("ww_side"), cam))
        sh.img((x, y), crop(img, (560, 280, 1240, 600), 262), f"{t} マス", 12)
        x += 272
    y += 18 + 136 + 14
    img, s, th = BLm.render("ww_side", "K1", 2.8)
    lay = BLm.LAST
    box = (int(s[0]) - 200, int(s[1]) - 140, int(s[0]) + 200, int(s[1]) + 140)
    now = Image.open(os.path.join(K.ROOT, "docs", "art", "WEAPON-8", "proto", "4_now_windwave.png")).convert("RGB")
    y = checks(sh, 20, y, img, lay, box, 300, crop(now, (330, 250, 730, 530), 300), "④ 今の 三日月（うしろ）")
    rows = [["かず", "値"],
            ["絵", "128×64（2 の 累乗）・5 色・半透明 0"],
            ["三角形", f"{spec['counts']['triangles']}（8 つ 同時）"], ["描画回数", "1（InstancedMesh）。今は 最大 16"],
            ["反転の ずれ", f"{spec['directions']['flipCheckMismatchPixels']} 点（0 = 描きなおしと ぴったり）"],
            ["区間", "出る 2 → とぶ 14 → きえる 4 = 20 ステップ"]]
    y = sh.table((20, y), rows, [140, 900], 13, 22)
    sh.im = sh.im.crop((0, 0, 1660, y + 20))
    sh.save(os.path.join(OUT, "blade-k1-final.png"))


def charge_sheet(atlas, spec):
    import handcharge as HCm
    sh = Sheet(1660, 1500)
    sh.text((20, 14), "ため中「手もとの 光」仕上げ: 白黒の 絵 ＋ 5 色の 表（charge_light.png / .json から 描いた）", 22, K.HEAD)
    sh.text((20, 46), "芯は 手に（直径 約 4 点）。つぶは 体の 方から 来ない。いっぱい: 手もとの 輪 1 回 ＋ 光が 剣へ 走る → 剣先に きらり。体は かくさない。", 14)
    y = 76
    L = [("ch_back_F30", "back", 30, "fujin", "集まる ためF 30"), ("ch_back_F62", "back", 62, "fujin", "ためF 62（輪・光の 走り）"),
         ("ch_back_F62", "back", 66, "fujin", "ためF 66（輪 ひろがる・きらり）"), ("ch_back_F90", "back", 90, "fujin", "いっぱい中 ためF 90"),
         ("ch_side_F90", "side", 90, "fujin", "ななめ横 ためF 90"), ("ch_back_F90", "back", 90, "raijin", "雷神剣（色だけ ちがう）")]
    x = 20
    keep = {}
    for i, (shot, view, F, pal, lab) in enumerate(L):
        img, (hx, hy), n = HCm.render(shot, view, F, pal)
        keep[i] = (img, HCm.LAST, (hx, hy))
        sh.img((x, y), crop(img, (hx - 150, hy - 90, hx + 110, hy + 230), 260), f"{lab}  つぶ {n}", 12)
        x += 270
    y += 18 + 320 + 16
    sh.text((20, y), "輪の ひろがり（ためF 60〜71 の 12 ステップ）", 15, K.HEAD)
    y += 22
    x = 20
    for F in (60, 62, 64, 66, 68, 71):
        img, (hx, hy), n = HCm.render("ch_back_F62", "back", F, "fujin")
        sh.img((x, y), crop(img, (hx - 80, hy - 60, hx + 60, hy + 80), 170), f"ためF {F}", 12)
        x += 180
    y += 18 + 170 + 16
    img, lay, (hx, hy) = keep[3]
    box = (hx - 150, hy - 90, hx + 110, hy + 230)
    y = checks(sh, 20, y, img, lay, box, 300, crop(Image.open(os.path.join(K.ROOT, "docs", "art", "WEAPON-8", "proto", "2_fujin_T1_F90.png")).convert("RGB"), (440, 310, 700, 630), 300), "④ 前の T1（胸）")
    sh.text((20, y), "素材: 白黒の 絵（128×128・4 倍）", 15, K.HEAD)
    big = Image.new("RGBA", atlas.size, (60, 66, 84, 255))
    big.alpha_composite(atlas)
    sh.img((20, y + 22), up(big, 3).crop((0, 0, 384, 300)), None)
    px0 = 450
    sh.text((px0, y), "5 色の 表（段 0 = 芯 → 4）", 15, K.HEAD)
    for r, (nm, pal) in enumerate((("風神剣", CH.WIND), ("雷神剣", CH.THUNDER))):
        sh.text((px0, y + 30 + r * 34), nm, 14)
        for i, c in enumerate(pal):
            sh.d.rectangle([px0 + 90 + i * 130, y + 28 + r * 34, px0 + 112 + i * 130, y + 50 + r * 34], fill=K.rgb(c), outline=(90, 90, 100))
            sh.text((px0 + 118 + i * 130, y + 32 + r * 34), c, 12, K.SUB)
    c = spec["counts"]
    rows = [["かず", "値"], ["絵", "128×128（2 の 累乗）・白黒 5 段（使う のは 4 段）・半透明 0"],
            ["描画回数", "2（板 3 まい 1 メッシュ ＋ Points）"], ["三角形", f"{c['triangles']}（芯・輪・きらり）"],
            ["点（Points）", f"最大 {c['points']}"], ["芯", "6 段（半径 0.5 → 1.5 点）"], ["輪", "12 コマ（半径 3 → 8.5 点）"]]
    sh.table((px0, y + 110), rows, [140, 800], 13, 24)
    sh.im = sh.im.crop((0, 0, 1660, y + 22 + 300 + 20))
    sh.save(os.path.join(OUT, "charge-hand-final.png"))


def main():
    os.makedirs(FX, exist_ok=True)
    for old in ("spiral-b-final.png", "spiral-b-motion.gif", "charge-t1-final.png"):
        p = os.path.join(OUT, old)
        if os.path.exists(p):
            os.remove(p)
    tex, spec = build_ribbon()
    batl, bspec = build_blade()
    catl, cspec = build_charge()
    mxp = finish_charge(catl, cspec)
    ic = build_icon()
    A = SpiralAsset()
    spiral_sheet(A)
    k1 = install_blade(batl, bspec)
    blade_sheet(batl, bspec, k1)
    charge_sheet(catl, cspec)
    icon_sheet(ic)
    print("spiral tris", spec["triangles"], "blade mismatch", bspec["directions"]["flipCheckMismatchPixels"], "charge points", mxp)


if __name__ == "__main__":
    main()
