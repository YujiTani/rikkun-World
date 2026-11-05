"""ICON-32 プロトタイプ: 32x32 アイテムアイコン 8 点 × 絵柄 2 案（docs/design/ICON-32.md）。
A: こい ふち線（あたたかい こげ茶）＋ 3 段の かげ ＋ 白っぽい 光
B: 色つきの ふち線（部品の いちばん こい 色）＋ やわらかい かげ ＋ 大きめの 光
乱数なし。出力: art/ICON-32/proto/{a,b}/<id>.png と 見本シート 2 枚。
使い方: python3 art/ICON-32/build.py [シートの 出力先.png]
"""
import colorsys, json, os, sys
from PIL import Image, ImageDraw

ICON_SIZE = 32  # ゲーム側の 定数と そろえる
N = ICON_SIZE
U = 64 / N      # 形は 64 の 座標で 書いて、32 の マスの まん中で しらべる
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_A = (0x3B, 0x24, 0x20, 255)  # A の ふち: あたたかい こげ茶（真っ黒は 使わない）

def hx(s):
    s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) / 255 for i in (0, 2, 4))

def ramp(base, sat=1.0):
    """色の 段: 暗い ほど 青むらさきへ・明るい ほど 黄色へ（CRITERIA 7）。[ふち, こい, ふつう, 明るい, 光]"""
    h, l, s = colorsys.rgb_to_hls(*hx(base)); s *= sat
    def at(dh, dl, ds):
        c = colorsys.hls_to_rgb((h + dh) % 1, max(0, min(1, l + dl)), max(0, min(1, s + ds)))
        return tuple(round(v * 255) for v in c) + (255,)
    cool = lambda t: (0.70 - h) * t if abs(0.70 - h) < .5 else 0
    warm = lambda t: ((0.13 - h) if abs(0.13 - h) < .5 else 0) * t
    return [at(cool(.2), -.32, -.05), at(cool(.1), -.15, 0), at(0, 0, 0), at(warm(.25), .13, .05), at(warm(.4), .28, -.1)]

def pin(pts, x, y):
    c = False; j = len(pts) - 1
    for i in range(len(pts)):
        (xi, yi), (xj, yj) = pts[i], pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
        j = i
    return c

def grid(f):
    return {(x, y) for y in range(N) for x in range(N) if f((x + .5) * U, (y + .5) * U)}

poly = lambda pts: grid(lambda X, Y: pin(pts, X, Y))
ellipse = lambda cx, cy, rx, ry: grid(lambda X, Y: ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1)
rect = lambda x0, y0, x1, y1: grid(lambda X, Y: x0 <= X < x1 and y0 <= Y < y1)

def capsule(x0, y0, x1, y1, r):
    dx, dy = x1 - x0, y1 - y0; L = dx * dx + dy * dy
    def f(X, Y):
        t = max(0, min(1, ((X - x0) * dx + (Y - y0) * dy) / L))
        return (X - x0 - t * dx) ** 2 + (Y - y0 - t * dy) ** 2 <= r * r
    return grid(f)

class Icon:
    def __init__(self, style): self.style = style; self.px = {}; self.part = {}; self.parts = []

    def add(self, mask, r, flat=False, k=1, axis=None):
        i = len(self.parts); self.parts.append(r); A = self.style == 'a'
        for (x, y) in mask:
            if flat: t = 2
            elif axis:
                ax, ay = axis; d = [p[0] * ay - p[1] * ax for p in mask]
                f = (x * ay - y * ax - min(d)) / max(1e-6, max(d) - min(d))
                t = 3 if f < .3 else (2 if f < .7 else 1)
            else:
                lit = (x - k, y - k) not in mask; dark = (x + k, y + k) not in mask
                t = 3 if lit and not dark else (1 if dark and not lit else 2)
            if not A and t == 3 and not flat: t = 3 if (x - k - 1, y - k - 1) not in mask else 2  # B: 光は ふちに そって 細く
            self.px[(x, y)] = r[t]; self.part[(x, y)] = i
        return mask

    def paint(self, mask, t):
        for p in mask:
            if p in self.px: self.px[p] = self.parts[self.part[p]][t]

    def shine(self, x, y, big=False):
        pts = {(x, y)} | ({(x + 1, y), (x, y + 1)} if big or self.style == 'b' else set())
        for p in pts:
            if p in self.px: self.px[p] = self.parts[self.part[p]][4] if self.style == 'a' else (255, 250, 232, 255)

    def finish(self):
        add = {}
        for (x, y), i in self.part.items():
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                j = self.part.get((x + dx, y + dy))
                if j is not None and j > i: add[(x, y)] = OUT_A if self.style == 'a' else self.parts[i][0]; break
        self.px.update(add)
        img = Image.new('RGBA', (N, N))
        for (x, y), c in self.px.items(): img.putpixel((x, y), c)
        for y in range(N):
            for x in range(N):
                if (x, y) in self.px: continue
                nb = [self.part[(x + dx, y + dy)] for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                      if (x + dx, y + dy) in self.part and (self.style == 'a' or abs(dx) + abs(dy) == 1)]
                if nb: img.putpixel((x, y), OUT_A if self.style == 'a' else self.parts[max(nb)][0])
        return img

