"""WEAPON-9 v2 案 B「しゃぼんだま」: 白い ドームの ふちが しゃぼん玉の ように パステルの にじ色。まくに ふわっと うずと あわ。斬撃は ふとい まるい にじ。
下絵: PixelLab vfx lite `pixellab/v2tex/niji-b-dome`・`niji-b-slash`（うずの 形・ミントの ふち・あわ・しまの ならびを もらった）。
実行: uv run --no-project --with pillow --with numpy python art/WEAPON-9/tex-b/build.py
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import tex9  # noqa: E402
from tex9 import Sprite, TW, TH, D  # noqa: E402

PAL = {"W": "#FBFDF6", "M": "#B4F0CC", "M2": "#8FD8C0", "S": "#9AD4EF", "L": "#C4B0EE", "F": "#5E7E96"}
BAY = tex9.B


def tile():
    """88×112 × 2 コマ。1 まい に うずの うで 1 本（1 まわりで 4 本）: 上は ふじ → 水色 → 下は ミント。へりは 網。
    あわ（わっか）3 こ。2 コマ目は あわが 3 行 上へ（のぼる）"""
    s = Sprite(TW * 2, TH)
    rnd = random.Random(5)
    bub = [(rnd.randint(8, 80), rnd.randint(50, 100), rnd.choice((1.5, 2.5))) for _ in range(3)]
    for f in range(2):
        for y in range(TH):
            ln = 1 - y / TH  # 1 = 上
            if y < 10:
                continue
            c0 = (y * 0.75) % TW  # うずの 線（上へ 行くほど ずれる = うず）
            wdt = 28 * (0.45 + 0.55 * ln)
            for x in range(TW):
                d = (x - c0) % TW
                if d >= wdt:
                    continue
                u = d / wdt
                edge = min(u, 1 - u)
                if edge < 0.22 and BAY[y % 4][x % 4] > edge * 3.2:
                    continue
                col = PAL["L"] if y < 40 else PAL["S"] if y < 76 else PAL["M"]
                s.px(f * TW + x, y, col)
        for x, y, r in bub:
            tex9.ring_px_tile(s, f * TW, x, y - 3 * f, r, PAL["W"])
    return s


RIM = [(None, 0)] * 6 + [(PAL["M"], 64), (PAL["M"], 64), (PAL["L"], 128), (PAL["L"], 128), (PAL["S"], 192), (PAL["S"], 192),
                         (PAL["M"], 255), (PAL["M"], 255), (PAL["W"], 255), (D, 255)]


def slash_color(f, q, u, x, y):
    # 外（f 小）→ 内: ふじ・水色・ミント・クリーム白（下絵の ならび）
    return PAL["L"] if f < 0.26 else PAL["S"] if f < 0.5 else PAL["M"] if f < 0.74 else PAL["W"]


def slash_frame(view, i, tail, head, sc, thin):
    return tex9.slash_px(view, tail, head, sc, thin, {"kind": "arc", "T": 15}, slash_color, cap="round")


def slash_deco(s, view, i):
    """弧の 内がわに あわ。のこりで ふえて、きえかけで 1 こ"""
    ky = 1.0 if view == "side" else 0.6
    cy = 38 if view == "side" else 40.5
    spots = [(0.35, 12, 2.5), (0.6, 10, 1.5), (0.8, 13, 2.0)]
    n = [0, 1, 3, 1][i]
    for qq, rr, r in spots[:n]:
        th = math.radians(165 - qq * 150)
        x = 32 + rr * math.cos(th)
        y = cy - rr * math.sin(th) * ky
        tex9.ring_px(s, x, y, r, PAL["W"])


O = dict(
    tile_fn=tile, rim_bins=RIM, slash_frame=slash_frame, slash_deco=slash_deco,
    shift=lambda t: int(t * 14),  # うずが ながれる（14 点/秒 → 25 秒で 1 まわり）
    swap=20, inner=0.25, inner_k=0.45, window=PAL["W"], frost_tint=(0.96, 1.0, 1.06),
    ring=(PAL["M2"], PAL["M"], PAL["W"], PAL["S"]),
    frag_cols=[PAL["W"], PAL["M"], PAL["S"], PAL["L"]], frag_fade=PAL["F"],
)

P = dict(
    out=HERE, pl="b",
    pl_dome_frames=[2, 6, 12], pl_slash_frames=[0, 1, 2], pl_k=1, pl_sk=2,
    pl_took=[
        "・ドーム: ミントの ふち、ふじと 水色の うずの うで、ちいさな あわ、",
        "  左上の まどの 光（しゃぼん玉らしさ）",
        "・斬撃: 外から ふじ・水色・ミント・クリームの しま、まるい はし、",
        "  弧の 内がわの あわ",
        "・すてた 所: 上から 見た うずの まん中（球に はるので らせんに）、",
        "  ふち なしの パステル（昼の 空に とける → こい 紺の ふち を 足した）",
    ],
    title="v2 案 B「しゃぼんだま」: ふちが パステルの にじ色・ふわっと うずと あわ",
    concept=[
        "しろい ドームが しゃぼん玉に なる。ふちの 近くが ミント・水色・ふじ の にじ色（見る 角度で 色が かわる）。まくに ふわっと うずの うで 4 本と あわ。左上に まどの 光。",
        "斬撃は ふとくて まるい にじの しま（ふじ・水色・ミント・クリーム）。弧の 中に あわ。色の 割合: 白 6・パステル 3.5・紺 0.5（いちばん 虹らしい）。",
        "形の 言葉: まる だけ（球・あわ・まるい はし・うず）。細かさ: 中（ふちに あつめる。まん中は 白い 休む 所）。",
    ],
    palette=[("W", PAL["W"], "まどの 光・あわ・斬撃の 内"), ("M", PAL["M"], "ミント: ふち・うず の 下"), ("M2", PAL["M2"], "ミント こい: 地面の 輪"),
             ("S", PAL["S"], "水色: ふち・うず の 中"), ("L", PAL["L"], "ふじ: ふち・うず の 上・斬撃の 外"), ("F", PAL["F"], "きえる かけら"),
             ("D", D, "ふちの いちばん 外・斬撃の ふち")],
    pal_note="7 色（虹は 色の 数の 例外）。もよう 5 色・斬撃 5 色。半透明 なし",
    data=[
        ["描画回数", "4（今と 同じ）＋ 斬撃 1"],
        ["三角形", "202（今と 同じ）＋ 斬撃 2"],
        ["絵", "まく 176×112・ふち 16×2・斬撃 256×88"],
        ["シェーダー", "絵を 2 回 よむ ＋ まどの 光（カメラの 向きで 1 行）"],
        ["一人称", "うら面は うずだけ 網で 1/3（白く ならない）"],
        ["うごきを へらす", "うずの ながれ・あわ を 止める"],
    ],
    six=["決め: とどまる 160 ステップ 同じ 明るさ（うずが ながれる だけ）",
         "ささる 所: 球は 地面で 切る ＋ ミントの 輪で かくす",
         "重ね: 奥の まく → 子 → 玉 → 手前の ふち・まど",
         "地面の 輪: 半径 6.4 = 当たり（色だけ ミントに）",
         "まわりを 明るく: +30%・1 回だけ（今と 同じ）",
         "ドット: 1/8 ブロックの 升目。うずの へりは 網"],
    slash_table=[["出る", "1", "4（F0〜3）"], ["★決め", "1", "4（F4〜7）= いちばん 太い"], ["のこり", "1", "4（F8〜11）あわ 3 こ"], ["きえかけ", "1", "4（F12〜15）網で ぬける"]],
    criteria={1: ("○", "まるい 球・まるい 弧"), 2: ("△", "パステルは 明るさの 差が 小さい → 紺の ふちで おぎなう"), 3: ("○", "にじ色の ふちに 目が 行く"),
              4: ("○", "細かい のは ふちだけ"), 5: ("○", "輪で「ここまで」"), 6: ("○", "白 6・パステル 3.5・紺 0.5"),
              7: ("△", "パステル 3 色は 明るさが 近い"), 8: ("○", "雷（白〜黄）と はっきり ちがう"), 9: ("○", "まる だけ"),
              10: ("△", "ミントの 輪は 今の 金と ちがう"), 12: ("○", "字 なしで あわの まく"), 13: ("△", "白黒で うずが うすい"),
              16: ("○", "音と いっしょ"), 17: ("△", "パステル・あわで 少し 子どもっぽい")},
    motion={1: ("○", "斬撃 4 区間 × 4 ステップ"), 2: ("○", "「ぼわん と ふとい にじ」"), 3: ("○", "F0 で 半分 出る"),
            5: ("○", "決めが いちばん 太い"), 6: ("○", "のこりで 弧の さきが のこる"), 8: ("○", "出る 1 コマで 一気に"),
            9: ("○", "あわで 振った 道が 見える"), 11: ("○", "板 6 マス・太さ 15 点"), 16: ("○", "今と 同じ"), 18: ("○", "よこ／ねかせ")},
)

if __name__ == "__main__":
    tex9.run(O, P)
