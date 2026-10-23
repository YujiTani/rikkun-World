"""WEAPON-7 PR3 虹（にじ）の アイコン（16×16・10 色）。Pixel Art Studio で 1 点ずつ。

見本: おもちゃの 光の 剣（まっすぐ・すける・にじ色に 光る）。
形で 区別: 雷神剣 = そった 刃・風神剣 = 細い 45 度の 刃 → 虹 = **太い（3 点）まっすぐな 刃が 急（約 55 度）に たつ**・先は とがる。
色: 根もとから 先へ 赤→黄→みどり→青→むらさき（うすい 色 5 つ）。左の 1 列は 光（まっ白に しない 青白）。
実行: python3 art/WEAPON-7/icon-niji/build.py
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))
from pixelstudio import Sprite  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

PAL = {
    "K": "#241A4A",  # ふち（こい こん むらさき）
    "H": "#EEF2FF",  # 刃の 光（左の 1 列。まっ白は さける）
    "r": "#FF8C94",  # 赤
    "y": "#FFE585",  # 黄
    "g": "#86EBA8",  # みどり
    "b": "#82C6FF",  # 青
    "p": "#C79CFF",  # むらさき
    "S": "#8C93AE",  # つば（灰色）
    "N": "#2B3A78",  # 柄（こん色）
    "n": "#5A6A9E",  # 柄の 光
}
HUES = ["p", "b", "g", "y", "r"]  # 先（上）→ 根もと（下）

# 刃: 行 y → (左の x, 3 点)。まっすぐ・急。先は とがる（1 行目は 2 点）。
BLADE_Y0, BLADE_Y1 = 2, 10
X_TIP, X_BASE = 11, 5  # 左の x が 先で 11、根もとで 5 に なるよう 直線で 割る


def blade_rows():
    rows = {}
    for y in range(BLADE_Y0, BLADE_Y1 + 1):
        t = (y - BLADE_Y0) / (BLADE_Y1 - BLADE_Y0)  # 0 先 → 1 根もと
        x0 = round(X_TIP + (X_BASE - X_TIP) * t)
        w = min(3, y - BLADE_Y0 + 1)  # 先は 1 → 2 → 3 点と とがる
        if w < 3:
            x0 += 1
        hue = HUES[min(4, int(t * 5))]
        rows[y] = (x0, w, hue)
    return rows


def build():
    s = Sprite(16, 16, palette=list(PAL.values()))
    for y, (x0, w, hue) in blade_rows().items():
        for i in range(w):
            s.px(x0 + i, y, PAL["H"] if (i == 0 and y > BLADE_Y0 + 1 and y % 2 == 1) else PAL[hue])
    # つば（刃の 根もとを よこぎる 灰色。小さく 5 点）
    for x in range(4, 9):
        s.px(x, 11, PAL["S"])
    # 柄（短く こん色。左下へ）
    for x, y, c in [(6, 12, "N"), (5, 12, "n"), (5, 13, "N"), (4, 13, "n"), (4, 14, "N")]:
        s.px(x, y, PAL[c])
    s.outline(PAL["K"], where="outside")
    return s


def build_rows_png():
    return build()


# ---------------------------------------------------------------- 見本シート

BG = (154, 46, 74)  # 武器の マスの 背景（雷神剣と 同じ）
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"


def font(n):
    return ImageFont.truetype(FONT, n)


def ts_icon(name, pal_name):
    src = open(os.path.join(ROOT, "src", "ui", "itemArtW7.ts"), encoding="utf-8").read()
    pal_txt = re.search(r"const " + pal_name + r" = \{([^}]*)\}", src).group(1)
    pal = {k: int(v, 16) for k, v in re.findall(r"(\w): 0x([0-9a-fA-F]{6})", pal_txt)}
    rows = re.findall(r"'([.\w]{16})'", re.search(r"const " + name + r" = \[(.*?)\];", src, re.S).group(1))
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                c = pal[ch]
                im.putpixel((x, y), ((c >> 16) & 255, (c >> 8) & 255, c & 255, 255))
    return im


def crystal_katana():
    """src/ui/itemArtM4.ts の sword()（きらめく カタナ）を 読みかえた もの"""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))

    def put(x, y, c):
        if 0 <= x < 16 and 0 <= y < 16:
            im.putpixel((x, y), (c >> 16, (c >> 8) & 255, c & 255, 255))

    def line(x0, y0, x1, y1, c):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(n + 1):
            t = 0 if n == 0 else i / n
            put(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), c)

    blade, edge, alt = 0x9FE8FF, 0x6FB8E0, 0xC79BFF
    pts = [(6, 9), (7, 8), (8, 7), (9, 6), (10, 5), (11, 4), (12, 3), (13, 2), (14, 1)]
    for i, (x, y) in enumerate(pts):
        put(x, y, blade if i % 2 == 0 else alt)
        put(x + 1, y, edge)
        put(x, y + 1, alt if i % 2 == 0 else blade)
    g = 0xF2C230
    line(4, 9, 7, 12, g); line(5, 9, 8, 12, g); put(4, 10, g); put(7, 11, g)
    h = 0x222222
    line(3, 11, 1, 13, h); line(4, 12, 2, 14, h); put(1, 14, h)
    put(3, 12, 0xFFFFFF); put(2, 13, 0xFFFFFF)
    for x, y in [(11, 1), (14, 4), (8, 4)]:
        for dx, dy in [(0, 0), (1, 0), (0, -1), (0, 1)]:
            put(x + dx, y + dy, 0xFFFFFF)
    return im


def on_bg(im, k, bg=BG):
    b = Image.new("RGBA", (16, 16), bg + (255,))
    b.alpha_composite(im)
    return b.resize((16 * k, 16 * k), Image.NEAREST).convert("RGB")


def slot(im, rainbow=True, k=4):
    S = 64
    out = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(out)
    cols = [(255, 90, 95), (255, 200, 61), (61, 220, 132), (79, 195, 247), (199, 155, 255)]
    for i in range(3):
        for j in range(S):
            d.point([(j, i), (j, S - 1 - i)], fill=cols[(j * 5) // S])
            d.point([(i, j), (S - 1 - i, j)], fill=cols[4 - (j * 5) // S])
    art = im.resize((48, 48), Image.NEAREST)
    out.paste(art, (8, 8), art)
    return out.resize((S * k // 2, S * k // 2), Image.NEAREST)


def gray(im):
    return im.convert("L").convert("RGB")


def silhouette(im, fg=(20, 22, 30), bg=(232, 228, 218)):
    out = Image.new("RGB", im.size, bg)
    p = out.load()
    a = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if a[x, y][3] > 0:
                p[x, y] = fg
    return out


def compare(niji):
    raijin = ts_icon("RAIJIN_KEN", "PAL")
    fujin = ts_icon("FUJIN_KEN", "PAL_FUJIN")
    kira = crystal_katana()
    items = [("雷神剣", raijin), ("風神剣", fujin), ("きらめく刀", kira), ("虹（新）", niji)]
    W, H = 1180, 620
    im = Image.new("RGB", (W, H), (22, 25, 38))
    d = ImageDraw.Draw(im)
    d.text((20, 14), "虹の アイコン: 武器 4 本ならべ（16×16・10 色）", font=font(24), fill=(255, 226, 150))
    d.text((20, 48), "雷神剣 = そった 刃・風神剣 = 細い 45 度・きらめく刀 = 45 度に 2 色の 刃 ＋ きらり・虹 = 急に たつ 太い まっすぐな 刃（根もとから 先へ にじ色）", font=font(14), fill=(170, 176, 196))
    x = 20
    for label, ic in items:
        d.text((x, 84), label, font=font(16), fill=(236, 232, 220))
        im.paste(on_bg(ic, 8), (x, 108))
        im.paste(slot(ic), (x, 108 + 138 + 6) if False else (x, 252))
        x += 290
    # 下の 段: 1 倍・シルエット・白黒（4 本）
    y = 410
    d.text((20, y - 24), "① シルエット（字なし）", font=font(13), fill=(170, 176, 196))
    x = 20
    for label, ic in items:
        im.paste(silhouette(ic).resize((96, 96), Image.NEAREST), (x, y))
        x += 108
    d.text((470, y - 24), "② 白黒", font=font(13), fill=(170, 176, 196))
    x = 470
    for label, ic in items:
        im.paste(gray(on_bg(ic, 6)), (x, y))
        x += 108
    d.text((20, 530), "ものさし: 1 ○ 影が ちがう（急に たつ 太くて まっすぐ）/ 2 ○ 白黒で 刃と 柄が 分かれる / 6 ○ にじ 5 色は うすい 色・面積は 刃だけ / 7 ○ 光の 列は 青白 / 8 ○ 4 本の 色の なかまが ちがう", font=font(13), fill=(236, 232, 220))
    d.text((20, 552), "9 ○ とがった 先 ＋ まっすぐ ＋ 小さな つば = 剣 / 10 ○ ふち 1 点・16 px / 12・13 ○ 形でも 分かる（色だけに たよらない）/ 17 ○ おもちゃの 光の 剣の まま かっこよく", font=font(13), fill=(236, 232, 220))
    d.text((20, 574), "黄色い わく・レア度の にじの 星と ぶつからない: 刃は 右が x=13・上が y=1 までで、ふちから 1 点 はなれて いる。", font=font(13), fill=(170, 176, 196))
    out = os.path.join(ROOT, "docs", "art", "WEAPON-7", "icon.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out)
    return im


def write_rows(s):
    inv = {v.lower(): k for k, v in PAL.items()}
    im = s.composite(1)
    rows = []
    for y in range(16):
        r = ""
        for x in range(16):
            p = im.getpixel((x, y))
            r += "." if p[3] == 0 else inv["#%02x%02x%02x" % p[:3]]
        rows.append(r)
    pal = ", ".join("%s: 0x%s" % (k, v[1:].lower()) for k, v in PAL.items())
    with open(os.path.join(HERE, "niji_rows.txt"), "w", encoding="utf-8") as f:
        f.write("const PAL_NIJI = { %s };\n\nconst NIJI = [\n" % pal)
        for r in rows:
            f.write("  '%s',\n" % r)
        f.write("];\n")


def sheet_preview(niji):
    """preview.png: 雷神剣・風神剣・きらめく刀・虹 を 16 倍で ならべる（字なし）"""
    raijin = ts_icon("RAIJIN_KEN", "PAL")
    fujin = ts_icon("FUJIN_KEN", "PAL_FUJIN")
    kira = crystal_katana()
    row = [raijin, fujin, kira, niji]
    k = 12
    out = Image.new("RGB", (4 * 16 * k + 5 * 12, 16 * k + 24), (22, 25, 38))
    x = 12
    for ic in row:
        out.paste(on_bg(ic, k), (x, 12))
        x += 16 * k + 12
    out.save(os.path.join(HERE, "preview.png"))


def main():
    s = build()
    s.save_png(os.path.join(HERE, "niji_16.png"))
    s.save_png(os.path.join(HERE, "niji_x4.png"), scale=4)
    s.save_silhouette(os.path.join(HERE, "silhouette.png"), scale=8)
    s.stats()
    write_rows(s)
    niji = Image.open(os.path.join(HERE, "niji_16.png")).convert("RGBA")
    sheet_preview(niji)
    compare(niji)


if __name__ == "__main__":
    main()
