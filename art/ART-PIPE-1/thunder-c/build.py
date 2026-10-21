"""ART-PIPE-1 雷 C「らいもん」— 直角に おれる 太い 雷 ＋ 雷紋（四角い うずまき）の しるし（しかくの 形の 言葉・和風）。

1 px = 1/8 ブロック。コマは 48×256。重ねは 3 まい: halo（奥）・body・core（手前）。足し算。
網（ディザ）を ほとんど 使わない「べた ぬり 3 色」の 絵。
実行: python3 art/ART-PIPE-1/thunder-c/build.py
"""
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import kit  # noqa: E402
from kit import Sprite, stamp_path, stamp_line, fade_bottom  # noqa: E402

W_, H_ = kit.CELL_W, kit.CELL_H
GROUND = H_ - 3
EMB = 25  # 着地の 雷紋の 1 辺
EMB_CY = GROUND - EMB // 2
EMB_TOP = GROUND - EMB + 1

PAL = {
    "W": "#FFFAE6",   # 芯
    "Y1": "#FFE680",  # 雷紋・かぎ
    "Y2": "#E2B23C",  # ふち（金）
    "Y3": "#8A6626",  # のこり
    "Y4": "#3E3014",  # 奥の かげ（べた）
}
SEED = 31


def stepped(seed):
    """たて → よこ → たて … と 直角に おれる 道"""
    r = random.Random(seed)
    x, y = 24, 0
    pts = [(x, y)]
    side = 1
    while y < GROUND - 52:
        y = min(GROUND - 52, y + r.randint(14, 26))
        pts.append((x, y))
        x = max(9, min(W_ - 10, x + side * r.randint(6, 12)))
        pts.append((x, y))
        side = -side
    pts.append((24, y))
    pts.append((24, EMB_TOP))
    return pts


