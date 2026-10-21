"""WEAPON-8: 速さバフの アイコン 3 案（16×16。ふち 1 点 K = 風神剣と 同じ #12304A。光は 左上から）"""
from PIL import Image

PAL = {
    "K": "#12304A",  # ふち（風神剣と 同じ）
    "W": "#F4FCFF",  # いちばん 明るい
    "L": "#CDEFFC",
    "C": "#8FD6F2",
    "c": "#4FA8D8",
    "B": "#2B6699",
    "P": "#F0509A",  # くつ（りっくんの くつの ピンク）
    "p": "#B8296E",
    "S": "#E4E8F0",  # くつ底
    "s": "#9AA6BC",
}

# I1 はやい くつ（くつ ＋ うしろに 風の 線 3 本。しかく）
SHOE = [
    "................",
    "................",
    "................",
    "........KKKK....",
    "KKKK...KPPPpK...",
    "KWLCK..KPWPpK...",
    ".KKKK.KPPWPPKK..",
    "......KPPPWPPPKK",
    "KKKKKKKPPPPPPPpK",
    "KWWLLCKPPPPPWWWK",
    ".KKKKKKSSSSSSSSK",
    "KKKK...KssssssK.",
    "KLCcK...KKKKKK..",
    ".KKKK...........",
    "................",
    "................",
]

def _grid():
    return [["." for _ in range(16)] for _ in range(16)]


def _outline(g):
    out = [r[:] for r in g]
    for y in range(16):
        for x in range(16):
            if g[y][x] != ".":
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < 16 and 0 <= yy < 16 and g[yy][xx] not in (".", "K"):
                    out[y][x] = "K"
                    break
    return ["".join(r) for r in out]


def tornado():
    """I2 たつまき（上が ひろく 下が とがる 風の うず。うずの 段が 左右に ゆれる。まる＋さんかく）"""
    g = _grid()
    layers = [(1, 1, 14), (3, 2, 11), (5, 4, 9), (7, 3, 7), (9, 5, 6), (11, 6, 4), (13, 8, 2)]
    for row, x0, w in layers:
        for i in range(w):
            x = x0 + i
            t = i / max(1, w - 1)
            ch = "W" if t < 0.25 else ("L" if t < 0.55 else ("C" if t < 0.8 else "c"))
            if row >= 9 and ch == "W":
                ch = "L"
            g[row][x] = ch
    g[14][9] = "c"
    return _outline(g)


def arrows():
    """I3 ≫（くの字 2 つ ＋ 風の 線 2 本。さんかく）"""
    g = _grid()
    for x0 in (4, 9):
        for y in range(2, 13):
            dx = 5 - abs(y - 7) - 1
            for k in (0, 1):
                x = x0 + dx + k - 1
                if 0 <= x < 15:
                    g[y][x] = ("W" if k == 0 else "L") if y < 7 else ("C" if k == 0 else "c")
            if y == 7:
                g[y][x0 + dx + 1] = "W"
    for (y, x0, x1) in ((5, 1, 3), (9, 0, 2)):
        for x in range(x0, x1 + 1):
            g[y][x] = "L" if x < x1 else "C"
    return _outline(g)


SWIRL = tornado()
ARROW = arrows()

ICONS = {"I1": ("はやい くつ", SHOE), "I2": ("たつまき", SWIRL), "I3": ("はやい やじるし", ARROW)}


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def icon(rows):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        assert len(r) == 16, (y, r, len(r))
        for x, ch in enumerate(r):
            if ch != ".":
                im.putpixel((x, y), hx(PAL[ch]) + (255,))
    return im


if __name__ == "__main__":
    out = Image.new("RGBA", (3 * 16 * 8 + 40, 16 * 8), (40, 46, 66, 255))
    for i, (k, (n, rows)) in enumerate(ICONS.items()):
        im = icon(rows).resize((128, 128), Image.NEAREST)
        out.alpha_composite(im, (i * 148, 0))
    out.save("/tmp/claude-0/-home-user-rikkun-World/051e33fe-27d4-5f43-8b62-d6186aceedfa/scratchpad/icons.png")
