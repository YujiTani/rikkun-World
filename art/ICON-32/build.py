"""ICON-32 本番: 絵を 作って art/icons32/<id>.png に 書く ＋ 確かめの シート（1x・3x、茶・草・夜）。
python3 art/ICON-32/build.py [シートの 出力 dir]
（手で 直した PNG を 上書き したく ない ときは art/ICON-32/keep.txt に id を 書く）"""
import json, os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gear as G, misc as M, legend as LG, legend4 as L4
OUT = os.path.join(HERE, '..', 'icons32')
os.makedirs(OUT, exist_ok=True)

ICONS = {
    # 道具
    **{f'{m}_pickaxe': (lambda m=m: G.pickaxe(m)) for m in ('wood', 'stone', 'iron', 'kin', 'kongo')},
    **{f'{m}_axe': (lambda m=m: G.axe(m)) for m in ('wood', 'stone', 'iron', 'kin', 'kongo')},
    'fude': G.fude, 'kuwa': G.kuwa, 'watering_can': G.watering_can, 'long_watering_can': lambda: G.watering_can(G.LEAF, True),
    'bucket': G.bucket, 'water_bucket': lambda: G.bucket(G.WATER), 'magma_bucket': lambda: G.bucket(G.LAVA),
    'wakimizu_bucket': lambda: G.bucket(G.WATER, True), 'magma_wakimizu_bucket': lambda: G.bucket(G.LAVA, True),
    'mushi_ami': G.mushi_ami, 'mizumori': G.mizumori, 'dotsuki': G.dotsuki, 'chalk': G.chalk,
    # 武器
    'bokuto': lambda: G.sword(G.WOOD, hilt=G.LACQ, wood=True), 'katana': lambda: G.sword(G.STEEL, guard=G.IRON, hilt=G.SUMI),
    'crystal_katana': lambda: G.sword(G.CRYS, guard=G.GEM, hilt=G.PURPLE), 'kin_katana': lambda: G.sword(G.GOLD, hilt=G.SHADE, sp=True),
    'kongo_katana': lambda: G.sword(G.GEM, guard=G.CHALK, hilt=G.WATER, sp=True), 'raijin_ken': lambda: G.sword(G.PURPLE, deco=G._bolt, curve=False),
    'fujin_ken': lambda: G.sword(G.WIND, guard=G.CHALK, deco=G._wind, curve=False), 'niji': lambda: G.sword(G.STEEL, deco=G._rainbow, guard=G.CHALK),
    'naginata': G.naginata, 'yumi': G.bow, 'kin_yumi': lambda: G.bow(G.GOLD, G.SHADE, G.CRIMSON, True), 'kongo_yumi': lambda: G.bow(G.GEM, G.NAVY, G.CHALK, True), 'ya': G.ya,
    # 防具
    **{f'{p}{k}': (lambda k=k, m=m: getattr(G, k)(m)) for p, m in (('', 'iron'), ('kin_', 'kin'), ('kongo_', 'kongo')) for k in ('kabuto', 'yoroi', 'kote', 'suneate')},
    'ninja_zukin': G.ninja_zukin, 'ninja_shozoku': G.ninja_shozoku, 'ninja_tekko': G.ninja_tekko, 'ninja_tabi': G.ninja_tabi,
    'samurai_jingasa': G.samurai_jingasa, 'samurai_haori': G.samurai_haori, 'samurai_tekko': G.samurai_tekko, 'samurai_geta': G.samurai_geta,
    # プロトの のこり
    'iron_ingot': M.iron_ingot, 'diamond': M.diamond, 'rope': M.rope, 'momo_yaki': M.momo_yaki, 'tomato': M.tomato,
    **{b: (lambda b=b: M.block(b)) for b in M.block_ids()},
}
LEAF_ = G.LEAF
ICONS['grass'] = M.grass
for _i in LG.IDS: ICONS[_i] = getattr(LG, _i)  # でんせつ 11 点は 1 点もの
ICONS['kokuryu'] = L4.kokuryu  # LEGEND-4 PR1（黒龍）。ほかの 4 点は それぞれの PR で 足す
ICONS['yatagarasu'] = L4.yatagarasu  # LEGEND-4 PR2（八咫烏）
import hero as HR, armor_hero as AH
ICONS.update(HR.IDS); ICONS.update(AH.IDS)  # 2 回目の 描きなおし（英雄っぽい 形・強い 明暗）
import batch2 as B2
for _i in B2.IDS: ICONS.setdefault(_i, getattr(B2, _i))  # バッチ 2

