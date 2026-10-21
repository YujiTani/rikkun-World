"""ART-PIPE-1 雷 B「ひかりの たま」仕上げ版 — 太い 本すじ ＋ 細い 2 本 ＋ 着地の 小さな 玉 ＋ とがった 放電。

1 px = 1/8 ブロック。コマは 64×256。重ねは 3 まい: halo（奥）・body・core（手前）。足し算。
コマ 8: 予兆・のびる・着地・玉★・ふくらむ・しぼむ・のこり・きえかけ。
形は 2 通りだけ 描く（もう 2 通りは ゲームで 左右 反転。UV を はんたいに するだけ）。
アトラス thunder_b_sheet.png = 1024×1024: x = (形 × 8 + コマ) × 64、y = 重ね × 256（いちばん 下の 段は あき）。
実行: python3 art/ART-PIPE-1/thunder-b/build.py
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import kit  # noqa: E402
kit.CELL_W = 64
from kit import Sprite, stamp_path, dither_disc, fade_bottom  # noqa: E402

W_, H_ = 64, 256
CX = 32
GROUND = H_ - 3
BALL_Y = GROUND - 14  # 玉の まん中（地面から 14 点 上）
NF = 8

PAL = {
    "W": "#FFF8DC",
    "Y1": "#FFE98A",
    "Y2": "#F0C24A",
    "Y3": "#9A7430",
    "Y4": "#4E3C1A",
}
SEED = 21


def bolt_path(rnd, x0, y1, end_x, xmin=18, xmax=46, seg=(6, 12), dx=(4, 8)):
    """角の とがった すじ。1 区切り 6〜12 点・よこへ 4〜8 点。下では 玉の 中心へ よせる"""
    pts = [(x0, 0)]
    x, y = x0, 0
    side = 1 if rnd.random() < 0.5 else -1
    while y < y1:
        y = min(y1, y + rnd.randint(*seg))
        if y1 - y < 5:
            y = y1
        if y >= y1 - 26:
            side = 1 if x < end_x else -1
        x = max(xmin, min(xmax, x + side * rnd.randint(*dx)))
        if y == y1:
            x = end_x
        pts.append((x, y))
        side = -side if rnd.random() < 0.85 else side
    return pts


def strands(seed):
    rnd = random.Random(seed)
    main = bolt_path(rnd, CX + rnd.randint(-3, 3), BALL_Y, CX)
    t1 = bolt_path(rnd, CX - 9 + rnd.randint(-2, 2), BALL_Y, CX - 3, seg=(7, 12), dx=(3, 6))
    t2 = bolt_path(rnd, CX + 9 + rnd.randint(-2, 2), BALL_Y, CX + 3, seg=(7, 12), dx=(3, 6))
    # 下 1/3 に 短い 枝 2 本（左・右）
    branches = []
    cand = [p for p in main if 175 <= p[1] <= 225]
    for k, side in enumerate((-1, 1)):
        sx, sy = cand[(rnd.randrange(len(cand)) + k) % len(cand)] if cand else main[-3]
        bp = [(sx, sy)]
        x, y = sx, sy
        for _ in range(3):
            y += rnd.randint(7, 10)
            x = max(4, min(W_ - 5, x + side * rnd.randint(4, 7)))
            bp.append((x, y))
        branches.append(bp)
    return dict(main=main, thin=[t1, t2], branches=branches)


def arcs(seed, n, r0, lens):
    """玉の ふちから 外へ のびる とがった 放電（3〜4 区切りの ぎざぎざ）"""
    rnd = random.Random(seed)
    out = []
    for k in range(n):
        a = (k + rnd.uniform(-0.2, 0.2)) / n * math.tau
        L = rnd.randint(*lens)
        nseg = 3 if L < 11 else 4
        pts = []
        for j in range(nseg + 1):
            rr = r0 + L * j / nseg
            off = 0 if j in (0, nseg) else (3 if j % 2 else -3)
            ca, sa = math.cos(a), math.sin(a)
            pts.append((round(CX + rr * ca - off * sa), round(BALL_Y + rr * sa + off * ca)))
        out.append(pts)
    return out


def jag_ball(s, r, n_root=8, ring=None):
    """玉: ふちを 放電の 根もとで 1 点 ずつ 欠く・出す。まん中 W は 小さく 強く"""
    for y in range(BALL_Y - r - 2, BALL_Y + r + 3):
        for x in range(CX - r - 2, CX + r + 3):
            d = math.hypot(x - CX, y - BALL_Y)
            ang = math.atan2(y - BALL_Y, x - CX) % math.tau
            sector = int(ang / math.tau * n_root * 2)
            re = r + (1 if sector % 2 == 0 else -1) * 0.9
            if d <= re:
                s.px(x, y, PAL["Y2"] if d > re - 1.6 else PAL["Y1"])
    if ring:
        s.circle(CX, BALL_Y, ring, PAL["Y2"])


def ball(s, r, w_r, ring=None, jag=True):
    s.use(layer="halo")
    dither_disc(s, CX, BALL_Y, r + 2, r + 9, PAL["Y4"])
    s.use(layer="body")
    if jag:
        jag_ball(s, r, ring=ring)
    else:
        s.circle(CX, BALL_Y, r, PAL["Y1"], fill=True)
        s.circle(CX, BALL_Y, r, PAL["Y2"])
    s.use(layer="core")
    s.circle(CX, BALL_Y, w_r, PAL["W"], fill=True)


def spikes(s, seed, n, r0, lens, tipcolor=True):
    s.use(layer="core")
    for a in arcs(seed, n, r0, lens):
        stamp_path(s, a, 1, PAL["Y1"])
        if tipcolor:
            s.px(a[-1][0], a[-1][1], PAL["W"])


def strand_layers(s, ss, main_w, core_w, halo_w, halo_col, thin=True, upto=None, branches=True):
    s.use(layer="halo")
    stamp_path(s, ss["main"], halo_w, halo_col, upto=upto)
    if thin:
        for p in ss["thin"]:
            stamp_path(s, p, 3, PAL["Y4"], upto=upto)
    s.use(layer="body")
    stamp_path(s, ss["main"], main_w, PAL["Y1"], upto=upto)
    if thin:
        for p in ss["thin"]:
            stamp_path(s, p, 1, PAL["Y2"], upto=upto)
    s.use(layer="core")
    stamp_path(s, ss["main"], core_w, PAL["W"], upto=upto)
    if branches:
        s.use(layer="body")
        for b in ss["branches"]:
            stamp_path(s, b, 1, PAL["Y1"], upto=upto)


def draw(s, f, st, ss, seed):
    s.frame(f)
    if st == 0:  # 予兆: 空に 小さな 玉
        s.use(layer="halo"); dither_disc(s, CX, 8, 3, 12, PAL["Y4"])
        s.use(layer="body"); s.circle(CX, 8, 4, PAL["Y1"], fill=True)
        s.use(layer="core"); s.circle(CX, 8, 1, PAL["W"], fill=True)
    if st == 1:  # のびる: 本すじが おりる（太い 1 本 ＋ 細い 2 本）
        strand_layers(s, ss, 3, 1, 5, PAL["Y4"], upto=190, branches=False)
        s.use(layer="halo"); s.circle(CX, 8, 4, PAL["Y3"], fill=True)
    if st == 2:  # 着地: すじが いちばん 太い ＋ 小さな 玉（先に 雷が 当たった）
        strand_layers(s, ss, 5, 3, 9, PAL["Y3"])
        s.use(layer="halo"); dither_disc(s, CX, BALL_Y, 8, 14, PAL["Y4"])
        s.use(layer="body"); s.circle(CX, BALL_Y, 6, PAL["Y1"], fill=True); s.circle(CX, BALL_Y, 6, PAL["Y2"])
        s.use(layer="core"); s.circle(CX, BALL_Y, 3, PAL["W"], fill=True)
    if st == 3:  # 玉★
        strand_layers(s, ss, 3, 2, 5, PAL["Y4"])
        ball(s, 14, 4)
        spikes(s, seed, 8, 15, (9, 13))
        s.use(layer="halo"); fade_bottom(s, GROUND - 1, H_ - 1)
        s.use(layer="body"); fade_bottom(s, GROUND, H_ - 1)
    if st == 4:  # ふくらむ
        strand_layers(s, ss, 1, 1, 3, PAL["Y4"], thin=False, branches=False)
        ball(s, 11, 3, ring=20)
        spikes(s, seed + 3, 6, 12, (8, 10), tipcolor=False)
        s.use(layer="halo"); fade_bottom(s, GROUND - 1, H_ - 1)
    if st == 5:  # しぼむ
        s.use(layer="body")
        s.circle(CX, BALL_Y, 5, PAL["Y2"], fill=True)
        s.circle(CX, BALL_Y, 22, PAL["Y3"])
        s.use(layer="core"); s.circle(CX, BALL_Y, 2, PAL["Y1"], fill=True)
    if st == 6:  # のこり
        s.use(layer="body"); s.circle(CX, BALL_Y, 2, PAL["Y3"], fill=True)
        s.use(layer="halo"); dither_disc(s, CX, BALL_Y, 0, 6, PAL["Y4"])
    if st == 7:  # きえかけ
        s.use(layer="body"); s.px(CX, BALL_Y, PAL["Y3"])
        s.use(layer="halo")
        for dx, dy in ((-3, -1), (2, -2), (4, 1), (-1, 3)):
            s.px(CX + dx, BALL_Y + dy, PAL["Y4"])


def build_bolt(seed=SEED):
    s = Sprite(W_, H_)
    for L in ("halo", "body", "core"):
        s.layer(L)
    for _ in range(NF - 1):
        s.add_frame(copy=False)
    ss = strands(seed)
    for st in range(NF):
        draw(s, st + 1, st, ss, seed)
    for f, ms in zip(range(1, NF + 1), (67, 33, 33, 100, 100, 67, 67, 50)):
        s.set_duration(ms, [f])
    return s, ss


def build_unfaded(ss):
    s = Sprite(W_, H_)
    for L in ("halo", "body", "core"):
        s.layer(L)
    s.frame(1)
    s.use(layer="body")
    stamp_path(s, ss["main"] + [(ss["main"][-1][0], H_ - 1)], 3, PAL["Y1"])
    s.use(layer="core")
    stamp_path(s, ss["main"] + [(ss["main"][-1][0], H_ - 1)], 1, PAL["W"])
    return kit.frame_rgba(s, 1, ("halo", "body", "core"))


def build_decal():
    """地面の 輪: 同心円 3 つ（外 = 半径 5 = 40 点）＋ 輪の 間の ひびの 光（ぎざぎざ 4 本）"""
    s = Sprite(96, 96)
    s.add_frame(copy=False)
    for f, k in ((1, 0), (2, 1)):
        s.frame(f)
        s.circle(48, 48, 40, PAL["Y2"] if k == 0 else PAL["Y3"])
        if k == 0:
            s.circle(48, 48, 41, PAL["Y3"])
        s.circle(48, 48, 30, PAL["Y3"] if k == 0 else PAL["Y4"])
        s.circle(48, 48, 20, PAL["Y3"] if k == 0 else PAL["Y4"])
        for q in range(4):  # ひび: 輪 20 と 30 の 間・30 と 40 の 間を ぎざぎざに つなぐ
            a = math.radians(45 + 90 * q)
            pts = []
            for j, rr in enumerate((22, 27, 31, 36, 39)):
                off = 0 if j in (0, 4) else (2 if j % 2 else -2)
                pts.append((round(48 + rr * math.cos(a) - off * math.sin(a)), round(48 + rr * math.sin(a) + off * math.cos(a))))
            stamp_path(s, pts, 1, PAL["Y2"] if k == 0 else PAL["Y3"])
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


def export_game(variants, decal):
    from PIL import Image
    atlas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    for v, s in enumerate(variants):
        for f in range(1, NF + 1):
            for li, L in enumerate(("halo", "body", "core")):
                atlas.paste(kit.cel(s, f, L), ((v * NF + f - 1) * W_, li * H_))
    atlas.save(os.path.join(HERE, "thunder_b_sheet.png"))
    g = Image.new("RGBA", (256, 128), (0, 0, 0, 0))
    g.paste(decal.composite(1), (0, 0))
    g.paste(decal.composite(2), (96, 0))
    g.save(os.path.join(HERE, "thunder_b_ground.png"))
    sp = Image.new("RGBA", (16, 4), (0, 0, 0, 0))
    plus = spark_img(0.0)
    sp.paste(plus, (0, 0))
    sp.putpixel((5, 1), kit.hex2rgba(PAL["Y1"]))
    sp.putpixel((9, 1), kit.hex2rgba(PAL["Y3"]))
    sp.save(os.path.join(HERE, "thunder_b_spark.png"))
    print("game ->", atlas.size, g.size, sp.size)
    return atlas


def main():
    s, ss = build_bolt(SEED)
    s1, _ = build_bolt(SEED + 100)
    s.preview(os.path.join(HERE, "preview.png"), scale=3, bg="#161926", cols=8)
    s.stats()
    decal = build_decal()
    export_game([s, s1], decal)

    P = dict(
        out=HERE, sprite=s, layers=("halo", "body", "core"),
        layer_names=("奥: にじみ", "中: 玉・すじ", "手前: 芯・放電"),
        title="B 仕上げ 「ひかりの たま」 太い 本すじ ＋ 着地の 小さな 玉 ＋ とがった 放電",
        concept=[
            "形の 言葉 = まる が 主（玉・同心円・ふくらむ）、さんかくは そえる（すじの 角・玉の まわりの 放電 8 本）。色は 白〜黄の 5 色だけ。",
            "直した 所: 本すじ 1 本 太く（芯 2・からだ 3・にじみ）・角を とがらせる・下に 枝 2 本・着地の 2 ステップ（すじ いちばん 太い ＋ 小さな 玉）・玉の ふちを 欠く・W を 小さく・輪に ひび 4 本。",
        ],
        palette=[("W", PAL["W"], "玉の まん中・芯・放電の 先"), ("Y1", PAL["Y1"], "玉・すじ"), ("Y2", PAL["Y2"], "ふち・輪"),
                 ("Y3", PAL["Y3"], "にじみ"), ("Y4", PAL["Y4"], "とおい にじみ")],
        six=[
            "たて軸で カメラへ 向く 板。玉 6 ステップ・\nふくらむ 6 ステップ。着地は すじが いちばん 太い",
            "すじの 下を 網で ぬき、玉（地面から 14 点 上）で\n切れ目を かくす",
            "にじみ（奥）・玉と すじ（中）・芯と 放電（手前）の 3 まい",
            "同心円 3 つの 輪（外 = 半径 5）＋ ひび 4 本。寝かせる",
            "着地 +35% → +25% → +12% → 0（1 回だけ・\n3 段で さがる）",
            "1 点 = 1/8 ブロック。玉は 点で 描いた 円。形は 2 通り ＋ 左右 反転 = 4 通り",
        ],
        timeline=[
            dict(name="予兆", f=1, steps=4),
            dict(name="のびる", f=2, steps=2, light=0.10),
            dict(name="着地", f=3, steps=2, light=0.35, decal=(1, 0.9), spark=0.0),
            dict(name="玉", f=4, steps=6, light=0.25, decal=(1, 1.0), spark=0.05),
            dict(name="ふくらむ", f=5, steps=6, light=0.12, decal=(1, 0.9), spark=0.15),
            dict(name="しぼむ", f=6, steps=4, decal=(2, 0.8), spark=0.25),
            dict(name="のこり", f=7, steps=4, decal=(2, 0.6), spark=0.35),
            dict(name="きえかけ", f=8, steps=3, decal=(2, 0.3), spark=0.45),
        ],
        key_i=3, motion_sil=(0, 3, 5),
        decal=decal, spark_img=spark_img, spark_n=32, seed=9,
        unfaded=build_unfaded(ss),
        data=[
            ["コマ（絵）", "8 コマ × 形 2 通り ＋ 反転"],
            ["ステップ", "雷 31（F2〜32）＋ つぶ 50〜80"],
            ["絵の 大きさ", "雷 1024×1024（4 MB）、輪 256×128、つぶ 16×4"],
            ["描画回数", "雷 1 ＋ 輪 1 ＋ つぶ 1 = 3"],
            ["三角形", "雷 6 ＋ 輪 2 ＋ つぶ 64 = 72"],
            ["光", "置きっぱなしの 1 つ（+35→25→12→0）"],
        ],
        criteria={
            1: ("○", "黒ぬりで 太い すじ・角・枝が 見え、玉の 上に すじが 立つ"),
            2: ("○", "玉の まん中が いちばん 明るい"),
            3: ("○", "ぼかすと 玉に 目が 行く"),
            4: ("○", "細かさは 放電と ひびだけ"),
            5: ("―", ""),
            6: ("○", "黄 5・にじみ 3・白 2"),
            7: ("○", "白→黄→こげ茶"),
            8: ("○", "とがった 放電で たいまつ・夕日と 分かれる"),
            9: ("○", "まる が 主・さんかくは そえる"),
            10: ("○", "太い すじで 今の 雷と ならぶ"),
            11: ("―", ""), 12: ("○", "すじの 角・枝・放電の ぎざぎざで 雷と 分かる"), 13: ("○", "形で 分かる"),
            14: ("―", ""), 15: ("―", ""),
            16: ("○", "光・輪・つぶで 返す"),
            17: ("○", "玉の ふちを 欠いて とがらせ、かわいい 寄りを 弱めた"),
        },
        motion={
            1: ("○", "予兆 4・のびる 2・着地+玉 8・あと 11（＋つぶ）"),
            2: ("○", "「ばしっ と 当たって ぷくっ」。止め絵 = 玉"),
            3: ("○", "予兆 → のびる → 着地 で 変わる"),
            4: ("―", ""), 5: ("○", "玉の コマが 決め"), 6: ("―", ""), 7: ("―", ""),
            8: ("○", "のびる 2 ステップ"),
            9: ("○", "ふくらむ → しぼむ → のこり → きえかけ で 余韻"),
            10: ("―", ""),
            11: ("○", "着地の すじは 5 点（ふだんの 倍）"),
            12: ("○", "着地で 小さく → 玉で ぷくっ → しぼむ"),
            13: ("―", ""), 14: ("―", ""), 15: ("―", ""),
            16: ("○", "外の 輪 = 半径 5"),
            17: ("―", ""), 18: ("○", "8 方向 同じ"),
        },
    )
    kit.make_sheet(P)
    extend_sheet(s)


def extend_sheet(s):
    """B の 前の 案と 直した 案を ならべた 1 段を 足す"""
    from PIL import Image
    path = os.path.join(HERE, "sheet.png")
    old = Image.open(path).convert("RGB")
    H0 = old.height
    sh = kit.Sheet(old.width, H0 + 760)
    sh.im.paste(old, (0, 0))
    y = H0 + 10
    sh.text((24, y), "前の 案（B 最初）と 直した 案 — 同じ 場面・同じ 玉の コマ", 20, (255, 226, 150))
    prev = Image.open(os.path.join(HERE, "prev_key_scene.png")).convert("RGB")
    cur = Image.open(os.path.join(HERE, "key_scene.png")).convert("RGB")
    sh.label_img((24, y + 36), kit.up(prev, 2), "前（細い すじ・黒ぬりで 光の 玉）", 14)
    sh.label_img((450, y + 36), kit.up(cur, 2), "直した（太い 本すじ・枝・放電 8 本）", 14)
    land = kit.compose_scene(kit.frame_rgba(s, 3, ("halo", "body", "core")), decal=kit.scale_rgb(build_decal().composite(1), 0.9), light=0.35)
    sh.label_img((876, y + 36), kit.up(land, 2), "着地の コマ（すじ いちばん 太い ＋ 小さな 玉）", 14)
    sil_old = kit.silhouette(prev.convert("RGBA").crop((0, 0, 200, 300)))
    sy = y + 36 + 14 + 6 + 600 + 12
    sh.text((24, sy), "シルエット（黒ぬり）: 左 前 / 右 直した。直した 方は 太い すじ・角・枝・放電で「雷」と 言える。", 15, kit.INK)
    sh.text((24, sy + 24), "確かめ: ものさし 1 ○・12 ○・17 ○（前は 1 △・12 △・17 △）。着地の 2 ステップで すじが いちばん 太い（5 点）、玉★が いちばん 大きく 明るい。", 15, kit.INK)
    sh.save(path)


if __name__ == "__main__":
    main()
