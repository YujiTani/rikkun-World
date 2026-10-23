"""オーナーに 見せる 1 まい docs/art/WEAPON-9/v3-slash.png と うごき v3-slash.gif（3 段こうげき つき → きりあげ → けさ ＋ ヒットの 火花）。
実行: uv run --no-project --with pillow --with numpy python art/WEAPON-9/slash-niji/compare.py（build.py も 中で 回す）
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import numpy as np  # noqa: E402
import build  # noqa: E402
import tex9  # noqa: E402
import sheet9  # noqa: E402
from kit9 import kit  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

atlas, frames, cent, hit, data = build.main()
G = sheet9.GOLD
SKY, GRASS = (160, 210, 246), (96, 156, 70)
NIGHT = (34, 40, 74)


def on_bg(im, k, bg):
    b = Image.new("RGBA", im.size, (*bg, 255))
    b.alpha_composite(im)
    return b.resize((im.width * k, im.height * k), Image.NEAREST)


def spark_cell(ci, long_, di):
    row = ci * 2 + (0 if long_ else 1)
    return hit.crop((di * 8, row * 8, di * 8 + 8, row * 8 + 8))


def flash_cell(f):
    return hit.crop((f * 16, 80, f * 16 + 16, 96))


def spark_frame(seed, step, dir_deg=20.0, k=3):
    """step = 当たって から の ステップ。中心 (0,0) からの 点の 位置（1x の 斬撃の 点）"""
    out = []
    for (a, v0, life, cn) in build.simulate_sparks(seed, dir_deg):
        if step >= life:
            continue
        d = sum(v0 * build.SPARK["dragPerStep"] ** i for i in range(step)) / 60.0  # マス
        x, y = math.cos(a) * d * 64 / 6, -math.sin(a) * d * 64 / 6
        di = round((math.degrees(a) % 360) / 45) % 8
        out.append((x, y, build.SPARK_COLS.index(cn), step < life * build.SPARK["shortAt"], di))
    return out


def panel(tech, fi, sp_step=None, bg=SKY, k=4, seed=1, flip=False):
    """1 コマの 板（4 倍）＋ 火花（3 倍の 点 ≒ 1/16 ブロック）"""
    W, H = 64 * k + 40, 44 * k + 40
    c = Image.new("RGBA", (W, H), (*bg, 255))
    d = ImageDraw.Draw(c)
    if bg == SKY:
        d.rectangle([0, int(H * 0.78), W, H], fill=GRASS)
    if fi is not None:
        im = frames[(tech, "side")][fi][1]
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        c.alpha_composite(im.resize((64 * k, 44 * k), Image.NEAREST), (20, 20))
    if sp_step is not None:
        cx, cy = 20 + (40 if not flip else 24) * k, 20 + 22 * k  # 当たる 所（刃の 先の ほう）
        fs = build.SPARK["flashSteps"]
        acc = 0
        for f, n in enumerate(fs):
            if acc <= sp_step < acc + n:
                fl = flash_cell(f).resize((48, 48), Image.NEAREST)
                c.alpha_composite(fl, (int(cx - 24), int(cy - 24)))
            acc += n
        for (x, y, ci, long_, di) in spark_frame(seed, sp_step, 200 if flip else 20):
            cell = spark_cell(ci, long_, di).resize((24, 24), Image.NEAREST)
            px, py = int(cx + x * k - 12), int(cy + y * k - 12)
            if 0 <= px < W - 24 and 0 <= py < H - 24:
                c.alpha_composite(cell, (px, py))
    return c.convert("RGB")


# ---------------------------------------------------------------- 1 まいの 比べ画像
sh = kit.Sheet(1900, 1560)
sh.text((24, 14), "虹の 斬撃 v3（C1「ズバッ」を 土台に・3 段で 形を かえる・ヒットの 火花）— ゲーム用の 絵", 28, G)
sh.text((24, 54), "役わり: 刀が どこまで とどくかと 振った 向きを 見せ、当てたら 火花で 知らせる。白い 出る 2 ステップ → 決め（= 当たる 間）→ 先へ 流れて 紫 1 本で きえる。", 15)
y = 90
for tech in build.TECHS:
    st = build.STEPS[tech]
    td = data["techs"][tech]
    sh.text((24, y), f"{build.TECH_JA[tech]}  ステップ {st}（ぜんぶ {sum(st)}）・決め {build.ACTIVE[tech]} = 当たる 区間・出す の は techStart + {td['spawnDelay']['firstStage']}（連続 {td['spawnDelay']['comboStage']}）", 16, G)
    x = 24
    for i, (lab, im) in enumerate(frames[(tech, "side")]):
        sh.label_img((x, y + 26), on_bg(im, 3, SKY), f"{i}: {lab}（{st[i]}）", 12)
        x += 64 * 3 + 8
    xf = x + 10
    sh.label_img((xf, y + 26), on_bg(frames[(tech, "flat")][1][1], 2, SKY), "ねかせ ★", 12)
    sh.label_img((xf, y + 26 + 18 + 88 + 6), on_bg(frames[(tech, "side")][1][1], 2, NIGHT), "夜の 空 ★", 12)
    y += 26 + 18 + 132 + 40
# ヒット
sh.text((24, y), "ヒット（決めの はじめに 1 回）: 細長い 火花 6〜8 こ（虹 5 色・はじめ 速く → だんだん おそく・角度と 寿命に ばらつき）＋ まん中の 白い 光 3 コマ", 16, G)
x = 24
for s_ in (0, 2, 4, 7, 10, 14):
    sh.label_img((x, y + 26), panel("kesa", 1 if s_ < 6 else 2, s_, k=2), f"当てて {s_} ステップ", 12)
    x += 64 * 2 + 40 + 10
x += 10
for seed in (2, 3):
    sh.label_img((x, y + 26), panel("kesa", None, 4, k=2, seed=seed), f"ちがう 乱数 {seed}", 12)
    x += 64 * 2 + 40 + 10
sh.label_img((x + 10, y + 26), on_bg(hit, 2, SKY), "niji_hit_1x（2 倍）", 12)
y += 26 + 18 + 132 + 40 + 60
# 左右 反転 と ゲームの 中
sh.text((24, y), "左右: カメラから 見て 左へ 振る ときは 板を 反転（centroid の x → 64 − x）。ゲームの 中の 見本（三人称・横 / うしろ）", 16, G)
x = 24
sh.label_img((x, y + 26), panel("kiriage", 1, flip=False, k=2), "右へ 振る（きりあげ）", 12)
sh.label_img((x + 180, y + 26), panel("kiriage", 1, flip=True, k=2), "左へ 振る（反転）", 12)
x = 400
for tech in build.TECHS:
    _, a = tex9.slash_scene(frames[(tech, "side")][1][1], "side", size=(300, 188))
    sh.label_img((x, y + 26), a, f"{build.TECH_JA[tech]}（横）", 12)
    x += 310
_, b = tex9.slash_scene(frames[("kesa", "flat")][1][1], "flat", size=(300, 188))
sh.label_img((x, y + 26), b, "けさ（うしろ）", 12)
y += 26 + 18 + 188 + 24
lines = [
    "自己採点（EFFECT-KNOWLEDGE 5。ゲーム未確認の 観点は 未確認・合格に しない）: 1 当たり 3/4（はばは 弦に 合わせた・決めの 長さ = 当たる 区間。出す 時の 配線は 未確認）",
    "2 見やすさ 3/4（紺の ふち 2 点・夜でも 紫と 白が 出る。一人称・雪・砂は 未確認）  3 見分け 3/4（3 段で 形が ちがう・後半は 紫 1 本＝もう 当たらない。ゲームで 未確認）",
    "4 手ごたえ 3/4（先の 光・先へ 流れて 消える・はじめ 速い 火花。はじき と セットは 未確認）  5 あきない 3/4（火花の 乱数・角度 ±5°・寿命 ±1・大きさ ±5%。配線は 未確認）",
    "合計 30×3/4 + 25×3/4 + 20×3/4 + 15×3/4 + 10×3/4 = 75 点（見こみ。ゲームの 中で 1〜4 を 確かめる まで 不合格 あつかい）。描画: 板 1 まい（今と 同じ）＋ 火花 1（点 or 板の まとめ 1 回）。",
]
for ln in lines:
    sh.text((24, y), ln, 14)
    y += 22
sh.save(os.path.join(tex9.DOCS, "v3-slash.png"))

# ---------------------------------------------------------------- GIF: 3 段こうげき（つき → きりあげ → けさ）。2 ステップ = 1 コマ（0.03 秒）
seq = [("thrust", data["techs"]["thrust"]["spawnDelay"]["firstStage"]), ("kiriage", data["techs"]["kiriage"]["spawnDelay"]["comboStage"]),
       ("kesa", data["techs"]["kesa"]["spawnDelay"]["comboStage"])]
gif = []
for n, (tech, delay) in enumerate(seq):
    st = build.STEPS[tech]
    tot = delay + sum(st) + 12
    for s_ in range(0, tot, 2):
        e = s_ - delay
        fi = None
        if e >= 0:
            acc = 0
            for i, m in enumerate(st):
                if e < acc + m:
                    fi = i
                    break
                acc += m
        hit_at = st[0]  # 決めの はじめ
        sp = e - hit_at if e >= hit_at else None
        p = panel(tech, fi, sp if sp is not None and sp < 20 else None, k=3, seed=n + 1)
        c = Image.new("RGB", (p.width, p.height + 24), kit.BG)
        c.paste(p, (0, 24))
        ImageDraw.Draw(c).text((6, 4), f"{build.TECH_JA[tech]}  techStart + {s_}", font=kit.font(13), fill=G)
        gif.append(c)
gif[0].save(os.path.join(tex9.DOCS, "v3-slash.gif"), save_all=True, append_images=gif[1:], duration=30, loop=0)
gif[0].save(os.path.join(HERE, "combo_slow.gif"), save_all=True, append_images=gif[1:], duration=120, loop=0)
print("ok", len(gif))
