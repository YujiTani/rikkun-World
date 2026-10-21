"""WEAPON-9 案 C「ほしの たま」: まん中の 大きな 光の 玉（4 本の 光の すじの 星）と にじの かけらが 主役。
まくは きらきらの 点線の ふち、帯は ななめの 軌道 2 本を かけらが 回る。
実行: python3 art/WEAPON-9/dome-c/build.py
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
    "W": "#FFFDF2", "C1": "#D8F4FF", "C2": "#86C8F0", "C3": "#3F78B0", "C4": "#22385E",
    "G": "#5FD98E", "B": "#4FA3F0", "M": "#D16BE6",
}
C = {k: rgb(v) for k, v in PAL.items()}
B = kit9.BAYER
HUE = [C["G"], C["B"], C["M"]]
DIAMOND = [(0, -2), (-1, -1), (0, -1), (1, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)]


def make_star():
    """光の 玉（半径 2 ブロック = 16 点）＋ 4 本の すじ（星）。64×64 = 8 ブロック"""
    n = 64
    s = Sprite(n, n)
    c = n / 2
    for y in range(n):
        for x in range(n):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            d = math.hypot(dx, dy)
            arm = min(abs(dx), abs(dy))
            if d < 16:
                if d > 13.5:
                    s.px(x, y, PAL["W"])
                elif d > 10.5:
                    s.px(x, y, PAL["C1"])
                elif B[y % 4][x % 4] < (0.5 if d > 7 else 0.25):
                    s.px(x, y, PAL["C2"])
            elif d < 19 and B[y % 4][x % 4] < (19 - d) / 3 * 0.6:
                s.px(x, y, PAL["C2"])
            if d >= 13.5 and arm < max(0.6, 2.2 * (1 - d / 32)) and d < 31:
                s.px(x, y, PAL["W"] if arm < 1.0 else PAL["C1"])
    return s


def make_rim():
    """まくの ふち（カメラに 正面の 円）。細い 線 ＋ 16 この きらきら"""
    n = 120
    s = Sprite(n, n)
    c = n / 2
    for y in range(n):
        for x in range(n):
            d = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if 55.3 <= d < 56.3 and (x + y) % 3 != 0:
                s.px(x, y, PAL["C2"])
    for i in range(16):
        a = i * math.pi / 8 + 0.2
        x0, y0 = round(c + 56 * math.cos(a) - 0.5), round(c + 56 * math.sin(a) - 0.5)
        big = i % 2 == 0
        for ox, oy in (DIAMOND if big else [(0, -1), (-1, 0), (0, 0), (1, 0), (0, 1)]):
            s.px(x0 + ox, y0 + oy, PAL["W"] if (ox, oy) == (0, 0) else PAL["C1"])
    return s


def make_ring():
    n = 112
    s = Sprite(n, n)
    kit9.ring_band(s, 56, 56, 50.6, 51.6, PAL["C1"])
    kit9.ring_band(s, 56, 56, 47.0, 47.8, PAL["C3"])
    for i in range(8):
        a = i * math.pi / 4
        x0, y0 = round(56 + 51 * math.cos(a)), round(56 + 51 * math.sin(a))
        for ox, oy in DIAMOND:
            s.px(x0 + ox, y0 + oy, PAL["W"] if (ox, oy) == (0, 0) else [PAL["G"], PAL["B"], PAL["M"]][i % 3])
    return s


def make_shard():
    s = Sprite(5, 5)
    for ox, oy in DIAMOND:
        s.px(2 + ox, 2 + oy, PAL["W"] if (ox, oy) == (0, 0) else PAL["M"])
    return s


STAR, RIM, RING, SHARD = make_star(), make_rim(), make_ring(), make_shard()
STAR_I, RIM_I, RING_I = STAR.composite(1), RIM.composite(1), RING.composite(1)
ORBITS = [(math.radians(28), 0.0, 1), (math.radians(-24), math.pi / 2, -1)]  # (かたむき, 向き, 回る 向き)


def orbit_pts(Cc, R, tilt, yaw, u):
    x, z = R * np.cos(u), R * np.sin(u)
    y = z * math.sin(tilt)
    z = z * math.cos(tilt)
    xr = x * math.cos(yaw) - z * math.sin(yaw)
    zr = x * math.sin(yaw) + z * math.cos(yaw)
    return np.stack([Cc[0] + xr, Cc[1] + y, Cc[2] + zr], -1)


def render(fr, st, t, first):
    r, feet, k = st["r"], st["feet"], st["k"]
    Cc = np.array((0.0, feet + kit9.BODY_C, 0.0))
    if not first:
        D = np.linalg.norm(fr.cam.pos - Cc)
        if D > r + 0.3:
            sz = 2 * r * D / math.sqrt(D * D - r * r) * 120 / 112.6
            fr.sprite(RIM_I, Cc, sz, sz, additive="over")
    rr = kit9.ground_ring_radius(r, feet)
    if rr > 0.2:
        fr.decal(RING_I, 7.0 * rr / 6.4, over_colors=[tuple(C[c]) for c in ("W", "C1", "G", "B", "M")])
    if not first:
        o = 8.0 * min(1, r / 3.5)
        fr.sprite(STAR_I, Cc, o, o, additive=True, z_bias=-0.3)
    # ななめの 軌道 2 本（細い にじの 線・カメラに 正面）＋ かけら 6 こずつ（うず）
    pts, wid, col = [], [], []
    for oi, (tilt, yaw, dirn) in enumerate(ORBITS):
        u = np.linspace(0, 2 * math.pi, 220, endpoint=False)
        P = orbit_pts(Cc, r * 0.92, tilt, yaw, u)
        hue = (np.floor((u / (2 * math.pi) * 6 + dirn * t * 0.5)) % 3).astype(int)
        for i in range(len(u)):
            if i % 4 == 3:
                continue  # 点線（すきまを あけて 軽く）
            pts.append(P[i]); wid.append(0.16); col.append(HUE[hue[i]])
        for j in range(6):
            uu = dirn * t * 2 * math.pi / 5.0 + j * math.pi / 3 + oi
            for tr in range(4):  # かけらの うしろに 小さな あと 3 つ
                p = orbit_pts(Cc, r * 0.92, tilt, yaw, np.array([uu - dirn * tr * 0.07]))[0]
                pts.append(p); wid.append(0.5 if tr == 0 else 0.22 - tr * 0.04)
                col.append(C["W"] if tr == 0 else HUE[(j + oi) % 3])
    pts, wid, col = np.array(pts), np.array(wid), np.array(col)
    _, _, z = fr.cam.project(pts)
    order = np.argsort(-z, kind="stable")
    fr.ribbon(pts[order], wid[order], col[order], over=True)
    # かけらの 色の まわり（ひしがた）
    fp, life = sheet9.rise_frags(31, 24, Cc, r, t)
    cols = np.array([HUE[i % 3] if i % 4 else C["W"] for i in range(len(fp))])
    cols = np.where((life > 0.8)[:, None], C["C3"], cols)
    fr.dots(fp, cols, size_b=0.3, over=True)


P = dict(
    out=HERE,
    title="案 C「ほしの たま」— まん中の 光の 玉 と にじの かけらが 主役（まる ＋ ほし・ひしがた）",
    concept=[
        "見本 3 の 星の ドーム を もとに: 子を つつむ 大きな 光の 玉（半径 2）から 4 本の 光の すじ。まくは 細い 点線と 16 この きらきら だけ（いちばん すける）。",
        "帯は ななめの 軌道 2 本（細い にじの 点線）を にじの かけら 6 こずつが 回る（5 秒で 1 まわり・あとを ひく）。地面に 細い 輪と ひしがた 8 こ。",
        "形の 言葉: まる（玉）＋ さんかく（ひしがた・すじ）。色の 割合: 空と 地面 8・白〜水色 1.5・にじ 0.5。細かさ: まん中に 集め、まわりは 余白。",
    ],
    palette=[(k, PAL[k], u) for k, u in [
        ("W", "玉の ふち・すじ・かけらの しん"), ("C1", "玉・きらきら・輪"), ("C2", "玉の 網・ふちの 点線"), ("C3", "輪の 内・きえる かけら"), ("C4", "（とおい にじみ）"),
        ("G", "にじ 緑"), ("B", "にじ 青"), ("M", "にじ 赤むらさき")]],
    pal_note="8 色（虹は 色の 数の 例外）。玉は 足し算・線と かけらは ふつうの 重ね",
    render=render,
    light=0.35, tint=(0.9, 0.97, 1.0),
    parts=[("光の 玉＋すじ 64×64（3 倍）", STAR_I, 3), ("ふち 120×120（2 倍）", RIM_I, 2), ("地面の 輪 112×112（2 倍）", RING_I, 2), ("かけら 5×5（10 倍）", SHARD.composite(1), 10)],
    icon_note=[
        "C: すきとおる 水晶の 刃（水色 4 段）。しんに 緑・青・赤むらさきの つぶ。",
        "左上に 小さな にじの きらり（ふち なし）。ふち 1 点 #241A44。12 色。",
        "手に 持つ: 押し出し。しんの つぶ だけ 光る 材質（いちばん おとなしい）",
    ],
    data=[
        ["描画回数", "3（板の アトラス 1〈玉・ふち・軌道・回る かけら〉・輪 1・舞う かけら〈点〉1）"],
        ["三角形", "126（玉 2・ふち 2・軌道 2 本×24 区切り 96・回る かけら 12×2・輪 2・点 0）"],
        ["絵の 大きさ", "アトラス 256×128（玉・ふち・かけら）＋ 輪 112×112"],
        ["色の 数", "8（白〜水色 5 ＋ にじ 3）"],
        ["一人称", "ふち と 玉 を 出さない（軌道・かけら・輪）"],
        ["斬撃", "今の 軌跡（色）＋ ひしがた 4 こ（今の 星と 同じ 入れ口）"],
    ],
    six=[
        "決めの 絵: とどまる 160 は 明るさ 一定。かけらが 回る だけ",
        "ささる 所: 玉と 軌道は 地面に ささらない。輪の ひしがたで 地面に のせる",
        "重ね: 奥の 軌道 → 子 → 玉（足し算）→ 手前の 軌道・かけら",
        "地面の 輪: 上から 見た 絵。細い 輪 = 半径 6.4 = 当たり",
        "まわりを 明るく: +35%・水色・3 段・うかぶ で 1 回だけ",
        "ドット: 玉・すじ・ひしがたは 1/8 ブロックの 点",
    ],
    criteria={1: ("△", "まくが 点線だけ → 「球」より 「玉と 輪」に 見えやすい"), 2: ("○", "玉の 白と 子の 明るさが ちがう"),
              3: ("○", "まん中の 玉に 目が 行く（子も そこ）"), 4: ("○", "細かさは まん中だけ"), 5: ("△", "ドームの 大きさは 輪で 分かるが まくは 弱い"),
              6: ("○", "にじは 小さい 面積"), 7: ("○", "白 → 水色 → 青"), 8: ("○", "雷 B（黄）と 色の なかまが ちがう"),
              9: ("○", "まる ＋ ひしがた"), 10: ("○", "雷 B と 同じ「光の 玉」"), 12: ("○", "字 なしで 光の 玉"),
              13: ("○", "白黒でも 玉が 出る"), 16: ("○", "音と いっしょ"), 17: ("○", "見本 3 の 星の 光わざ")},
    motion={1: ("○", "うかぶ 40・とどまる 160・おりる 40・もどり 20"), 2: ("○", "光の 玉に もちあげられ ぴたっと"),
            3: ("○", "F8 で 玉"), 4: ("○", "ため 150 の 光（共通）"), 5: ("―", "当たりは ドーム"),
            8: ("○", "40 で 一気"), 9: ("○", "おりる で 玉が しぼむ"), 11: ("△", "まくが 細いので 半径 7 が 小さく 感じる"),
            12: ("○", "玉が ふくらむ"), 13: ("○", "軌道 2 本が ちがう かたむき"), 16: ("△", "当たりの 球と 見える 玉の 大きさが ちがう"),
            18: ("○", "どの 向きでも 玉と 輪")},
)

slash_pal = {k: PAL[k] for k in ("W", "G", "B", "M", "C2")}
P["slash"] = parts9.slash_set("C", slash_pal, HERE)
ic = parts9.icon("C", {"L": "#F4FFFF", "W": "#FFFDF2", "C1": "#D8F4FF", "C2": "#A8D8F0", "C3": "#5E8EC0", "G": "#5FD98E", "B": "#4FA3F0", "M": "#D16BE6"})
ic.save_png(os.path.join(HERE, "niji_icon_16.png"))
ic.preview(os.path.join(HERE, "icon_preview.png"), scale=12)
P["icon"] = ic.composite(1)
for nm, sp in (("star", STAR), ("rim", RIM), ("ring", RING), ("shard", SHARD)):
    sp.save_png(os.path.join(HERE, f"{nm}_1x.png"))
sheet9.make(P)
