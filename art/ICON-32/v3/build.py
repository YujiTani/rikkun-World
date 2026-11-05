"""ICON-32 v3: 12 点を 作って 見本シート 2 枚と 拡大の 確認画像を 出す。
使い方: python3 art/ICON-32/v3/build.py [出力 dir]"""
import json, os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import items
HERE = os.path.dirname(os.path.abspath(__file__))
old = json.load(open(os.path.join(HERE, '..', 'ref', 'old16.json')))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out')
os.makedirs(os.path.join(HERE, 'png'), exist_ok=True); os.makedirs(out, exist_ok=True)
icons = {}
for iid in items.ALL:
    f = getattr(items, iid); icons[iid] = (f(old) if iid == 'grass' else f()).render()
    icons[iid].save(os.path.join(HERE, 'png', f'{iid}.png'))
def up(p):
    im = Image.new('RGBA', (16, 16)); [im.putpixel((k % 16, k // 16), tuple(c)) for k, c in enumerate(p)]; return im
Z, cell, bg = 6, 32 * 6 + 12, (54, 48, 58, 255)
sh = Image.new('RGBA', (cell * 6, cell * 4 + 20), bg); d = ImageDraw.Draw(sh)
for k, iid in enumerate(items.ALL):
    col, rr = k % 6, (k // 6) * 2
    sh.alpha_composite(up(old[iid]).resize((32 * Z, 32 * Z), Image.NEAREST), (col * cell + 6, rr * cell + 6))
    sh.alpha_composite(icons[iid].resize((32 * Z, 32 * Z), Image.NEAREST), (col * cell + 6, (rr + 1) * cell + 6))
    d.text((col * cell + 8, rr * cell + 4), iid + ' (old16)', fill=(230, 230, 230, 255))
sh.save(os.path.join(out, 'v3-proto.png'))
bgs = [('hotbar', (120, 86, 58, 255)), ('grass', (86, 150, 70, 255)), ('night', (28, 30, 56, 255))]
gm = Image.new('RGBA', (12 * 104 + 8, 3 * 104 + 8), (40, 36, 44, 255)); d = ImageDraw.Draw(gm)
for r, (_, c0) in enumerate(bgs):
    for k, iid in enumerate(items.ALL):
        x0, y0 = 8 + k * 104, 8 + r * 104
        d.rectangle((x0, y0, x0 + 96, y0 + 96), fill=c0, outline=(70, 48, 32, 255), width=2)
        gm.alpha_composite(icons[iid].resize((64, 64), Image.NEAREST), (x0 + 2, y0 + 2))
        gm.alpha_composite(icons[iid], (x0 + 62, y0 + 62))
gm.save(os.path.join(out, 'v3-ingame.png'))
