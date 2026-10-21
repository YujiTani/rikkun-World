"""WEAPON-8: 速さバフの アイコン 3 案の 見本シート ＋ HUD の 置き場所の 見本。

python3 art/WEAPON-8/buff-icon/build.py → docs/art/WEAPON-8/buff-icon-3.png・hud-place.png
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
sys.path.insert(0, HERE)

from PIL import Image, ImageDraw  # noqa: E402

import w8kit as K  # noqa: E402
from icons import ICONS, icon  # noqa: E402

SHOT = os.path.join(K.ROOT, "ui-gate-report", "hud-1280x800.png")
SRC_ITEM = os.path.join(K.ROOT, "src", "ui", "itemArtW7.ts")


def fujin_icon():
    """今の 風神剣の アイコン（くらべ用。src の 行を 読む）"""
    txt = open(SRC_ITEM, encoding="utf-8").read()
    pal_line = txt[txt.index("const PAL_FUJIN"):].split("\n")[0]
    pal = {}
    for part in pal_line.split("{")[1].split("}")[0].split(","):
        k, v = part.split(":")
        pal[k.strip()] = int(v.strip(), 16)
    rows_block = txt[txt.index("const FUJIN_KEN = ["):]
    rows = [ln.strip().strip("',") for ln in rows_block.split("\n")[1:17]]
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in pal:
                c = pal[ch]
                im.putpixel((x, y), ((c >> 16) & 255, (c >> 8) & 255, c & 255, 255))
    return im


def heart():
    rows = [
        "................",
        "................",
        "..KKK....KKK....",
        ".KRRRK..KRRRK...",
        "KRWRRRKKRRRRrK..",
        "KRWRRRRRRRRRrK..",
        "KRRRRRRRRRRRrK..",
        ".KRRRRRRRRRrK...",
        "..KRRRRRRRrK....",
        "...KRRRRRrK.....",
        "....KRRRrK......",
        ".....KRrK.......",
        "......KK........",
        "................",
        "................",
        "................",
    ]
    pal = {"K": (60, 10, 20), "R": (226, 40, 52), "r": (160, 20, 36), "W": (255, 200, 200)}
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in pal:
                im.putpixel((x, y), pal[ch] + (255,))
    return im


def plate(ic, scale=2, pad=4):
    """HUD の 小さな 板（HUD の パネルと 同じ こい 色・角まる）＋ アイコン 整数倍"""
    n = 16 * scale + pad * 2
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=8, fill=(34, 40, 58, 215), outline=(143, 214, 242, 255), width=2)
    im.alpha_composite(ic.resize((16 * scale, 16 * scale), Image.NEAREST), (pad, pad))
    return im


def hud_place(key="I1"):
    shot = Image.open(SHOT).convert("RGBA")
    ic = icon(ICONS[key][1])
    p = plate(ic)
    d = ImageDraw.Draw(shot)
    spots = [
        ("①", "体力の 上", (322, 548)),
        ("②", "体力の よこ", (650, 650)),
        ("③", "もっている 物の 上", (902, 582)),
    ]
    for num, name, (x, y) in spots:
        shot.alpha_composite(p, (x, y))
        d.rectangle([x - 4, y - 4, x + p.width + 3, y + p.height + 3], outline=(255, 226, 120), width=2)
        d.text((x + p.width + 8, y + 6), num + " " + name, font=K.font(18), fill=(255, 240, 180), stroke_width=3, stroke_fill=(20, 20, 30))
    for i, line in enumerate(["速さバフの アイコン（案 I1・2 倍）の 置き場所 3 案", "どれか 1 か所だけ。風神剣を もって いる 間だけ 出す"]):
        d.text((16, 12 + i * 26), line, font=K.font(18), fill=(255, 255, 255), stroke_width=3, stroke_fill=(20, 20, 30))
    return shot


NOTES = {
    "I1": ("はやい くつ", "しかく", "りっくんの ピンクの くつ ＋ うしろに 風の 線 3 本。「はやく はしれる」が いちばん まっすぐ。風の 線は 風神剣の 色",
           {1: ("○", "くつの 形"), 2: ("○", "ピンクと 白の 差"), 3: ("○", ""), 4: ("○", "くつに 集める"), 6: ("△", "ピンクが 強い（小さい 面積なので OK の はんい）"),
            7: ("○", ""), 8: ("○", "ハート（赤）・風神剣（白青）と ちがう"), 9: ("○", "しかく（くつ）＋ 線"), 10: ("○", "16×16・ふち 1 点"),
            11: ("○", "HUD の 板と 同じ 角まる"), 12: ("○", "くつ = はしる"), 13: ("○", "形で 分かる"), 14: ("―", ""), 15: ("―", "押さない"),
            16: ("○", "出る・消える だけ。点滅 なし"), 17: ("○", "")}),
    "I2": ("たつまき", "まる＋さんかく", "風の うずの 形（上が ひろく 下が とがる）。「風の 力」が 分かる。速さは 分かりにくい",
           {1: ("○", "たつまきの 形"), 2: ("○", ""), 3: ("○", ""), 4: ("○", ""), 6: ("○", "白青だけ"), 7: ("○", ""),
            8: ("○", "風神剣と 同じ なかま"), 9: ("○", ""), 10: ("○", ""), 11: ("○", ""), 12: ("△", "「はやい」より「たつまき（あぶない）」に 見えるかも"),
            13: ("○", ""), 14: ("―", ""), 15: ("―", ""), 16: ("○", ""), 17: ("○", "")}),
    "I3": ("はやい やじるし ≫", "さんかく", "くの字 2 つ ＋ 風の 線。動画の「はやおくり」と 同じ 形で 子どもも 知っている",
           {1: ("○", "≫"), 2: ("○", ""), 3: ("○", ""), 4: ("○", ""), 6: ("○", "白青だけ"), 7: ("○", ""), 8: ("○", ""),
            9: ("○", "さんかく"), 10: ("○", ""), 11: ("○", ""), 12: ("△", "「はやおくり」と まちがえるかも（何が はやいか は 分かりにくい）"),
            13: ("○", ""), 14: ("―", ""), 15: ("―", ""), 16: ("○", ""), 17: ("○", "")}),
}


def main():
    sh = K.Sheet(1800, 1060)
    sh.text((24, 14), "風神剣の 速さバフの アイコン: 方向の 3 案（16×16・ふち 1 点 #12304A・光は 左上）", 28, K.HEAD)
    sh.text((24, 52), "どれも 風神剣を もって いる 間だけ HUD に 出す（点滅しない）。マスに 2 倍で 出す。色は 風神剣の 白〜水色（I1 だけ くつの ピンク）。12 色 以内", 15, K.SUB)
    cur = fujin_icon()
    hrt = heart()
    hud = Image.open(SHOT).convert("RGBA")
    y0 = 92
    for i, (k, (name, rows)) in enumerate(ICONS.items()):
        ic = icon(rows)
        nm, shape, desc, crit = NOTES[k]
        x = 24 + i * 590
        sh.text((x, y0), f"{k} {nm}" + ("（おすすめ）" if k == "I1" else ""), 22, K.INK)
        sh.text((x, y0 + 32), f"形の 言葉: {shape}", 13, K.SUB)
        yy = y0 + 56
        sh.img((x, yy), K.up(ic, 12).convert("RGBA") if False else _on_bg(K.up(ic, 12), (40, 46, 66)), "12 倍", 12)
        # 1 倍・2 倍・板
        bx = x + 16 * 12 + 20
        sh.img((bx, yy), _on_bg(ic, (40, 46, 66)), "1 倍", 12)
        sh.img((bx + 40, yy), _on_bg(K.up(ic, 2), (40, 46, 66)), "2 倍", 12)
        sh.img((bx + 100, yy), _on_bg(plate(ic), (90, 140, 80)), "HUD の 板", 12)
        # 確かめ
        sil = K.silhouette(ic)
        sh.img((bx, yy + 90), K.up(sil, 4), "① シルエット", 12)
        sh.img((bx + 90, yy + 90), K.up(K.gray(_on_bg(ic, (40, 46, 66))), 4), "② 白黒", 12)
        sh.img((bx + 180, yy + 90), K.blur(K.up(_on_bg(ic, (40, 46, 66)), 4), 2), "③ ぼかし", 12)
        # ならべ: ハート・風神剣と
        row = Image.new("RGBA", (16 * 3 * 2 + 16, 32), (40, 46, 66, 255))
        row.alpha_composite(K.up(hrt, 2), (0, 0))
        row.alpha_composite(K.up(ic, 2), (40, 0))
        row.alpha_composite(K.up(cur, 2), (80, 0))
        sh.img((bx, yy + 190), K.up(row, 2), "④ ハート・この 案・風神剣（2 倍 → さらに 2 倍）", 12)
        _wrap(sh, (x, yy + 290), desc, 34)
        # HUD に 小さく 重ねた 本物の 大きさ
        crop = hud.copy()
        crop.alpha_composite(plate(ic), (322, 548))
        sh.img((x, yy + 340), crop.crop((300, 520, 780, 700)), "原寸（体力の 上に 置いた とき）", 12)
        sh.table((x, yy + 560), K.criteria_rows(crit, K.CRITERIA_NAMES), [24, 120, 36, 380], 12, 18)
    sh.save(os.path.join(K.DOCS, "buff-icon-3.png"))
    hp = hud_place("I1")
    hp.convert("RGB").save(os.path.join(K.DOCS, "hud-place.png"))
    print("->", os.path.join(K.DOCS, "hud-place.png"))
    # 1 倍の 絵（下絵。ゲームに 入れるのは 決まって から developer）
    for k, (_, rows) in ICONS.items():
        icon(rows).save(os.path.join(HERE, f"buff_{k}_16.png"))


def _wrap(sh, xy, text, n):
    x, y = xy
    for i in range(0, len(text), n):
        sh.text((x, y), text[i:i + n], 14)
        y += 20


def _on_bg(im, col):
    bg = Image.new("RGBA", im.size, col + (255,))
    bg.alpha_composite(im.convert("RGBA"))
    return bg


if __name__ == "__main__":
    main()
