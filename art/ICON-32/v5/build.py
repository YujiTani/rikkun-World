"""ICON-32 v5: 12 点 → png/ と v5-proto.png（上 v3・下 v4、6 倍）・v5-ingame.png（茶・草・夜、1x/3x/8x）。"""
import importlib.util, json, os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import items
old = json.load(open(os.path.join(HERE, '..', 'ref', 'old16.json')))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out')
os.makedirs(os.path.join(HERE, 'png'), exist_ok=True); os.makedirs(out, exist_ok=True)
icons = {}
for iid in items.ALL:
    f = getattr(items, iid); icons[iid] = (f(old) if iid == 'grass' else f()).render()
    icons[iid].save(os.path.join(HERE, 'png', f'{iid}.png'))
v3 = {i: Image.open(os.path.join(HERE, '..', 'v4', 'png', f'{i}.png')).convert('RGBA') for i in items.ALL}
Z, cell, bg = 6, 32 * 6 + 12, (54, 48, 58, 255)
sh = Image.new('RGBA', (cell * 6, cell * 4 + 20), bg); d = ImageDraw.Draw(sh)
for k, iid in enumerate(items.ALL):
    col, rr = k % 6, (k // 6) * 2
    sh.alpha_composite(v3[iid].resize((32 * Z, 32 * Z), Image.NEAREST), (col * cell + 6, rr * cell + 6))
    sh.alpha_composite(icons[iid].resize((32 * Z, 32 * Z), Image.NEAREST), (col * cell + 6, (rr + 1) * cell + 6))
    d.text((col * cell + 8, rr * cell + 4), iid + ' (v4)', fill=(230, 230, 230, 255))
    d.text((col * cell + 8, (rr + 1) * cell + 4), 'v5', fill=(255, 220, 140, 255))
sh.save(os.path.join(out, 'v5-proto.png'))
bgs = [(120, 86, 58, 255), (86, 150, 70, 255), (28, 30, 56, 255)]
W = 8 + 12 * 140
gm = Image.new('RGBA', (W, 3 * 140 + 8), (40, 36, 44, 255)); d = ImageDraw.Draw(gm)
for r, c0 in enumerate(bgs):
    for k, iid in enumerate(items.ALL):
        x0, y0 = 8 + k * 140, 8 + r * 140
        d.rectangle((x0, y0, x0 + 132, y0 + 132), fill=c0, outline=(70, 48, 32, 255), width=2)
        gm.alpha_composite(icons[iid].resize((96, 96), Image.NEAREST), (x0 + 2, y0 + 2))
        gm.alpha_composite(icons[iid], (x0 + 98, y0 + 98))
gm.save(os.path.join(out, 'v5-ingame.png'))
