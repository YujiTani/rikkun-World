"""WEAPON-9 v2（2026-10-23 オーナー「ドームの 絵と 斬撃も PixelLab 使いましょう」）:
白い ドームの ふち・表面の もようと にじの 斬撃の 板を「ドット絵の テクスチャ」に する 3 案の 共通の 道具。

- 下絵は PixelLab（vfx lite）`art/WEAPON-9/pixellab/v2tex/niji-<案>-dome|slash.png`。そのまま 入れない。
  下絵から もらうのは 色・もようの 形・時間の 割りふり だけ。絵は ここと 各案の build.py が 1 点ずつ 描く。
- ゲームに 入れる 形（案 3 つ とも 同じ。developer が nijiFx の シェーダーを 絵を 読む 形に 直す）:
  * まくの もよう `dome_surf_1x.png` = 88×112（1/8 ブロックの 升目。経 352 を 4 回 くりかえす・北極 90° から 下 −25° まで 112 行）。
    よこに 2 コマ（176×112）。点が ある 所 = もよう、すけ = くもりガラスの 白（今の シェーダーの 3 段の 白）。
  * ふち `dome_rim_1x.png` = 16×2。よこ = ふちの 強さ（1 − |n·v|）を 16 段、上の 行 = 色、下の 行 = 網の こさ（255 べた・128 半分・64 1/4・0 なし）。
  * 斬撃 `slash_1x.png` = 256×88（今の niji_slash.png と 同じ ならび: 上 = よこ〈side〉・下 = ねかせ〈flat〉、よこに 4 コマ）。
- 乱数は random.Random(seed) だけ（毎回 同じ 絵）。
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402
import kit9  # noqa: E402
import sheet9  # noqa: E402
from kit9 import Sprite, kit, rgb  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

# 手元（Mac）の 字。クラウドの IPA が ない とき だけ さしかえる
if not os.path.exists(kit.FONT_PATH):
    for p in ("/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc", "/System/Library/Fonts/Hiragino Sans GB.ttc"):
        if os.path.exists(p):
            kit.FONT_PATH = p
            break

ROOT = kit9.ROOT
PL = os.path.join(ROOT, "art", "WEAPON-9", "pixellab", "v2tex")
DOCS = kit9.DOCS
VERIFY = os.path.join(DOCS, "verify")
B = kit9.BAYER
TW, TH = 88, 112  # まくの もようの 1 まい
NLON, NLAT = 352, 176
D = "#3A3270"  # 昼の 空でも りんかくを 出す こい 紺（今の ドーム・斬撃と 同じ）

# ---------------------------------------------------------------- 下絵

def sketch_frames(name):
    """PixelLab の シート（よこ ならび・行 おり返し）を コマに 分ける"""
    meta = json.load(open(os.path.join(PL, f"niji-{name}.json")))
    sheet = Image.open(os.path.join(PL, f"niji-{name}.png")).convert("RGBA")
    out = []
    for f in meta["frames"]:
        r = f["frame"]
        out.append(sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])))
    return out


def sketch_strip(name, picks, k=3, bg=(40, 44, 60)):
    fr = sketch_frames(name)
    ims = [fr[i] for i in picks if i < len(fr)]
    w, h = ims[0].size
    out = Image.new("RGB", ((w * k + 6) * len(ims), h * k), bg)
    for i, im in enumerate(ims):
        b = Image.new("RGBA", im.size, (*bg, 255))
        b.alpha_composite(im)
        out.paste(b.resize((w * k, h * k), Image.NEAREST), (i * (w * k + 6), 0))
    return out


# ---------------------------------------------------------------- 絵の 手つだい

def plus_star(s, x, y, r, core, arm, only=None):
    """4 本の とげの 星（r = 1: 3×3 / r = 2: 5×5）"""
    s.px(x, y, core, only=only)
    for k in range(1, r + 1):
        c = arm if k == r else core
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            s.px(x + dx, y + dy, c, only=only)


def ring_px(s, x, y, r, color):
    """小さな あわ（わっか）。r = 1.5〜2.5"""
    for yy in range(int(y - r) - 1, int(y + r) + 2):
        for xx in range(int(x - r) - 1, int(x + r) + 2):
            d = math.hypot(xx + 0.5 - x, yy + 0.5 - y)
            if r - 0.75 <= d <= r + 0.25:
                s.px(xx % s.w, yy, color)


def ring_px_tile(s, x0, x, y, r, color):
    """あわを 1 まいの もようの 中で よこに まわりこんで 描く（x0 = コマの 左）"""
    for yy in range(int(y - r) - 1, int(y + r) + 2):
        for xx in range(int(x - r) - 1, int(x + r) + 2):
            d = math.hypot(xx + 0.5 - x, yy + 0.5 - y)
            if r - 0.75 <= d <= r + 0.25 and 0 <= yy < s.h:
                s.px(x0 + xx % TW, yy, color)


def rim_sprite(bins):
    """bins: 16 こ の (色 or None, こさ 0〜255)"""
    s = Sprite(16, 2)
    for i, (c, a) in enumerate(bins):
        if c is None or a == 0:
            continue
        s.px(i, 0, c)
        g = max(0, min(255, a))
        s.px(i, 1, "#%02X%02X%02X" % (g, g, g))
    return s


def rim_lookup(rim_img):
    a = np.asarray(rim_img.convert("RGBA"), float)
    return a[0, :, :3], a[0, :, 3] > 0, a[1, :, 0] / 255.0


def slash_px(view, tail, head, sc, thin, shape, color_fn, cap="point"):
    """1 コマの 斬撃（64×44。1 点 = 1/16 ブロック × 6/64 の 板）。shape: arc / chevron。
    view = side（よこ。半円）/ flat（うしろから。上下に 0.6 倍 つぶれた 空間で 点ごとに 計算 = 絵を あとから のばさない）"""
    s = Sprite(64, 44)
    ky = 1.0 if view == "side" else 0.6
    cx, cy, R = 32, (38 if view == "side" else 40.5), 30
    Tmax = sc * (shape.get("T", 12) if view == "side" else shape.get("T", 12) * 1.4)
    for y in range(44):
        for x in range(64):
            dx, dy = x + 0.5 - cx, (cy - (y + 0.5)) / ky
            th = math.degrees(math.atan2(dy, dx))
            if shape["kind"] == "chevron":
                # 「く」の 字（上が かど）: 外がわの 線 = 頂点(0, R) と はし(±R cos15, R sin15) を むすぶ まっすぐ。e = その 線から 内への きょり
                ex, ey = R * math.cos(math.radians(15)) * (1 if dx >= 0 else -1), R * math.sin(math.radians(15))
                vx, vy = ex, ey - R
                ln_ = math.hypot(vx, vy)
                nx, ny = -vy / ln_, vx / ln_
                if nx * (0 - 0) + ny * (0 - R) < 0:
                    nx, ny = -nx, -ny
                e = (dx - 0) * nx + (dy - R) * ny
            else:
                e = R - math.hypot(dx, dy)
            if not (15 <= th <= 165):
                continue
            q = (165 - th) / 150
            if not (tail <= q <= head):
                continue
            u = (q - tail) / max(1e-3, head - tail)
            if cap == "round":
                w = Tmax * (0.35 + 0.65 * math.sin(math.pi * u) ** 0.6) if 0.0 < u < 1.0 else 0
            elif cap == "moon":
                w = Tmax * math.sin(math.pi * u) ** 0.8  # 三日月: 両はしが とがる
            else:
                w = Tmax * (u ** 0.7) * (1.0 if u < 0.9 else max(0.35, 1 - (u - 0.9) * 6))
            if e < 0 or e > w or w < 0.6:
                continue
            f = e / max(w, 1e-3)
            if thin > 0 and B[y % 4][x % 4] < thin:
                continue
            c = color_fn(f, q, u, x, y)
            if c:
                s.px(x, y, c)
    return s


def slash_atlas(make_frame, out_dir, deco=None):
    """make_frame(view, i, tail, head, sc, thin) → Sprite。256×88（上 = side・下 = flat）。コマごとの 見た目の まん中も 出す"""
    atlas = Image.new("RGBA", (256, 88), (0, 0, 0, 0))
    frames = {"side": [], "flat": []}
    cent = {"side": [], "flat": []}
    sprites = []
    for vi, view in enumerate(("side", "flat")):
        for i, (lab, tail, head, sc, thin) in enumerate(SLASH_FRAMES):
            s = make_frame(view, i, tail, head, sc, thin)
            s.outline(D, where="outside")
            if deco:
                deco(s, view, i)
            im = s.composite(1)
            sprites.append(s)
            frames[view].append((lab, im))
            a = np.asarray(im)[..., 3] > 0
            ys, xs = np.nonzero(a)
            cent[view].append([round(float(xs.mean()) + 0.5, 1), round(float(ys.mean()) + 0.5, 1)] if len(xs) else [32, 22])
            atlas.paste(im, (64 * i, 44 * vi))
    atlas.save(os.path.join(out_dir, "slash_1x.png"))
    json.dump(cent, open(os.path.join(out_dir, "slash_centroid.json"), "w"))
    return frames, cent, sprites


SLASH_FRAMES = [("出る F0〜3", 0.0, 0.55, 0.8, 0.0), ("★決め F4〜7", 0.0, 1.0, 1.0, 0.0), ("のこり F8〜11", 0.45, 1.0, 0.8, 0.0), ("きえかけ F12〜15", 0.72, 1.0, 0.55, 0.5)]


# ---------------------------------------------------------------- ドームを 場面に 描く（ゲームの シェーダーと 同じ 読み方）

def make_render(O):
    """O: 案の 辞書（tile 画像 2 コマ・rim 画像・shift(t)・reveal(t)・inner・window・ring・orb・frag_cols）"""
    tiles = [np.asarray(O["tile"].crop((i * TW, 0, (i + 1) * TW, TH)), float) for i in range(2)]
    rim_col, rim_on, rim_den = rim_lookup(O["rim"])
    frost = np.array([0.30, 0.29, 0.27]) * 255 * np.array(O.get("frost_tint", (1.0, 1.0, 1.0)))

    def render(fr, st, t, first):
        r, feet, k = st["r"], st["feet"], st["k"]
        Cc = (0.0, feet + kit9.BODY_C, 0.0)
        q = round(k * 4) / 4
        tile = tiles[int(t * 60 // O.get("swap", 40)) % 2]
        shift = O["shift"](t)
        cam = fr.cam

        def shade(P, n, ndv, ilat, ilon, front, nlat, nlon):
            N = len(ndv)
            col = np.zeros((N, 3))
            m = np.zeros(N, bool)
            ov = np.zeros(N, bool)
            bay = B[ilat % 4, ilon % 4]
            row = (nlat - 1 - ilat)
            col_i = (ilon + shift) % TW
            inrow = (row >= 0) & (row < TH)
            px = np.zeros((N, 4))
            px[inrow] = tile[row[inrow], col_i[inrow]]
            mot = px[:, 3] > 0
            if O.get("reveal"):
                lim = O["reveal"](t, st)  # 下から 何行 まで 見せるか（0〜1）
                ln = 1 - row / TH
                mot &= ln <= lim
            if front and not first:
                rim = 1 - ndv
                bi = np.clip((rim * 16).astype(int), 0, 15)
                on = rim_on[bi] & (bay < rim_den[bi] - 1e-6)
                col[on] = rim_col[bi[on]]
                m |= on
                ov |= on
                # もよう（ふちより 下）
                sel = mot & ~on
                col[sel] = px[sel, :3]
                m |= sel
                ov |= sel
                # まどの 光（B）: カメラから 見て 左上の 三日月
                if O.get("window"):
                    vx = (n @ cam.right)
                    vy = (n @ cam.up)
                    hv = np.hypot(vx, vy)
                    wv = (vx < -0.2) & (vy > 0.25) & (hv > 0.5) & (hv < 0.66) & (np.arctan2(vy, -vx) > 0.35) & (np.arctan2(vy, -vx) < 1.25) & ~on
                    col[wv] = rgb(O["window"])
                    m |= wv
                    ov |= wv
                lvl = np.where(rim < 0.25, 3, np.where(rim < 0.5, 2, 1))
                fz = ~m
                col[fz] = frost[None, :] * (lvl[fz, None] / 3.0)
                m |= fz
            else:
                # 中から（うら面）: もようだけ 暗く・網で 半分（画面を 白く しない）
                sel = mot & (bay < O.get("inner", 0.5))
                col[sel] = px[sel, :3] * O.get("inner_k", 0.8)
                m |= sel
            col[~ov] *= q
            if q < 1:
                ov &= bay < q
                m &= (bay < q) | ~ov
            return col, m, ov

        fr.sphere(Cc, r, shade)
        rr = kit9.ground_ring_radius(r, feet)
        if rr > 0.2:
            fr.decal(O["ring_img"], 7.0 * rr / 6.4, k=q)
        if not first:
            o = 4.0 * min(1, r / 2)
            fr.sprite(O["orb_img"], Cc, o, o, additive=True, z_bias=0.4)
        pts, life = sheet9.rise_frags(11, 24, Cc, r, t)
        fc = O["frag_cols"]
        cols = np.array([rgb(fc[i % len(fc)]) for i in range(len(pts))])
        cols = np.where((life > 0.8)[:, None], rgb(O["frag_fade"]), cols)
        fr.dots(pts, cols, size_b=0.25, over=True)

    return render


def ring_img(c_out, c_mid, c_core, c_in):
    s = Sprite(112, 112)
    kit9.ring_band(s, 56, 56, 47.5, 53.5, c_out, dither_out=3)
    kit9.ring_band(s, 56, 56, 49.5, 52.0, c_mid)
    kit9.ring_band(s, 56, 56, 50.3, 51.3, c_core)
    kit9.ring_band(s, 56, 56, 40, 41, c_in)
    kit9.ring_band(s, 56, 56, 53.6, 54.8, D)
    return s


def orb_img():
    return Image.open(os.path.join(ROOT, "public", "models", "fx", "niji_orb.png")).convert("RGBA")


# ---------------------------------------------------------------- 斬撃を 場面に（子の 前に カメラ正面の 板）

def slash_scene(frame_img, view="side", size=(320, 200), yaw=None):
    yaw = (90.0 if view == "side" else 0.0) if yaw is None else yaw
    cam = kit9.third_cam(4.6, yaw, 0.0, 160, 100, pitch_deg=12.0)
    fr = kit9.Frame(cam)
    kit9.put_kid(fr, 0.0)
    fr.mark_base()
    # 体の 前（+z）2.2 マス・胸の 高さ。板 6 × 4.1 ブロック
    sc = 1.0 if view == "flat" else 0.55
    fr.sprite(frame_img, (0.0, 0.8, 2.2 if view == "flat" else 1.3), 6 * sc, 6 * sc * 44 / 64, additive="over", z_bias=-5)
    return fr, fr.image(size)


def cur_slash(view, i):
    a = Image.open(os.path.join(ROOT, "public", "models", "fx", "niji_slash.png")).convert("RGBA")
    return a.crop((64 * i, 0 if view == "side" else 44, 64 * (i + 1), 44 if view == "side" else 88))


# ---------------------------------------------------------------- 見本シート

def cur_dome_crop(size=(320, 200)):
    im = Image.open(os.path.join(VERIFY, "dome-round.png")).convert("RGB")
    return im.crop((240, 100, 1040, 600)).resize(size, Image.LANCZOS)


def make_sheet(P):
    out = P["out"]
    render = P["render"]
    SP = dict(render=render, light=0.30, tint=(1.0, 0.95, 0.8))
    fr_key, key = sheet9.scene(SP, 120)
    _, key_fp = sheet9.scene(SP, 120, first=True)
    key.save(os.path.join(out, "key_outside.png"))
    key_fp.save(os.path.join(out, "key_first.png"))
    W, H = 1800, 2900
    sh = kit.Sheet(W, H)
    G = sheet9.GOLD
    sh.text((24, 14), P["title"], 32, G)
    y = 60
    for line in P["concept"]:
        sh.text((24, y), line, 17)
        y += 25

    # 段 1: 下絵（PixelLab）
    y1 = 170
    sh.text((24, y1), "PixelLab の 下絵（vfx lite・1 generation ずつ。そのまま 入れない。もらった 所 → 右）", 16, G)
    ds = sketch_strip(P["pl"] + "-dome", P["pl_dome_frames"], k=P.get("pl_k", 2))
    sl = sketch_strip(P["pl"] + "-slash", P["pl_slash_frames"], k=P.get("pl_sk", 2))
    sh.label_img((24, y1 + 26), ds, "ドームの 下絵", 12)
    sh.label_img((24 + ds.width + 24, y1 + 26), sl, "斬撃の 下絵", 12)
    yy = y1 + 40
    xx = 24 + ds.width + sl.width + 64
    for ln in P["pl_took"]:
        sh.text((xx, yy), ln, 13)
        yy += 20

    # 段 2: 外・一人称・色
    y2 = y1 + 40 + max(ds.height, sl.height) + 20
    sh.label_img((24, y2), key, "三人称・外から（カメラ 12・とどまる F120。1 点 ≒ 1/8 ブロック）", 15)
    sh.label_img((684, y2), key_fp, "一人称・中から（うら面は もようだけ 網で）", 15)
    py = sh.palette((1344, y2 + 4), P["palette"], sw=20)
    sh.text((1344, py + 2), P["pal_note"], 12, kit.SUB)

    # 段 3: 動き（シャイニング。区間は 今と 同じ）・8 方向
    y3 = y2 + 440
    sh.text((24, y3), "ドームの 動き（区間と ステップは 今と 同じ。★ = 決め。もようの 動きだけ 案ごと）", 16, G)
    x = 24
    for name, stp, dur in sheet9.TIMELINE:
        im = sheet9.scene_t(SP, stp, (184, 115))
        sh.label_img((x, y3 + 26), im, f"{name}（{dur}）", 12, kit.INK)
        x += 194
    y3b = y3 + 170
    sh.text((24, y3b), "8 方向ならべ（外から 12）", 16, G)
    x = 24
    for i in range(8):
        _, im = sheet9.scene(SP, 120, yaw=i * 45, size=(212, 132))
        sh.label_img((x, y3b + 26), im, f"{i * 45}°", 12)
        x += 220

    # 段 4: ゲームに 入れる 絵（1x を 拡大）
    y4 = y3b + 190
    sh.text((24, y4), "ゲームに 入れる 絵（1x を 拡大。まくの もよう 88×112 × 2 コマ・ふち 16×2・地面の 輪 112×112）", 16, G)
    x = 24
    for label, img, k in P["parts"]:
        bg = Image.new("RGBA", img.size, (*P.get("part_bg", (150, 160, 176)), 255))
        bg.alpha_composite(img)
        big = bg.resize((img.width * k, img.height * k), Image.NEAREST)
        sh.label_img((x, y4 + 26), big, label, 12)
        x += big.width + 18
    # まくに はった ところ（くりかえし）
    y4b = y4 + 26 + 18 + 112 * 2 + 30

    # 段 5: 斬撃
    sh.text((24, y4b), "にじの 斬撃（256×88: 上 = よこ・下 = ねかせ。1 点 = 6/64 ブロック。3 倍。コマは 4 ステップずつ = 今と 同じ）", 16, G)
    x = 24
    for view in ("side", "flat"):
        for lab, im in P["slash"][view]:
            bg = Image.new("RGBA", im.size, (*kit.BG, 255))
            bg.alpha_composite(im)
            sh.label_img((x, y4b + 26), bg.resize((im.width * 3, im.height * 3), Image.NEAREST), f"{'よこ' if view == 'side' else 'ねかせ'} {lab}", 12)
            x += im.width * 3 + 8
        if view == "side":
            x += 10
    y5 = y4b + 26 + 18 + 132 + 20
    kf = P["slash"]["side"][1][1]
    kff = P["slash"]["flat"][1][1]
    sh.label_img((24, y5), sheet9.slash_on_sky(kf, 4), "★決め（よこ）・昼の 空の 前", 12)
    sh.label_img((24 + 256 + 16, y5), sheet9.slash_on_sky(kff, 4), "★決め（ねかせ）", 12)
    fr_s, sc_s = slash_scene(kf, "side")
    fr_f, sc_f = slash_scene(kff, "flat")
    sh.label_img((580, y5), sc_s, "ゲームの 中（横から 見た カメラ）", 12)
    sh.label_img((910, y5), sc_f, "ゲームの 中（うしろから）", 12)
    _, cur_s = slash_scene(cur_slash("side", 1), "side")
    _, cur_f = slash_scene(cur_slash("flat", 1), "flat")
    sh.label_img((1240, y5), cur_s, "今（横）", 12)
    sh.label_img((1572, y5), cur_f.resize((208, 130), Image.NEAREST), "今（うしろ）", 12)
    # 動きの 確かめ: シルエット・8 方向・よこから 見た 動き
    y6 = y5 + 240
    sh.text((24, y6), "斬撃の 確かめ（MOTION）: ① 決めの シルエット ② 8 方向（カメラの 角で よこ／ねかせ）③ よこから 見た 動き（4 コマ を 重ねる）", 16, G)
    sil = kit.silhouette(kf).resize((192, 132), Image.NEAREST)
    sh.label_img((24, y6 + 26), sil, "① シルエット", 12)
    x = 230
    for i in range(8):
        a = i * 45
        ang = a if a <= 180 else 360 - a
        view = "flat" if (ang <= 35 or ang >= 145) else "side"
        im = P["slash"][view][1][1]
        _, sc8 = slash_scene(im, view, size=(140, 88), yaw=a)
        sh.label_img((x, y6 + 26), sc8, f"{a}° {('ねかせ' if view == 'flat' else 'よこ')}", 11)
        x += 146
    onion = Image.new("RGBA", (64, 44), (*kit.BG, 255))
    for lab, im in P["slash"]["side"]:
        onion.alpha_composite(im)
    sh.label_img((x + 10, y6 + 26), onion.resize((192, 132), Image.NEAREST), "③ 4 コマ 重ね", 12)

    # 段 6: 確かめの 絵（CRITERIA）
    y7 = y6 + 190
    sh.text((24, y7), "確かめの 絵: ① まっ黒の シルエット ② 白黒 ③ ぼかし ④ 今の 白い ドームと ならべる（ゲームの スクショ dome-round）", 16, G)
    cs = (320, 200)
    sh.label_img((24, y7 + 26), kit9.silhouette_from(fr_key, cs), "① シルエット（エフェクトだけ）", 12)
    sh.label_img((354, y7 + 26), kit9.gray(key).resize(cs, Image.NEAREST), "② 白黒", 12)
    sh.label_img((684, y7 + 26), kit9.blur(key.resize(cs, Image.NEAREST), 3), "③ ぼかし", 12)
    sh.label_img((1014, y7 + 26), cur_dome_crop(cs), "④ 今（ゲーム）", 12)
    sh.label_img((1344, y7 + 26), key.resize(cs, Image.NEAREST), "④ この 案", 12)

    # 段 7: 表
    y8 = y7 + 270
    yy = sh.table((24, y8), [["かず", "見こみ"]] + P["data"], [130, 380], 12, 18)
    yy += 10
    sh.text((24, yy), "ペラペラに しない 6 つ（PIPELINE 3 章）", 13, G)
    yy += 20
    for i, ln in enumerate(P["six"]):
        sh.text((24, yy), f"{i + 1}. {ln}", 12)
        yy += 18
    yy += 8
    sh.table((24, yy), [["区間（斬撃）", "コマ", "ステップ"]] + P["slash_table"], [160, 60, 300], 12, 18)
    sh.table((560, y8), kit.criteria_rows(P["criteria"], kit.CRITERIA_NAMES), [24, 120, 36, 420], 12, 18)
    sh.table((1170, y8), kit.criteria_rows(P["motion"], kit.MOTION_NAMES), [24, 110, 36, 460], 12, 18)
    sh.save(os.path.join(out, "sheet.png"))
    return key, key_fp, fr_key


# ---------------------------------------------------------------- 1 案を まとめて 作る

def run(O, P):
    """O: 絵の 部品（tile_fn・rim_bins・slash_frame・slash_deco・ring・…）。P: シートの 字。
    書き出し: dome_surf_1x.png・dome_rim_1x.png・slash_1x.png・ring_1x.png・slash_centroid.json・sheet.png・key_*.png"""
    out = P["out"]
    os.makedirs(out, exist_ok=True)
    tile = O["tile_fn"]()  # Sprite 176×112
    tile.save_png(os.path.join(out, "dome_surf_1x.png"))
    rim = rim_sprite(O["rim_bins"])
    rim.save_png(os.path.join(out, "dome_rim_1x.png"))
    ring = ring_img(*O["ring"])
    ring.save_png(os.path.join(out, "ring_1x.png"))
    frames, cent, sprites = slash_atlas(O["slash_frame"], out, O.get("slash_deco"))
    R = dict(O)
    R["tile"] = tile.composite(1)
    R["rim"] = rim.composite(1)
    R["ring_img"] = ring.composite(1)
    R["orb_img"] = orb_img()
    P["render"] = make_render(R)
    P["slash"] = frames
    # 1 枚の まくの 絵を 4 回 ならべた 見本（経 352）
    strip = Image.new("RGBA", (TW * 4, TH), (0, 0, 0, 0))
    t1 = R["tile"].crop((0, 0, TW, TH))
    for i in range(4):
        strip.alpha_composite(t1, (i * TW, 0))
    P["parts"] = [("まくの もよう 1x（2 コマ）", R["tile"], 2), ("ふち 16×2（上 = 色・下 = 網の こさ）", R["rim"], 8),
                  ("地面の 輪", R["ring_img"], 2)]
    key, key_fp, fr_key = make_sheet(P)
    # 色の 数・半透明
    imgs = [R["tile"], R["ring_img"]] + [im for v in frames.values() for _, im in v]
    nsl = kit9.count_colors([im for v in frames.values() for _, im in v])
    ntile = kit9.count_colors([R["tile"]])
    print(P["out"], "slash colors", nsl, "tile colors", ntile, "semi", kit9.semi_alpha(imgs))
    return dict(key=key, key_fp=key_fp, frames=frames, cent=cent, tile=R["tile"], rim=R["rim"])
