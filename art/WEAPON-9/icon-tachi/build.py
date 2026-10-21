"""WEAPON-9 虹の アイコン（16×16）: そった 長い 太刀。刃は 銀・刃文は にじ色。
柄は 金茶の 糸巻き ＋ 赤い ひし形・金の 柄頭・はばき・金の 木瓜四方透かし鍔（4 つの 丸い 花びらの すかし）。
見本の 写真は 写さない（言葉だけ）。16 色（ふち 1・銀 3・にじ 3・金 2・金茶 2・赤 1 ＋ 空き）。
実行: python3 art/WEAPON-9/icon-tachi/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import kit9  # noqa: E402
from kit9 import Sprite, rgb  # noqa: E402

PAL = {
    "K": "#241A44",
    "1": "#F4F7FF", "2": "#C3CEE2", "3": "#8E9CBA",  # 銀: 光・ふつう・かげ
    "G": "#5FD98E", "B": "#4FA3F0", "M": "#D16BE6",  # 刃文
    "Y": "#F6CB45", "y": "#B8860B",  # 金
    "T": "#B9772F", "t": "#7C4A1E",  # 金茶の 糸巻き
    "R": "#D2283C",  # 赤い ひし形
}

# 刃: 行ごとに みね側の x。上へ 行くほど 立つ（そりは 小さめ・長め）。はば 3 → 先は 2 → 1
MX = {7: 7, 6: 8, 5: 9, 4: 10, 3: 10, 2: 11, 1: 12, 0: 13}
HAMON = {7: "G", 6: "G", 5: "B", 4: "B", 3: "M", 2: "M", 1: "G"}
WIDE = (6, 4, 2)  # 刃文が 身の 方へ ふくらむ 行（波）


def build():
    g = {}
    # 鍔: 金の 円。まん中の まわりに すかし 4 つ（木瓜の 花びらの あいだ）
    tx, ty = 5, 10
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 4:
                g[(tx + dx, ty + dy)] = "Y" if (dx + dy) <= 0 else "y"
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        g[(tx + dx, ty + dy)] = "K"
    # 柄: 糸巻き（金茶）・赤い ひし形・柄頭（金）
    for i, (x, y) in enumerate(((3, 12), (2, 13), (1, 14))):
        for ox in (0, 1):
            g[(x + ox, y)] = "T" if (i + ox) % 2 == 0 else "t"
    for p in ((2, 13), (3, 13), (2, 12), (2, 14)):
        g[p] = "R"
    g[(2, 13)] = "R"
    for p, c in (((0, 15), "Y"), ((1, 15), "y"), ((0, 14), "Y")):
        g[p] = c
    # はばき
    g[(6, 8)] = "Y"; g[(7, 8)] = "Y"; g[(8, 8)] = "y"
    # 刃
    for y, mx in MX.items():
        if y == 0:
            g[(mx, 0)] = "1"; g[(mx + 1, 0)] = "2"
            continue
        g[(mx, y)] = "1"
        g[(mx + 1, y)] = HAMON[y] if y in WIDE else "2"
        if y == 1:
            continue
        g[(mx + 2, y)] = HAMON[y]
    s = Sprite(16, 16)
    for (x, y), ch in g.items():
        s.px(x, y, PAL[ch])
    s.outline(PAL["K"], where="outside")
    return s


if __name__ == "__main__":
    s = build()
    s.save_png(os.path.join(HERE, "niji_icon_16.png"))
    s.preview(os.path.join(HERE, "icon_preview.png"), scale=16)
    print(s.stats(print_=False))
