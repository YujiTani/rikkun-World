"""WEAPON-9: 虹の にじの 斬撃 A の 「寝かせた 絵」（うしろからの カメラ用）。
よこから 見た 絵（slash_1x.png）は 半円の 弧。うしろから 見ると 地面と ならんで 振る 弧は 上下に つぶれて 見える
ので、同じ 計算（parts9.slash）を 上下に ky 倍に つぶした 空間で 点ごとに 描く（絵を 後から のばし ちぢみ しない）。
64×44 × 4 コマ（今と 同じ）。実行: python3 art/WEAPON-9/final/build_lying.py → slash_lying_1x.png
"""
import math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import kit9, parts9  # noqa
from kit9 import Sprite

PAL = {"W": "#FFF8E2", "G": "#5FD98E", "B": "#4FA3F0", "M": "#D16BE6", "D": "#3A3270"}
KY = 0.5  # うしろから 見た 上下の つぶれ
BAY = parts9.BAY


def slash_lying(tail, head, sc, thin):
    s = Sprite(64, 44)
    cx, cy, R = 32, 36.5, 30
    Tmax = 12 * sc
    for y in range(44):
        for x in range(64):
            dx, dy = x + 0.5 - cx, (cy - (y + 0.5)) / KY
            r = math.hypot(dx, dy)
            th = math.degrees(math.atan2(dy, dx))
            if not (15 <= th <= 165):
                continue
            q = (165 - th) / 150
            if not (tail <= q <= head):
                continue
            u = (q - tail) / max(1e-3, head - tail)
            w = Tmax * (u ** 0.7) * (1.0 if u < 0.9 else max(0.35, 1 - (u - 0.9) * 6))
            e = R - r
            if e < 0 or e > w or w < 0.6:
                continue
            f = e / max(w, 1e-3)
            if thin > 0 and BAY[y % 4][x % 4] < thin:
                continue
            c = PAL["W"] if f < 0.2 else PAL["M"] if f < 0.45 else PAL["B"] if f < 0.7 else PAL["G"]
            if f > 0.85 and BAY[y % 4][x % 4] < 0.5:
                continue
            s.px(x, y, c)
    return s


def main():
    strip = kit9.Image.new("RGBA", (64 * 4, 44), (0, 0, 0, 0))
    for i, (lab, tail, head, sc, thin) in enumerate(parts9.SLASH_FRAMES):
        sl = slash_lying(tail, head, sc, thin)
        sl.outline(PAL["D"], where="outside")
        strip.paste(sl.composite(1), (64 * i, 0))
    strip.save(os.path.join(HERE, "slash_lying_1x.png"))


if __name__ == "__main__":
    main()
