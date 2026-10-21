"""ART-PIPE-1 雷 B「ひかりの たま」— 細い 放電の すじ ＋ 着地で ふくらむ 光の 玉（まるの 形の 言葉）。

1 px = 1/8 ブロック。コマは 48×256。重ねは 3 まい: halo（奥）・body・core（手前）。足し算。
実行: python3 art/ART-PIPE-1/thunder-b/build.py
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import kit  # noqa: E402
from kit import Sprite, stamp_path, zigzag, dither_disc, fade_bottom  # noqa: E402

W_, H_ = kit.CELL_W, kit.CELL_H
GROUND = H_ - 3
BALL_Y = GROUND - 14  # 玉の まん中（地面から 2 ブロック 弱 上）

PAL = {
    "W": "#FFF8DC",   # 玉の まん中・すじの 芯
    "Y1": "#FFE98A",  # 玉の からだ
    "Y2": "#F0C24A",  # 玉の ふち・輪
    "Y3": "#9A7430",  # にじみ
    "Y4": "#4E3C1A",  # とおい にじみ
}
SEED = 21


def strands(seed, n=3):
    return [zigzag(seed + i * 7, 24 + (i - 1) * 3, 0, BALL_Y, seg=(4, 9), amp=4, xmin=14, xmax=34) for i in range(n)]


def arcs(seed, n, r0, r1):
    """玉の まわりの 小さな 放電（外へ のびる 短い ぎざぎざ）"""
    rnd = random.Random(seed)
    out = []
    for k in range(n):
        a = (k / n) * math.tau + rnd.uniform(-0.3, 0.3)
        pts = []
        for j in range(4):
            rr = r0 + (r1 - r0) * j / 3
            aa = a + (0.25 if j % 2 else -0.25)
            pts.append((round(24 + rr * math.cos(aa)), round(BALL_Y + rr * math.sin(aa) * 0.9)))
        out.append(pts)
    return out


def ball(s, r, layer_cols, ring=None):
    s.use(layer="halo")
    dither_disc(s, 24, BALL_Y, r + 2, r + 9, PAL["Y4"])
    s.use(layer="body")
    s.circle(24, BALL_Y, r, PAL["Y1"], fill=True)
    s.circle(24, BALL_Y, r, PAL["Y2"])
    if ring:
        s.circle(24, BALL_Y, ring, PAL["Y2"])
    s.use(layer="core")
    s.circle(24, BALL_Y, max(1, r // 2), PAL["W"], fill=True)


def draw(s, f, st, ss):
    s.frame(f)
    if st == 0:  # 予兆: 空に 小さな 玉
        s.use(layer="halo"); dither_disc(s, 24, 8, 3, 12, PAL["Y4"])
        s.use(layer="body"); s.circle(24, 8, 4, PAL["Y1"], fill=True)
        s.use(layer="core"); s.circle(24, 8, 1, PAL["W"], fill=True)
    if st == 1:  # のびる: すじ 3 本が おりる
        s.use(layer="body")
        for p in ss:
            stamp_path(s, p, 1, PAL["Y2"], upto=190)
        s.use(layer="core")
        stamp_path(s, ss[1], 1, PAL["W"], upto=190)
        s.use(layer="halo"); s.circle(24, 8, 4, PAL["Y3"], fill=True)
    if st == 2:  # 決め: 玉 ＋ すじ ＋ 放電
        s.use(layer="halo")
        for p in ss:
            stamp_path(s, p, 5, PAL["Y4"])
        s.use(layer="body")
        for p in ss:
            stamp_path(s, p, 2, PAL["Y1"])
        s.use(layer="core")
        stamp_path(s, ss[1], 1, PAL["W"])
        ball(s, 13, None)
        s.use(layer="core")
        for a in arcs(SEED, 7, 15, 23):
            stamp_path(s, a, 1, PAL["Y1"])
        s.use(layer="halo"); fade_bottom(s, GROUND - 1, H_ - 1)
        s.use(layer="body"); fade_bottom(s, GROUND, H_ - 1)
    if st == 3:  # ふくらむ: 玉が 大きく うすく、輪が はなれる
        s.use(layer="halo")
        stamp_path(s, ss[1], 3, PAL["Y4"])
        s.use(layer="body")
        stamp_path(s, ss[1], 1, PAL["Y2"])
        ball(s, 10, None, ring=19)
        s.use(layer="core")
        for a in arcs(SEED + 3, 5, 17, 23):
            stamp_path(s, a, 1, PAL["Y2"])
        s.use(layer="halo"); fade_bottom(s, GROUND - 1, H_ - 1)
    if st == 4:  # しぼむ
        s.use(layer="body")
        s.circle(24, BALL_Y, 5, PAL["Y2"], fill=True)
        s.circle(24, BALL_Y, 21, PAL["Y3"])
        s.use(layer="core"); s.circle(24, BALL_Y, 2, PAL["Y1"], fill=True)
    if st == 5:  # のこり
        s.use(layer="body"); s.circle(24, BALL_Y, 2, PAL["Y3"], fill=True)
        s.use(layer="halo"); dither_disc(s, 24, BALL_Y, 0, 6, PAL["Y4"])


def build_bolt(seed=SEED):
    s = Sprite(W_, H_)
    for L in ("halo", "body", "core"):
        s.layer(L)
    for _ in range(5):
        s.add_frame(copy=False)
    ss = strands(seed)
    for st in range(6):
        draw(s, st + 1, st, ss)
    for f, ms in zip(range(1, 7), (50, 33, 100, 100, 67, 67)):
        s.set_duration(ms, [f])
    return s, ss


def build_unfaded(ss):
    s = Sprite(W_, H_)
    for L in ("halo", "body", "core"):
        s.layer(L)
    s.frame(1)
    s.use(layer="body")
    for p in ss:
        stamp_path(s, p + [(p[-1][0], H_ - 1)], 2, PAL["Y1"])
    s.use(layer="core")
    stamp_path(s, ss[1] + [(ss[1][-1][0], H_ - 1)], 1, PAL["W"])
    return kit.frame_rgba(s, 1, ("halo", "body", "core"))


def build_decal():
    """地面の 輪: 同心円 3 つ（外 = 半径 5）＋ まん中の 光の たまり"""
    s = Sprite(96, 96)
    s.add_frame(copy=False)
    for f, k in ((1, 0), (2, 1)):
        s.frame(f)
        s.circle(48, 48, 40, PAL["Y2"] if k == 0 else PAL["Y3"])
        if k == 0:
            s.circle(48, 48, 41, PAL["Y3"])
        for i in range(48):
            a = i * math.tau / 48
            if i % 2 == 0:
                s.px(round(48 + 30 * math.cos(a)), round(48 + 30 * math.sin(a)), PAL["Y3"] if k == 0 else PAL["Y4"])
        s.circle(48, 48, 20, PAL["Y3"] if k == 0 else PAL["Y4"])
        dither_disc(s, 48, 48, 6 if k == 0 else 0, 16 if k == 0 else 8, PAL["Y2"] if k == 0 else PAL["Y4"])
        if k == 0:
            s.circle(48, 48, 5, PAL["Y1"], fill=True)
            s.circle(48, 48, 2, PAL["W"], fill=True)
    return s


def spark_img(u):
    from PIL import Image
    if u < 0.45:
        im = Image.new("RGBA", (3, 3), (0, 0, 0, 0))
        for x, y in ((1, 0), (0, 1), (2, 1), (1, 2)):
            im.putpixel((x, y), kit.hex2rgba(PAL["Y1"]))
        im.putpixel((1, 1), kit.hex2rgba(PAL["W"]))
        return im
    return Image.new("RGBA", (1, 1), kit.hex2rgba(PAL["Y1"] if u < 0.8 else PAL["Y3"]))


def ball_light(im, e):
    return im


def main():
    s, ss = build_bolt()
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
        layer_names=("奥: にじみ", "中: 玉・すじ", "手前: 芯・放電"),
        title="B 「ひかりの たま」 細い 放電の すじ ＋ ふくらむ 光の 玉",
        concept=[
            "形の 言葉 = まる（玉・同心円・＋の つぶ）。細い すじ 3 本が おりて、地面で 光の 玉が ぷくっと ふくらむ。",
            "色の 割合 = 黄の 玉 5 割・にじみ 3 割・白 2 割。細かさは 玉の まわりの 放電だけ。やさしい・なかまの 雷。",
        ],
        palette=[("W", PAL["W"], "玉の まん中・芯"), ("Y1", PAL["Y1"], "玉・すじ"), ("Y2", PAL["Y2"], "ふち・輪"),
                 ("Y3", PAL["Y3"], "にじみ"), ("Y4", PAL["Y4"], "とおい にじみ")],
        six=[
            "たて軸で カメラへ 向く 板。決めの 玉を 6 ステップ、\nふくらむ 玉を 6 ステップ（2 まいで 長く 見せる）",
            "すじの 下を 網で ぬき、玉（地面から 1.5 ブロック 上）で\n切れ目を かくす",
            "にじみ（奥）・玉と すじ（中）・芯と 放電（手前）の 3 まい",
            "同心円 3 つの 輪（外 = 半径 5）。寝かせる",
            "玉が ある あいだ（12 ステップ）+25% → 3 段で さがる。\nA より 弱く 長い",
            "1 点 = 1/8 ブロック。玉は 点で 描いた 円（PIL の だ円は 使わない）",
        ],
        timeline=[
            dict(name="予兆", f=1, steps=3),
            dict(name="のびる", f=2, steps=2, light=0.08),
            dict(name="玉", f=3, steps=6, light=0.25, decal=(1, 1.0), spark=0.0),
            dict(name="ふくらむ", f=4, steps=6, light=0.2, decal=(1, 0.9), spark=0.1),
            dict(name="しぼむ", f=5, steps=4, light=0.1, decal=(2, 0.8), spark=0.22),
            dict(name="のこり", f=6, steps=4, decal=(2, 0.6), spark=0.32),
            dict(name="つぶ", f=None, steps=40, decal=(2, 0.3), spark=0.6),
        ],
        key_i=2, motion_sil=(0, 2, 4),
        decal=decal, spark_img=spark_img, spark_n=32, seed=9,
        unfaded=build_unfaded(ss),
        data=[
            ["コマ（絵）", "6 コマ × 形 4 通り"],
            ["ステップ", "雷 25 ＋ つぶ 〜60"],
            ["絵の 大きさ", "雷 288×3072、地面 96×96 × 2"],
            ["描画回数", "雷 1 ＋ 輪 1 ＋ つぶ 1 = 3"],
            ["三角形", "雷 6 ＋ 輪 2 ＋ つぶ 64 = 72"],
            ["光", "A と 同じ（置きっぱなしの 1 つ）"],
        ],
        criteria={
            1: ("△", "黒ぬりで 玉は 分かるが、すじが 細く「雷」より「光の 玉」"),
            2: ("○", "玉の まん中が いちばん 明るい"),
            3: ("○", "ぼかすと 玉に 目が 行く"),
            4: ("○", "細かさは 放電だけ"),
            5: ("―", ""),
            6: ("○", "黄 5・にじみ 3・白 2"),
            7: ("○", "白→黄→こげ茶"),
            8: ("△", "黄の 玉は 夕日・たいまつの 光と にて 見える かも"),
            9: ("○", "まる = やさしい"),
            10: ("△", "今の 雷より 細い すじ。玉が 新しい 形"),
            11: ("―", ""), 12: ("△", "雷と 分かるのは 放電の ぎざぎざ だけ"), 13: ("○", "形で 分かる"),
            14: ("―", ""), 15: ("―", ""),
            16: ("○", "光・輪・つぶで 返す"),
            17: ("△", "かわいい 寄り。りっくんの「かっこいい」から 少し はなれる かも"),
        },
        motion={
            1: ("○", "予兆 3・のびる 2・決め 12・あと 8（＋つぶ）"),
            2: ("○", "「すっと おりて ぷくっ」。止め絵 = 玉"),
            3: ("○", "予兆 → のびる で 変わる"),
            4: ("―", ""), 5: ("○", "玉の コマが 決め"), 6: ("―", ""), 7: ("―", ""),
            8: ("○", "のびる 1 コマ"),
            9: ("○", "ふくらむ → しぼむ で 余韻"),
            10: ("―", ""),
            11: ("△", "すじは 細い。玉で 大きさを 出す"),
            12: ("○", "玉が ふくらんで しぼむ"),
            13: ("―", ""), 14: ("―", ""), 15: ("―", ""),
            16: ("○", "外の 輪 = 半径 5"),
            17: ("―", ""), 18: ("○", "8 方向 同じ"),
        },
    )
    kit.make_sheet(P)


if __name__ == "__main__":
    main()
