"""オーナーに 見せる 1 まい docs/art/WEAPON-9/final.png（先に build.py）。実行: python3 art/WEAPON-9/final/compose.py"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "common"))
import kit9, sheet9  # noqa: E402
from kit9 import kit  # noqa: E402
from PIL import Image  # noqa: E402

sh = kit.Sheet(1320, 900)
sh.text((24, 14), "虹（にじ）最終: ドーム B「にじの おび」（中は 白い 玉・うすい 光）・にじの 斬撃 A・そった 長い 太刀", 28, sheet9.GOLD)
key = Image.open(os.path.join(HERE, "key_outside.png"))
sh.label_img((24, 60), key, "シャイニング 外から（カメラ 12）。球の りんかく・まくの くもりガラスの 白・まん中の 白い 玉・地面の 輪", 14)
sl = Image.open(os.path.join(HERE, "slash_1x.png")).convert("RGBA").crop((64, 0, 128, 44))
sh.label_img((690, 60), sheet9.slash_on_sky(sl, 5), "にじの 斬撃 A（昼の 空の 前）", 14)
ic = Image.open(os.path.join(HERE, "niji_icon_16.png")).convert("RGBA")
cur = kit9.current_icons()
y = 500
sh.label_img((24, y), kit9.slot(ic, scale=8), "虹（新しい 太刀）", 14)
sh.label_img((200, y), kit9.slot(cur[0], scale=8), "雷神剣", 14)
sh.label_img((376, y), kit9.slot(cur[1], scale=8), "風神剣", 14)
one = Image.new("RGB", (40, 40), (154, 46, 74)); one.paste(ic, (12, 12), ic)
sh.label_img((560, y), one, "1 倍", 14)
iso = kit9.iso_extrude(ic, cell=10, depth=2)
bg = Image.new("RGBA", iso.size, (*kit.BG, 255)); bg.alpha_composite(iso)
sh.label_img((660, y), bg, "手に 持つ（押し出し）", 14)
sh.text((24, 780), "刃は 銀・刃文は にじ色（緑・青・赤むらさき）。柄は 金茶の 糸巻き ＋ 赤い ひし形、金の 柄頭・はばき・木瓜四方透かし鍔。", 15)
sh.text((24, 806), "ドーム: 描画 4・三角形 116（球 16×6 を 地面で 切る 112 ＋ 輪 2 ＋ 玉 2）・9 色・点滅なし・一人称は まく と 玉を 出さない。", 15)
sh.save(os.path.join(kit9.DOCS, "final.png"))
