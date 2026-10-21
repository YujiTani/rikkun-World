"""ART-PIPE-1: 雷の 見本シートを 作る 道具（3 案で 共通）。

- 絵そのものは 各案の build.py が Pixel Art Studio（pixelstudio.Sprite）で 1 点ずつ 描く。
- ここは「ゲームの 中っぽい 見本の 場面」「確かめの 絵」「表」を 組む だけ。
- 1 px = 1/8 ブロック（= タイルの 2 点）。雷の コマは 48×256（よこ 6・たて 32 ブロック）。
- 乱数は random.Random(seed) だけ（毎回 同じ 絵）。
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont  # noqa: E402
from pixelstudio import Sprite, hex2rgba  # noqa: E402,F401

NEAREST = Image.NEAREST
FONT_PATH = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"
PPB = 8  # 1 ブロックの 点の 数（雷・地面の 輪）
CELL_W, CELL_H = 48, 256
DOCS = os.path.join(ROOT, "docs", "art", "ART-PIPE-1")
CUR_SHEET = os.path.join(ROOT, "public", "models", "fx", "thunder_sheet.png")
CUR_GROUND = os.path.join(ROOT, "public", "models", "fx", "thunder_ground.png")

INK = (236, 232, 220)
SUB = (170, 176, 196)
PANEL = (32, 36, 54)
BG = (22, 25, 38)


def font(sz):
    return ImageFont.truetype(FONT_PATH, sz)


def rgb(c):
    return hex2rgba(c)[:3]


# ---------------------------------------------------------------- 描く 手つだい

def stamp_line(s, x0, y0, x1, y1, w, color, only=None):
    """太さ w の 線（四角の はんこを Bresenham で おす）。ドットが 倍に ならない"""
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    a, b = w // 2, (w - 1) // 2
    while True:
        s.rect(x0 - a, y0 - a, x0 + b, y0 + b, color, only=only)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def stamp_path(s, pts, w, color, upto=None, only=None, width_fn=None):
    """点の 列を 太さ w で つなぐ。upto = 上から 何 px まで 描くか（のびる コマ）。width_fn(y) で 太さを 変えられる"""
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        if upto is not None and ya > upto:
            break
        if upto is not None and yb > upto:
            t = (upto - ya) / max(1, yb - ya)
            xb, yb = round(xa + (xb - xa) * t), upto
        ww = width_fn((ya + yb) / 2) if width_fn else w
        stamp_line(s, xa, ya, xb, yb, ww, color, only=only)


def zigzag(seed, x0, y0, y1, seg=(10, 22), amp=7, xmin=4, xmax=CELL_W - 5):
    r = random.Random(seed)
    pts = [(x0, y0)]
    x, y = x0, y0
    side = 1 if r.random() < 0.5 else -1
    while y < y1:
        y = min(y1, y + r.randint(*seg))
        x = max(xmin, min(xmax, x + side * r.randint(2, amp)))
        side = -side if r.random() < 0.8 else side
        pts.append((x, y))
    return pts


def branch_from(seed, pts, n, length=(18, 34), seg=(5, 9), min_y=40):
    """本すじから 細い 枝を n 本。外へ ひらいて 下へ"""
    r = random.Random(seed)
    out = []
    cand = [p for p in pts if p[1] > min_y]
    for k in range(n):
        if not cand:
            break
        sx, sy = cand[r.randrange(len(cand))]
        side = -1 if (k % 2 == 0) else 1
        L = r.randint(*length)
        bp = [(sx, sy)]
        x, y = sx, sy
        while y < sy + L:
            y += r.randint(*seg)
            x += side * r.randint(1, 4)
            x = max(1, min(CELL_W - 2, x))
            bp.append((x, y))
        out.append(bp)
    return out


def dither_disc(s, cx, cy, r_in, r_out, color, seed=0, only=None, pattern="bayer"):
    """足し算の にじみ: 円の 中を 内がわ べた・外がわへ だんだん まばらに（半透明は 使わない）"""
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    for y in range(int(cy - r_out), int(cy + r_out) + 1):
        for x in range(int(cx - r_out), int(cx + r_out) + 1):
            d = math.hypot(x - cx, y - cy)
            if d > r_out:
                continue
            if d <= r_in:
                s.px(x, y, color, only=only)
                continue
            t = (d - r_in) / max(0.001, (r_out - r_in))
            if bayer[y % 4][x % 4] / 16.0 >= t:
                s.px(x, y, color, only=only)


def fade_bottom(s, y_from, y_to):
    """ささる 所を うすく: y_from〜y_to を 下へ いくほど 点を ぬく（4 段の 網）。今の layer だけ"""
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    im = s._img()
    for y in range(y_from, min(y_to + 1, s.h)):
        t = (y - y_from + 1) / (y_to - y_from + 2)
        for x in range(s.w):
            if bayer[y % 4][x % 4] / 16.0 < t:
                im.putpixel((x, y), (0, 0, 0, 0))


def cel(s, frame, layer):
    return s.frames[frame - 1].cels[layer]


def frame_rgba(s, frame, layers):
    out = Image.new("RGBA", (s.w, s.h), (0, 0, 0, 0))
    for L in layers:
        out = add_img(out, cel(s, frame, L))
    return out


# ---------------------------------------------------------------- 足し算の 重ね

def add_img(base, fx, xy=(0, 0)):
    """足し算（AdditiveBlending）。fx の 透明は 0 として 足す。base も RGBA を 返す"""
    base = base.convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(fx, xy, fx)
    r, g, b, a = layer.split()
    black = Image.new("L", base.size, 0)
    rgb_l = Image.merge("RGB", (Image.composite(r, black, a), Image.composite(g, black, a), Image.composite(b, black, a)))
    br, bg_, bb, ba = base.split()
    out = ImageChops.add(Image.merge("RGB", (br, bg_, bb)), rgb_l)
    alpha = ImageChops.lighter(ba, a)
    return Image.merge("RGBA", (*out.split(), alpha))


def scale_rgb(img, k):
    """明るさを k 倍（暗く するのは 足し算の 絵の うすめ）"""
    r, g, b, a = img.convert("RGBA").split()
    f = lambda v: max(0, min(255, int(v * k)))  # noqa: E731
    return Image.merge("RGBA", (r.point(f), g.point(f), b.point(f), a))


def up(img, k):
    return img.resize((img.width * k, img.height * k), NEAREST)


# ---------------------------------------------------------------- 見本の 場面（よこから 見た ジオラマ）

SKY_TOP, SKY_BOT = (24, 30, 58), (58, 74, 104)
GRASS, GRASS_D = (92, 150, 66), (70, 120, 52)
DIRT, DIRT_D = (128, 90, 58), (100, 70, 44)
STONE = (120, 122, 128)


def scene_bg(w=200, h=300, ground=262, seed=3):
    """空の グラデーション（4 段の 帯）＋ 地面の ブロック（1 ブロック = 8 px）。少し だんだん"""
    im = Image.new("RGBA", (w, h), SKY_TOP + (255,))
    d = ImageDraw.Draw(im)
    bands = 6
    for i in range(bands):
        t = i / (bands - 1)
        c = tuple(int(SKY_TOP[k] + (SKY_BOT[k] - SKY_TOP[k]) * t) for k in range(3))
        d.rectangle([0, int(ground * i / bands), w, int(ground * (i + 1) / bands)], fill=c)
    heights = [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2]
    for bx in range(0, w // PPB + 1):
        hh = heights[bx % len(heights)]
        top = ground - hh * PPB
        for by in range(top, h, PPB):
            x0 = bx * PPB
            if by == top:
                d.rectangle([x0, by, x0 + 7, by + 7], fill=DIRT)
                d.rectangle([x0, by, x0 + 7, by + 2], fill=GRASS)
                d.point([(x0 + 2, by + 3), (x0 + 5, by + 4)], fill=GRASS_D)
            else:
                d.rectangle([x0, by, x0 + 7, by + 7], fill=DIRT if by < top + 24 else STONE)
                d.point([(x0 + 1, by + 5), (x0 + 6, by + 2)], fill=DIRT_D)
    return im


def draw_kid(im, x, gy):
    """ピンクの パーカーの 子（目安の 大きさ: 1 ブロック はば・2 ブロック 弱）"""
    d = ImageDraw.Draw(im)
    d.rectangle([x + 1, gy - 15, x + 6, gy - 10], fill=(250, 214, 180))  # 顔
    d.rectangle([x, gy - 16, x + 7, gy - 15], fill=(232, 112, 160))  # フード
    d.rectangle([x, gy - 9, x + 7, gy - 4], fill=(232, 112, 160))  # パーカー
    d.rectangle([x + 1, gy - 3, x + 2, gy - 1], fill=(60, 70, 110))
    d.rectangle([x + 5, gy - 3, x + 6, gy - 1], fill=(60, 70, 110))
    d.point([(x + 2, gy - 13), (x + 5, gy - 13)], fill=(40, 30, 40))
    return im


def light_up(im, cx, cy, radius, k, tint=(1.0, 0.96, 0.82), sky_y=None):
    """5: 出た しゅんかんの 色つきの 明るさ（ブロック・キャラ）。k = 上がる 割合（0.35 = 35%）。円の 中で 段で へる。
    空（sky_y より 上で 空の 色の 点）は 明るく しない（光が 当たるのは 物 だけ）"""
    px = im.load()
    sky = set()
    if sky_y is not None:
        bands = {tuple(int(SKY_TOP[k] + (SKY_BOT[k] - SKY_TOP[k]) * (i / 5)) for k in range(3)) for i in range(6)}
        rp = scene_bg(im.width, im.height).load()
        for y in range(im.height):
            for x in range(im.width):
                if rp[x, y][:3] in bands:
                    sky.add((x, y))
    for y in range(max(0, int(cy - radius)), min(im.height, int(cy + radius))):
        for x in range(max(0, int(cx - radius)), min(im.width, int(cx + radius))):
            d = math.hypot(x - cx, (y - cy) * 1.0) / radius
            if d >= 1 or (x, y) in sky:
                continue
            step = 1.0 if d < 0.4 else (0.6 if d < 0.7 else 0.3)  # 3 段（なめらかに しない）
            r, g, b, a = px[x, y]
            f = 1 + k * step
            px[x, y] = (min(255, int(r * f * tint[0] + 6 * step)), min(255, int(g * f * tint[1] + 5 * step)),
                        min(255, int(b * f * tint[2])), a)
    return im


def decal_side(decal_img, squash=4):
    """地面の 輪を よこから 見た 形に（見本だけの 近似。高さを 1/squash に）"""
    return decal_img.resize((decal_img.width, max(1, decal_img.height // squash)), NEAREST)


def compose_scene(bolt_rgba, decal=None, sparks=(), light=0.0, ground=262, w=200, h=300, cx=100,
                  glow=None, kid=True, bolt_w=None):
    im = scene_bg(w, h, ground)
    if kid:
        draw_kid(im, cx + 26, ground)
    if light > 0:
        light_up(im, cx, ground - 6, 64, light, sky_y=ground)
    if decal is not None:
        ds = decal_side(decal)
        im = add_img(im, ds, (cx - ds.width // 2, ground - ds.height // 2))
    if glow is not None:
        im = add_img(im, glow, (cx - glow.width // 2, ground - glow.height // 2 - 2))
    bw = bolt_w or bolt_rgba.width
    im = add_img(im, bolt_rgba, (cx - bw // 2, ground - bolt_rgba.height + 2))
    for (sx, sy, spr) in sparks:
        im = add_img(im, spr, (int(cx + sx - spr.width // 2), int(ground + sy - spr.height // 2)))
    return im


def spark_positions(seed, n, t, rise=(16, 24), spread=18):
    """つぶの 位置（着地から t の 割合 0..1）。上へ ふわっと（今の sparkAt と 同じ 形の 動き）"""
    r = random.Random(seed)
    out = []
    for _ in range(n):
        ang = r.random() * math.tau
        sp = 2 + r.random() * spread
        ri = r.uniform(*rise)
        life = r.uniform(0.6, 1.0)
        u = min(1.0, t / life)
        e = 1 - (1 - u) ** 2
        if u >= 1:
            continue
        out.append((math.cos(ang) * sp * e, -ri * e, u))
    return out


# ---------------------------------------------------------------- 今の 雷（くらべ用）

def current_frame(k=3, variant=0):
    sh = Image.open(CUR_SHEET).convert("RGBA")
    return sh.crop((k * 32, variant * 256, k * 32 + 32, variant * 256 + 256))


def current_ground():
    g = Image.open(CUR_GROUND).convert("RGBA")
    return g.crop((0, 0, 64, 64)), g.crop((64, 0, 128, 64))


def current_scene():
    glow, ring = current_ground()
    glow_s = glow.resize((24, 6), NEAREST)  # 半径 1.5 → 3 ブロック
    ring_s = ring.resize((80, 80), NEAREST)  # 半径 5
    sp = Image.new("RGBA", (1, 1), (255, 246, 208, 255))
    sparks = [(x, y, sp) for (x, y, u) in spark_positions(7, 36, 0.25)]
    return compose_scene(current_frame(), decal=scale_rgb(ring_s, 0.9), sparks=sparks, light=0.0, glow=glow_s)


# ---------------------------------------------------------------- 確かめの 絵

def kit_nearest():
    return NEAREST


def silhouette(rgba, fg=(20, 22, 30), bg=(232, 228, 218)):
    a = rgba.split()[3].point(lambda v: 255 if v > 0 else 0)
    out = Image.new("RGB", rgba.size, bg)
    out.paste(Image.new("RGB", rgba.size, fg), (0, 0), a)
    return out


def gray(im):
    return im.convert("L").convert("RGB")


def blur(im, r=3):
    return im.convert("RGB").filter(ImageFilter.GaussianBlur(r))


def view8(bolt_rgba, cross=True, cell_w=64):
    """カメラの 向き 8 つ（0°〜315°）で どう 見えるか。cross = 今の 十字の 板 2 枚、False = たて軸で カメラへ 向く 板"""
    panels = []
    for i in range(8):
        th = math.radians(i * 45 + 22.5 * 0)  # 0,45,90...
        p = Image.new("RGBA", (cell_w, bolt_rgba.height), (*BG, 255))
        if cross:
            # 板 A は x 軸ぞい（画面の よこ = u·cosθ）、板 B は z 軸ぞい（u·sinθ）。負なら 左右が 反転して 見える
            for f in (math.cos(th), math.sin(th)):
                wpx = max(1, round(bolt_rgba.width * abs(f)))
                sq = bolt_rgba.resize((wpx, bolt_rgba.height), NEAREST)
                if f < 0:
                    sq = sq.transpose(Image.FLIP_LEFT_RIGHT)
                p = add_img(p, sq, ((cell_w - sq.width) // 2, 0))
        else:
            p = add_img(p, bolt_rgba, ((cell_w - bolt_rgba.width) // 2, 0))
        panels.append(p)
    W = 8 * cell_w + 7 * 2
    out = Image.new("RGBA", (W, bolt_rgba.height), (60, 60, 70, 255))
    for i, p in enumerate(panels):
        out.paste(p, (i * (cell_w + 2), 0))
    return out


# ---------------------------------------------------------------- シートの 組み立て

class Sheet:
    def __init__(self, w, h, bg=BG):
        self.im = Image.new("RGB", (w, h), bg)
        self.d = ImageDraw.Draw(self.im)

    def text(self, xy, s, sz=18, fill=INK):
        self.d.text(xy, s, font=font(sz), fill=fill)

    def label_img(self, xy, img, label=None, sz=15, fill=SUB):
        x, y = xy
        if label:
            self.text((x, y), label, sz, fill)
            y += sz + 6
        self.im.paste(img.convert("RGB"), (x, y))
        return y + img.height

    def palette(self, xy, rows, sw=26):
        x, y = xy
        for name, hexc, use in rows:
            self.d.rectangle([x, y, x + sw, y + sw], fill=rgb(hexc), outline=(90, 90, 100))
            self.text((x + sw + 8, y + 1), f"{name} {hexc.upper()}", 14)
            self.text((x + sw + 8, y + 16), use, 12, SUB)
            y += sw + 12
        return y

    def table(self, xy, rows, widths, sz=13, lh=19):
        x0, y = xy
        for r_i, row in enumerate(rows):
            x = x0
            for c, wcol in zip(row, widths):
                self.text((x, y), str(c), sz, INK if r_i else (255, 220, 140))
                x += wcol
            y += lh
        return y

    def save(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.im.save(path)
        print("sheet ->", path, self.im.size)


CRITERIA_NAMES = {
    1: "形で分かる", 2: "明るさの差", 3: "最初に目に入る", 4: "細かさは主役だけ", 5: "さわれそう",
    6: "色の割合", 7: "色の段", 8: "色のなかま", 9: "形の言葉", 10: "ならべて浮かない",
    11: "UIの4きまり", 12: "字なしで分かる", 13: "色だけにたよらない", 14: "字の濃さ", 15: "押す所",
    16: "音・絵・字で返す", 17: "子どもっぽすぎない",
}
MOTION_NAMES = {
    1: "4区間", 2: "言葉と止め絵", 3: "次のコマで変わる", 4: "ためを見せる", 5: "当たりのポーズ",
    6: "振りぬいて止める", 7: "中心線", 8: "間をぬるくしない", 9: "後すきで見せる", 10: "キャンセル",
    11: "やりすぎくらい", 12: "つぶし・のばし", 13: "1軸で回さない", 14: "決まる立ち方", 15: "関節",
    16: "絵と当たりの場所", 17: "やられ", 18: "8方向",
}


def criteria_rows(marks, names):
    rows = [["#", "ものさし", "○△×", "わけ"]]
    for k in sorted(names):
        m = marks.get(k, ("―", ""))
        rows.append([str(k), names[k], m[0], m[1]])
    return rows


def export_atlas(s, layers, path):
    """ゲーム用の 1x: たて = 重ねの まい（layers の 順）、よこ = コマ"""
    n = s.n_frames
    out = Image.new("RGBA", (s.w * n, s.h * len(layers)), (0, 0, 0, 0))
    for li, L in enumerate(layers):
        for f in range(1, n + 1):
            out.paste(cel(s, f, L), ((f - 1) * s.w, li * s.h))
    out.save(path)
    print("atlas ->", path, out.size)
    return out


# ---------------------------------------------------------------- 1 案の 見本シート

def scene_at(P, e):
    """タイムラインの 1 こ（e）の 場面"""
    s, layers = P["sprite"], P["layers"]
    bolt = frame_rgba(s, e["f"], layers) if e.get("f") else Image.new("RGBA", (s.w, s.h), (0, 0, 0, 0))
    decal = None
    if e.get("decal"):
        di, k = e["decal"]
        decal = scale_rgb(P["decal"].composite(di), k)
    sparks = []
    if e.get("spark") is not None:
        for (x, y, u) in spark_positions(P.get("seed", 1), P["spark_n"], e["spark"]):
            spr = P["spark_img"](u)
            sparks.append((x, y, spr))
    extra = P.get("scene_extra")
    im = compose_scene(bolt, decal=decal, sparks=sparks, light=e.get("light", 0.0))
    if extra:
        im = extra(im, e)
    return im


def make_sheet(P):
    out_dir = P["out"]
    tl = P["timeline"]
    key_e = tl[P["key_i"]]
    key_scene = scene_at(P, key_e)
    cur = current_scene()
    W, H = 1800, 2560
    sh = Sheet(W, H)
    sh.text((24, 16), P["title"], 34, (255, 226, 150))
    y = 62
    for line in P["concept"]:
        sh.text((24, y), line, 18)
        y += 26

    # 段 2: 決めの コマ（場面）・今の 雷・色の表・6 つの 入れ方
    y2 = 150
    sh.label_img((24, y2), up(key_scene, 2), "決めの コマ（ゲームの 中の 見本。2 倍。1 点 = 1/8 ブロック）")
    sh.label_img((448, y2), up(cur, 2), "今の 雷 v4（同じ 場面・同じ 着地の コマ）")
    py = sh.palette((880, y2 + 22), P["palette"])
    sh.text((880, py + 6), "足し算の 絵: 暗い 色 = すける（半透明は 使わない）", 13, SUB)
    sy = y2
    sh.text((1260, sy), "ペラペラに しない 6 つ", 20, (255, 226, 150))
    sy += 32
    for i, line in enumerate(P["six"]):
        for j, part in enumerate(line.split("\n")):
            sh.text((1260 + (0 if j == 0 else 22), sy), (f"{i + 1}. " if j == 0 else "") + part, 14)
            sy += 21
        sy += 6

    # 段 3: よこから 見た 動き（タイムライン）
    y3 = 790
    sh.text((24, y3), "よこから 見た 動き（コマ と ステップ。1 ステップ = 1/60 秒。★ = 決めの コマ）", 18, (255, 226, 150))
    x = 24
    frames_gif = []
    n_tl = len(tl)
    cw = min(120, (W - 48) // n_tl // 2 - 4)  # コマが 多い ときは はばを せまく
    step = cw * 2 + 8
    for i, e in enumerate(tl):
        sc = scene_at(P, e)
        frames_gif.append((sc, e["steps"]))
        crop = sc.crop((100 - cw // 2 - 14, 110, 100 + cw // 2 - 14 + (cw % 2), 300))
        lab = ("★" if i == P["key_i"] else "") + f"{e['name']} ×{e['steps']}"
        sh.label_img((x, y3 + 30), up(crop, 2), lab, 14, INK)
        x += step
    total = sum(e["steps"] for e in tl)
    sh.text((24, y3 + 30 + 20 + 380 + 6), f"合計 {total} ステップ（{total / 60:.2f} 秒）。今の 雷は 雷 16 ＋ つぶ〜80 ステップ", 14, SUB)

    # 段 4: 絵の 部品
    y4 = 1260
    sh.text((24, y4), "部品（ゲームに 入れる 1x の 絵を 拡大。奥 → 手前）", 18, (255, 226, 150))
    x = 24
    s = P["sprite"]
    for L, name in zip(P["layers"], P["layer_names"]):
        c = cel(s, key_e["f"], L).crop((0, 96, s.w, s.h))
        bgc = Image.new("RGBA", c.size, (*BG, 255))
        sh.label_img((x, y4 + 30), up(add_img(bgc, c), 2), name, 13)
        x += s.w * 2 + 14
    bgc = Image.new("RGBA", (s.w, s.h - 96), (*BG, 255))
    allc = add_img(bgc, frame_rgba(s, key_e["f"], P["layers"]).crop((0, 96, s.w, s.h)))
    sh.label_img((x, y4 + 30), up(allc, 2), "重ねた 形", 13)
    x += s.w * 2 + 24
    dec = P["decal"]
    dimg = add_img(Image.new("RGBA", (dec.w, dec.h), (*BG, 255)), dec.composite(P.get("decal_show", 1)))
    sh.label_img((x, y4 + 30), up(dimg, 3), "4. 地面の 輪（上から。寝かせる）", 13)
    x += dec.w * 3 + 20
    sp = P["spark_img"](0.0)
    sp_bg = add_img(Image.new("RGBA", (sp.width + 2, sp.height + 2), (*BG, 255)), sp, (1, 1))
    yy = sh.label_img((x, y4 + 30), up(sp_bg, 12), "つぶ（12 倍）", 13)
    sp2 = P["spark_img"](0.7)
    sp2_bg = add_img(Image.new("RGBA", (sp2.width + 2, sp2.height + 2), (*BG, 255)), sp2, (1, 1))
    sh.label_img((x, yy + 10), up(sp2_bg, 12), "きえる ころ", 13)
    x += max(sp.width + 2, 8) * 12 + 24
    # 2. ささる 所
    bolt_k = frame_rgba(s, key_e["f"], P["layers"])
    hard = P.get("unfaded")
    if hard is not None:
        g0 = compose_scene(hard, kid=False).crop((76, 236, 124, 270))
        g1 = compose_scene(bolt_k, kid=False).crop((76, 236, 124, 270))
        yy = sh.label_img((x, y4 + 30), up(g0, 4), "2. ささる 所: うすく しない", 13)
        sh.label_img((x, yy + 10), up(g1, 4), "2. うすく した（網で 4 段）", 13)

    # 段 5: 確かめの 絵 4 枚（CRITERIA）
    y5 = 1660
    sh.text((24, y5), "確かめの 絵（CRITERIA）: ① まっ黒の シルエット ② 白黒 ③ ぼかし ④ 今の物と ならべる（段 2）", 18, (255, 226, 150))
    crop_box = (20, 60, 180, 300)
    sil = silhouette(bolt_k.crop((0, 0, s.w, s.h)))
    sh.label_img((24, y5 + 30), up(sil, 1).resize((s.w * 1, s.h), NEAREST), "①", 13)
    sh.label_img((100, y5 + 30), up(gray(key_scene).crop(crop_box), 1), "② 白黒", 13)
    sh.label_img((280, y5 + 30), up(blur(key_scene).crop(crop_box), 1), "③ ぼかし", 13)
    sh.label_img((460, y5 + 30), gray(cur).crop(crop_box), "② 今の 白黒", 13)
    # MOTION の 確かめ
    sh.text((660, y5 + 30), "MOTION: ① 予兆・決め・余韻の シルエット ② 8 方向（上 = 今の 十字 / 下 = この案）", 14, INK)
    x = 660
    for i in P["motion_sil"]:
        e = tl[i]
        b = frame_rgba(s, e["f"], P["layers"])
        sh.label_img((x, y5 + 56), silhouette(b).resize((s.w * 3 // 4, s.h * 3 // 4), kit_nearest()), e["name"], 12)
        x += s.w + 8
    v_cur = view8(current_frame().crop((0, 96, 32, 256)), cross=True, cell_w=52)
    v_new = view8(bolt_k.crop((0, 96, s.w, s.h)), cross=P.get("cross", False), cell_w=52)
    sh.label_img((x + 10, y5 + 56), v_cur, None)
    sh.label_img((x + 10, y5 + 56 + 166), v_new, None)

    # 段 6: 表
    y6 = 2060
    yy = sh.table((24, y6), [["かず", "目安"]] + P["data"], [170, 330], 13, 20)
    sh.table((560, y6), criteria_rows(P["criteria"], CRITERIA_NAMES), [24, 128, 40, 400], 12, 18)
    sh.table((1170, y6), criteria_rows(P["motion"], MOTION_NAMES), [24, 112, 40, 440], 12, 18)
    sh.save(os.path.join(out_dir, "sheet.png"))

    # 動き（GIF）
    imgs, durs = [], []
    for sc, st in frames_gif:
        imgs.append(up(sc.convert("RGB"), 2))
        durs.append(max(20, round(st * 1000 / 60)))
    imgs.append(up(scene_bg().convert("RGB"), 2))
    durs.append(600)
    imgs[0].save(os.path.join(out_dir, "scene.gif"), save_all=True, append_images=imgs[1:], duration=durs, loop=0)
    key_scene.save(os.path.join(out_dir, "key_scene.png"))
    return sh.im, key_scene
