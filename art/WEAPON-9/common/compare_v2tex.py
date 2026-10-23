"""オーナーに 見せる 1 まい docs/art/WEAPON-9/v2tex-options.png（先に tex-a・tex-b・tex-c の build.py）。
実行: uv run --no-project --with pillow --with numpy python art/WEAPON-9/common/compare_v2tex.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tex9  # noqa: E402
import sheet9  # noqa: E402
from kit9 import kit  # noqa: E402
from PIL import Image  # noqa: E402

W9 = os.path.dirname(HERE)
OPTS = [
    ("tex-a", "A「ほしの まく」", ["しろい ドームに ちいさな ほしが ぽつぽつ。", "ふちは クリームと 金。斬撃は 三日月と ほし。", "いちばん しずかで やさしい。"]),
    ("tex-b", "B「しゃぼんだま」", ["ふちが しゃぼん玉の パステルの にじ色。", "うずと あわ。斬撃は ふとい まるい にじ。", "いちばん 虹らしい（少し こどもっぽい）。"]),
    ("tex-c", "C「ひかりの こうし」", ["ひしがたの ひかりの あみ と ほうせき。", "かたい 金の ふち。斬撃は かどの ある「く」。", "いちばん かっこいい（細かさ 高め）。"]),
]
CW = 560
sh = kit.Sheet(24 + CW * 4 + 24, 1300)
G = sheet9.GOLD
sh.text((24, 14), "虹の シャイニング v2: ドームの もよう・ふち と にじの 斬撃を ドット絵の テクスチャに（PixelLab の 下絵から）— 3 案", 28, G)
sh.text((24, 54), "白い ドームは そのまま。色の 足し方・もようで 差を つけた。描画回数 4・三角形 202 は 今と 同じ（絵を 読む だけ）。おすすめ: A（りゆうは 下）", 16)


def col(x, title, key, fp, sl_side, sl_flat, scn, lines):
    y = 96
    sh.text((x, y), title, 22, G)
    y += 34
    sh.label_img((x, y), key.resize((CW - 20, round((CW - 20) * 400 / 640)), Image.NEAREST), "そとから（カメラ 12）", 13)
    y += 22 + round((CW - 20) * 400 / 640) + 10
    sh.label_img((x, y), fp.resize((260, 163), Image.NEAREST), "なかから（一人称）", 13)
    sh.label_img((x + 280, y), scn.resize((260, 163), Image.NEAREST), "斬撃（ゲームの 中・横）", 13)
    y += 22 + 163 + 10
    sh.label_img((x, y), sheet9.slash_on_sky(sl_side, 4), "斬撃 ★決め（よこ）", 13)
    if sl_flat is not None:
        sh.label_img((x + 270, y), sheet9.slash_on_sky(sl_flat, 4), "（ねかせ）", 13)
    y += 22 + 176 + 14
    for ln in lines:
        sh.text((x, y), ln, 16)
        y += 24


# 今
cur_key = tex9.cur_dome_crop((640, 400))
cur_s = tex9.cur_slash("side", 1)
cur_f = tex9.cur_slash("flat", 1)
_, cur_scn = tex9.slash_scene(cur_s, "side")
cur_fp = Image.open(os.path.join(tex9.DOCS, "verify", "dome-round.png")).convert("RGB").crop((0, 0, 1280, 800))
ph = Image.new("RGB", (260, 163), (60, 64, 80))
from PIL import ImageDraw  # noqa: E402
ImageDraw.Draw(ph).text((12, 70), "(none)", fill=(170, 176, 196))
col(24, "今（ゲームの スクショ）", cur_key, ph, cur_s, cur_f, cur_scn,
    ["しろい ドーム（シェーダーの もよう）。", "にじの おびが まわる。斬撃は にじの 弧。", "A〜C は 見本の 場面（ゲームでは まだ ない）。"])
for i, (d, title, lines) in enumerate(OPTS):
    p = os.path.join(W9, d)
    key = Image.open(os.path.join(p, "key_outside.png")).convert("RGB")
    fp = Image.open(os.path.join(p, "key_first.png")).convert("RGB")
    atlas = Image.open(os.path.join(p, "slash_1x.png")).convert("RGBA")
    s1 = atlas.crop((64, 0, 128, 44))
    f1 = atlas.crop((64, 44, 128, 88))
    _, scn = tex9.slash_scene(s1, "side")
    col(24 + CW * (i + 1), title, key, fp, s1, f1, scn, lines)

y = 1140
for ln in [
    "おすすめ A: 白い ドームの 決定に いちばん そう（白 8.5 割）。ほしは 6 歳でも「きらきら」と 分かり、休む 所が あるので 子と ふちに 目が 行く。くり返す 斬撃も しずか（fun.md 1）。",
    "B は 虹らしさ いちばん だが パステルが 昼の 空に とけやすく（紺の ふちで おぎなう）、少し こどもっぽい。C は かっこいいが あみが まく ぜんたいで 細かく、中から だと かごに 見える おそれ。",
    "PixelLab: vfx lite 6 回（ドーム 3・斬撃 3）。残り 32 → 25.2 generations（請求 6.8: 1 回が 長く かかり 少し 多め）。下絵は そのまま 入れず、build.py で 1 点ずつ 描いた。",
]:
    sh.text((24, y), ln, 15)
    y += 26
sh.save(os.path.join(tex9.DOCS, "v2tex-options.png"))