def spiral(s, cx, cy, size, w, color):
    """雷紋: 四角い うずまき（外から 内へ）。size は 外の 1 辺"""
    x0, y0 = cx - size // 2, cy - size // 2
    pts = [(x0, y0)]
    L = size - 1
    x, y = x0, y0
    dirs = [(1, 0), (0, 1), (-1, 0), (0, -1)]
    i = 0
    step = w + 2
    lens = [L, L, L, L - step]
    while True:
        n = lens[i % 4] if i < 4 else L - step * ((i - 2) // 2 + 1)
        if n <= w:
            break
        dx, dy = dirs[i % 4]
        x, y = x + dx * n, y + dy * n
        pts.append((x, y))
        i += 1
    for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
        stamp_line(s, xa + w // 2, ya + w // 2, xb + w // 2, yb + w // 2, w, color)


def brackets(s, cx, cy, d, n, w, color):
    """四すみの かぎ（「 」）"""
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = cx + sx * d, cy + sy * d
            stamp_line(s, x, y, x - sx * n, y, w, color)
            stamp_line(s, x, y, x, y - sy * n, w, color)


def draw(s, f, st, pts):
    s.frame(f)
    gx = pts[-1][0]
    if st == 0:
        s.use(layer="body"); spiral(s, 24, 8, 11, 1, PAL["Y1"])
        s.use(layer="core"); s.rect(23, 7, 25, 9, PAL["W"])
    if st == 1:
        s.use(layer="halo"); stamp_path(s, pts, 9, PAL["Y4"], upto=176)
        s.use(layer="body"); stamp_path(s, pts, 5, PAL["Y2"], upto=176)
        s.use(layer="core"); stamp_path(s, pts, 1, PAL["W"], upto=176)
    if st == 2:
        s.use(layer="halo")
        stamp_path(s, pts, 11, PAL["Y4"])
        s.rect(gx - 15, EMB_TOP - 3, gx + 15, GROUND, PAL["Y4"])
        fade_bottom(s, GROUND - 1, H_ - 1)
        s.use(layer="body")
        stamp_path(s, pts, 7, PAL["Y2"])
        spiral(s, gx, EMB_CY, EMB, 3, PAL["Y2"])
        s.use(layer="core")
        stamp_path(s, pts, 3, PAL["W"])
        spiral(s, gx, EMB_CY, EMB, 1, PAL["W"])
        brackets(s, gx, EMB_CY, 21, 5, 2, PAL["Y1"])
        s.use(layer="body"); fade_bottom(s, GROUND, H_ - 1)
    if st == 3:
        s.use(layer="body")
        stamp_path(s, pts, 3, PAL["Y2"])
        spiral(s, gx, EMB_CY, EMB, 1, PAL["Y2"])
        s.use(layer="core"); stamp_path(s, pts, 1, PAL["W"])
    if st == 4:
        s.use(layer="body")
        for i, ((xa, ya), (xb, yb)) in enumerate(zip(pts, pts[1:])):
            if i % 2 == 0:
                stamp_line(s, xa, ya, xb, yb, 2, PAL["Y3"])
        spiral(s, gx, EMB_CY, EMB, 1, PAL["Y3"])
    if st == 5:
        s.use(layer="body"); spiral(s, gx, EMB_CY, 13, 1, PAL["Y3"])


def build_bolt(seed=SEED):
    s = Sprite(W_, H_)
    for L in ("halo", "body", "core"):
        s.layer(L)
    for _ in range(5):
        s.add_frame(copy=False)
    pts = stepped(seed)
    for st in range(6):
        draw(s, st + 1, st, pts)
    for f, ms in zip(range(1, 7), (33, 33, 100, 67, 50, 50)):
        s.set_duration(ms, [f])
    return s, pts


def build_unfaded(pts):
    s = Sprite(W_, H_)
    for L in ("halo", "body", "core"):
        s.layer(L)
    s.frame(1)
    s.use(layer="halo"); stamp_path(s, pts + [(pts[-1][0], H_ - 1)], 11, PAL["Y4"])
    s.use(layer="body"); stamp_path(s, pts + [(pts[-1][0], H_ - 1)], 7, PAL["Y2"])
    s.use(layer="core"); stamp_path(s, pts + [(pts[-1][0], H_ - 1)], 3, PAL["W"])
    return kit.frame_rgba(s, 1, ("halo", "body", "core"))


def build_decal():
    """地面: 半径 5 の 輪 ＋ 中に 雷紋の 四角い わく（すみに うずまき）＋ まん中の うずまき"""
    s = Sprite(96, 96)
    s.add_frame(copy=False)
    for f, k in ((1, 0), (2, 1)):
        s.frame(f)
        c_main = PAL["Y2"] if k == 0 else PAL["Y3"]
        c_sub = PAL["Y3"] if k == 0 else PAL["Y4"]
        s.circle(48, 48, 40, c_sub)
        s.rect(20, 20, 76, 76, c_main, fill=False)
        s.rect(24, 24, 72, 72, c_sub, fill=False)
        for x in range(28, 72, 8):
            for (a, b) in ((20, 24), (72, 76)):
                stamp_line(s, x, a, x, b, 1, c_sub)
                stamp_line(s, a, x, b, x, 1, c_sub)
        for cx, cy in ((22, 22), (74, 22), (22, 74), (74, 74)):
            spiral(s, cx, cy, 9, 1, PAL["Y1"] if k == 0 else c_sub)
        spiral(s, 48, 48, 15, 1, PAL["W"] if k == 0 else c_sub)
    return s


def spark_img(u):
    from PIL import Image
    if u < 0.5:
        return Image.new("RGBA", (2, 2), kit.hex2rgba(PAL["W"]))
    return Image.new("RGBA", (1, 1), kit.hex2rgba(PAL["Y1"] if u < 0.8 else PAL["Y3"]))


def main():
    s, pts = build_bolt()
    s.preview(os.path.join(HERE, "preview.png"), scale=3, bg="#161926", cols=6)
    s.stats()
    from PIL import Image
    rows = []
    for v in range(4):
        vs = build_bolt(SEED + 100 * v)[0]
        rows.append(kit.export_atlas(vs, ("halo", "body", "core"), os.path.join(HERE, "_v.png")))
    os.remove(os.path.join(HERE, "_v.png"))
    atlas = Image.new("RGBA", (rows[0].width, rows[0].height * 4), (0, 0, 0, 0))
    for i, r in enumerate(rows):
        atlas.paste(r, (0, i * r.height))
    atlas.save(os.path.join(HERE, "bolt_atlas.png"))
    decal = build_decal()
    decal.save_png(os.path.join(HERE, "ground_1x.png"), frame=1)
    decal.save_png(os.path.join(HERE, "ground_fade_1x.png"), frame=2)

    P = dict(
        out=HERE, sprite=s, layers=("halo", "body", "core"),
        layer_names=("奥: べたの かげ", "中: 金の ふち・雷紋", "手前: 芯・かぎ"),
        title="C 「らいもん」 直角に おれる 雷 ＋ 雷紋（四角い うずまき）の しるし",
        concept=[
            "形の 言葉 = しかく（直角の 雷・四角い うずまき・すみの かぎ）。雷神の たいこの もようの ような 和風の しるし。",
            "色の 割合 = 金の ふち 4 割・白 3 割・かげ 3 割。網を ほぼ 使わない べた 3 色。細かさは 着地の しるし だけ。",
        ],
        palette=[("W", PAL["W"], "芯・かぎ"), ("Y1", PAL["Y1"], "雷紋"), ("Y2", PAL["Y2"], "金の ふち"),
                 ("Y3", PAL["Y3"], "のこり"), ("Y4", PAL["Y4"], "奥の かげ（べた）")],
        six=[
            "たて軸で カメラへ 向く 板。決めの「雷紋 ＋ かぎ」を\n6 ステップ 止める",
            "着地の 下を 網で ぬく ＋ 雷紋の しるしの 下の\nべたの 四角で 切れ目を かくす",
            "かげ（奥）・金の ふちと 雷紋（中）・芯と かぎ（手前）の 3 まい",
            "半径 5 の 輪の 中に 雷紋の 四角い わく（すみに うずまき）",
            "着地の 4 ステップだけ +30%。3 段で さがる",
            "1 点 = 1/8 ブロック。線は 1 か 2 点の 直角だけ（ななめ なし）",
        ],
        timeline=[
            dict(name="予兆", f=1, steps=2),
            dict(name="のびる", f=2, steps=2, light=0.1),
            dict(name="着地", f=3, steps=6, light=0.3, decal=(1, 1.0), spark=0.0),
            dict(name="ほそる", f=4, steps=4, light=0.15, decal=(1, 0.8), spark=0.12),
            dict(name="きえる", f=5, steps=3, decal=(2, 0.8), spark=0.22),
            dict(name="のこり", f=6, steps=4, decal=(2, 0.6), spark=0.32),
            dict(name="つぶ", f=None, steps=40, decal=(2, 0.3), spark=0.6),
        ],
        key_i=2, motion_sil=(0, 2, 4),
        decal=decal, spark_img=spark_img, spark_n=28, seed=11,
        unfaded=build_unfaded(pts),
        data=[
            ["コマ（絵）", "6 コマ × 形 4 通り"],
            ["ステップ", "雷 21 ＋ つぶ 〜60"],
            ["絵の 大きさ", "雷 288×3072、地面 96×96 × 2"],
            ["描画回数", "雷 1 ＋ 輪 1 ＋ つぶ 1 = 3"],
            ["三角形", "雷 6 ＋ 輪 2 ＋ つぶ 56 = 64"],
            ["光", "A と 同じ（置きっぱなしの 1 つ）"],
        ],
        criteria={
            1: ("○", "直角の 雷 ＋ 四角い うずまきで ほかに ない 影"),
            2: ("○", "白の 芯 ＞ 金 ＞ かげ"),
            3: ("○", "ぼかすと 着地の しるしへ"),
            4: ("○", "細かさは しるし だけ。上は 太い 直角"),
            5: ("―", ""),
            6: ("○", "金 4・白 3・かげ 3"),
            7: ("○", "白→黄→金→こげ茶"),
            8: ("○", "白〜金。雷神剣の つばの 金と つながる"),
            9: ("○", "しかく = どっしり・強い"),
            10: ("△", "ぎざぎざ でなく 直角。世界の 箱の 形とは あう"),
            11: ("―", ""),
            12: ("△", "直角の 雷を 雷と 思う かは りっくんに 聞きたい"),
            13: ("○", "形で 分かる"), 14: ("―", ""), 15: ("―", ""),
            16: ("○", "光・しるし・つぶで 返す"),
            17: ("○", "和風で 大人っぽい。オリジナル感が いちばん 強い"),
        },
        motion={
            1: ("○", "予兆 2・のびる 2・決め 6・あと 11（＋つぶ）"),
            2: ("○", "「ドン と はんこ」。止め絵 = 雷紋"),
            3: ("○", "予兆 → のびる で 変わる"),
            4: ("―", ""), 5: ("○", "雷紋が 出る コマが 決め"), 6: ("―", ""), 7: ("―", ""),
            8: ("○", "のびる 1 コマ"),
            9: ("○", "しるしが のこって 余韻"),
            10: ("―", ""), 11: ("○", "太い 直角"), 12: ("△", "大きさは 変わらない"),
            13: ("―", ""), 14: ("―", ""), 15: ("―", ""),
            16: ("△", "わくは 四角、はんいは まる（輪で しめす）"),
            17: ("―", ""), 18: ("○", "8 方向 同じ"),
        },
    )
    kit.make_sheet(P)


if __name__ == "__main__":
    main()
