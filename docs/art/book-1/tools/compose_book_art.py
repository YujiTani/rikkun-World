"""BOOK-1 案 C の 挿絵を 組む（ふつうは build_book_art.mjs から 呼ばれる）。

  python3 compose_book_art.py <素材の フォルダ> <出す フォルダ> [id ...]
素材の フォルダには export_assets.ts が 書き出した PNG と bindings.json（キー・マウスの 割り当て）が ある。
組み立ては scenes.py の データ（1 項目 ＝ 部品の ならび）。出す物: <id>.png（100×75、とうめい なし）。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
import book_px as B  # noqa: E402
from scenes import SCENES  # noqa: E402

ORDER = list(SCENES)


def main():
    B.ASSETS = Path(sys.argv[1])
    B.BINDINGS.update(json.loads((B.ASSETS / 'bindings.json').read_text()))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    ids = sys.argv[3:] or ORDER
    for i in ids:
        im = B.new()
        B.draw(im, SCENES[i])
        B.finish(im).convert('RGB').save(out / f'{i}.png', optimize=True)
    print(f'{len(ids)} まい → {out}')


if __name__ == '__main__':
    main()
