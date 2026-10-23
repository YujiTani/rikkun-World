"""LIVE-2 こたつ 2×2（I3 たまご こたつ・ななめ ふとん 案 C「ふくらむ すそ」。2026-10-23 オーナーが C を えらんだ）。Pixel Art Studio で 1 点ずつ。

依頼: docs/art/requests/LIVE-2-kotatsu.md（案 C）。
形の 目安（1/16 ブロック = 1 点）は src/world/blocks/kotatsu.ts に 合わせる:
  足もと 32×32・高さ 16。KOTATSU_RUN（天板の ふち → 足もと）= 6 点（0.375。今の 0.4 = 6.4 点は 点が ずれるので 0.375 を すすめる）。
  天板 = 20×20（まわり 6 点 内がわ、高さ 16）。ふとん = 台形 4 まい（上 20・下 32・高さ 16）。
PixelLab は 使わない（依頼書の とおり 0 回）。
実行: python3 art/LIVE-2-kotatsu/kotatsu/build.py
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))
from pixelstudio import Sprite  # noqa: E402

# I3 の 色（DESIGN 16.15）。futonD は コードに ある 色（DESIGN には オーナー確認待ちで 足す）
C = {
    "futon": "#3D5A9E", "futonL": "#5B7BC4", "futonD": "#2F4780", "hem": "#EFE7D4",
    "plate": "#A87B4F", "plateEdge": "#7A5434", "grain": "#9C7040",
    "mikan": "#F0902A", "mikanD": "#C86E14", "leaf": "#6E9A3A",
    "egg": "#F5ECD8", "eggD": "#E2D6B8",
}
RUN = 6          # 天板の ふち → 足もと（点）
FOOT = 32        # 足もと 32×32
TOP = FOOT - 2 * RUN  # 天板 20×20
H = 16           # 高さ


def sprite(w, h):
    return Sprite(w, h, palette=list(C.values()))


# ---------- 1. 天板 20×20 ----------
def draw_top():
    s = sprite(TOP, TOP)
    s.rect(0, 0, TOP - 1, TOP - 1, C["plate"])
    s.rect(0, 0, TOP - 1, TOP - 1, C["plateEdge"], fill=False)
    for y in (5, 10, 15):                      # 木目 よこ 3 本（とぎれ とぎれ）
        for x in range(2, TOP - 2):
            if (x + y) % 5 != 0:
                s.px(x, y, C["grain"])
    cx, cy = 14, 5                             # みかん（右おく）
    for y in range(cy - 2, cy + 3):
        for x in range(cx - 2, cx + 3):
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy <= 5:
                s.px(x, y, C["mikanD"] if dx + dy > 1 else C["mikan"])
    s.px(cx, cy - 3, C["leaf"]); s.px(cx + 1, cy - 3, C["leaf"])
    return s


# ---------- 2. ななめ ふとん 32×16（台形。外は すける） ----------
def in_trap(x, y):
    """台形（上 6..25 → 下 0..31）。絵は 台形の 外も 同じ 絵で うめる（UV の はしで すけた 点を ひろわない）。
    なので いつも True。l は 台形の 左の はし（ふちの 目安）"""
    l = round(RUN * (1 - y / (H - 1)))
    return True, l


HEM = 4  # 案 C: すそは 下 4 点（今の 2 点の 倍）


def draw_slope():
    s = sprite(FOOT, H)
    for y in range(H):
        for x in range(FOOT):
            ok, l = in_trap(x, y)
            if not ok:
                continue
            c = C["futon"]
            if (x + y * 2) % 6 == 0:             # もようは 今の まま（6 点に 1 つ、ななめ）
                c = C["futonL"]
            if y == 0:
                c = C["futonD"]                  # 天板の 下の かげの 帯
            s.px(x, y, c)
    # すそ（下 4 点・生成り）。上の ふちは 8 点ごとに 1 点 ふくらむ（布の 波）。すその 上に こい 藍の 線 1 本
    for y in range(H - HEM, H):
        for x in range(FOOT):
            if in_trap(x, y)[0]:
                s.px(x, y, C["hem"])
    for x in range(FOOT):
        if in_trap(x, H - HEM - 1)[0]:
            bump = x % 8 in (3, 4)
            s.px(x, H - HEM - 1, C["hem"] if bump else C["futonD"])
            if bump:
                s.px(x, H - HEM - 2, C["futonD"])
    # すその 中の 縫い目（1 点 こい 生成り = 天板の ふちの 木では なく eggD）
    for x in range(1, FOOT - 1, 3):
        if in_trap(x, H - 2)[0]:
            s.px(x, H - 2, C["eggD"])
    return s


# ---------- 3. 角の たまり 8×8（地面に ひろがる 布。三角 2 まいで 使う） ----------
# u = 0 が 角の 頂上（すその 角）、u = 7 が 外へ 出た 先。v は たまりの はば。外の 2 辺に すそ 2 点。
def draw_corner():
    s = sprite(8, 8)
    for y in range(8):
        for x in range(8):
            if True:  # 8×8 ぜんぶ うめる（UV は 三角 P(0,0)・Tip(0,8)・へり(8,0)。x + y >= 4 が すその たまり）
                c = C["futon"]
                if x + y >= 4:
                    c = C["hem"]
                elif (x + y * 2) % 6 == 0:
                    c = C["futonL"]
                s.px(x, y, c)
    for y in range(0, 3):                         # おりめ（x = 0 の 列 = たまりの 背すじ。光は 左上なので こい 藍）
        s.px(0, y, C["futonD"])
    return s


# ---------- 4. すそ 32×4（ふとんの 絵の 下 4 行と 同じ。別の 面に する とき 用） ----------
def draw_hem():
    s = sprite(FOOT, HEM)
    s.rect(0, 0, FOOT - 1, HEM - 1, C["hem"])
    for x in range(1, FOOT - 1, 3):
        s.px(x, HEM - 2, C["eggD"])
    return s


# ---------- 5. のぞく たまご 8×8（下半分。2 まい: ふつう・ひび） ----------
def draw_egg(crack=False):
    s = sprite(8, 8)
    for y in range(8):
        for x in range(8):
            dx, dy = (x - 3.5) / 3.6, (y + 0.5) / 6.2
            if dx * dx + dy * dy <= 1:
                s.px(x, y, C["eggD"] if (dx > 0.35 or dy > 0.75) else C["egg"])
    if crack:
        for (x, y) in ((2, 1), (3, 2), (4, 1), (5, 2)):
            s.px(x, y, C["plateEdge"])
    return s


def img(s):
    return s.composite(1).copy()


# ---------- 見本: 2×2 を ななめ上から 描く（ソフトの ラスタライズ） ----------
TAM_UP, TAM_OUT, TAM_IN = 1.5, 3, 6


def render(top, slope, egg, corner, scale=6, yaw=35, pitch=32):
    tex_t, tex_s, tex_e, tex_c = (np.array(i) for i in (top, slope, egg, corner))
    a, p = np.radians(yaw), np.radians(pitch)
    def proj(v):
        x, y, z = v[0] - 16, v[1], v[2] - 16
        x1 = x * np.cos(a) - z * np.sin(a); z1 = x * np.sin(a) + z * np.cos(a)
        y2 = y * np.cos(p) - z1 * np.sin(p); z2 = y * np.sin(p) + z1 * np.cos(p)
        return np.array([x1, -y2, z2])
    quads = []  # (4 頂点 3D, 4 uv（点）, tex, 明るさ)
    T0, T1 = RUN, FOOT - RUN
    quads.append(([(T0, H, T0), (T1, H, T0), (T1, H, T1), (T0, H, T1)], [(0, 0), (TOP, 0), (TOP, TOP), (0, TOP)], tex_t, 1.0))
    sides = {  # 名前: (上の 2 点, 下の 2 点, 明るさ DESIGN 3.1)
        "s": ([(T0, H, T1), (T1, H, T1)], [(0, 0, FOOT), (FOOT, 0, FOOT)], 0.8),
        "n": ([(T1, H, T0), (T0, H, T0)], [(FOOT, 0, 0), (0, 0, 0)], 0.8),
        "e": ([(T1, H, T1), (T1, H, T0)], [(FOOT, 0, FOOT), (FOOT, 0, 0)], 0.6),
        "w": ([(T0, H, T0), (T0, H, T1)], [(0, 0, 0), (0, 0, FOOT)], 0.6),
    }
    for (t0, t1), (b0, b1), lum in sides.values():
        quads.append(([t0, t1, b1, b0], [(RUN, 0), (FOOT - RUN, 0), (FOOT, H), (0, H)], tex_s, lum))
    # 角の たまり（案 C）: 角ごとに 三角 2 まい。P = 角の 上 1.5 点、Tip = 外へ ななめ 3 点、A・B = 角から へりに そって 5 点 内
    for (cx, cz, sx, sz) in ((0, 0, -1, -1), (FOOT, 0, 1, -1), (FOOT, FOOT, 1, 1), (0, FOOT, -1, 1)):
        Pp = (cx, TAM_UP, cz); Tp = (cx + sx * TAM_OUT, 0.05, cz + sz * TAM_OUT)
        Ap = (cx - sx * TAM_IN, 0.05, cz); Bp = (cx, 0.05, cz - sz * TAM_IN)
        for side in (Ap, Bp):
            lum = 0.8 if side is Ap else 0.6
            quads.append(([Pp, Tp, side, side], [(0, 0), (0, 7.9), (7.9, 0), (7.9, 0)], tex_c, lum))
    # たまご（前の すそ まん中、すこし 前）
    quads.append(([(12, 6, FOOT + 0.6), (20, 6, FOOT + 0.6), (20, -2, FOOT + 0.6), (12, -2, FOOT + 0.6)], [(0, 0), (8, 0), (8, 8), (0, 8)], tex_e, 0.95))
    W, Hh = 64 * scale, 48 * scale
    col = np.zeros((Hh, W, 4), np.uint8); col[..., :3] = (205, 205, 200); col[..., 3] = 255
    zb = np.full((Hh, W), -1e9)
    off = np.array([W / 2, Hh * 0.55])
    ys, xs = np.mgrid[0:Hh, 0:W]
    for verts, uvs, tex, lum in quads:
        P = [proj(np.array(v, float)) for v in verts]
        for tri in ((0, 1, 2), (0, 2, 3)):
            pa, pb, pc = (P[i][:2] * scale + off for i in tri)
            za = [P[i][2] for i in tri]; ua = [np.array(uvs[i], float) for i in tri]
            d = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1])
            if abs(d) < 1e-9:
                continue
            w0 = ((pb[1] - pc[1]) * (xs + .5 - pc[0]) + (pc[0] - pb[0]) * (ys + .5 - pc[1])) / d
            w1 = ((pc[1] - pa[1]) * (xs + .5 - pc[0]) + (pa[0] - pc[0]) * (ys + .5 - pc[1])) / d
            w2 = 1 - w0 - w1
            m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            z = w0 * za[0] + w1 * za[1] + w2 * za[2]
            u = w0 * ua[0][0] + w1 * ua[1][0] + w2 * ua[2][0]
            v = w0 * ua[0][1] + w1 * ua[1][1] + w2 * ua[2][1]
            ti = np.clip(u.astype(int), 0, tex.shape[1] - 1); tj = np.clip(v.astype(int), 0, tex.shape[0] - 1)
            texel = tex[tj, ti]
            m &= (texel[..., 3] > 0) & (z > zb)
            col[m, :3] = (texel[m, :3] * lum).astype(np.uint8); zb[m] = z[m]
    return Image.fromarray(col, "RGBA")


def label(im, text):
    d = ImageDraw.Draw(im); d.rectangle([0, 0, len(text) * 6 + 6, 12], fill=(255, 255, 255, 255)); d.text((3, 1), text, fill=(30, 30, 30, 255))
    return im


def main():
    parts = {
        "kotatsu_top": draw_top(), "kotatsu_slope": draw_slope(), "kotatsu_corner": draw_corner(),
        "kotatsu_hem": draw_hem(), "kotatsu_egg_peek": draw_egg(), "kotatsu_egg_peek_crack": draw_egg(True),
    }
    for name, s in parts.items():
        s.save_png(os.path.join(HERE, f"{name}_1x.png"))
        st = s.stats(print_=False)
        print(name, st["size"], "colors", st["colors_used"], "semi", st.get("semi_alpha"), "dups", st.get("near_dups"))
    # 天板を 32×32 の 上から 見た 形（16×16 の タイル 4 まいに 切れる。まわり 6 点 = 上から 見た ふとん）
    top32 = Image.new("RGBA", (FOOT, FOOT), (0, 0, 0, 0))
    d = ImageDraw.Draw(top32)
    d.rectangle([0, 0, FOOT - 1, FOOT - 1], fill=C["futon"])
    for i in range(FOOT):  # 角の ひだ（上から 見た ななめ）
        if i < RUN or i >= FOOT - RUN:
            for (x, y) in ((i, i), (FOOT - 1 - i, i)):
                top32.putpixel((x, y), Image.new("RGBA", (1, 1), C["futonD"]).getpixel((0, 0)))
    d.rectangle([0, FOOT - 1, FOOT - 1, FOOT - 1], fill=C["hem"]); d.rectangle([0, 0, FOOT - 1, 0], fill=C["hem"])
    d.rectangle([0, 0, 0, FOOT - 1], fill=C["hem"]); d.rectangle([FOOT - 1, 0, FOOT - 1, FOOT - 1], fill=C["hem"])
    top32.paste(img(parts["kotatsu_top"]), (RUN, RUN))
    top32.save(os.path.join(HERE, "kotatsu_top_32_1x.png"))

    # preview.png: 1 倍の 絵を 8 倍で ならべる
    sc = 8
    tiles = [("top 20x20", img(parts["kotatsu_top"])), ("slope 32x16", img(parts["kotatsu_slope"])),
             ("corner 8x8", img(parts["kotatsu_corner"])), ("hem 32x4", img(parts["kotatsu_hem"])),
             ("egg 8x8", img(parts["kotatsu_egg_peek"])), ("egg crack", img(parts["kotatsu_egg_peek_crack"])),
             ("top-down 32x32", top32)]
    W = sum(t.width * sc + 16 for _, t in tiles) + 16
    pv = Image.new("RGBA", (W, 34 * sc), (232, 228, 218, 255))
    x = 16
    for name, t in tiles:
        big = t.resize((t.width * sc, t.height * sc), Image.NEAREST)
        pv.alpha_composite(big, (x, 24)); ImageDraw.Draw(pv).text((x, 6), name, fill=(40, 40, 40, 255)); x += big.width + 16
    pv.save(os.path.join(HERE, "preview.png"))

    # sheet.png: ななめ上 ＋ 横 ＋ 今の こたつ ＋ CRITERIA の 確かめ（シルエット・白黒・ぼかし）
    view = render(img(parts["kotatsu_top"]), img(parts["kotatsu_slope"]), img(parts["kotatsu_egg_peek"]), img(parts["kotatsu_corner"]))
    side = render(img(parts["kotatsu_top"]), img(parts["kotatsu_slope"]), img(parts["kotatsu_egg_peek"]), img(parts["kotatsu_corner"]), yaw=0, pitch=12)
    far = render(img(parts["kotatsu_top"]), img(parts["kotatsu_slope"]), img(parts["kotatsu_egg_peek"]), img(parts["kotatsu_corner"]), scale=2)
    far = far.resize((far.width * 3, far.height * 3), Image.NEAREST)
    bg = np.array(view)[..., :3]
    sil = Image.fromarray(np.where((np.abs(bg.astype(int) - [205, 205, 200]).sum(-1) > 6)[..., None], [34, 36, 46], [232, 228, 218]).astype(np.uint8)).convert("RGBA")
    gray = ImageOps.grayscale(view).convert("RGBA")
    blur = view.filter(ImageFilter.GaussianBlur(6))
    old = Image.open(os.path.join(ROOT, "docs", "screenshots", "LIVE-2", "01-kotatsu-egg.png")).convert("RGBA").crop((630, 200, 800, 345))
    old = old.resize((old.width * 2, old.height * 2), Image.NEAREST)
    cells = [("C naname (3/4)", view), ("C side", side), ("far x1/3", far), ("now 1x1", old),
             ("silhouette", sil), ("gray", gray), ("blur", blur)]
    cw, ch = view.width, view.height
    sheet = Image.new("RGBA", (cw * 4 + 50, ch * 2 + 30), (245, 242, 235, 255))
    for i, (n, im) in enumerate(cells):
        cx, cy = 10 + (i % 4) * (cw + 10), 10 + (i // 4) * (ch + 10)
        im2 = im.copy(); im2.thumbnail((cw, ch), Image.NEAREST)
        sheet.alpha_composite(label(im2.copy(), n), (cx, cy))
    sheet.save(os.path.join(HERE, "sheet.png"))
    os.makedirs(os.path.join(ROOT, "docs", "art", "LIVE-2"), exist_ok=True)
    sheet.save(os.path.join(ROOT, "docs", "art", "LIVE-2", "kotatsu-C.png"))


if __name__ == "__main__":
    main()
