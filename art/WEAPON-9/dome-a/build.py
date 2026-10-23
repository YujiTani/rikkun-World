"""WEAPON-9 案 A「ひかりの まく」: 3D の 球の まくが 主役。ふちが 白金に 光り、まくの 上を にじの しまが 横に 回る。
実行: python3 art/WEAPON-9/dome-a/build.py
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import numpy as np  # noqa: E402
import kit9  # noqa: E402
import parts9  # noqa: E402
import sheet9  # noqa: E402
from kit9 import Sprite, rgb  # noqa: E402

PAL = {
    "W": "#FFF8E2", "Y1": "#FFE7A6", "Y2": "#E9B85C", "Y3": "#8A6A3A", "Y4": "#463826",
    "G": "#5FD98E", "B": "#4FA3F0", "M": "#D16BE6", "D": "#3A3270",
}
C = {k: rgb(v) for k, v in PAL.items()}
B = kit9.BAYER


def make_orb():
    """光の 玉（半径 1.5 ブロック = 12 点）。まん中は うすい 網だけ → 子が 見える"""
    s = Sprite(28, 28)
    c = 13.5
    kit9.ring_band(s, c, c, 9.0, 11.0, PAL["Y1"], dither_out=2.5)
    kit9.ring_band(s, c, c, 9.6, 10.4, PAL["W"])
    for y in range(28):
        for x in range(28):
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if 6.0 <= d < 9.0 and B[y % 4][x % 4] < 0.5:
                s.px(x, y, PAL["Y2"])
            elif d < 6.0 and B[y % 4][x % 4] < 0.25:
                s.px(x, y, PAL["Y3"])
    return s


def make_ring():
    n = 112  # 半径 7 ブロック ぶん（1 点 = 1/8）。とどまる 間の 輪 = 半径 6.4 = 51 点
    s = Sprite(n, n)
    kit9.ring_band(s, 56, 56, 47.5, 53.5, PAL["Y2"], dither_out=3)
    kit9.ring_band(s, 56, 56, 49.5, 52.0, PAL["Y1"])
    kit9.ring_band(s, 56, 56, 50.3, 51.3, PAL["W"])
    kit9.ring_band(s, 56, 56, 40, 41, PAL["Y3"])
    return s


def make_band_tile():
    """まくに はる にじの しま（1 まわりの 一部。よこ 48 × たて 24 点）"""
    s = Sprite(48, 24)
    for y in range(24):
        for x in range(48):
            seg = ["G", "B", "M"][(x // 16) % 3]
            yy = (y + round(2 * math.sin(x / 48 * 2 * math.pi))) % 24
            if yy in (3, 4, 5):
                s.px(x, y, PAL["W"] if yy == 4 else PAL[seg])
            elif yy in (13, 14):
                s.px(x, y, PAL[seg])
            elif yy in (2, 6, 12, 15) and B[y % 4][x % 4] < 0.5:
                s.px(x, y, PAL["D"])
    return s


ORB, RING, BAND = make_orb(), make_ring(), make_band_tile()
ORB_I, RING_I = ORB.composite(1), RING.composite(1)
HUE = [C["G"], C["B"], C["M"]]
BANDS = [(-0.12, 2.6), (0.24, 2.2), (0.58, 2.0)]  # (緯度 rad, はば 点)


def render(fr, st, t, first):
    r, feet, k = st["r"], st["feet"], st["k"]
    Cc = (0.0, feet + kit9.BODY_C, 0.0)
    q = round(k * 4) / 4  # 明るさは 4 段で 上がる 1 回だけ

    def shade(P, n, ndv, ilat, ilon, front, nlat, nlon):
        N = len(ndv)
        col = np.zeros((N, 3))
        m = np.zeros(N, bool)
        bx, by = ilon % 4, ilat % 4
        bay = B[by, bx]
        ov = np.zeros(N, bool)
        if front and not first:
            rim = 1 - ndv
            w = rim > 0.88
            y1 = (rim > 0.78) & ~w & (bay < 0.75)
            y2 = (rim > 0.62) & ~w & (rim <= 0.78) & (bay < 0.375)
            fill = (rim <= 0.62) & (bay < 0.0626) & (ilat % 8 == 0)
            col[w], col[y1], col[y2], col[fill] = C["W"], C["Y1"], C["Y2"] * 0.8, C["Y3"]
            m |= w | y1 | y2 | fill
            ov |= w | y1
        # にじの しま（両面。中から も 見える）
        lon = (ilon + 0.5) / nlon * 2 * math.pi
        lat_px = ilat - nlat / 2
        rot = t * 2 * math.pi / 6.0  # 6 秒で 1 まわり
        for la, wd in BANDS:
            c0 = la * nlat / math.pi + 1.6 * np.sin(lon + rot + la * 3)
            dd = np.abs(lat_px - c0)
            inb = dd < wd
            core = dd < 0.8
            hue = ((np.floor((lon - rot * 0.5 + la) / (2 * math.pi) * 6)).astype(int)) % 3
            hc = np.array(HUE)[hue]
            if not front and not first:  # 外から: 奥の しまは しんの 線だけ（すけて 見える）
                inb = core & (bay < 0.5)
            add = np.where(core[:, None], C["W"], hc)
            sel = inb & ~(m & ov)
            col[sel] = add[sel]
            m |= sel
            ov |= sel
        col[~ov] *= q
        if q < 1:  # 出る・消える は 網で 点を ぬく（明るさの 点滅 なし）
            ov &= bay < q
            m &= (bay < q) | ~ov
        return col, m, ov

    fr.sphere(Cc, r, shade)
    rr = kit9.ground_ring_radius(r, feet)
    if rr > 0.2:
        fr.decal(RING_I, 7.0 * rr / 6.4, k=q)
    if not first:
        o = 3.5 * min(1, r / 2)
        fr.sprite(ORB_I, Cc, o, o, additive=True, z_bias=-0.3)
    pts, life = sheet9.rise_frags(11, 24, Cc, r, t)
    cols = np.array([C["W"] if i % 3 == 0 else HUE[i % 3] for i in range(len(pts))])
    cols = np.where((life > 0.8)[:, None], C["Y2"], cols)  # きえる ころは 暗く（点滅しない）
    fr.dots(pts, cols, size_b=0.25, over=True)


P = dict(
    out=HERE,
    title="案 A「ひかりの まく」— 3D の 球の まくが 主役（まる ＋ よこの しま）",
    concept=[
        "見本 1 の 白金の ドーム を もとに: ふちが 白金に 光る 球。まくの 上を にじの しま 3 本が よこに 回る（6 秒で 1 まわり。うねりで うずに 見える）。",
        "まん中に 白金の 光の 玉（子が 網ごしに 見える）。地面に 白金の 輪（半径 6.4 = 当たり）。かけら 24 こが ゆっくり 上へ。色の 割合: 白金 7・にじ 2.5・暗い 0.5。",
        "形の 言葉: まる（球）＋ しかくの 落ち着き（水平の しま）。細かさ: まく ぜんたいに うすい 網 → 中。",
    ],
    palette=[(k, v, u) for k, v, u in [
        ("W", PAL["W"], "ふちの いちばん 明るい 所・しまの しん"), ("Y1", PAL["Y1"], "ふち・玉"), ("Y2", PAL["Y2"], "ふちの 内・輪"),
        ("Y3", PAL["Y3"], "まくの うすい 網・きえる かけら"), ("Y4", PAL["Y4"], "（とおい にじみ）"),
        ("G", PAL["G"], "にじ 緑"), ("B", PAL["B"], "にじ 青"), ("M", PAL["M"], "にじ 赤むらさき"), ("D", PAL["D"], "しまの へりの 網")]],
    pal_note="9 色（虹は 色の 数の 例外。オーナー決定）。足し算・半透明 なし",
    render=render,
    light=0.30, tint=(1.0, 0.95, 0.8),
    parts=[("光の 玉 28×28（6 倍）", ORB_I, 6), ("地面の 輪 112×112（2 倍）", RING_I, 2), ("まくの しま 48×24（4 倍）", BAND.composite(1), 4)],
    icon_note=[
        "A: 刃を よこぎる にじの しま（緑・青・赤むらさき 3 点ずつ）。",
        "刃の 左上 1 列は 白い 光。ふち 1 点 #241A44。12 色。",
        "手に 持つ: 今の 刀と 同じ 押し出し。刃の しまだけ 光る 材質（足し算 なし）",
    ],
    data=[
        ["描画回数", "4（まく＋しま 1・輪 1・玉 1・かけら〈点〉1）"],
        ["三角形", "148（球 16×6 の 下 1/4 を けずる 144・輪 2・玉 2・点 0）"],
        ["絵の 大きさ", "まくの しま 48×24 を くり返し・輪 112×112・玉 28×28"],
        ["色の 数", "9（白金 5 ＋ にじ 3 ＋ 網 1）"],
        ["一人称", "まく と 玉 を 出さない（しま・輪・かけら）"],
        ["斬撃", "今の 軌跡と 同じ（色だけ）→ ふえ 0"],
    ],
    six=[
        "決めの 絵: とどまる 160 ステップ 同じ 明るさ（しまが 回る だけ）",
        "ささる 所: 球は 地面で 切る ＋ 輪を 重ねて 切れ目を かくす",
        "重ね: 奥の まく（しま 75%）→ 子 → 玉 → 手前の ふち",
        "地面の 輪: 上から 見た 絵。半径 6.4 = 当たり",
        "まわりを 明るく: +30%・白金・3 段・うかぶ で 1 回だけ",
        "ドット: しま・ふちは 1/8 ブロックの 升目。網で すかす",
    ],
    criteria={1: ("○", "まるい 球の りんかくが すぐ 分かる"), 2: ("△", "昼の 空では 白金の ふちと 空の 明るさが 近い"),
              3: ("○", "ふちと 玉に 目が 行く"), 4: ("△", "まく ぜんたいに 網 → 少し ざわつく"), 5: ("○", "「ここまで」が 輪で 分かる"),
              6: ("○", "白金 7・にじ 2.5"), 7: ("○", "明るい ほど 黄みの 白、暗い ほど 茶"), 8: ("○", "雷 B（白〜黄）と 近い が しまで 区別"),
              9: ("○", "まる ＋ よこの しま"), 10: ("○", "雷 B と 同じ 1/8 の 点・足し算"), 12: ("○", "字 なしで 光の かべ"),
              13: ("○", "白黒でも ふちが 出る"), 16: ("○", "音 shiningStart と いっしょ"), 17: ("○", "見本の 大人っぽい 光わざ")},
    motion={1: ("○", "うかぶ 40・とどまる 160・おりる 40・もどり 20"), 2: ("○", "ふわーっと もちあげ ぴたっと 止まる"),
            3: ("○", "F8 で 玉が 出る"), 4: ("○", "ため 150 の 光（共通）"), 5: ("―", "当たりは ドーム（決め = とどまる）"),
            8: ("○", "広がりは 40 で 一気。間は ゆっくり 止め"), 9: ("○", "おりる で ちぢむ のが 見える"), 11: ("○", "半径 7 は 画面の たて いっぱい"),
            12: ("△", "まくは ふくらむ だけ（のび は ない）"), 16: ("○", "球の 絵 = 当たりの 球"), 18: ("○", "どの 向きでも 同じ 円")},
)

slash_pal = {k: rgb(PAL[k]) for k in ("W", "G", "B", "M")}
slash_pal = {k: PAL[k] for k in ("W", "G", "B", "M")}
P["slash"] = parts9.slash_set("A", slash_pal, HERE)
ic = parts9.icon("A", {"L": "#F4FFF8", "G": "#5FD98E", "B": "#4FA3F0", "M": "#D16BE6", "g2": "#2F8F62", "b2": "#2F66B8", "m2": "#8E3FA8"})
ic.save_png(os.path.join(HERE, "niji_icon_16.png"))
ic.preview(os.path.join(HERE, "icon_preview.png"), scale=12)
P["icon"] = ic.composite(1)
ORB.save_png(os.path.join(HERE, "orb_1x.png"))
RING.save_png(os.path.join(HERE, "ring_1x.png"))
BAND.save_png(os.path.join(HERE, "band_1x.png"))
sheet9.make(P)
for nm, sp in (("orb", ORB), ("ring", RING), ("band", BAND), ("icon", ic)):
    st = sp.stats(print_=False)
    print(nm, {k: st[k] for k in st if k in ("colors", "semi_alpha", "near_dups")} if isinstance(st, dict) else st)
