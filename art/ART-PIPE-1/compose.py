"""ART-PIPE-1: 3 案を ならべた docs/art/ART-PIPE-1/thunder-3.png を 作る（先に 各案の build.py を 回す）。
実行: python3 art/ART-PIPE-1/compose.py
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "common"))
import kit  # noqa: E402
from PIL import Image  # noqa: E402

for k in "abc":
    subprocess.run([sys.executable, os.path.join(HERE, f"thunder-{k}", "build.py")], check=True, stdout=subprocess.DEVNULL)

cols = [
    ("今 v4（十字の 板）", kit.current_scene(), "細い 1 色の 線。十字の 板なので 斜めから 二重に 見える"),
    ("A いなずまの しん（おすすめ）", Image.open(os.path.join(HERE, "thunder-a", "key_scene.png")), "太い ぎざぎざ ＋ 枝 ＋ ひびの 星。さんかく"),
    ("B ひかりの たま", Image.open(os.path.join(HERE, "thunder-b", "key_scene.png")), "細い すじ 3 本 ＋ ふくらむ 玉。まる"),
    ("C らいもん", Image.open(os.path.join(HERE, "thunder-c", "key_scene.png")), "直角の 雷 ＋ 雷紋の はんこ。しかく・和風"),
]
W = 24 + len(cols) * (400 + 24)
sh = kit.Sheet(W, 1080)
sh.text((24, 14), "雷神剣の 雷: 方向の 3 案（決めの コマ・同じ 場面・2 倍。1 点 = 1/8 ブロック）", 28, (255, 226, 150))
sh.text((24, 54), "どの 案も: たて軸で カメラへ 向く 板・決めの コマ 6 ステップ 止め・3 まい 重ね・寝かせた 地面の 輪・着地で まわりを 少し 明るく・Nearest の ドット。色は 白〜黄だけ（雷 v4 の きまり）", 15)
x = 24
for title, im, line in cols:
    sh.text((x, 92), title, 20)
    sh.im.paste(kit.up(im, 2).convert("RGB"), (x, 124))
    sh.text((x, 734), line, 14, kit.SUB)
    x += 424
# 下: 動き（各案 4 コマ）と 下絵
sh.text((24, 770), "動きの くわしい 表・確かめの 絵・ものさし表は 各案の sheet.png、動きは scene.gif", 15, kit.SUB)
pl = Image.open(os.path.join(HERE, "pixellab", "raijin-thunder-sketch.png")).convert("RGBA")
bg = Image.new("RGBA", pl.size, (*kit.BG, 255))
bg.alpha_composite(pl)
strip = Image.new("RGBA", (96 * 10, 128), (*kit.BG, 255))
for i in range(10):
    r, c = divmod(i, 4)
    strip.paste(bg.crop((c * 96, r * 128, c * 96 + 96, r * 128 + 128)), (i * 96, 0))
sh.text((24, 800), "下絵: PixelLab の VFX（lite・1 回）。10 コマ・14 fps。「予兆の 点 → 2 コマで のびる → 着地を 止める → ほそって きえる」の 時間の 割りふりだけ もらった（絵は 使わない）", 14)
sh.im.paste(strip.resize((96 * 10 // 1, 128), Image.NEAREST).convert("RGB"), (24, 830))
sh.save(os.path.join(kit.DOCS, "thunder-3.png"))
