"""ICON-64 プロトタイプ: 64x64 アイテムアイコン 8 点（docs/design/ICON-64.md）。
毎回 同じ 絵が できる（乱数なし）。出力: art/ICON-64/proto/<id>.png と 見本シート。
使い方: python3 art/ICON-64/build.py [シートの 出力先]
"""
import json, math, os, sys
from PIL import Image

N = 64  # アイコンの 大きさ（ICON_SIZE。ゲーム側の 定数と そろえる）
HERE = os.path.dirname(os.path.abspath(__file__))
OUTLINE = (0x2A, 0x1E, 0x14, 255)  # いまの 16x16 と 同じ ふち色

def hx(s, a=255):
    s = s.lstrip('#'); return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)

def ramp(dark, mid, light, hi=None):
    return [hx(dark), hx(mid), hx(light), hx(hi) if hi else hx(light)]

# ---------- 形（マスク = set of (x,y)） ----------
def inside_poly(pts, x, y):
    c = False; j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]; xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
        j = i
    return c

def poly(pts):
    return {(x, y) for y in range(N) for x in range(N) if inside_poly(pts, x + .5, y + .5)}

def ellipse(cx, cy, rx, ry):
    return {(x, y) for y in range(N) for x in range(N) if ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1}

def capsule(x0, y0, x1, y1, r):
    dx, dy = x1 - x0, y1 - y0; L = dx * dx + dy * dy
    out = set()
    for y in range(N):
        for x in range(N):
            px, py = x + .5, y + .5
            t = max(0, min(1, ((px - x0) * dx + (py - y0) * dy) / L))
            if (px - x0 - t * dx) ** 2 + (py - y0 - t * dy) ** 2 <= r * r: out.add((x, y))
    return out

def rect(x0, y0, x1, y1):
    return {(x, y) for y in range(y0, y1) for x in range(x0, x1)}

