"""art/icons32/<id>.png を アトラス 1 枚に まとめる（ICON-32）。乱数なし・名前の 順。
python3 art/ICON-32/pack.py          → src/assets/icons32.png と icons32.json を 書く
python3 art/ICON-32/pack.py --check  → 作りなおした 物と 今の 物の 画素・表が 同じか（CI。ちがえば 1 で おわる）"""
import json, os, sys
from PIL import Image

ICON_SIZE = 32  # src/ui/iconAtlas.ts の ICON_SIZE と 同じ
COLS = 16
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'art', 'icons32')
OUT_PNG = os.path.join(ROOT, 'src', 'assets', 'icons32.png')
OUT_JSON = os.path.join(ROOT, 'src', 'assets', 'icons32.json')

def build():
    ids = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.png'))
    rows = max(1, (len(ids) + COLS - 1) // COLS)
    atlas = Image.new('RGBA', (COLS * ICON_SIZE, rows * ICON_SIZE), (0, 0, 0, 0))
    for i, iid in enumerate(ids):
        im = Image.open(os.path.join(SRC, iid + '.png')).convert('RGBA')
        if im.size != (ICON_SIZE, ICON_SIZE): sys.exit(f'{iid}.png は {im.size}。{ICON_SIZE}x{ICON_SIZE} に して ください')
        atlas.paste(im, ((i % COLS) * ICON_SIZE, (i // COLS) * ICON_SIZE))
    return atlas, {'size': ICON_SIZE, 'cols': COLS, 'ids': ids}

def main():
    atlas, index = build()
    if '--check' in sys.argv:
        ok = os.path.exists(OUT_PNG) and json.load(open(OUT_JSON)) == index
        ok = ok and Image.open(OUT_PNG).convert('RGBA').tobytes() == atlas.tobytes()
        print('アトラス OK' if ok else 'アトラスが 古い: python3 art/ICON-32/pack.py を 実行して コミット して ください')
        sys.exit(0 if ok else 1)
    atlas.save(OUT_PNG, optimize=True)
    json.dump(index, open(OUT_JSON, 'w'), ensure_ascii=False, indent=0)
    print(f'{len(index["ids"])} 点 → {os.path.relpath(OUT_PNG, ROOT)}')

main()
