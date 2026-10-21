"""WEAPON-9: オーナーに 見せる 3 案の 1 まい docs/art/WEAPON-9/options.png（先に 各案の build.py を 回す）。
実行: python3 art/WEAPON-9/compose.py
見本の 絵（他人の 物）は 入れない。
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "common"))
import kit9  # noqa: E402
import sheet9  # noqa: E402
from kit9 import kit  # noqa: E402
from PIL import Image  # noqa: E402

for k in "abc":
    subprocess.run([sys.executable, os.path.join(HERE, f"dome-{k}", "build.py")], check=True, stdout=subprocess.DEVNULL)

COLS = [
    ("a", "A ひかりの まく", ["3D の 球の まくが 主役。白金に 光る ふち ＋ まくを 回る にじの しま 3 本。", "見本 1 の 白金の ドームに いちばん 近い。昼の 空では ふちが 少し 弱い。"],
     "描画 4・三角形 148・9 色"),
    ("b", "B にじの おび（おすすめ）", ["カメラに 正面の にじの 帯 4 本が うずを まいて 回る。まくは 細い ふち だけ。", "帯は ふつうの 重ねで 昼でも 色が 出る。雷 B（光の 玉）と ちがう 形。"],
     "描画 4・三角形 102・10 色"),
    ("c", "C ほしの たま", ["まん中の 大きな 光の 玉 ＋ 4 本の すじ。ななめの 軌道 2 本を にじの かけらが 回る。", "いちばん すける・おとなしい。まくが 細く「球」より「玉」に 見えやすい。"],
     "描画 3・三角形 126・8 色"),
]
CW = 600
W, H = 24 + 3 * (CW + 24), 1130
sh = kit.Sheet(W, H)
sh.text((24, 14), "虹（にじ）の シャイニング・にじの 斬撃・アイコン: 方向の 3 案", 30, sheet9.GOLD)
sh.text((24, 56), "どの 案も: カメラ 12 で 外から（とどまる F120）／一人称は まく と 玉を 出さない／板は カメラに 正面／明るさは うかぶ で 上がり おりる で 下がる 1 回だけ（点滅なし）／地面の 輪 = 当たりの 半径 6.4", 15)
sh.text((24, 80), "まん中が 白く 光る 玉・ふちの 光る リング（まく）・うずを まく にじの 帯・光の かけら（決定の 4 つ）は 3 案 ぜんぶに 入って いる。くわしくは art/WEAPON-9/dome-*/sheet.png、動きは scene.gif", 15, kit.SUB)
x = 24
for k, name, lines, nums in COLS:
    d = os.path.join(HERE, f"dome-{k}")
    y = 116
    sh.text((x, y), name, 24, sheet9.GOLD if "おすすめ" in name else kit.INK)
    y += 36
    out = Image.open(os.path.join(d, "key_outside.png")).resize((CW, 375), Image.NEAREST)
    y = sh.label_img((x, y), out, "三人称・外から（カメラ 12）", 13) + 10
    fp = Image.open(os.path.join(d, "key_first.png")).resize((290, 181), Image.NEAREST)
    sh.label_img((x, y), fp, "一人称・中から", 13)
    sl = Image.open(os.path.join(d, "slash_1x.png")).convert("RGBA").crop((64, 0, 128, 44))
    sky = sheet9.slash_on_sky(sl, 4)
    sh.label_img((x + 310, y), sky.crop((0, 0, 256, 176)).resize((290, 181), Image.NEAREST) if False else sky.resize((264, 181), Image.NEAREST), "にじの 斬撃（決め）", 13)
    y += 181 + 30
    ic = Image.open(os.path.join(d, "niji_icon_16.png")).convert("RGBA")
    sh.label_img((x, y), kit9.slot(ic, scale=5), "アイコン", 13)
    cur = kit9.current_icons()
    sh.label_img((x + 100, y), kit9.slot(cur[0], scale=3), "今の 雷神剣", 12)
    sh.label_img((x + 170, y), kit9.slot(cur[1], scale=3), "風神剣", 12)
    iso = kit9.iso_extrude(ic, cell=6, depth=2)
    bg = Image.new("RGBA", iso.size, (*kit.BG, 255))
    bg.alpha_composite(iso)
    sh.label_img((x + 260, y), bg, "手に 持つ（押し出し）", 13)
    y += 175
    for ln in lines:
        sh.text((x, y), ln, 14)
        y += 22
    sh.text((x, y + 4), nums + "（上限 描画 4・三角形 150）", 14, sheet9.GOLD)
    x += CW + 24
y = 1030
sh.text((24, y), "見本から 言葉に した こと: ① 光わざは 形で 読める（球の りんかく・帯の うず = CRITERIA 1・9） ② 白い 芯と 色の 外がわの 明るさの 差で 光る（2・7） ③ まわりは 暗く 余白（4）。", 14)
sh.text((24, y + 24), "気を つけた こと: 昼の 空（#8FD3FF）の 前では 足し算の 白が 空に とける → にじの 部品は ふつうの 重ね（色の 点）、足し算は 玉と にじみだけ。", 14)
sh.text((24, y + 48), "PixelLab: VFX lite 1 回（1 generation。時間の 割りふり「玉 → 3 コマで 広がる → 8 コマ 止め → 網で ぬけて 消える」だけ もらった。絵は 使わない）。art/WEAPON-9/pixellab/", 14, kit.SUB)
sh.save(os.path.join(kit9.DOCS, "options.png"))
