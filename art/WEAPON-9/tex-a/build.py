"""WEAPON-9 v2 案 A「ほしの まく」: 白い ドームに 小さな 星が ぽつぽつ。ふちは クリームと 金。斬撃は 三日月と 星。
下絵: PixelLab vfx lite `pixellab/v2tex/niji-a-dome`・`niji-a-slash`（色・星の 形・三日月の 形を もらった）。
実行: uv run --no-project --with pillow --with numpy python art/WEAPON-9/tex-a/build.py
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import tex9  # noqa: E402
from tex9 import Sprite, TW, TH, D  # noqa: E402

PAL = {"W": "#FFFDF2", "C": "#FFF0B8", "Y": "#E6B450", "Y3": "#B07A1A", "L": "#D8C8FF", "S": "#7FD8F0", "G": "#5FBF9A"}


def tile():
    """88×112 × 2 コマ。星 12 こ（大 5×5・小 3×3）。7 割 金と クリームの とげ（白い まくの 上でも 見える）、3 割 にじ（水色・ふじ色・みどり）。2 コマ目は 半分の 星が 大 ⇄ 小（きらきら。明るさは 変えない）"""
    s = Sprite(TW * 2, TH)
    rnd = random.Random(23)
    stars = []
    cells = [(cx, cy) for cy in range(4) for cx in range(3)]
    rnd.shuffle(cells)
    for k, (cx, cy) in enumerate(cells[:12]):
        x = 6 + cx * 29 + rnd.randint(0, 18)
        y = 18 + cy * 24 + rnd.randint(0, 14)
        big = rnd.random() < 0.7
        rr = rnd.random()
        arm = PAL["Y"] if rr < 0.45 else PAL["C"] if rr < 0.7 else [PAL["S"], PAL["L"], PAL["G"]][k % 3]
        stars.append((x, y, big, arm, k % 2 == 0))
    for f in range(2):
        for x, y, big, arm, tw in stars:
            b = big if (f == 0 or not tw) else not big
            tex9.plus_star(s, f * TW + x % TW, y, 2 if b else 1, PAL["W"], arm)
    return s


RIM = [(None, 0)] * 8 + [(PAL["Y"], 64), (PAL["Y"], 128), (PAL["Y"], 128), (PAL["C"], 192), (PAL["C"], 192), (PAL["W"], 255), (PAL["W"], 255), (D, 255)]


def slash_color(f, q, u, x, y):
    if f < 0.5:
        return PAL["W"]
    if f > 0.86:
        return PAL["S"] if tex9.B[y % 4][x % 4] < 0.6 else None
    return PAL["L"] if q > 0.5 else PAL["C"]


def slash_frame(view, i, tail, head, sc, thin):
    return tex9.slash_px(view, tail, head, sc, thin, {"kind": "arc", "T": 12}, slash_color, cap="moon")


def slash_deco(s, view, i):
    """三日月の うしろに 星（ふち 線 なし）。決めの あとから 1 こずつ ふえて、きえかけで 小さく"""
    ky = 1.0 if view == "side" else 0.6
    cy = 38 if view == "side" else 40.5
    spots = [(0.62, 33, 2), (0.30, 35, 1), (0.82, 25, 1)]
    n = [1, 2, 3, 2][i]
    for k, (qq, rr, big) in enumerate(spots[:n]):
        th = math.radians(165 - qq * 150)
        x = round(32 + rr * math.cos(th))
        y = round(cy - rr * math.sin(th) * ky)
        r = big if i < 3 else 1
        tex9.plus_star(s, x, y, r, PAL["W"], PAL["S"] if k % 2 == 0 else PAL["L"])


O = dict(
    tile_fn=tile, rim_bins=RIM, slash_frame=slash_frame, slash_deco=slash_deco,
    shift=lambda t: int(t * 6),  # 星は ゆっくり ながれる（6 点/秒）
    swap=30, inner=0.5,
    ring=(PAL["Y"], PAL["C"], PAL["W"], PAL["Y3"]),
    frag_cols=[PAL["W"], PAL["C"], PAL["S"], PAL["L"]], frag_fade=PAL["Y3"],
)

P = dict(
    out=HERE, pl="a",
    pl_dome_frames=[2, 6, 12], pl_slash_frames=[0, 1, 2, 4], pl_k=2, pl_sk=3,
    pl_took=[
        "・ドーム: くもりガラスの 白（青み）、クリームの ふち と 金の へり、",
        "  まくに ちらばる 4 本とげの 小さな 星（白が 多く、水色・ふじ・みどりが 少し）",
        "・斬撃: 太い 三日月（両はしが とがる）、上の 方が ふじ色、うしろに 水色の 星",
        "・時間: 出る → 止め → 網で きえる（今の 区間と 同じ）",
        "・すてた 所: 下絵の 黒い ふち（こい 紺に）、ドームの 半分の 形（球に はる）",
    ],
    title="v2 案 A「ほしの まく」: しろい ドームに ちいさな ほし・三日月の 斬撃",
    concept=[
        "しろい くもりガラスの ドームに、ちいさな ほしが ぽつぽつ（1 まわりに 48 こ）。ほしは ゆっくり ながれて、ときどき 大きく なったり 小さく なったり（きらきら。明るさは かえない）。",
        "ふちは クリームと 金の やわらかい 光。斬撃は ふとい 三日月で、うしろに ほしが のこる。色の 割合: 白 8.5・金 1・にじ 0.5（いちばん しずか）。",
        "形の 言葉: まる（ドーム・三日月）＋ ちいさな とげ（ほし）。細かさ: ひくい（ほしの 間は 休む 所）。",
    ],
    palette=[("W", PAL["W"], "ほしの まん中・ふちの 光・斬撃の 芯"), ("C", PAL["C"], "ほしの とげ・ふち"), ("Y", PAL["Y"], "ふちの 内・地面の 輪"),
             ("Y3", PAL["Y3"], "輪の 内・きえる かけら"), ("L", PAL["L"], "ふじ: ほし・三日月の 上"), ("S", PAL["S"], "水色: ほし・三日月の へり"),
             ("G", PAL["G"], "みどり: ほし（少し）"), ("D", D, "ふちの いちばん 外・斬撃の ふち")],
    pal_note="8 色（虹は 色の 数の 例外）。まくの もよう 7 色・斬撃 6 色。半透明 なし",
    data=[
        ["描画回数", "4（今と 同じ: まく 1・輪 1・玉 1・点 1）＋ 斬撃 1"],
        ["三角形", "202（今と 同じ: まく 198・輪 2・玉 2）＋ 斬撃 2"],
        ["絵", "まく 176×112・ふち 16×2・斬撃 256×88（今と 同じ 大きさ）"],
        ["シェーダー", "今の 計算の かわりに 絵を 2 回 よむ（もよう・ふち）"],
        ["一人称", "うら面は ほしだけ 網で 半分（白く ならない）"],
        ["うごきを へらす", "ほしの ながれ・きらきら を 止める"],
    ],
    six=["決め: とどまる 160 ステップ 同じ 明るさ（ほしが ながれる だけ）",
         "ささる 所: 球は 地面で 切る ＋ 輪で 切れ目を かくす（今と 同じ）",
         "重ね: 奥の まく → 子 → 玉 → 手前の ふち",
         "地面の 輪: 半径 6.4 = 当たり（今と 同じ）",
         "まわりを 明るく: +30%・1 回だけ（今と 同じ）",
         "ドット: もようも ふちも 1/8 ブロックの 升目"],
    slash_table=[["出る", "1", "4（F0〜3）"], ["★決め", "1", "4（F4〜7）= いちばん 太い"], ["のこり", "1", "4（F8〜11）ほし 3 こ"], ["きえかけ", "1", "4（F12〜15）網で ぬける"]],
    criteria={1: ("○", "まるい 球と 三日月が すぐ 分かる"), 2: ("○", "ふちの 紺と 白で 昼でも りんかく"), 3: ("○", "ふちと 玉に 目が 行く"),
              4: ("○", "ほしの 間に 休む 所が ある"), 5: ("○", "輪で「ここまで」"), 6: ("○", "白 8.5・金 1・にじ 0.5"),
              7: ("○", "明るい ほど 黄みの 白、暗い 金は 茶へ"), 8: ("△", "雷 B（白〜黄）に 近い。ほしで 区別"), 9: ("○", "まる ＋ 小さな とげ"),
              10: ("○", "1/8 の 点・足し算"), 12: ("○", "字 なしで 光の まく"), 13: ("○", "白黒でも ふちと ほしが 出る"),
              16: ("○", "音と いっしょ（今と 同じ）"), 17: ("△", "やさしいが 虹らしさは 少ない")},
    motion={1: ("○", "斬撃 4 区間 × 4 ステップ"), 2: ("○", "「シュッ と 三日月、ほしが のこる」"), 3: ("○", "F0 で 半分 出る"),
            5: ("○", "決めの 三日月が いちばん 太い"), 6: ("○", "のこりで 弧の さきだけ のこる"), 8: ("○", "出る 1 コマで 一気に"),
            9: ("○", "のこりの ほしで 振った 道が 見える"), 11: ("○", "板 6 マス"), 16: ("○", "弧の まん中を 刀の さきに（今と 同じ）"),
            18: ("○", "よこ／ねかせ の 2 まい")},
)

if __name__ == "__main__":
    tex9.run(O, P)
