"""WEAPON-8: 風神剣の ためわざ「らせんの かぜ」 3 案の 見本を 作る 道具。

- 3D の 点（スプラット）と カメラに 向く 小さな ドット絵（ビルボード）を、低い 解像度
  （1 点 = 1/8 ブロック）で 透視投影して 描き、Nearest で 拡大する。
  → よこ・うしろ（プレイヤー目線）・8 方向を 同じ 形から 作れる（見る 向きで ずるを しない）。
- 座標: x = 進む 向き、y = 上、z = よこ。
- 乱数は random.Random(seed) だけ。
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

NEAREST = Image.NEAREST
FONT_PATH = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"
DOCS = os.path.join(ROOT, "docs", "art", "WEAPON-8")
WIND_SHEET = os.path.join(ROOT, "public", "models", "fx", "windwave_sheet.png")

# ---------------------------------------------------------------- 色（5 色。今の 真空波の 4 色 ＋ 空に とけない ための こい 青 1 つ）
PAL = {
    "W1": "#F4FCFF",  # 芯（真っ白は さける）
    "W2": "#CDEFFC",  # からだ（今の E6F8FF に 近い）
    "B1": "#8FD6F2",  # からだの かげ（今の A6E4F7）
    "B2": "#4FA8D8",  # 裏・ふち（今の 62BDE6）
    "B3": "#2B6699",  # いちばん こい: 明るい 空で とけない ための ふち・裏
}
PAL_USE = {
    "W1": "芯・あたまの 光",
    "W2": "からだ（表）",
    "B1": "からだの かげ",
    "B2": "裏がわ・しっぽ",
    "B3": "ふち（空と 分ける）",
}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


C = {k: rgb(v) for k, v in PAL.items()}

INK = (236, 232, 220)
SUB = (170, 176, 196)
HEAD = (170, 226, 255)
BG = (22, 25, 38)


def font(sz):
    return ImageFont.truetype(FONT_PATH, sz)


# ---------------------------------------------------------------- ベクトル

def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a, k):
    return (a[0] * k, a[1] * k, a[2] * k)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


# ---------------------------------------------------------------- カメラ

class Cam:
    def __init__(self, pos, target, w, h, f):
        self.pos, self.w, self.h, self.f = pos, w, h, f
        self.fwd = norm(sub(target, pos))
        self.right = norm(cross(self.fwd, (0, 1, 0)))
        self.up = cross(self.right, self.fwd)

    def proj(self, p):
        v = sub(p, self.pos)
        zc = dot(v, self.fwd)
        if zc <= 0.05:
            return None
        return (self.w / 2 + self.f * dot(v, self.right) / zc, self.h / 2 - self.f * dot(v, self.up) / zc, zc)


def orbit_cam(center, yaw_deg, elev_deg, dist, w, h, ppb=8):
    """center の まわりを 回る カメラ。yaw 0 = うしろ（+x を 見る）、90 = よこ（+z がわ から）、180 = 正面"""
    ya, el = math.radians(yaw_deg), math.radians(elev_deg)
    d = (math.cos(ya) * math.cos(el), math.sin(el), -math.sin(ya) * math.cos(el))
    # d は カメラから 見て いる 向きの 逆（中心 → カメラ）
    back = (-d[0], d[1], -d[2])
    pos = add(center, mul(back, dist))
    return Cam(pos, center, w, h, ppb * dist)


# ---------------------------------------------------------------- 描く 物
# ("dot", pos, color, size_blocks)  … 3D の 点（小さな 四角）
# ("spr", pos, img RGBA, px_blocks)   … カメラに 向く ドット絵（1 点 = px_blocks ブロック）
# ("shift", depth)                      … 使わない（重ねは pos を ずらして 表す）

def render(items, cam, bg=None, outline=None):
    """items を 奥から 順に 描く。outline = 外がわ 1 点の 色（低い 解像度で）"""
    lay = Image.new("RGBA", (cam.w, cam.h), (0, 0, 0, 0))
    px = lay.load()
    rec = []
    for it in items:
        pr = cam.proj(it[1])
        if pr is None:
            continue
        rec.append((pr[2], pr, it))
    rec.sort(key=lambda r: -r[0])
    for zc, (sx, sy, _), it in rec:
        if it[0] == "dot":
            col, size = it[2], it[3]
            n = max(1, int(round(size * cam.f / zc)))
            x0, y0 = int(math.floor(sx - n / 2 + 0.5)), int(math.floor(sy - n / 2 + 0.5))
            for yy in range(y0, y0 + n):
                for xx in range(x0, x0 + n):
                    if 0 <= xx < cam.w and 0 <= yy < cam.h:
                        px[xx, yy] = col + (255,)
        else:
            img, pb = it[2], it[3]
            k = pb * cam.f / zc
            nw, nh = max(1, int(round(img.width * k))), max(1, int(round(img.height * k)))
            im2 = img.resize((nw, nh), NEAREST) if (nw, nh) != img.size else img
            _paste_clip(lay, im2, sx, sy)
    if outline is not None:
        lay = add_outline(lay, outline)
    if bg is not None:
        out = bg.convert("RGBA").copy()
        out.alpha_composite(lay)
        return out
    return lay


def _inside(lay, im, sx, sy):
    x, y = int(round(sx - im.width / 2)), int(round(sy - im.height / 2))
    return x >= 0 and y >= 0 and x + im.width <= lay.width and y + im.height <= lay.height


def _paste_clip(lay, im, sx, sy):
    x, y = int(round(sx - im.width / 2)), int(round(sy - im.height / 2))
    tmp = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    tmp.paste(im, (x, y), im)
    lay.alpha_composite(tmp)


def add_outline(lay, col):
    a = lay.split()[3]
    grow = a.filter(ImageFilter.MaxFilter(3))
    edge = Image.new("RGBA", lay.size, col + (255,))
    out = Image.new("RGBA", lay.size, (0, 0, 0, 0))
    out.paste(edge, (0, 0), grow)
    out.alpha_composite(lay)
    return out


def up(img, k):
    return img.resize((img.width * k, img.height * k), NEAREST)


# ---------------------------------------------------------------- よこから 見た 場面（昼の 空。白い 風が いちばん 見にくい 場面）

SKY_T, SKY_B = (120, 190, 240), (176, 222, 250)
GRASS, DIRT, STONE = (98, 160, 70), (128, 92, 60), (122, 124, 130)


def side_bg(w, h, ground_y):
    im = Image.new("RGBA", (w, h), SKY_T + (255,))
    d = ImageDraw.Draw(im)
    for i in range(5):
        t = i / 4
        c = tuple(int(SKY_T[k] + (SKY_B[k] - SKY_T[k]) * t) for k in range(3))
        d.rectangle([0, int(ground_y * i / 5), w, int(ground_y * (i + 1) / 5)], fill=c)
    for bx in range(0, w, 8):
        d.rectangle([bx, ground_y, bx + 7, ground_y + 7], fill=DIRT)
        d.rectangle([bx, ground_y, bx + 7, ground_y + 2], fill=GRASS)
        for by in range(ground_y + 8, h, 8):
            d.rectangle([bx, by, bx + 7, by + 7], fill=DIRT if by < ground_y + 16 else STONE)
    return im


def draw_kid_side(im, x, gy, facing=1):
    """ピンクの パーカーの 子（よこ。1 ブロック = 8 点。せたけ 約 1.8 ブロック）＋ 剣を 前へ"""
    d = ImageDraw.Draw(im)
    pink, skin, hair = (226, 26, 128), (250, 214, 180), (236, 226, 236)
    d.rectangle([x + 1, gy - 14, x + 6, gy - 9], fill=skin)
    d.rectangle([x, gy - 15, x + 7, gy - 13], fill=hair)
    d.rectangle([x, gy - 9, x + 7, gy - 3], fill=pink)
    d.rectangle([x + 1, gy - 3, x + 2, gy - 1], fill=(40, 36, 48))
    d.rectangle([x + 5, gy - 3, x + 6, gy - 1], fill=(240, 240, 240))
    d.point([(x + (5 if facing > 0 else 2), gy - 12)], fill=(40, 30, 40))
    # つきだした 剣（白〜水色の 刃）
    d.line([(x + 7, gy - 7), (x + 15, gy - 9)], fill=(214, 240, 252))
    d.point([(x + 7, gy - 7)], fill=(60, 70, 110))
    return im


# ---------------------------------------------------------------- 今の 真空波（十字の 板 2 まい）を 同じ 道具で 描く

def current_wave_items(center, frame=1, size=1.3):
    sh = Image.open(WIND_SHEET).convert("RGBA")
    tex = sh.crop((frame * 32, 0, frame * 32 + 32, 32))
    tp = tex.load()
    items = []
    t = size / 32
    for j in range(32):
        for i in range(32):
            c = tp[i, j]
            if c[3] == 0:
                continue
            u, v = (i + 0.5) / 32 - 0.5, 0.5 - (j + 0.5) / 32
            # たて板（x-y 面）と よこ板（x-z 面）
            items.append(("dot", add(center, (u * size, v * size, 0)), c[:3], t * 1.25))
            items.append(("dot", add(center, (u * size, 0, -v * size)), c[:3], t * 1.25))
    return items


# ---------------------------------------------------------------- シートの 組み立て

class Sheet:
    def __init__(self, w, h, bg=BG):
        self.im = Image.new("RGB", (w, h), bg)
        self.d = ImageDraw.Draw(self.im)

    def text(self, xy, s, sz=16, fill=INK):
        self.d.text(xy, s, font=font(sz), fill=fill)

    def img(self, xy, im, label=None, sz=14, fill=SUB):
        x, y = xy
        if label:
            self.text((x, y), label, sz, fill)
            y += sz + 6
        self.im.paste(im.convert("RGB"), (x, y))
        return y + im.height

    def palette(self, xy, sw=22):
        x, y = xy
        for k, v in PAL.items():
            self.d.rectangle([x, y, x + sw, y + sw], fill=rgb(v), outline=(90, 90, 100))
            self.text((x + sw + 8, y), f"{k} {v}", 13)
            self.text((x + sw + 8, y + 15), PAL_USE[k], 11, SUB)
            y += sw + 10
        return y

    def table(self, xy, rows, widths, sz=12, lh=17):
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
        print("->", path, self.im.size)


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


def silhouette(rgba, fg=(20, 22, 30), bg=(232, 228, 218)):
    a = rgba.split()[3].point(lambda v: 255 if v > 0 else 0)
    out = Image.new("RGB", rgba.size, bg)
    out.paste(Image.new("RGB", rgba.size, fg), (0, 0), a)
    return out


def gray(im):
    return im.convert("L").convert("RGB")


def blur(im, r=3):
    return im.convert("RGB").filter(ImageFilter.GaussianBlur(r))