def main():
    keep = set(open(os.path.join(HERE, 'keep.txt')).read().split()) if os.path.exists(os.path.join(HERE, 'keep.txt')) else set()
    imgs = {}
    for iid, f in ICONS.items():
        im = f().render(); imgs[iid] = im
        if iid not in keep: im.save(os.path.join(OUT, f'{iid}.png'))
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/icon32-final'
    os.makedirs(out, exist_ok=True)
    cats = json.load(open(os.path.join(HERE, 'ref', 'categories.json')))
    for name, want in (('tools', {'tool'}), ('weapons', {'weapon'}), ('armor', {'armor'}), ('blocks', None), ('protos', {'food', 'metal', 'build-proto'}), ('food', {'food'}), ('materials', {'material', 'metal'}), ('home', {'home'}), ('build', {'build'}), ('light', {'light'}), ('plant', {'plant'})):
        ids = [i for i in ICONS if (want is None and i in M.TILES) or (want and cats.get(i) in want and i not in M.TILES)]
        if name == 'protos': ids = ['iron_ingot', 'diamond', 'rope', 'momo_yaki', 'tomato', 'grass']
        sheet(ids, imgs, os.path.join(out, f'{name}.png'))

def sheet(ids, imgs, path):
    bgs = [(120, 86, 58, 255), (86, 150, 70, 255), (28, 30, 56, 255)]
    cell = 112; cols = 8; rows = (len(ids) + cols - 1) // cols
    im = Image.new('RGBA', (cols * cell * 3 + 8, rows * (cell + 12) + 8), (40, 36, 44, 255)); d = ImageDraw.Draw(im)
    for k, iid in enumerate(ids):
        for b, c0 in enumerate(bgs):
            x0 = 8 + (b * cols + k % cols) * cell; y0 = 8 + (k // cols) * (cell + 12)
            d.rectangle((x0, y0, x0 + cell - 8, y0 + cell - 8), fill=c0)
            im.alpha_composite(imgs[iid].resize((96, 96), Image.NEAREST), (x0 + 0, y0 + 0))
            im.alpha_composite(imgs[iid], (x0 + cell - 40, y0 + cell - 40))
            if b == 0: d.text((x0, y0 + cell - 6), iid[:16], fill=(230, 230, 230, 255))
    im.save(path)

main()

def zoom(ids, path, z=4, cols=7, bg=(120, 86, 58, 255)):
    cell = 32 * z + 8
    im = Image.new('RGBA', (cols * cell, ((len(ids) + cols - 1) // cols) * (cell + 10)), bg); d = ImageDraw.Draw(im)
    for k, iid in enumerate(ids):
        p = Image.open(os.path.join(OUT, iid + '.png'))
        x0, y0 = (k % cols) * cell, (k // cols) * (cell + 10)
        im.alpha_composite(p.resize((32 * z, 32 * z), Image.NEAREST), (x0 + 4, y0 + 2)); d.text((x0 + 4, y0 + cell), iid[:18], fill=(255, 255, 255, 255))
    im.save(path)

if len(sys.argv) > 2:
    cats = json.load(open(os.path.join(HERE, 'ref', 'categories.json')))
    want = sys.argv[2]
    ids = [i for i in ICONS if (cats.get(i) == want and i not in M.TILES) or (want == 'blocks' and i in M.TILES)]
    zoom(ids, os.path.join(sys.argv[1], f'z-{want}.png'))
