"""WEAPON-9 最終（選ばれた 案 B「にじの おび」＋ A の 仕上げの 中）: 外から「光の 球の 中に いる」と 分かる。ふちの 外に こい 紺の 縁、まくに うすい 光の 網、まん中に 白い 玉。
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
    """光の 玉（半径 1.5 ブロック = 12 点）。まん中は 白い 玉（子の うしろ）、まわりに 白金の 光の はね"""
    s = Sprite(32, 32)
    c = 15.5
    kit9.ring_band(s, c, c, 6.0, 13.0, PAL["Y2"], dither_out=3.0)
    kit9.ring_band(s, c, c, 0.0, 10.0, PAL["Y1"])
    for y in range(32):
        for x in range(32):
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if 8.0 <= d < 10.0 and B[y % 4][x % 4] < 0.5:
                s.px(x, y, PAL["Y2"])
    kit9.ring_band(s, c, c, 0.0, 6.5, PAL["W"])
    return s


def make_ring():
    n = 112  # 半径 7 ブロック ぶん（1 点 = 1/8）。とどまる 間の 輪 = 半径 6.4 = 51 点
    s = Sprite(n, n)
    kit9.ring_band(s, 56, 56, 47.5, 53.5, PAL["Y2"], dither_out=3)
    kit9.ring_band(s, 56, 56, 49.5, 52.0, PAL["Y1"])
    kit9.ring_band(s, 56, 56, 50.3, 51.3, PAL["W"])
    kit9.ring_band(s, 56, 56, 40, 41, PAL["Y3"])
    kit9.ring_band(s, 56, 56, 53.6, 54.8, PAL["D"])
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



def make_slash():
    """にじの 斬撃 A（しまの 太い 弧）。昼の 空の 前でも 出るよう 外がわに 紺の 縁（5 色）"""
    res = []
    strip = kit9.Image.new("RGBA", (64 * 4, 44), (0, 0, 0, 0))
    for i, (lab, tail, head, sc, thin) in enumerate(parts9.SLASH_FRAMES):
        sl = parts9.slash("A", {k: PAL[k] for k in ("W", "G", "B", "M")}, tail, head, sc, thin)
        sl.outline(PAL["D"], where="outside")
        im = sl.composite(1)
        res.append((lab, im))
        strip.paste(im, (64 * i, 0))
    strip.save(os.path.join(HERE, "slash_1x.png"))
    return res


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
        dk_all = np.zeros(N, bool)
        if front and not first:
            rim = 1 - ndv
            dk = (rim > 0.925)  # いちばん 外: こい 紺の 縁（昼の 空でも りんかくが 出る）
            w = (rim > 0.82) & ~dk
            y1 = (rim > 0.7) & ~w & ~dk & (bay < 0.8)
            y2 = (rim > 0.55) & ~w & ~dk & (rim <= 0.7) & (bay < 0.5)
            fill = (rim <= 0.55) & (bay < 0.13)  # まく ぜんたいに うすい 光の 網
            col[dk], col[w], col[y1], col[y2], col[fill] = C["D"], C["W"], C["Y1"], C["Y2"], C["Y1"]
            m |= w | y1 | y2 | fill | dk
            ov |= w | y1 | dk | fill | y2
            dk_all = dk | w
        # にじの しま（両面。中から も 見える）
        lon = (ilon + 0.5) / nlon * 2 * math.pi
        lat_px = ilat - nlat / 2
        lon = (ilon + 0.5) / nlon * 2 * math.pi
        lat_px = ilat - nlat / 2
        rot = t * 2 * math.pi / 6.0  # 6 秒で 1 まわり
        # にじの おび 4 本（B）: うずを まく ならせん。5 秒で 1 まわり。上へ 行くほど 細く とがる
        rot = t * 2 * math.pi / 5.0
        ln = (lat_px + nlat / 2) / nlat  # 0 = 下 … 1 = 上
        for pass_ in (0,):
            u = ((lon - rot - ln * 1.9 * math.pi) / (2 * math.pi) * 4) % 1.0
            wdt = 0.27 * np.clip(1.0 - 0.75 * np.clip(ln - 0.15, 0, 1), 0.12, 1)
            if not front and not first:
                inb = (u < wdt) & (np.abs(u - wdt / 2) < 0.04) & (bay < 0.5)
            else:
                inb = (u < wdt) & ((ln > 0.28) | (bay < (ln + 0.05) * 3.4))
            jj = (np.floor((lon - rot - ln * 1.9 * math.pi) / (2 * math.pi) * 4)).astype(int)
            hue = (jj + np.floor(ln * 3 + t * 0.6).astype(int)) % 3
            hc = np.array(HUE)[hue]
            if not front and not first:
                hc = np.array([C["G"], C["B"], C["M"]])[hue] * 0.8
            core = np.abs(u - wdt * 0.45) < wdt * 0.12
            add = np.where(core[:, None], C["W"], hc)
            sel = inb & ~(m & ov & ~dk_all)
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
        o = 4.0 * min(1, r / 2)
        fr.sprite(ORB_I, Cc, o, o, additive=True, z_bias=0.4)
    pts, life = sheet9.rise_frags(11, 24, Cc, r, t)
    cols = np.array([C["W"] if i % 3 == 0 else HUE[i % 3] for i in range(len(pts))])
    cols = np.where((life > 0.8)[:, None], C["Y2"], cols)  # きえる ころは 暗く（点滅しない）
    fr.dots(pts, cols, size_b=0.25, over=True)


P = dict(
    out=HERE,
    title="虹 最終: ドーム A「ひかりの まく」・にじの 斬撃 A・太刀の アイコン",
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
    parts=[("光の 玉 32×32（6 倍）", ORB_I, 6), ("地面の 輪 112×112（2 倍）", RING_I, 2), ("まくの しま 48×24（4 倍）", BAND.composite(1), 4)],
    icon_note=[
        "A: 刃を よこぎる にじの しま（緑・青・赤むらさき 3 点ずつ）。",
        "刃の 左上 1 列は 白い 光。ふち 1 点 #241A44。12 色。",
        "手に 持つ: 今の 刀と 同じ 押し出し。刃の しまだけ 光る 材質（足し算 なし）",
    ],
    data=[
        ["描画回数", "4（まく＋しま 1・輪 1・玉 1・かけら〈点〉1）"],
        ["三角形", "148（球 16×6 の 下 1/4 を けずる 144・輪 2・玉 2・点 0）"],
        ["絵の 大きさ", "まくの しま 48×24 を くり返し・輪 112×112・玉 32×32"],
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
    criteria={1: ("○", "まるい 球の りんかくが すぐ 分かる"), 2: ("○", "ふちの 外に 紺の 縁 → 昼の 空でも りんかくが 出る"),
              3: ("○", "ふちと 玉に 目が 行く"), 4: ("△", "まく ぜんたいに 網 → 少し ざわつく"), 5: ("○", "「ここまで」が 輪で 分かる"),
              6: ("○", "白金 7・にじ 2.5"), 7: ("○", "明るい ほど 黄みの 白、暗い ほど 茶"), 8: ("○", "雷 B（白〜黄）と 近い が しまで 区別"),
              9: ("○", "まる ＋ よこの しま"), 10: ("○", "雷 B と 同じ 1/8 の 点・足し算"), 12: ("○", "字 なしで 光の かべ"),
              13: ("○", "白黒でも ふちが 出る"), 16: ("○", "音 shiningStart と いっしょ"), 17: ("○", "見本の 大人っぽい 光わざ")},
    motion={1: ("○", "うかぶ 40・とどまる 160・おりる 40・もどり 20"), 2: ("○", "ふわーっと もちあげ ぴたっと 止まる"),
            3: ("○", "F8 で 玉が 出る"), 4: ("○", "ため 150 の 光（共通）"), 5: ("―", "当たりは ドーム（決め = とどまる）"),
            8: ("○", "広がりは 40 で 一気。間は ゆっくり 止め"), 9: ("○", "おりる で ちぢむ のが 見える"), 11: ("○", "半径 7 は 画面の たて いっぱい"),
            12: ("△", "まくは ふくらむ だけ（のび は ない）"), 16: ("○", "球の 絵 = 当たりの 球"), 18: ("○", "どの 向きでも 同じ 円")},
)

import importlib.util  # noqa: E402
sp = importlib.util.spec_from_file_location("icon_tachi", os.path.join(HERE, "..", "icon-tachi", "build.py"))
it = importlib.util.module_from_spec(sp)
sp.loader.exec_module(it)
ic = it.build()
ic.save_png(os.path.join(HERE, "niji_icon_16.png"))
ic.preview(os.path.join(HERE, "icon_preview.png"), scale=12)
P["icon"] = ic.composite(1)
P["slash"] = make_slash()
ORB.save_png(os.path.join(HERE, "orb_1x.png"))
RING.save_png(os.path.join(HERE, "ring_1x.png"))
BAND.save_png(os.path.join(HERE, "band_1x.png"))
sheet9.make(P)
for nm, sp in (("orb", ORB), ("ring", RING), ("band", BAND), ("icon", ic)):
    st = sp.stats(print_=False)
    print(nm, {k: st[k] for k in st if k in ("colors", "semi_alpha", "near_dups")} if isinstance(st, dict) else st)