# ---------- 絵の 組み立て ----------
class Icon:
    """部品を 下から 順に かさねる。部品ごとに 3 段の かげ（左上から 光）・部品の さかいに こい線・さいごに 外の ふち 1px"""
    def __init__(self):
        self.px = {}       # (x,y) -> rgba
        self.part = {}     # (x,y) -> 部品の 番号
        self.parts = []    # (mask, ramp)

    def add(self, mask, rmp, k=4, flat=False, cyl=None):
        idx = len(self.parts); self.parts.append((mask, rmp))
        for (x, y) in mask:
            if flat: t = 1
            elif cyl is not None:  # 円柱: 軸に 直角な きょりで 3 段
                ax, ay = cyl; d = (x * ay - y * ax)
                t = 1
                lo = min((p[0] * ay - p[1] * ax) for p in mask); hi = max((p[0] * ay - p[1] * ax) for p in mask)
                f = (d - lo) / max(1e-6, hi - lo)
                t = 2 if f < .35 else (1 if f < .75 else 0)
            else:
                lit = (x - k, y - k) not in mask
                shade = (x + k, y + k) not in mask
                t = 2 if lit and not shade else (0 if shade and not lit else 1)
            self.px[(x, y)] = rmp[t]; self.part[(x, y)] = idx
        return idx

    def paint(self, mask, c):
        for p in mask:
            if p in self.px: self.px[p] = c

    def selout(self):
        """部品の さかい: 下の 部品の 色を その 部品の いちばん こい 色に"""
        add = {}
        for (x, y), i in self.part.items():
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                j = self.part.get((x + dx, y + dy))
                if j is not None and j > i: add[(x, y)] = self.parts[i][1][0]; break
        self.px.update(add)

    def finish(self):
        self.selout()
        img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            if 0 <= x < N and 0 <= y < N: img.putpixel((x, y), c)
        # 外の ふち 1px（8 方向）
        src = img.copy()
        for y in range(N):
            for x in range(N):
                if src.getpixel((x, y))[3]: continue
                if any(0 <= x + dx < N and 0 <= y + dy < N and src.getpixel((x + dx, y + dy))[3]
                       for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                    img.putpixel((x, y), OUTLINE)
        return img

def spark(icon, x, y, c=(255, 255, 255, 255)):
    icon.paint({(x, y), (x + 1, y), (x, y + 1)}, c)

# ---------- 色の 家族（めずらしさ・素材で 色を わける） ----------
WOOD = ramp('#6b4423', '#9a6a3a', '#c48b52')
IRON = ramp('#5b6770', '#93a1ab', '#d3dde3', '#ffffff')
STEEL = ramp('#6f7f8c', '#b8c6d0', '#eef4f8', '#ffffff')
GOLDR = ramp('#9a6b12', '#e0a82e', '#ffe08a')
NAVY = ramp('#1d2440', '#2f3a66', '#4b5a92')
RED = ramp('#9e1f1a', '#e0402f', '#ff8a70', '#ffffff')
LEAF = ramp('#23652b', '#3f9c3a', '#7fd25a')
WATER = ramp('#1b6aa8', '#3fa2e6', '#9fdcff', '#ffffff')
ROPE = ramp('#7a5a2c', '#b78f4f', '#e2c48a')
ARMOR = ramp('#3a2a2a', '#6e3b3b', '#a65a4f')

def iron_pickaxe():
    i = Icon()
    i.add(capsule(12, 54, 46, 20, 3.2), WOOD, cyl=(34, -34))
    head = poly([(6, 28), (16, 14), (32, 7), (50, 8), (60, 18), (56, 22), (46, 16), (34, 15), (22, 20), (11, 31)])
    i.add(head, IRON, k=3)
    i.add(rect(40, 12, 47, 22) & poly([(39, 14), (45, 10), (49, 16), (43, 22)]), IRON, flat=True)
    spark(i, 30, 12)
    return i.finish()

def katana():
    i = Icon()
    blade = poly([(55, 3), (61, 5), (60, 10), (27, 43), (20, 37)])
    i.add(blade, STEEL, k=2)
    i.paint({(x, y) for (x, y) in blade if abs((x + y) - 64) <= 0 and x > 24}, STEEL[3])  # はもん
    i.add(ellipse(22, 42, 7, 7), GOLDR, k=2)  # つば
    hilt = capsule(8, 56, 19, 45, 3.6)
    i.add(hilt, NAVY, cyl=(11, -11))
    i.paint({(x, y) for (x, y) in hilt if (x + 2 * y) % 6 == 0}, GOLDR[2])  # ひしまき
    spark(i, 50, 10)
    return i.finish()

def iron_ingot():
    i = Icon()
    i.add(poly([(8, 34), (20, 22), (56, 22), (56, 30), (44, 46), (8, 46)]), IRON, flat=True)
    i.add(poly([(8, 34), (20, 22), (56, 22), (44, 34)]), [IRON[2]] * 4, flat=True)  # 上の 面
    i.add(poly([(44, 34), (56, 22), (56, 30), (44, 46)]), [IRON[0]] * 4, flat=True)  # 横の 面
    spark(i, 22, 26); spark(i, 27, 25)
    return i.finish()

def tomato():
    i = Icon()
    i.add(ellipse(32, 36, 22, 20), RED, k=6)
    star = poly([(32, 12), (35, 19), (44, 17), (38, 23), (42, 29), (32, 25), (22, 29), (26, 23), (20, 17), (29, 19)])
    i.add(star, LEAF, k=2)
    i.add(capsule(32, 8, 33, 16, 1.6), LEAF, flat=True)
    i.paint(ellipse(22, 30, 4, 3), RED[3])
    return i.finish()

def grass_block(old):
    """ブロックの アイテム = 16x16 の タイルを 斜めの 箱に はる（上 1・左 0.8・右 0.6 の 明るさ）"""
    top, side = old['tile:grass_top'], old['tile:grass_side']
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    cx, cy, s = 32, 6, 26  # 上の 頂点・ひし形の 半分の はば
    h = 13  # ひし形の 半分の 高さ
    for y in range(N):
        for x in range(N):
            px, py = x + .5 - cx, y + .5 - cy
            # 上の 面: (u,v) in [0,1]
            u = (px / s + py / h) / 2; v = (py / h - px / s) / 2
            if 0 <= u < 1 and 0 <= v < 1:
                c = top[int(v * 16) * 16 + int(u * 16)]; img.putpixel((x, y), tuple(c)); continue
            # 左の 面
            if px < 0:
                u = (px + s) / s; w = py - h - (-px) * h / s * -1 + 0
                vv = (py - (h + px * h / s * -1)) / 30
                vv = (py - (h - (-px) * (-h / s)) ) / 30
            # 左右の 面は かんたんな 平行四辺形で
            for (sx0, sgn, k) in ((cx - s, 1, .8), (cx, 1, .6)):
                pass
    # 左の 面と 右の 面（平行四辺形）
    H = 30
    for y in range(N):
        for x in range(N):
            if img.getpixel((x, y))[3]: continue
            if cx - s <= x < cx:
                u = (x + .5 - (cx - s)) / s
                y0 = cy + h + (x + .5 - (cx - s)) * h / s
                v = (y + .5 - y0) / H
                if 0 <= v < 1:
                    c = side[int(v * 16) * 16 + int(u * 16)]
                    img.putpixel((x, y), tuple(int(c[k] * .8) for k in range(3)) + (255,))
            elif cx <= x < cx + s:
                u = (x + .5 - cx) / s
                y0 = cy + 2 * h - (x + .5 - cx) * h / s
                v = (y + .5 - y0) / H
                if 0 <= v < 1:
                    c = side[int(v * 16) * 16 + int(u * 16)]
                    img.putpixel((x, y), tuple(int(c[k] * .6) for k in range(3)) + (255,))
    src = img.copy()
    for y in range(N):
        for x in range(N):
            if src.getpixel((x, y))[3]: continue
            if any(0 <= x + dx < N and 0 <= y + dy < N and src.getpixel((x + dx, y + dy))[3] for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                img.putpixel((x, y), OUTLINE)
    return img

def water_bucket():
    i = Icon()
    i.add(capsule(14, 26, 32, 8, 1.8) | capsule(32, 8, 50, 26, 1.8), IRON, flat=True)  # とって
    body = poly([(12, 26), (52, 26), (46, 58), (18, 58)])
    i.add(body, IRON, cyl=(0, 1))
    i.add(ellipse(32, 26, 21, 6), [IRON[0]] * 4, flat=True)
    i.add(ellipse(32, 26, 18, 4.5), WATER, k=2)
    i.add(rect(16, 40, 49, 43) & body, [IRON[0]] * 4, flat=True)  # わ
    spark(i, 24, 25); spark(i, 18, 32)
    return i.finish()

def rope():
    i = Icon()
    for r in (22, 16, 10):
        ring = ellipse(32, 36, r + 3, (r + 3) * .7) - ellipse(32, 36, r - 2, (r - 2) * .7)
        i.add(ring, ROPE, k=2)
        i.paint({(x, y) for (x, y) in ring if (x - y) % 5 == 0}, ROPE[0])  # より
    i.add(capsule(52, 30, 58, 12, 2.6), ROPE, flat=True)  # はし
    return i.finish()

def kabuto():
    i = Icon()
    i.add(poly([(6, 40), (58, 40), (54, 52), (10, 52)]), ARMOR, k=3)  # しころ
    i.paint({(x, y) for y in (44, 48) for x in range(8, 57)}, ARMOR[0])
    i.add(ellipse(32, 36, 19, 17) & rect(0, 0, N, 41), NAVY, k=5)  # はち
    i.add(rect(13, 38, 52, 42), GOLDR, flat=True)  # まびさし
    horn = poly([(28, 24), (14, 4), (20, 2), (32, 17), (44, 2), (50, 4), (36, 24)])
    i.add(horn, GOLDR, k=2)
    i.add(ellipse(32, 26, 4, 4), RED, k=1)
    return i.finish()

def upscale16(px16):
    img = Image.new('RGBA', (16, 16))
    for idx, c in enumerate(px16): img.putpixel((idx % 16, idx // 16), tuple(c))
    return img

def main():
    old = json.load(open(os.path.join(HERE, 'ref', 'old16.json')))
    items = [('iron_pickaxe', iron_pickaxe(), '道具'), ('katana', katana(), '武器'), ('iron_ingot', iron_ingot(), '材料'),
             ('tomato', tomato(), '畑'), ('grass', grass_block(old), 'ブロック'), ('water_bucket', water_bucket(), 'バケツ'),
             ('rope', rope(), 'なわ'), ('kabuto', kabuto(), '防具')]
    os.makedirs(os.path.join(HERE, 'proto'), exist_ok=True)
    S = 4  # シートの 拡大（64 → 256）
    cell = N * S + 16
    sheet = Image.new('RGBA', (cell * len(items), cell * 2 + 8), (40, 46, 62, 255))
    for k, (iid, img, _) in enumerate(items):
        img.save(os.path.join(HERE, 'proto', f'{iid}.png'))
        old16 = upscale16(old[iid]).resize((N * S, N * S), Image.NEAREST)
        sheet.alpha_composite(old16, (k * cell + 8, 8))
        sheet.alpha_composite(img.resize((N * S, N * S), Image.NEAREST), (k * cell + 8, cell + 8))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'proto', 'sheet.png')
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for k, (iid, _, cat) in enumerate(items):
        d.text((k * cell + 10, cell - 6), f'{iid} (old 16)', fill=(220, 220, 220, 255))
        d.text((k * cell + 10, cell * 2 - 2), f'{iid} (new 64)', fill=(255, 230, 140, 255))
    sheet.save(out)
    # ゲームの 大きさ（48・64 px）での 見え方
    small = Image.new('RGBA', (len(items) * 72, 136), (40, 46, 62, 255))
    for k, (iid, img, _) in enumerate(items):
        small.alpha_composite(img.resize((48, 48), Image.LANCZOS), (k * 72 + 12, 8))
        small.alpha_composite(img, (k * 72 + 4, 64))
    small.save(out.replace('.png', '-ingame.png'))

main()
