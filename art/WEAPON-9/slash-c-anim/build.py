"""WEAPON-9 v2 斬撃 C「く」の字の アニメ 2 案（オーナー決定 2026-10-23: スマブラの 斬撃の ように いきおいよく パッと 出て すっと 消える）。
- C1「ズバッ」: 出だし 1 コマで「く」ぜんぶが 白い 芯で 出る → 決めで にじ色 → うしろ（もと）から 先へ 細く なって 消える。ぬけた 所に 網の 残像。
- C2「ひらめき」: 1 ステップの 細い 白い 線 → ひとまわり 大きく ふくらむ → 決め（かどに 星）→ 先から もとへ 細く 消える ＋ 残像。
1 コマ 64×44（今と 同じ。1 点 = 6/64 ブロック）。6 コマ × よこ／ねかせ = 384×88。区間の ステップは 下の 表。
実行: uv run --no-project --with pillow --with numpy python art/WEAPON-9/slash-c-anim/build.py
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import numpy as np  # noqa: E402
import tex9  # noqa: E402
import sheet9  # noqa: E402
from kit9 import kit  # noqa: E402
from PIL import Image  # noqa: E402

PAL = {"W": "#FFFDF4", "G": "#4CC57E", "Bl": "#5AB4FF", "M": "#A882F0", "A": "#C9B8F5"}
B = tex9.B

# (名前, tail, head, 太さ, 白い 芯の わりあい, 網, ステップ, 残像に する 前の コマ, かどの 星)
C1 = [
    ("出る（白）", 0.0, 1.0, 0.8, 0.75, 0.0, 2, None, 0),
    ("★決め", 0.0, 1.0, 1.0, 0.24, 0.0, 5, None, 0),
    ("消える 1", 0.22, 1.0, 0.85, 0.24, 0.0, 3, 1, 0),
    ("消える 2", 0.45, 1.0, 0.65, 0.2, 0.0, 3, 2, 0),
    ("消える 3", 0.66, 1.0, 0.45, 0.2, 0.0, 3, 3, 0),
    ("きえかけ", 0.84, 1.0, 0.3, 0.3, 0.5, 2, None, 0),
]
C2 = [
    ("ひらめき（線）", 0.0, 1.0, 0.25, 1.0, 0.0, 1, None, 0),
    ("ふくらむ", 0.0, 1.0, 1.2, 0.5, 0.0, 2, None, 0),
    ("★決め（かどに 星）", 0.0, 1.0, 1.0, 0.24, 0.0, 5, None, 2),
    ("消える 1", 0.0, 0.75, 0.8, 0.24, 0.0, 3, 2, 1),
    ("消える 2", 0.0, 0.5, 0.55, 0.2, 0.0, 3, 3, 0),
    ("きえかけ", 0.0, 0.3, 0.35, 0.3, 0.5, 3, None, 0),
]
VARIANTS = [("c1", "C1「ズバッ」", C1), ("c2", "C2「ひらめき」", C2)]


def frame(view, tail, head, sc, core, thin):
    def cf(f, q, u, x, y):
        if f < core:
            return PAL["W"]
        g = (f - core) / max(1e-3, 1 - core)
        return PAL["G"] if g < 0.34 else PAL["Bl"] if g < 0.67 else PAL["M"]
    s = tex9.slash_px(view, tail, head, sc, thin, {"kind": "chevron", "T": 10}, cf, cap="moon")
    return s


def apex_star(s, view, r):
    cy = 38 if view == "side" else 40.5
    ky = 1.0 if view == "side" else 0.6
    x, y = 32, round(cy - 30 * ky) - 1
    tex9.plus_star(s, x, y, r, PAL["W"], PAL["Bl"])


def build(seq):
    sprites = {"side": [], "flat": []}
    for view in ("side", "flat"):
        for (lab, tail, head, sc, core, thin, steps, ghost, star) in seq:
            s = frame(view, tail, head, sc, core, thin)
            s.outline(tex9.D, where="outside")
            sprites[view].append(s)
        # 残像: 前の コマに あって 今の コマに ない 所を うすい ふじの 網で（半透明の 点は 使わない）
        out = []
        for i, (lab, tail, head, sc, core, thin, steps, ghost, star) in enumerate(seq):
            im = sprites[view][i].composite(1).copy()
            if ghost is not None:
                prev = np.asarray(sprites[view][ghost].composite(1))[..., 3] > 0
                a = np.asarray(im).copy()
                cur = a[..., 3] > 0
                ys, xs = np.nonzero(prev & ~cur)
                c = tuple(int(PAL["A"][k:k + 2], 16) for k in (1, 3, 5))
                for y, x in zip(ys, xs):
                    if B[y % 4][x % 4] < 0.25:
                        a[y, x] = (*c, 255)
                im = Image.fromarray(a, "RGBA")
            if star:
                sp = tex9.Sprite(64, 44)
                apex_star(sp, view, star)
                st = sp.composite(1)
                im.alpha_composite(st)
            out.append((lab, im))
        sprites[view] = out
    return sprites


def main():
    res = {}
    for key, title, seq in VARIANTS:
        fr = build(seq)
        n = len(seq)
        atlas = Image.new("RGBA", (64 * n, 88), (0, 0, 0, 0))
        cent = {"side": [], "flat": []}
        for vi, view in enumerate(("side", "flat")):
            for i, (_, im) in enumerate(fr[view]):
                atlas.paste(im, (64 * i, 44 * vi))
                a = np.asarray(im)[..., 3] > 0
                ys, xs = np.nonzero(a)
                cent[view].append([round(float(xs.mean()) + 0.5, 1), round(float(ys.mean()) + 0.5, 1)])
        atlas.save(os.path.join(HERE, f"{key}_slash_1x.png"))
        steps = [s[6] for s in seq]
        json.dump({"steps": steps, "centroid": cent}, open(os.path.join(HERE, f"{key}_slash.json"), "w"))
        # GIF: 左 = ゲームの 中（横）、右 = ねかせ（うしろから）、下 = 昼の 空の 前 4 倍。1 ステップ = 1/60 秒 → 20ms に まるめ
        frames, durs = [], []
        blank_s = Image.new("RGBA", (64, 44), (0, 0, 0, 0))
        seqf = [(fr["side"][i][1], fr["flat"][i][1], steps[i]) for i in range(n)] + [(blank_s, blank_s, 30)]
        for side, flat, st in seqf:
            _, a = tex9.slash_scene(side, "side", size=(320, 200))
            _, b = tex9.slash_scene(flat, "flat", size=(320, 200))
            c = Image.new("RGB", (660, 430), kit.BG)
            c.paste(a, (0, 0))
            c.paste(b, (340, 0))
            sky = sheet9.slash_on_sky(side, 5)
            c.paste(sky, (0, 210))
            sky2 = sheet9.slash_on_sky(flat, 5)
            c.paste(sky2, (340, 210))
            frames.append(c)
            durs.append(max(20, round(st * 1000 / 60 / 10) * 10))
        frames[0].save(os.path.join(HERE, f"{key}.gif"), save_all=True, append_images=frames[1:], duration=durs, loop=0)
        # ゆっくり 版（4 倍 おそく。コマを 見る 用）
        frames[0].save(os.path.join(HERE, f"{key}_slow.gif"), save_all=True, append_images=frames[1:], duration=[d * 4 for d in durs], loop=0)
        res[key] = dict(title=title, seq=seq, fr=fr, steps=steps, cent=cent)
    # 今の 斬撃（4 コマ × 4 ステップ）
    sheet(res)
    return res


def sheet(res):
    sh = kit.Sheet(1800, 1240)
    G = sheet9.GOLD
    sh.text((24, 14), "斬撃 C「く」の字の アニメ 2 案（スマブラ風: パッと 出て すっと 消える）", 28, G)
    sh.text((24, 54), "1 ステップ = 1/60 秒。白い 芯 → にじ色（みどり・青・むらさき）・こい 紺の ふち・残像は うすい ふじの 網（半透明 なし）。今の 斬撃は 4 コマ × 4 = 16 ステップ。", 15)
    y = 92
    for key in ("c1", "c2"):
        r = res[key]
        tot = sum(r["steps"])
        sh.text((24, y), f"{r['title']}  ぜんぶで {tot} ステップ（{tot / 60:.2f} 秒）", 20, G)
        x = 24
        for i, (lab, im) in enumerate(r["fr"]["side"]):
            bg = Image.new("RGBA", im.size, (*kit.BG, 255))
            bg.alpha_composite(im)
            sh.label_img((x, y + 30), bg.resize((192, 132), Image.NEAREST), f"{i}: {lab}（{r['steps'][i]}）", 12)
            x += 200
        yf = y + 30 + 18 + 132 + 6
        x = 24
        for i, (lab, im) in enumerate(r["fr"]["flat"]):
            bg = Image.new("RGBA", im.size, (*kit.BG, 255))
            bg.alpha_composite(im)
            sh.label_img((x, yf), bg.resize((128, 88), Image.NEAREST), "ねかせ" if i == 0 else None, 12)
            x += 200
        rows = [["コマ", "区間", "ステップ"]] + [[str(i), q[0], str(q[6])] for i, q in enumerate(r["seq"])] + [["", "ぜんぶ", str(tot)]]
        sh.table((1250, y + 30), rows, [50, 200, 80], 13, 20)
        y = yf + 18 + 88 + 30
    sh.text((24, y), "刀の 弧に 合わせる: 今の SLASH_CENTROID と 同じ やり方で 入る（コマごとの 見た目の まん中を 刀の さきへ）。数は c1_slash.json・c2_slash.json の centroid。", 14)
    sh.text((24, y + 24), "決めの まん中は x 32・y 20〜21（今の 弧の 決め 35.5・20.6 と ほぼ 同じ → 刀の さきに そのまま 合う）。C1 は 消える 間に まん中が 先（右 = 振った 先）へ 動いて 刀に ついて いく。C2 は もと（左）へ もどる。", 14)
    sh.text((24, y + 48), "板の 数・三角形は 今と 同じ（1 まい・2）。絵だけ 256×88 → 384×88（6 コマ）。texture の repeat を 1/6 に、コマの 切りかえを ステップの 表で（developer）。", 14)
    sh.save(os.path.join(HERE, "sheet.png"))


if __name__ == "__main__":
    main()
