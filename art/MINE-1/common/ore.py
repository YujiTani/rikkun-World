"""鉱石の 遠く用の 絵（16×16）の 道具。B「とびだす つぶ」の ならび（1 面 9×9 小ブロック）を 16 点に うつす。
つぶの 座標は `docs/art/mine-1/proto/designs.py.txt` の opt_b（coal_layout・iron_layout・gold_layout・cry_layout・hot_layout・dia_layout）の まま。
うつし方: 1 小ブロック ≒ 16/9 = 1.78 点。つぶごとに 大きさを 四捨五入（1 → 2 点、2 → 4 点、3 → 5 点、5 → 9 点）、
位置は つぶの 中心を 合わせる（`fit()`）。1 点ずつ 四捨五入 すると 小ブロックの 太さが 1 点と 2 点に ばらつく ため、つぶごとに まとめて おく。
石の 地は ゲームの いまの `stone`（ほたるいしだけ こい 青灰）。影は 描かない（ゲームの 面の 明るさで 出る）。ふち線 なし。
"""
import math

from mine import *

SC = 16 / 9

# つぶの ならび（designs.py の pick の 3 つ。1 面ごとに ハッシュで 1 つ えらぶ もの。ここでは 見えかたの よい 1 つを 使う）
COAL_LAYOUTS = [[(1, 1), (5, 4), (1, 6)], [(4, 1), (0, 4), (5, 7)], [(2, 2), (6, 4), (1, 6)]]                       # (u0, v0) 3×1 の 板
IRON_LAYOUTS = [[(1, 1), (5, 4)], [(4, 0), (0, 5)], [(1, 5), (5, 1)]]                                               # (u0, v0) 3×3 の こぶ
GOLD_LAYOUTS = [[(1, 1, 2), (5, 5, 2), (2, 6, 1)], [(5, 1, 2), (2, 3, 1), (1, 6, 2)], [(3, 2, 2), (6, 6, 1), (1, 5, 2)]]  # (u0, v0, 大きさ)
CRY_LAYOUTS = [(1, 1), (3, 2), (2, 3)]                                                                              # (u0, v0) 太い はしらの 左上
HOT_LAYOUTS = [[(1, 1), (5, 2), (2, 5), (6, 6), (4, 7)], [(2, 1), (6, 1), (1, 4), (5, 5), (2, 7)], [(1, 2), (4, 1), (7, 3), (3, 5), (6, 7)]]  # 芯の (u, v)
DIA_LAYOUTS = [((3, 3), (7, 7)), ((5, 4), (1, 7)), ((4, 5), (7, 1))]                                                # (ひし形の まん中, かけら)


def rh(x):
    return int(math.floor(x + 0.5))


def fit(u0, w):
    """小ブロックの はば [u0, u0 + w) → (はじまりの 点, 点の はば)"""
    size = max(1, rh(w * SC))
    start = rh((u0 + w / 2) * SC - size / 2)
    return max(0, min(T - size, start)), size


def put(t, x, y, rows, cmap):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in cmap and 0 <= x + i < T and 0 <= y + j < T:
                t[y + j, x + i] = hx(cmap[ch])


# つぶの 形（点の ならび。a = 光、b = 地、c = 下の 層。1 小ブロック = 2 点 か 1 点）
SLAB = ['aabbb', 'aabbb']                                   # 3×1 の 板。左はしの 1 マスが つや
LUMP = ['.cbc.', 'ccbcc', 'bbabb', 'ccbcc', '.cbc.']        # 3×3 の こぶ（＋ の 形が 明るい、かどは 下の 層）。ほたるの わも 同じ 形。四すみの 外がわ 1 点だけ けずって まるく（まるい こぶ）
NUG2 = ['aabb', 'aabb', 'bbbb', 'bbbb']                     # 2×2 の 粒。左上の 1 マスが 光
DOT1 = ['aa', 'aa']                                         # 1×1 の 粒


def place(t, u0, v0, w, h, rows, cmap):
    x, _ = fit(u0, w)
    y, _ = fit(v0, h)
    put(t, x, y, rows, cmap)


def stone_tile():
    return cur_stone()


def slate_tile():
    """ほたるいしの 地: こい 青灰 `#5E6672`（まだら `#535A66`・`#6A7380`、calm）"""
    return calm(speckle(SLATE, ['#535A66', '#6A7380'], 161, 34), SLATE)


def coal(variant=0):
    t = stone_tile()
    for (u, v) in COAL_LAYOUTS[variant]:
        place(t, u, v, 3, 1, SLAB, dict(a=COAL['hi'], b=COAL['main']))
    return t


def iron(variant=2):
    t = stone_tile()
    for (u, v) in IRON_LAYOUTS[variant]:
        place(t, u, v, 3, 3, LUMP, dict(a=IRON['hi'], b=IRON['main'], c=IRON['lo']))
    return t


def gold(variant=0):
    t = stone_tile()
    for (u, v, s) in GOLD_LAYOUTS[variant]:
        place(t, u, v, s, s, NUG2 if s == 2 else DOT1, dict(a=GOLD['hi'], b=GOLD['main']))
    return t


def crystal(variant=1):
    t = stone_tile()
    cm = dict(a=CRY['hi'], b=CRY['main'])
    u0, v0 = CRY_LAYOUTS[variant]
    place(t, u0, v0, 2, 2, NUG2, cm)                                    # 太い はしら（先が 光）
    for (du, dv) in ((3, 0), (2, 3), (0, 3)):                           # 細い はしら 3 本
        place(t, u0 + du, v0 + dv, 1, 1, DOT1, cm)
    return t


def hotaru(variant=1):
    t = slate_tile()
    cm = dict(a=HOT['core'], b=HOT['main'], c=HOT['lo'])
    for (u, v) in HOT_LAYOUTS[variant]:
        place(t, u - 1, v - 1, 3, 3, LUMP, cm)                          # 芯の まわり 3×3
    return t


def rhombus2():
    """ひし形 |u| + |v| ≦ 2 の 13 マス（1 小ブロック = 2 点 四方）。左上 = 光(a)・ななめの 列 = 地(b)・右下 = かげ(c)、右上に ピンク(p)・左下に きいろ(y)"""
    cells = {}
    for dv in range(-2, 3):
        for du in range(-2, 3):
            if abs(du) + abs(dv) <= 2:
                s_ = du + dv
                k = 'a' if s_ < 0 else ('c' if s_ > 0 else 'b')
                if (du, dv) == (1, -1):
                    k = 'p'
                if (du, dv) == (-1, 1):
                    k = 'y'
                cells[(du, dv)] = k
    return cells


def diamond(variant=2):
    t = stone_tile()
    (cu, cv), (pu, pv) = DIA_LAYOUTS[variant]
    cm = dict(a=DIA['hi'], b=DIA['main'], c=DIA['lo'], p=DIA['pink'], y=DIA['yel'])
    x0 = max(0, min(T - 10, rh((cu + 0.5) * SC - 5)))     # ひし形は 10×10 点（5 小ブロック × 2 点）
    y0 = max(0, min(T - 10, rh((cv + 0.5) * SC - 5)))
    for (du, dv), k in rhombus2().items():
        for j in range(2):
            for i in range(2):
                t[y0 + (dv + 2) * 2 + j, x0 + (du + 2) * 2 + i] = hx(cm[k])
    place(t, pu, pv, 1, 1, DOT1, dict(a=DIA['hi']))                     # 1×1 の かけら
    return t
