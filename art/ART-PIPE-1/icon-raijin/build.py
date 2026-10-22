"""ART-PIPE-1 雷神剣の アイコン（16×16）。Pixel Art Studio で 1 点ずつ。

オーナー決定 v3-A を 守る: そった むらさきの 刃 ＋ 金の 小さな つば ＋ 短い こん色の 柄（柄なし・大きな 丸い つばは NG）。
今回 足す 所:
- 刃の 色の 段を 4 つに（かげは 青へ・光は あたたかい 白むらさきへ。CRITERIA 7）。光は 左上から。
- 刃の 光の 線を ぎざぎざ（稲妻の 刃文）に → 風神剣・ふつうの 刀と 16 px でも 見分ける。
- 刃先の 横に 小さな 稲妻の 光 1 つ（3 点）。
- ふち線は 今と 同じ 1 点の こい むらさき（ほかの アイコンと そろえる）。
下絵: PixelLab Pro Flash 32×32（art/ART-PIPE-1/pixellab/raijin-icon-sketch-32.png）から「刃の 横の 稲妻」「刃の 光の 段」を もらった。
実行: python3 art/ART-PIPE-1/icon-raijin/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "pixel-art-studio", "scripts"))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
from pixelstudio import Sprite  # noqa: E402
import kit  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

PAL = {
    "K": "#1B1240",  # ふち（今と 同じ）
    "d": "#33268A",  # 刃の みね がわ（青より）
    "D": "#6A3FC8",  # 刃（今と 同じ）
    "M": "#A57CFF",  # 刃の 明るい 所
    "L": "#F1E4FF",  # 刃文の 光（今と 同じ）
    "Y": "#FFF0A8",  # 稲妻の 光（雷の Y1 と 同じ）
    "G": "#F2C230",  # 金（つば・柄頭）
    "g": "#B8860B",  # 金の かげ
    "N": "#24336E",  # 柄
    "n": "#3F56A8",  # 柄の 光
}

# 刃: 行ごとに（左の x, 左→右の 色）。上は たって 下は ねる そり（ふくらむ 側 = 左上 = 光の 側）。
# 光（L）が 1 点 → 2 点 → 1 点 と かわって 稲妻の 刃文に なる。
BLADE = {
    1: (14, "L"),
    2: (13, "Ld"),
    3: (12, "LMd"),
    4: (12, "LDd"),
    5: (11, "LMDd"),
    6: (11, "LLd"),
    7: (10, "LMDd"),
    8: (9, "LLDd"),
    9: (8, "LMDd"),
    10: (7, "LLDd"),
    11: (6, "LMd"),
}
PARTS = {  # つば（刃の 根もとを よこぎる 金の 短い 線）・柄・柄頭
    (5, 10): "G", (5, 11): "G", (6, 12): "g",
    (4, 12): "n", (5, 12): "N", (3, 13): "N", (4, 13): "n", (2, 14): "n", (3, 14): "N", (1, 15): "G",
}
SPARK = [(5, 0), (4, 1), (3, 2), (4, 2), (5, 2), (4, 3), (3, 4)]  # 刃の 左上の 小さな 稲妻（ふちは 付けない）
DY = 0
SX, SY = 1, 1


def build():
    s = Sprite(16, 16, palette=list(PAL.values()))
    for y, (x0, cols) in BLADE.items():
        for i, ch in enumerate(cols):
            s.px(x0 + i, y + DY, PAL[ch])
    for (x, y), ch in PARTS.items():
        s.px(x, y + DY, PAL[ch])
    s.outline(PAL["K"], where="outside")
    for x, y in SPARK:
        s.px(x + SX, y + SY, PAL["Y"])
    return s


def slot(icon16, k=4, pad=0.86, rainbow=True):
    """ホットバーの マス（64 px）の 見本: 背景 = 武器の 色、ふち 3 px = レジェンダリーの にじ（ここでは 止め絵）"""
    S = 64
    im = Image.new("RGB", (S, S), (154, 46, 74))
    d = ImageDraw.Draw(im)
    cols = [(255, 90, 95), (255, 200, 61), (61, 220, 132), (79, 195, 247), (199, 155, 255)]
    for i in range(3):
        for j in range(S):
            c = cols[(j * len(cols)) // S]
            d.point([(j, i), (j, S - 1 - i)], fill=c)
            d.point([(i, j), (S - 1 - i, j)], fill=cols[(len(cols) - 1 - (j * len(cols)) // S)])
    art = icon16.resize((48, 48), Image.NEAREST)  # 整数倍（3 倍）。ゲームは 86% → ここは 48/64
    im.paste(art, (8, 8), art)
    return im.resize((S * k // 2, S * k // 2), Image.NEAREST)


def main():
    s = build()
    s.preview(os.path.join(HERE, "preview.png"), scale=16, bg="#9A2E4A", labels=False, grid=True)
    s.save_silhouette(os.path.join(HERE, "silhouette.png"), scale=8)
    s.save_png(os.path.join(HERE, "raijin_ken_16.png"))
    s.save_png(os.path.join(HERE, "raijin_ken_x4.png"), scale=4)
    s.stats()
    return s


if __name__ == "__main__":
    main()


# ---------------------------------------------------------------- くらべの 絵（docs/art/ART-PIPE-1/icon.png）

def ts_icon(name, pal_name):
    """今の アイコンを src/ui/itemArtW7.ts から 読む（コードは 読むだけ）"""
    import re
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


def compare(new16):
    cur = ts_icon("RAIJIN_KEN", "PAL")
    fujin = ts_icon("FUJIN_KEN", "PAL_FUJIN")
    sh = kit.Sheet(1180, 760)
    sh.text((20, 14), "雷神剣の アイコン: 今（v3-A）と 新しい 案（16×16。オーナー決定 v3-A の 形を 守る）", 24, (255, 226, 150))
    sh.text((20, 50), "そりを 少し 強く・刃の 色を 4 段・光の 線を 稲妻の 刃文に・刃の 横に 小さな 稲妻。ふちは 今と 同じ 1 点。", 15)
    y = 90
    for label, im in (("今", cur), ("新しい 案", new16)):
        sh.text((20, y), label, 18)
        bg = Image.new("RGBA", (16, 16), (154, 46, 74, 255))
        bg.alpha_composite(im)
        sh.im.paste(bg.resize((192, 192), Image.NEAREST).convert("RGB"), (20, y + 28))
        sh.im.paste(slot(im), (232, y + 28))
        x = 372
        for k in (1, 2, 3):
            b = Image.new("RGBA", (16, 16), (154, 46, 74, 255))
            b.alpha_composite(im)
            sh.im.paste(b.resize((16 * k, 16 * k), Image.NEAREST).convert("RGB"), (x, y + 28))
            x += 16 * k + 12
        sil = kit.silhouette(im).resize((96, 96), Image.NEAREST)
        sh.im.paste(sil, (x + 10, y + 28))
        g = Image.new("RGBA", (16, 16), (154, 46, 74, 255))
        g.alpha_composite(im)
        sh.im.paste(kit.gray(g.resize((96, 96), Image.NEAREST)), (x + 120, y + 28))
        sh.im.paste(kit.blur(g.resize((96, 96), Image.NEAREST), 4), (x + 230, y + 28))
        # ならべる: 風神剣と（ホットバーの 大きさ）
        sh.im.paste(slot(fujin, k=2), (x + 350, y + 28))
        sh.im.paste(slot(im, k=2), (x + 420, y + 28))
        y += 250
    sh.text((372, 92 + 6), "1 倍・2 倍・3 倍", 13, kit.SUB)
    sh.text((582, 92 + 6), "① シルエット　② 白黒　③ ぼかし　④ 風神剣と ならべる", 13, kit.SUB)
    sh.text((20, 600), "ものさし: 1 ○ 刀の 形＋左上の 稲妻で 影が ちがう / 2 ○ 白黒で 刃の 光と 柄が 分かれる / 4 ○ 細かさは 刃文と 稲妻だけ / "
                       "6 ○ むらさき 7・金 1.5・黄 0.5", 13)
    sh.text((20, 622), "7 ○ かげは 青へ・光は あたたかい 白へ / 8 ○ 風神剣（水色）と 色の なかまが ちがう / 9 △ 刀は さんかく、稲妻で すばやさ / "
                       "10 ○ ふち 1 点・同じ 16 px / 12・13 ○ 稲妻の しるしで 色なしでも 雷", 13)
    sh.text((20, 644), "14〜16 ―（字・押す所は マスの きまり）/ 17 ○ かっこいい 寄り。下絵: PixelLab Pro Flash 32×32 を 1 回（刃の 横の 稲妻を もらった）", 13)
    sh.text((20, 680), "注意: 稲妻の 黄は 選んだ マスの わく（黄）と 近い。わくと 1 点 はなれて いる（左上の 2 点 あけ）ので まざらない。", 13, kit.SUB)
    out = os.path.join(kit.DOCS, "icon.png")
    sh.save(out)


def write_rows(s):
    """src/ui/itemArtW7.ts の RAIJIN_KEN と 同じ 形（16 行 ＋ PAL）。developer が 差しかえる"""
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
    with open(os.path.join(HERE, "raijin_ken_rows.txt"), "w", encoding="utf-8") as f:
        f.write("const PAL = { %s };\n\nconst RAIJIN_KEN = [\n" % pal)
        for r in rows:
            f.write("  '%s',\n" % r)
        f.write("];\n")


if __name__ == "__main__" and True:
    write_rows(build())
    compare(Image.open(os.path.join(HERE, "raijin_ken_16.png")).convert("RGBA"))