WOOD, IRON, STEEL, GOLD = ramp('#b07a45'), ramp('#a3aeb8', .6), ramp('#c9d6e0', .5), ramp('#e8b23a')
NAVY, RED, LEAF, WATER = ramp('#3d4f8f'), ramp('#e8473a'), ramp('#5cb848'), ramp('#4cb0ee')
ROPE, ARMOR = ramp('#d0a560'), ramp('#a34a3c')

def pickaxe(s):
    i = Icon(s)
    i.add(capsule(13, 54, 44, 22, 4.2), WOOD, axis=(31, -32))
    i.add(poly([(5, 30), (14, 15), (30, 7), (48, 7), (60, 17), (56, 23), (46, 16), (34, 15), (22, 21), (12, 33)]), IRON)
    i.add(poly([(38, 12), (46, 8), (52, 16), (44, 22)]), IRON, flat=True)
    i.shine(10, 6); return i.finish()

def katana(s):
    i = Icon(s)
    i.add(poly([(54, 3), (62, 5), (60, 11), (28, 44), (20, 37)]), STEEL)
    i.add(ellipse(22, 42, 8, 8), GOLD)
    h = i.add(capsule(8, 56, 19, 45, 5.2), NAVY, axis=(11, -11))
    i.paint({(x, y) for (x, y) in h if (x + y) % 3 == 0}, 4)
    i.shine(26, 3); return i.finish()

def ingot(s):
    i = Icon(s)
    i.add(poly([(6, 34), (20, 20), (58, 20), (58, 30), (44, 48), (6, 48)]), IRON, flat=True)
    i.paint(poly([(6, 34), (20, 20), (58, 20), (44, 34)]), 3)
    i.paint(poly([(44, 34), (58, 20), (58, 30), (44, 48)]), 1)
    i.shine(10, 12, True); return i.finish()

def tomato(s):
    i = Icon(s)
    i.add(ellipse(32, 37, 25, 22), RED, k=2)
    i.add(poly([(32, 12), (36, 20), (46, 17), (40, 24), (45, 30), (32, 26), (19, 30), (24, 24), (18, 17), (28, 20)]), LEAF)
    i.add(capsule(32, 6, 34, 16, 2.6), LEAF, flat=True)
    i.shine(8, 13, True); return i.finish()

def bucket(s):
    i = Icon(s)
    i.add(capsule(13, 26, 32, 7, 2.6) | capsule(32, 7, 51, 26, 2.6), IRON, flat=True)
    i.add(poly([(10, 26), (54, 26), (47, 60), (17, 60)]), IRON, axis=(0, 1))
    i.add(ellipse(32, 26, 22, 7), IRON, flat=True); i.paint(ellipse(32, 26, 22, 7), 1)
    i.add(ellipse(32, 26, 18, 5), WATER)
    i.paint(rect(14, 42, 51, 46), 1)
    i.shine(12, 13); return i.finish()

def rope(s):
    i = Icon(s)
    for r in (21, 13):
        ring = ellipse(30, 38, r + 5, (r + 5) * .72) - ellipse(30, 38, r - 2, (r - 2) * .72)
        i.add(ring, ROPE)
        i.paint({(x, y) for (x, y) in ring if (x - y) % 3 == 0}, 1)
    i.add(capsule(54, 34, 58, 10, 3.6), ROPE, flat=True)
    i.shine(8, 9); return i.finish()

def kabuto(s):
    i = Icon(s)
    i.add(poly([(4, 40), (60, 40), (55, 56), (9, 56)]), ARMOR)
    i.paint({(x, y) for (x, y) in i.px if y == 24}, 1)
    i.add(ellipse(32, 38, 21, 19) & rect(0, 0, 64, 42), NAVY, k=2)
    i.add(rect(10, 38, 54, 44), GOLD, flat=True)
    i.add(poly([(27, 26), (10, 3), (19, 1), (32, 18), (45, 1), (54, 3), (37, 26)]), GOLD)
    i.add(ellipse(32, 28, 5.5, 5.5), RED)
    i.shine(10, 11); return i.finish()

