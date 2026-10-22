"""ART-PIPE-1 雷 A「いなずまの しん」— 太い ぎざぎざの 芯（さんかくの 形の 言葉）。

1 px = 1/8 ブロック。コマは 48×256（たて 32 ブロック）。重ねは 3 まい: halo（奥）・body・core（手前）。
足し算で 重ねるので、暗い 色ほど すける（半透明は 使わない）。
実行: python3 art/ART-PIPE-1/thunder-a/build.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import kit  # noqa: E402
from kit import Sprite, stamp_path, zigzag, branch_from, dither_disc, fade_bottom  # noqa: E402

W_, H_ = kit.CELL_W, kit.CELL_H
GROUND = H_ - 3  # 着地の 行（下の 2 行は ささる 所の 網）

PAL = {
    "W": "#FFFBEA",   # 芯（いちばん 明るい。真っ白は 使わない）
    "Y1": "#FFF0A8",  # からだ
    "Y2": "#E8C452",  # ふち の 光
    "Y3": "#8C6E2A",  # にじみ（足し算で うすく 見える）
    "Y4": "#4A3A18",  # とおい にじみ（もっと うすい）
}

SEED = 11


def main_path(seed):
    return zigzag(seed, 24, 0, GROUND, seg=(8, 18), amp=14, xmin=8, xmax=W_ - 9)


def bottom_wide(base, extra):
    return lambda y: base + (extra if y > H_ - 60 else 0)


def draw_bolt(s, f, pts, brs, stage):
    """stage: 0 予兆 / 1 のびる / 2 決め / 3 ほそる / 4 きえる / 5 のこり"""
    s.use(frame=f, layer="halo")
    if stage == 0:
        dither_disc(s, 24, 6, 3, 12, PAL["Y4"])
        dither_disc(s, 24, 4, 1, 6, PAL["Y3"])
    if stage == 1:
        stamp_path(s, pts, 9, PAL["Y4"], upto=176)
        dither_disc(s, 24, 4, 2, 10, PAL["Y4"])
    if stage == 2:
        stamp_path(s, pts, 15, PAL["Y4"], width_fn=bottom_wide(15, 4))
        stamp_path(s, pts, 9, PAL["Y3"], width_fn=bottom_wide(9, 4))
        for b in brs:
            stamp_path(s, b, 7, PAL["Y4"])
        dither_disc(s, pts[-1][0], GROUND, 6, 20, PAL["Y3"])
        fade_bottom(s, GROUND - 2, H_ - 1)
    if stage == 3:
        stamp_path(s, pts, 9, PAL["Y4"])
        fade_bottom(s, GROUND - 2, H_ - 1)

    s.use(frame=f, layer="body")
    if stage == 0:
        stamp_path(s, pts, 1, PAL["Y2"], upto=26)
    if stage == 1:
        stamp_path(s, pts, 3, PAL["Y1"], upto=176)
        for b in brs[:2]:
            stamp_path(s, b, 1, PAL["Y2"], upto=176)
    if stage == 2:
        stamp_path(s, pts, 5, PAL["Y1"], width_fn=bottom_wide(5, 2))
        for b in brs:
            stamp_path(s, b, 3, PAL["Y1"])
        # 着地の 星（さんかくの とげ 5 本）
        gx = pts[-1][0]
        for dx, dy in ((-14, -6), (14, -6), (-8, -14), (8, -14), (0, -20)):
            s.polygon([(gx - 2, GROUND), (gx + 2, GROUND), (gx + dx, GROUND + dy)], PAL["Y1"])
        fade_bottom(s, GROUND, H_ - 1)
    if stage == 3:
        stamp_path(s, pts, 3, PAL["Y1"])
        fade_bottom(s, GROUND, H_ - 1)
    if stage == 4:
        for i, ((xa, ya), (xb, yb)) in enumerate(zip(pts, pts[1:])):
            if i % 2 == 0:
                kit.stamp_line(s, xa, ya, xb, yb, 1, PAL["Y2"])
    if stage == 5:
        for i, ((xa, ya), (xb, yb)) in enumerate(zip(pts, pts[1:])):
            if i % 3 == 1:
                kit.stamp_line(s, xa, ya, xb, yb, 1, PAL["Y3"])

    s.use(frame=f, layer="core")
    if stage == 0:
        s.rect(23, 2, 25, 4, PAL["W"])
    if stage == 1:
        stamp_path(s, pts, 1, PAL["W"], upto=176)
    if stage == 2:
        stamp_path(s, pts, 3, PAL["W"], width_fn=bottom_wide(3, 1))
        for b in brs:
            stamp_path(s, b, 1, PAL["W"])
        gx = pts[-1][0]
        s.rect(gx - 4, GROUND - 2, gx + 4, GROUND, PAL["W"])
        fade_bottom(s, GROUND + 1, H_ - 1)
    if stage == 3:
        stamp_path(s, pts, 1, PAL["W"])


def build_bolt(seed=SEED):
    s = Sprite(W_, H_)
    for L in ("halo", "body", "core"):
        s.layer(L)
    for _ in range(5):
        s.add_frame(copy=False)
    pts = main_path(seed)
    brs = branch_from(seed + 1, pts, 4, length=(20, 40), min_y=60)
    for st in range(6):
        draw_bolt(s, st + 1, pts, brs, st)
    for f, ms in zip(range(1, 7), (33, 33, 100, 67, 50, 50)):
        s.set_duration(ms, [f])
    return s, pts, brs


def build_unfaded(pts, brs):
    """2 の くらべ用: うすく しない 着地（同じ 形）"""
    s = Sprite(W_, H_)
    for L in ("halo", "body", "core"):
        s.layer(L)
    s.use(frame=1, layer="halo")
    stamp_path(s, pts, 17, PAL["Y4"], width_fn=bottom_wide(17, 4))
    stamp_path(s, pts, 11, PAL["Y3"], width_fn=bottom_wide(11, 4))
    s.use(frame=1, layer="body")
    stamp_path(s, pts + [(pts[-1][0], H_ - 1)], 7, PAL["Y1"], width_fn=bottom_wide(7, 2))
    s.use(frame=1, layer="core")
    stamp_path(s, pts + [(pts[-1][0], H_ - 1)], 3, PAL["W"], width_fn=bottom_wide(3, 2))
    return kit.frame_rgba(s, 1, ("halo", "body", "core"))


def build_decal():
    """4. 地面の 輪（上から 見た 96×96 = 12 ブロック）。1: 着地（ひびの 星 ＋ 半径 5 の 輪）2: きえる"""
    import math
    import random
    s = Sprite(96, 96)
    s.add_frame(copy=False)
    cx = cy = 48
    for f, k in ((1, 0), (2, 1)):
        s.use(frame=f)
        ring_c = PAL["Y2"] if k == 0 else PAL["Y3"]
        s.circle(cx, cy, 40, ring_c)
        if k == 0:
            s.circle(cx, cy, 39, PAL["Y3"])
            s.circle(cx, cy, 41, PAL["Y4"])
        r = random.Random(5)
        for i in range(8):
            a = i * math.tau / 8 + r.uniform(-0.2, 0.2)
            rr, x, y = 6, cx + 6 * math.cos(a), cy + 6 * math.sin(a)
            pts = [(x, y)]
            while rr < (30 if k == 0 else 20):
                rr += r.randint(4, 7)
                a2 = a + r.uniform(-0.35, 0.35)
                pts.append((cx + rr * math.cos(a2), cy + rr * math.sin(a2)))
            stamp_path(s, [(round(px), round(py)) for px, py in pts], 2 if k == 0 else 1,
                       PAL["Y1"] if k == 0 else PAL["Y4"])
        if k == 0:
            dither_disc(s, cx, cy, 4, 12, PAL["Y2"])
            s.circle(cx, cy, 3, PAL["W"], fill=True)
    return s


def spark_img(u):
    from PIL import Image
    if u < 0.5:
        im = Image.new("RGBA", (2, 3), (0, 0, 0, 0))
        for x in range(2):
            for y in range(2):
                im.putpixel((x, y), kit.hex2rgba(PAL["W"]))
        im.putpixel((0, 2), kit.hex2rgba(PAL["Y2"]))
        return im
    im = Image.new("RGBA", (1, 1), kit.hex2rgba(PAL["Y1"] if u < 0.8 else PAL["Y3"]))
    return im


def main():
    s, pts, brs = build_bolt()
    # 形の 数 4 通り（ゲーム用）
    variants = [build_bolt(SEED + 100 * v)[0] for v in range(4)]
    s.preview(os.path.join(HERE, "preview.png"), scale=3, bg="#161926", cols=6)
    s.stats()
    from PIL import Image
    rows = [kit.export_atlas(v, ("halo", "body", "core"), os.path.join(HERE, f"_v{i}.png")) for i, v in enumerate(variants)]
    atlas = Image.new("RGBA", (rows[0].width, rows[0].height * 4), (0, 0, 0, 0))
    for i, r in enumerate(rows):
        atlas.paste(r, (0, i * r.height))
        os.remove(os.path.join(HERE, f"_v{i}.png"))
    atlas.save(os.path.join(HERE, "bolt_atlas.png"))
    decal = build_decal()
    decal.save_png(os.path.join(HERE, "ground_1x.png"), frame=1)
    decal.save_png(os.path.join(HERE, "ground_fade_1x.png"), frame=2)

    P = dict(
        out=HERE, sprite=s, layers=("halo", "body", "core"),
        layer_names=("奥: にじみ", "中: からだ", "手前: 芯"),
        title="A 「いなずまの しん」 太い ぎざぎざの 芯 ＋ 枝 ＋ ひびの 星",
        concept=[
            "形の 言葉 = さんかく（とがった ぎざぎざ・とげの 星）。芯は 3〜5 点の 太さで、遠くからでも「かみなり！」。",
            "色の 割合 = 芯の 白 3 割・からだの 黄 4 割・にじみ 3 割。細かさは 着地の まわり（下 8 ブロック）に あつめる。",
        ],
        palette=[("W", PAL["W"], "芯"), ("Y1", PAL["Y1"], "からだ・枝"), ("Y2", PAL["Y2"], "ふち・輪"),
                 ("Y3", PAL["Y3"], "にじみ"), ("Y4", PAL["Y4"], "とおい にじみ")],
        six=[
            "たて軸で カメラへ 向く 板（よこへ 回っても 同じ 絵）。\n決めの コマを 6 ステップ（3 コマ分）止める",
            "着地の 下 2 ブロックを 網で 4 段 ぬく ＋ とげの 星で\n地面との 切れ目を かくす",
            "にじみ（奥 −0.3）・からだ（0）・芯（手前 +0.3）の\n3 まいを 1 つの 絵（アトラス）に",
            "地面に 寝かせた「ひびの 星」と 半径 5 の 輪（攻撃の はんい）",
            "着地の 6 ステップだけ 半径 8 ブロックを +35%（黄みの 白）。\n12 ステップで 3 段に さがる。1 回だけ",
            "1 点 = 1/8 ブロック。Nearest。にじみも 網（ディザ）で、\nなめらかな グラデーションに しない",
        ],
        timeline=[
            dict(name="予兆", f=1, steps=2),
            dict(name="のびる", f=2, steps=2, light=0.1),
            dict(name="着地", f=3, steps=6, light=0.35, decal=(1, 1.0), spark=0.0),
            dict(name="ほそる", f=4, steps=4, light=0.2, decal=(1, 0.8), spark=0.12),
            dict(name="きえる", f=5, steps=3, light=0.1, decal=(2, 0.8), spark=0.22),
            dict(name="のこり", f=6, steps=3, decal=(2, 0.6), spark=0.32),
            dict(name="つぶ", f=None, steps=40, decal=(2, 0.3), spark=0.6),
        ],
        key_i=2, motion_sil=(0, 2, 4),
        decal=decal, spark_img=spark_img, spark_n=40, seed=7,
        unfaded=build_unfaded(pts, brs),
        data=[
            ["コマ（絵）", "6 コマ × 形 4 通り（今と 同じ 4）"],
            ["ステップ", "雷 20 ＋ つぶ 〜60（今 16 ＋ 〜80）"],
            ["絵の 大きさ", "雷 288×3072（48×256 ×6×3まい×4）"],
            ["", "地面 96×96 × 2"],
            ["描画回数", "雷 1（3 まいを 1 つの 形に）＋ 輪 1"],
            ["", "＋ つぶ 1（インスタンス）＝ 3"],
            ["", "（今: 十字 2 ＋ 光 1 ＋ 輪 1 ＋ つぶ 1 = 5）"],
            ["三角形", "雷 6 ＋ 輪 2 ＋ つぶ 80 = 88（今 82）"],
            ["光", "シーンに 1 つ 置きっぱなし（強さ 0↔）"],
            ["", "足し引きしない（作りなおしが おきる）"],
        ],
        criteria={
            1: ("○", "黒ぬりでも ぎざぎざ ＋ 枝で 雷と 分かる"),
            2: ("○", "白黒で 芯が いちばん 明るい"),
            3: ("○", "ぼかすと 着地の 星に 目が 行く"),
            4: ("○", "細かさは 下 8 ブロック。上は 太い 線だけ"),
            5: ("―", ""),
            6: ("△", "白が 多め。明るい 画面では にじみを へらす"),
            7: ("○", "白→黄→こげ茶。暗い ほど 赤みへ"),
            8: ("○", "白〜黄だけ（雷 v4 の きまり）"),
            9: ("○", "さんかく = すばやい・強い"),
            10: ("○", "今の 雷と 同じ 色の なかま。太さだけ 変わる"),
            11: ("―", ""), 12: ("○", "字なしで 雷"), 13: ("○", "形で 分かる"), 14: ("―", ""), 15: ("―", ""),
            16: ("○", "光・輪・つぶ・音で 返す（音は 今の まま）"),
            17: ("○", "かっこいい 寄り。こわさは 色が 明るいので 少ない"),
        },
        motion={
            1: ("○", "予兆 2・のびる 2・決め 6・あと 10（＋つぶ）"),
            2: ("○", "「ためて ドン」。止め絵 = 着地"),
            3: ("○", "予兆 → のびる で 形が 大きく 変わる"),
            4: ("―", "ため（手の 光）は 別の 絵"),
            5: ("○", "着地の コマが いちばん 太い"),
            6: ("―", ""), 7: ("―", ""),
            8: ("○", "のびる は 1 コマで 7 割まで"),
            9: ("○", "ほそる・きえる・のこり で 余韻"),
            10: ("―", ""),
            11: ("○", "今の 2 倍 以上の 太さ"),
            12: ("△", "のびる→着地で 太る だけ"),
            13: ("―", ""), 14: ("―", ""), 15: ("―", ""),
            16: ("○", "輪 = 半径 5（攻撃の はんい と 同じ）"),
            17: ("―", ""),
            18: ("○", "たて軸の 板なので 8 方向 同じ 絵"),
        },
    )
    kit.make_sheet(P)


if __name__ == "__main__":
    main()
