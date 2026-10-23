"""WEAPON-9 虹の 斬撃 v3（C1「ズバッ」を 土台に、review-effect.md の 絵の 直しを 入れた ゲーム用の 絵）。
役わり（EFFECT-KNOWLEDGE 1）: 「虹の 斬撃は、刀が どこまで とどくかと 振った 向きを 見せる。当てたら 火花で 知らせる」。

出す 物（この フォルダ）:
- niji_slash3_1x.png 384×264: 1 コマ 64×44（1 点 = 6/64 ブロック。今と 同じ）。よこ = コマ 0〜5、
  たて = 行 0 つき・よこ／1 つき・ねかせ／2 きりあげ・よこ／3 きりあげ・ねかせ／4 けさ・よこ／5 けさ・ねかせ。
- niji_hit_1x.png 64×96: ヒットの 火花（細長い すじ 8 方向 × 5 色 × 長い／短い）＋ まん中の 白い 光 3 コマ（16×16）。
- slash3.json: わざごとの コマ表・centroid・出す ステップ・ばらつき・火花の 数（developer が 配線に 使う）。
直し（review-effect.md の 番号）: 2 決めの ステップを わざごと／3 はばを 当たりの 弦に／4 三段の 形／6 先の 光／7 後半を 紫 1 本＋網 半分＋夜用の 点／8 出る コマの 紺の ふち 2 点／10 火花＋まん中の 光。
実行: uv run --no-project --with pillow --with numpy python art/WEAPON-9/slash-niji/build.py
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import numpy as np  # noqa: E402
import tex9  # noqa: E402
from tex9 import Sprite  # noqa: E402
from PIL import Image  # noqa: E402

PAL = {"W": "#FFFDF4", "T": "#BFEFFF", "G": "#4CC57E", "Bl": "#5AB4FF", "M": "#A882F0", "A": "#C9B8F5", "N": "#6B4FA0", "Y": "#FFE27A", "D": tex9.D}
B = tex9.B
FW, FH = 64, 44

# ---------------------------------------------------------------- 形（よこから 見た 背骨の 線。q = 0 もと → 1 先）

def spine(tech, view, n=240):
    q = np.linspace(0, 1, n)
    if tech == "thrust":
        if view == "side":
            x, y = 20 + 24 * q, np.full(n, 22.0)  # 2.2 マス ≒ 24 点。右へ つく
        else:
            x, y = 24 + 16 * q, np.full(n, 30.0)  # うしろから: むこうへ つくので 短く（16 点）
        nx, ny = np.zeros(n), -np.ones(n)
    elif tech == "kiriage":
        cx, cy, R = 50.0, 40.0, 32.0  # 左下 → 右上へ 立てた「/」の 弧（はば ≒ 29 点 ≒ 2.7〜3.1 マス）
        th = np.radians(185 - 93 * q)
        x, y = cx + R * np.cos(th), cy - R * np.sin(th)
        nx, ny = np.cos(th), -np.sin(th)  # 外がわ = 中心から はなれる 向き
        if view == "flat":
            y = 40.5 + (y - 40.5) * 0.6
            ny = ny * 0.6
    else:  # kesa「く」: はば 45 点 = 4.2 マス（けさの 弦 4.25）
        R = 23.3
        ex, ey = R * math.cos(math.radians(15)), R * math.sin(math.radians(15))
        cy = 38.0
        apex = np.array([32.0, cy - R])
        left = np.array([32.0 - ex, cy - ey])
        right = np.array([32.0 + ex, cy - ey])
        x = np.where(q < 0.5, left[0] + (apex[0] - left[0]) * q * 2, apex[0] + (right[0] - apex[0]) * (q - 0.5) * 2)
        y = np.where(q < 0.5, left[1] + (apex[1] - left[1]) * q * 2, apex[1] + (right[1] - apex[1]) * (q - 0.5) * 2)
        dl, dr = apex - left, right - apex
        nl = np.array([dl[1], -dl[0]]) / np.linalg.norm(dl)
        nr = np.array([dr[1], -dr[0]]) / np.linalg.norm(dr)
        nx = np.where(q < 0.5, nl[0], nr[0])
        ny = np.where(q < 0.5, nl[1], nr[1])
        if view == "flat":
            y = 40.5 + (y - 40.5) * 0.6
    nn = np.hypot(nx, ny)
    return q, x, y, nx / nn, ny / nn


TMAX = {"thrust": 6.5, "kiriage": 8.0, "kesa": 9.0}


def width(u):
    """刃の はばの 形: もとは とがり、まん中で いちばん 太く、先は 4 割の くさびで 止まる（先の 光 6）"""
    w = np.where(u < 0.5, np.sin(np.pi * u) ** 0.8, np.maximum(0.42, 1 - (u - 0.5) * 1.2))
    return np.where(u > 0.985, 0, w)


def draw(tech, view, tail, head, sc, core, thin, mode, tip):
    q, sx, sy, nx, ny = spine(tech, view)
    T = TMAX[tech] * sc * (1.0 if view == "side" or tech == "thrust" else 1.3)
    ys, xs = np.mgrid[0:FH, 0:FW]
    px, py = xs + 0.5, ys + 0.5
    # いちばん 近い 背骨の 点
    d2 = (px[..., None] - sx) ** 2 + (py[..., None] - sy) ** 2
    k = np.argmin(d2, axis=2)
    qq = q[k]
    off = (px - sx[k]) * nx[k] + (py - sy[k]) * ny[k]  # 外がわ（前の へり）が +
    u = (qq - tail) / max(1e-3, head - tail)
    w = T * width(np.clip(u, 0, 1))
    inside = (qq >= tail) & (qq <= head) & (np.abs(off) <= w / 2 + 0.01) & (w > 0.7)
    if tech == "thrust":
        inside &= np.abs(py - sy[k]) <= 3.0  # 高さ 6 点 以内
    s = Sprite(FW, FH)
    f = (w / 2 - off) / np.maximum(w, 1e-3)  # 0 = 外の へり（前）→ 1 = 内
    for y in range(FH):
        for x in range(FW):
            if not inside[y, x]:
                continue
            if thin > 0 and B[y % 4][x % 4] < thin:
                continue
            ff, uu = f[y, x], u[y, x]
            if mode == "white":
                c = PAL["W"]
            elif mode == "purple":
                c = PAL["M"]
            else:
                if ff < core:
                    c = PAL["W"]
                else:
                    g = (ff - core) / max(1e-3, 1 - core)
                    c = PAL["G"] if g < 0.34 else PAL["Bl"] if g < 0.67 else PAL["M"]
                if tip and uu > 0.86:  # 先の 光: 白 → 水色 → にじ の くさび（3〜4 点）
                    c = PAL["W"] if uu > 0.94 else PAL["T"] if (uu > 0.9 or ff < 0.6) else c
            s.px(x, y, c)
    return s


# C1 を 土台に: (名前, tail, head, 太さ, 芯, 網, mode, 先の 光, 残像の もと)
def seq_for(tech):
    return [
        ("出る（白）", 0.0, 1.0, 0.9, 0.75, 0.0, "white", True, None),
        ("★決め", 0.0, 1.0, 1.0, 0.26, 0.0, "rainbow", True, None),
        ("消える 1", 0.25, 1.0, 0.8, 0.26, 0.0, "rainbow", True, 1),
        ("消える 2（紫）", 0.5, 1.0, 0.42, 0.0, 0.0, "purple", False, 2),
        ("消える 3（紫）", 0.7, 1.0, 0.32, 0.0, 0.0, "purple", False, 3),
        ("きえかけ", 0.86, 1.0, 0.28, 0.0, 0.5, "purple", False, None),
    ]


# 1 コマの ステップ（決めは 当たる 区間に 合わせる: つき 2・きりあげ 3・けさ 6）
STEPS = {"thrust": [2, 2, 2, 2, 2, 2], "kiriage": [2, 3, 3, 3, 2, 2], "kesa": [2, 6, 3, 3, 3, 2]}
ACTIVE = {"thrust": 2, "kiriage": 3, "kesa": 6}
STARTUP = {"thrust": 4, "kiriage": 19, "kesa": 28}
STEP_STARTUP = {"thrust": 4, "kiriage": 12, "kesa": 20}  # 2 段目・3 段目の 出だし
TECHS = ["thrust", "kiriage", "kesa"]
TECH_JA = {"thrust": "つき（1 段目）", "kiriage": "きりあげ（2 段目）", "kesa": "けさ（3 段目）"}


def ghost(im, prev_im):
    """前の コマに あって 今 ない 所を 網で（ふじ と 夜用の こい ふじ を まぜる。点は 1/8）。半透明 なし"""
    a = np.asarray(im).copy()
    pv = np.asarray(prev_im)[..., 3] > 0
    cur = a[..., 3] > 0
    ys, xs = np.nonzero(pv & ~cur)
    ca = tuple(int(PAL["A"][k:k + 2], 16) for k in (1, 3, 5))
    cn = tuple(int(PAL["N"][k:k + 2], 16) for k in (1, 3, 5))
    for y, x in zip(ys, xs):
        if B[y % 4][x % 4] < 0.125:
            a[y, x] = (*(cn if (x // 4 + y // 4) % 2 else ca), 255)
    return Image.fromarray(a, "RGBA")


def build_slash():
    atlas = Image.new("RGBA", (FW * 6, FH * 6), (0, 0, 0, 0))
    frames, cent = {}, {}
    for ti, tech in enumerate(TECHS):
        for vi, view in enumerate(("side", "flat")):
            seq = seq_for(tech)
            sps = []
            for (lab, tail, head, sc, core, thin, mode, tip, g) in seq:
                s = draw(tech, view, tail, head, sc, core, thin, mode, tip)
                s.outline(PAL["D"], where="outside")
                if mode == "white":
                    s.outline(PAL["D"], where="outside")  # 出る コマは 紺の ふち 2 点（空に とけない。8）
                sps.append(s.composite(1))
            out = []
            for i, im in enumerate(sps):
                g = seq[i][8]
                if g is not None:
                    im = ghost(im, sps[g])
                out.append((seq[i][0], im))
                atlas.paste(im, (FW * i, FH * (ti * 2 + vi)))
            frames[(tech, view)] = out
            c = []
            for _, im in out:
                al = np.asarray(im)[..., 3] > 0
                yy, xx = np.nonzero(al)
                c.append([round(float(xx.mean()) + 0.5, 1), round(float(yy.mean()) + 0.5, 1)] if len(xx) else [32.0, 22.0])
            cent[(tech, view)] = c
    atlas.save(os.path.join(HERE, "niji_slash3_1x.png"))
    return atlas, frames, cent


# ---------------------------------------------------------------- ヒットの 火花

SPARK_COLS = ["W", "Y", "G", "Bl", "M"]


def build_hit():
    """64×96: 上 80 行 = すじ 8 方向（よこ）× [5 色 × 長い／短い]（たて 10 行 × 8 点）。下 = まん中の 光 3 コマ（16×16）を 64×16 の 中へ"""
    im = Sprite(64, 96)
    for ci, cn in enumerate(SPARK_COLS):
        for li, L in enumerate((7, 4)):
            row = ci * 2 + li
            for di in range(8):
                ang = math.radians(di * 45)
                dx, dy = math.cos(ang), -math.sin(ang)
                ox, oy = di * 8 + 3.5, row * 8 + 3.5
                # 先（進む 向き）が 白く 太い、うしろへ 細く 色
                for t in np.linspace(0, 1, 16):
                    x = ox + dx * (L / 2 - t * L)
                    y = oy + dy * (L / 2 - t * L)
                    c = PAL["W"] if t < 0.2 else PAL[cn] if cn != "W" else PAL["T"]
                    im.px(int(math.floor(x)), int(math.floor(y)), c)
    # まん中の 光: 3 コマ（ひらく 星 → 小さな 星 → 網の 輪）
    base = 80
    for f in range(3):
        ox = f * 16
        cx, cy = ox + 7.5, base + 7.5
        if f == 0:
            tex9.plus_star(im, ox + 7, base + 7, 2, PAL["W"], PAL["Y"])
            for k in (3, 4, 5, 6):
                for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
                    im.px(ox + 7 + dx, base + 7 + dy, PAL["W"] if k < 5 else PAL["Y"])
            for dx, dy in ((2, 2), (-2, 2), (2, -2), (-2, -2), (3, 3), (-3, 3), (3, -3), (-3, -3)):
                im.px(ox + 7 + dx, base + 7 + dy, PAL["Y"])
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    im.px(ox + 7 + dx, base + 7 + dy, PAL["W"])
        elif f == 1:
            tex9.plus_star(im, ox + 7, base + 7, 2, PAL["W"], PAL["T"])
            for dx, dy in ((3, 0), (-3, 0), (0, 3), (0, -3)):
                im.px(ox + 7 + dx, base + 7 + dy, PAL["T"])
        else:
            for y in range(16):
                for x in range(16):
                    d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
                    if 4.5 <= d <= 6 and B[y % 4][x % 4] < 0.5:
                        im.px(ox + x, base + y, PAL["T"])
    im.save_png(os.path.join(HERE, "niji_hit_1x.png"))
    return im.composite(1)


SPARK = {
    "count": [6, 8], "speed0": 9.0, "speedJitter": 0.2, "dragPerStep": 0.86, "life": 14, "lifeJitter": 3,
    "spreadDeg": 50, "backCount": 2, "backSpreadDeg": 30, "gravity": 0.0, "shortAt": 0.5,
    "flashSteps": [2, 2, 3], "flashBlocks": 1.0, "streakBlocks": 0.5,
}


def simulate_sparks(seed, dir_deg=0.0):
    """火花の 動きの 見本（画面の 点で）。developer の 式と 同じ: v *= drag、寿命の 半分で 短い すじ"""
    rnd = random.Random(seed)
    n = rnd.randint(*SPARK["count"])
    out = []
    for i in range(n):
        back = i < SPARK["backCount"]
        base = dir_deg + (180 if back else 0)
        spr = SPARK["backSpreadDeg"] if back else SPARK["spreadDeg"]
        a = math.radians(base + rnd.uniform(-spr, spr))
        v = SPARK["speed0"] * (1 + rnd.uniform(-SPARK["speedJitter"], SPARK["speedJitter"])) * (0.6 if back else 1.0)
        life = SPARK["life"] + rnd.randint(-SPARK["lifeJitter"], SPARK["lifeJitter"])
        out.append((a, v, life, SPARK_COLS[(i + 1) % 5] if i else "W"))
    return out


def write_json(cent):
    data = {
        "texture": "niji_slash3_1x.png", "frameSize": [FW, FH], "frames": 6,
        "rows": {"thrust": {"side": 0, "flat": 1}, "kiriage": {"side": 2, "flat": 3}, "kesa": {"side": 4, "flat": 5}},
        "plateBlocks": 6, "pxPerBlock": 64 / 6,
        "techs": {},
        "variation": {"angleDeg": 5, "lifeSteps": 1, "scale": 0.05, "note": "シード付き乱数。lifeSteps は 消える コマ（2〜4）の どれか 1 つに ±1"},
        "mirror": "カメラから 見て 左へ 振る ときは 板を 左右 反転（uv の x を 反転）し、centroid の x を 64 − x に",
        "reducedMotion": "残像（ふじの 網）と 火花の 後ろ 2 つを 出さない・まん中の 光は 1 コマ目だけ",
        "spark": dict(SPARK, texture="niji_hit_1x.png",
                      streakCells={"cell": 8, "dirs": "よこ 0〜7 = 0°,45°,…,315°（画面の 上 = 90°）", "rows": "たて 行 = 色 × 2 + (0 長い / 1 短い)", "colors": SPARK_COLS},
                      flashCells={"y": 80, "size": 16, "frames": 3},
                      note="当たった 妖怪の 胸に。決めの コマの はじめ（当たりの 1 ステップ目）に 1 回。速さは マス/秒、drag は 1 ステップごとに かける"),
    }
    for tech in TECHS:
        st = STEPS[tech]
        data["techs"][tech] = {
            "steps": st, "total": sum(st), "keyFrame": 1,
            "activeSteps": ACTIVE[tech],
            "spawnDelay": {"firstStage": STARTUP[tech] - 2, "comboStage": STEP_STARTUP[tech] - 2,
                           "note": "techStart から この ステップ数 まって 出す → 白い 出る 2 ステップの つぎに 決め = 当たりの 1 ステップ目"},
            "centroid": {"side": cent[(tech, "side")], "flat": cent[(tech, "flat")]},
        }
    json.dump(data, open(os.path.join(HERE, "slash3.json"), "w"), ensure_ascii=False, indent=1)
    return data


def main():
    atlas, frames, cent = build_slash()
    hit = build_hit()
    data = write_json(cent)
    print("colors slash", tex9.kit9.count_colors([atlas]), "hit", tex9.kit9.count_colors([hit]), "semi", tex9.kit9.semi_alpha([atlas, hit]))
    return atlas, frames, cent, hit, data


if __name__ == "__main__":
    main()