def grass(s, old):
    """タイルを 斜めの 箱に（上 1.0・左 0.82・右 0.64）。B は 色つきの ふち"""
    top, side = old['tile:grass_top'], old['tile:grass_side']
    img = Image.new('RGBA', (N, N)); cx, cy, w, h, H = 16, 2, 14, 7, 15
    for y in range(N):
        for x in range(N):
            X, Y = x + .5 - cx, y + .5 - cy
            u, v = (X / w + Y / h) / 2, (Y / h - X / w) / 2
            if 0 <= u < 1 and 0 <= v < 1: img.putpixel((x, y), tuple(top[int(v * 16) * 16 + int(u * 16)])); continue
            if cx - w <= x + .5 < cx:
                uu = (x + .5 - cx + w) / w; y0 = cy + h + (x + .5 - cx + w) * h / w; k = .82
            elif cx <= x + .5 < cx + w:
                uu = (x + .5 - cx) / w; y0 = cy + 2 * h - (x + .5 - cx) * h / w; k = .64
            else: continue
            vv = (y + .5 - y0) / H
            if 0 <= vv < 1:
                c = side[int(vv * 16) * 16 + int(uu * 16)]
                img.putpixel((x, y), tuple(int(c[q] * k) for q in range(3)) + (255,))
    src = img.copy(); dirt = (0x4A, 0x2E, 0x1E, 255); green = (0x2E, 0x5A, 0x22, 255)
    for y in range(N):
        for x in range(N):
            if src.getpixel((x, y))[3]: continue
            nb = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if 0 <= x + dx < N and 0 <= y + dy < N and src.getpixel((x + dx, y + dy))[3]]
            if s == 'b': nb = [p for p in nb if abs(p[0]) + abs(p[1]) == 1]
            if nb: img.putpixel((x, y), OUT_A if s == 'a' else (green if y < cy + 2 * h + 1 else dirt))
    return img

def up(px16):
    img = Image.new('RGBA', (16, 16))
    for k, c in enumerate(px16): img.putpixel((k % 16, k // 16), tuple(c))
    return img

def main():
    old = json.load(open(os.path.join(HERE, 'ref', 'old16.json')))
    ids = ['iron_pickaxe', 'katana', 'iron_ingot', 'tomato', 'grass', 'water_bucket', 'rope', 'kabuto']
    fns = [pickaxe, katana, ingot, tomato, None, bucket, rope, kabuto]
    sets = {s: [grass(s, old) if f is None else f(s) for f in fns] for s in 'ab'}
    for s, imgs in sets.items():
        os.makedirs(os.path.join(HERE, 'proto', s), exist_ok=True)
        for iid, im in zip(ids, imgs): im.save(os.path.join(HERE, 'proto', s, f'{iid}.png'))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'proto', 'sheet.png')
    Z, cell, bg = 6, 32 * 6 + 16, (54, 48, 58, 255)
    sh = Image.new('RGBA', (cell * 8 + 70, cell * 3 + 10), bg); d = ImageDraw.Draw(sh)
    for r, (lab, row) in enumerate([('old16', [up(old[i]) for i in ids]), ('A', sets['a']), ('B', sets['b'])]):
        d.text((6, r * cell + cell // 2), lab, fill=(255, 236, 200, 255))
        for k, im in enumerate(row):
            sh.alpha_composite(im.resize((32 * Z, 32 * Z), Image.NEAREST), (70 + k * cell + 8, r * cell + 8))
            if r == 0: d.text((70 + k * cell + 10, 2), ids[k], fill=(220, 220, 220, 255))
    sh.save(out)
    gm = Image.new('RGBA', (8 * 112 + 70, 3 * 120), bg); d = ImageDraw.Draw(gm)
    for r, (lab, row) in enumerate([('old16', [up(old[i]).resize((32, 32), Image.NEAREST) for i in ids]), ('A', sets['a']), ('B', sets['b'])]):
        d.text((6, r * 120 + 50), lab, fill=(255, 236, 200, 255))
        for k, im in enumerate(row):
            x0, y0 = 70 + k * 112, r * 120 + 8
            d.rectangle((x0, y0, x0 + 103, y0 + 103), fill=(120, 86, 58, 255), outline=(70, 48, 32, 255), width=3)
            gm.alpha_composite(im.resize((64, 64), Image.NEAREST), (x0 + 6, y0 + 6))
            gm.alpha_composite(im, (x0 + 66, y0 + 8))
            gm.alpha_composite(im.resize((48, 48), Image.NEAREST), (x0 + 50, y0 + 50))
    gm.save(out.replace('.png', '-ingame.png'))

main()
