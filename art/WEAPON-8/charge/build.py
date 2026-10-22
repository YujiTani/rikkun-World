"""WEAPON-8: ため中の 見た目 3 案の 見本シート（雷神剣・風神剣 共通）。

python3 art/WEAPON-8/charge/build.py → docs/art/WEAPON-8/charge-3.png
ゲームの スクショ（うしろ = プレイヤー目線）に 3D の 形を 重ねる。子より 奥の つぶは 子で かくす。
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
sys.path.insert(0, os.path.join(HERE, "..", "spiral"))

from PIL import Image  # noqa: E402

import w8kit as K  # noqa: E402
from charge import FULL, PLANS, THUNDER, WIND, P  # noqa: E402
from w8kit import render, up, sub, dot  # noqa: E402
import build as SP  # noqa: E402  （うしろの カメラ・子の マスクを 使い回す）

CHEST = (0.0, 0.9, 0.0)
FRAMES = [(10, "ため 10"), (30, "ため 30（途中）"), (55, "ため 55"), (FULL, "★いっぱい 60"), (64, "64"), (90, "いっぱい 中 90")]
CROP = (400, 250, 720, 590)

INFO = {
    "T1": ("すいこまれる 光（ロックマン型）", "まわり 1.2〜1.6 ブロックから 光の つぶが 胸の まん中へ 一直線に すいこまれる（はじめ ゆっくり → 中で 速く・速い ほど 尾が 長い）。胸の 芯が ため に あわせて 大きく なる。いっぱい = 輪が 1 回 ぱっと ひろがり、きらり 4 つが ゆっくり 回る",
           [("描画回数", "2（つぶ・きらり 1 ／ 芯・輪 1）"), ("三角形", "つぶ 18 こ（尾は 絵で のばす 1 まい）× 2 ＋ きらり 4 × 2 ＋ 芯 3 まい 6 ＋ 輪 2 = 52"), ("絵", "白黒の 1 まい 64×64（芯・輪・きらり・つぶ）＋ 5 色の 表")]),
    "T2": ("らせんで 集まる", "2 本の うでの うずに 乗って、つぶが 回りながら 胸へ 集まる（らせんの かぜと 同じ 言葉）。いっぱい = 腰の 高さに 地面と 平行な 光の 輪が できて、光の 玉 3 つが 回る。小さな つぶが 上へ ふわっと",
           [("描画回数", "3（つぶ 1 ／ 芯・玉 1 ／ 輪 1）"), ("三角形", "つぶ 24 × 2 ＋ 芯・玉 4 × 2 ＋ 輪 16 区切り × 2 = 88"), ("絵", "白黒 64×64 ＋ 輪の 帯 16×4")]),
    "T3": ("光の 輪が しぼむ ＋ ★", "カメラに 向く 光の 輪が 12 ステップごとに 外から 胸へ しぼむ（輪の 上に つぶ 6 こ）。いっぱい = 頭の 上に ★ が ぽんっと 出て（0.5→1.3→1.0）、ためて いる 間 出つづける。輪は ゆっくり（24 ステップごと）",
           [("描画回数", "1〜2（輪・つぶ・芯・★ を 1 まいの 絵に）"), ("三角形", "輪 2 ＋ つぶ 6 ＋ 芯 1 ＋ ★ 1 = 10 まい → 20"), ("絵", "白黒 64×64 ＋ 5 色の 表")]),
}

MARKS = {
    "T1": "いちばん「ためてる！」が 分かる（集まる 動き）。いっぱいは 輪 1 回 ＋ きらり で 分かるが ★ ほど 強くない",
    "T2": "らせんの かぜと 形の 言葉が そろう。いっぱいの 輪は 足もとに あって よく 見える。数は いちばん 多い（まだ 上限の 中）",
    "T3": "いっぱいの ★ が 6 歳に いちばん 分かる。集まる 感じは 輪で 出すので T1 より 静か。いちばん 軽い",
}


def scene(fn, F, cols):
    cam = SP.behind_cam()
    items = fn(F, cols, cam, CHEST)
    kz = dot(sub(CHEST, cam.pos), cam.fwd)
    far = [it for it in items if dot(sub(it[1], cam.pos), cam.fwd) > kz + 0.05]
    near = [it for it in items if it not in far]
    shot = Image.open(SP.SHOT).convert("RGBA")
    out = shot.copy()
    out.alpha_composite(up(render(far, cam), SP.BK).crop((0, 0, 1280, 800)))
    out.paste(shot, (0, 0), SP.kid_mask())  # 子より 奥は かくれる
    out.alpha_composite(up(render(near, cam), SP.BK).crop((0, 0, 1280, 800)))
    return out.crop(CROP)


def current():
    """今の ため: 手の 十字の 板 2 まい（thunder_ground.png の 網の 円）。いっぱいで 1.5 倍に なる だけ"""
    g = Image.open(os.path.join(K.ROOT, "public", "models", "fx", "thunder_ground.png")).convert("RGBA").crop((0, 0, 64, 64))
    shot = Image.open(SP.SHOT).convert("RGBA")
    cam = SP.behind_cam()
    out = []
    for s in (0.8, 1.5):
        items = []
        gp = g.load()
        hand = (0.05, 1.05, 0.35)
        for j in range(0, 64, 2):
            for i in range(0, 64, 2):
                c = gp[i, j]
                if c[3] < 40:
                    continue
                u, v = (i / 64 - 0.5) * s, (0.5 - j / 64) * s
                items.append(("dot", (hand[0] + u, hand[1] + v, hand[2]), c[:3], s / 32))
                items.append(("dot", (hand[0], hand[1] + v, hand[2] + u), c[:3], s / 32))
        o = shot.copy()
        o.alpha_composite(up(render(items, cam), SP.BK).crop((0, 0, 1280, 800)))
        out.append(o.crop(CROP))
    return out


def main():
    cw, ch = CROP[2] - CROP[0], CROP[3] - CROP[1]
    sh = K.Sheet(1800, 3200)
    sh.text((24, 14), "ため中の 見た目: 方向の 3 案（雷神剣・風神剣 共通。色だけ 差しかえ）", 30, K.HEAD)
    sh.text((24, 56), "うしろ（プレイヤー目線）。ゲームの スクショに 重ねた 見本・原寸。ため いっぱい = 60 ステップ（1 秒）。強い 点滅は なし（明るさは 上がって 止まる・回る だけ）", 15, K.SUB)
    y = 90
    cur = current()
    sh.text((24, y), "今: 手に 十字の 板 2 まいの 網の 円（0.8 → いっぱいで 1.5 倍）", 18, K.INK)
    sh.img((24, y + 28), cur[0], "ため中", 13)
    sh.img((24 + cw + 12, y + 28), cur[1], "いっぱい", 13)
    lines = ["ださい 所:", "・動かない → 「たまって いく」が 見えない", "・いっぱいの 合図が「少し 大きく なる」だけ",
             "・ぼやけた 網の 円で 形が ない（何の 光か 分からない）", "・十字の 板なので ななめから 二重・線に 見える", "・雷の 黄色の まま（風神剣に 合わない）"]
    for i, ln in enumerate(lines):
        sh.text((24 + 2 * (cw + 12) + 10, y + 40 + i * 26), ln, 15)
    y += 28 + 20 + ch + 30
    for key, fn in PLANS.items():
        name, desc, budget = INFO[key]
        sh.text((24, y), f"{key} {name}" + ("（おすすめ）" if key == "T1" else ""), 22, K.HEAD)
        sh.text((24, y + 32), desc, 13, K.INK)
        x = 24
        for F, lab in FRAMES:
            sh.img((x, y + 56), scene(fn, F, P(WIND)).crop((15, 0, cw - 15, ch)), "風神剣 " + lab, 12)
            x += cw - 30 + 8
        y2 = y + 56 + 18 + ch + 8
        x = 24
        for F, lab in [(30, "ため 30"), (FULL, "★いっぱい 60"), (90, "いっぱい 中 90")]:
            im = scene(fn, F, P(THUNDER)).crop((15, 60, cw - 15, ch - 60))
            sh.img((x, y2), im, "雷神剣 " + lab, 12)
            x += cw - 30 + 8
        tx = x + 10
        sh.table((tx, y2 + 10), [["かず", "見積もり"]] + [list(b) for b in budget], [80, 420], 12, 22)
        sh.text((tx, y2 + 110), MARKS[key], 13, K.SUB)
        y = y2 + 18 + ch - 120 + 26
    # 色の 表
    sh.text((24, y), "色: 白黒の 絵（5 段）＋ 武器ごとの 5 色の 表（uniform）。同じ 絵・同じ 数で 雷神剣・風神剣（・虹 など）に 使える", 15, K.INK)
    for r, (nm, pal) in enumerate((("風神剣", WIND), ("雷神剣", THUNDER))):
        sh.text((24, y + 30 + r * 30), nm, 14)
        for i, c in enumerate(pal):
            sh.d.rectangle([110 + i * 120, y + 28 + r * 30, 130 + i * 120, y + 48 + r * 30], fill=K.rgb(c))
            sh.text((136 + i * 120, y + 30 + r * 30), c, 12, K.SUB)
    sh.im = sh.im.crop((0, 0, 1800, y + 100))
    sh.save(os.path.join(K.DOCS, "charge-3.png"))


if __name__ == "__main__":
    main()
