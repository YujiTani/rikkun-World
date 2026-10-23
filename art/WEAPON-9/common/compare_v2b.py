"""オーナーに 見せる 1 まい（決定 2026-10-23 の 試し）: docs/art/WEAPON-9/v2-dome-b-spiral-slash-c.png と .gif。
先に tex-b-spiral・slash-c-anim の build.py。実行: uv run --no-project --with pillow --with numpy python art/WEAPON-9/common/compare_v2b.py
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tex9  # noqa: E402
import sheet9  # noqa: E402
from kit9 import kit  # noqa: E402
from PIL import Image  # noqa: E402

W9 = os.path.dirname(HERE)


def load(name):
    sp = importlib.util.spec_from_file_location(name.replace("-", "_"), os.path.join(W9, name, "build.py"))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


bs = load("tex-b-spiral")
sc = load("slash-c-anim")
SP = bs.build()
res = {}
for key, title, seq in sc.VARIANTS:
    res[key] = dict(title=title, fr=sc.build(seq), steps=[q[6] for q in seq], seq=seq)
G = sheet9.GOLD

# ---- 1 まいの 比べ画像
sh = kit.Sheet(1880, 1000)
sh.text((24, 14), "虹 v2 の 試し: ドーム B「しゃぼんだま」＋ にじの らせん ／ 斬撃 C「く」の字の スマブラ風 アニメ 2 案", 28, G)
sh.text((24, 54), "決定 docs/decisions/2026-10-23-niji-dome-b-spiral.md。うごきは GIF（v2-dome-b-spiral-slash-c.gif・slash-c-anim/c1.gif・c2.gif・*_slow.gif = 4 倍 おそい）。", 15)
key = Image.open(os.path.join(W9, "tex-b-spiral", "key_outside.png")).convert("RGB")
sh.label_img((24, 90), key, "ドーム B ＋ らせん（外から・カメラ 12）", 14)
for i, ln in enumerate(["らせん = 5 秒で 1 まわり（今と 同じ 速さ）。", "B の うず = 88 秒で 1 まわり（ほぼ 止まって 見える）＋ あわが のぼる", "→ 2 つの うごきが まざらない。らせんの 色は B に 合う こい めの にじ", "（ミント・水色・ふじ）＋ 白い 芯 ＋ 紺の へり（網）で 空に とけない。"]):
    sh.text((24, 516 + i * 20), ln, 14)
x = 24
for k in range(4):
    stp = 50 + k * 30
    _, im = sheet9.scene(SP, stp, size=(150, 94))
    sh.label_img((x, 570), im, f"{(stp - 50) / 60:.1f} 秒", 12)
    x += 160
fp = Image.open(os.path.join(W9, "tex-b-spiral", "key_first.png")).convert("RGB").resize((240, 150), Image.NEAREST)
sh.label_img((24, 738), fp, "中から（一人称）", 12)
lines = {"c1": ["C1「ズバッ」18 ステップ（0.30 秒）: 白い「く」が 1 コマで ぜんぶ 出る →", "決めで にじ色 → もとから 先へ 細く 消えて 刀に ついて いく。残像 あり。"],
         "c2": ["C2「ひらめき」17 ステップ（0.28 秒）: 細い 白い 線が ひらめく → ひとまわり", "ふくらんで 決め（かどに 星）→ 先から もとへ 細く 消える。残像 あり。"]}
y = 90
for key_ in ("c1", "c2"):
    r = res[key_]
    sh.text((700, y), r["title"], 20, G)
    x = 700
    for i, (lab, im) in enumerate(r["fr"]["side"]):
        bg = Image.new("RGBA", im.size, (160, 210, 246, 255))
        bg.alpha_composite(im)
        sh.label_img((x, y + 30), bg.resize((128, 88), Image.NEAREST), f"{lab}（{r['steps'][i]}）", 11)
        x += 136
    _, scn = tex9.slash_scene(r["fr"]["side"][r["seq"].index(next(q for q in r["seq"] if q[0].startswith("★")))][1], "side", size=(300, 188))
    _, scf = tex9.slash_scene(r["fr"]["flat"][r["seq"].index(next(q for q in r["seq"] if q[0].startswith("★")))][1], "flat", size=(300, 188))
    sh.label_img((700, y + 150), scn, "★決め ゲームの 中（横）", 12)
    sh.label_img((1010, y + 150), scf, "（うしろから）", 12)
    yy = y + 160
    for ln in lines[key_]:
        for j in range(0, len(ln), 20):
            sh.text((1330, yy), ln[j:j + 20], 13)
            yy += 19
    y += 380
_, cur = tex9.slash_scene(tex9.cur_slash("side", 1), "side", size=(300, 188))
sh.label_img((290, 738), cur.resize((240, 150), Image.NEAREST), "今の 斬撃（くらべ）", 12)
sh.text((24, 916), "どちらも 板 1 まい・三角形 2（今と 同じ）。絵は 6 コマ 384×88。刀の 弧への 合わせは 今の SLASH_CENTROID と 同じ やり方で 入る（決めの まん中 x 32・y 20〜21 は 今の 弧と ほぼ 同じ）。", 14)
sh.text((24, 940), "点滅: 白は 出だしの 1〜2 ステップ だけ・画面 全体は 光らない（fun.md 6）。「うごきを へらす」では 残像と 星を 出さない 案。", 14)
sh.text((24, 964), "おすすめ: C1「ズバッ」— 出だしで 形が ぜんぶ 見え（MOTION 3・8）、消える 間も 刀の さきに ついて いくので 振った 向きが 分かる（MOTION 9）。C2 は 線 → ふくらむ が 気持ちいいが、消える 向きが 刀と 逆。", 14)
out_png = os.path.join(tex9.DOCS, "v2-dome-b-spiral-slash-c.png")
sh.save(out_png)

# ---- GIF: 左 = ドーム（とどまる 間）、右上 = C1、右下 = C2（どちらも くりかえし）。1 コマ = 2 ステップ（GIF の 0.03 秒）
def slash_at(r, step):
    t = 0
    for i, n in enumerate(r["steps"]):
        if step < t + n:
            return r["fr"]["side"][i][1]
        t += n
    return None


frames = []
loop = 36  # 0.6 秒ごとに 1 回 ふる
for k in range(0, 160, 2):
    stp = 41 + k
    _, dome = sheet9.scene(SP, stp, size=(480, 300))
    c = Image.new("RGB", (480 + 340, 330), kit.BG)
    c.paste(dome, (0, 30))
    sh_d = kit.Sheet(1, 1)
    for j, key_ in enumerate(("c1", "c2")):
        im = slash_at(res[key_], k % loop)
        blank = Image.new("RGBA", (64, 44), (0, 0, 0, 0))
        _, scn = tex9.slash_scene(im if im is not None else blank, "side", size=(320, 150))
        c.paste(scn, (490, 30 + j * 150))
    from PIL import ImageDraw
    d = ImageDraw.Draw(c)
    f = kit.font(14)
    d.text((6, 6), "ドーム B ＋ らせん", font=f, fill=G)
    d.text((496, 6), "上 C1「ズバッ」・下 C2「ひらめき」", font=f, fill=G)
    frames.append(c)
out_gif = os.path.join(tex9.DOCS, "v2-dome-b-spiral-slash-c.gif")
frames[0].save(out_gif, save_all=True, append_images=frames[1:], duration=30, loop=0)
print(out_gif)
