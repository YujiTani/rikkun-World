"""下絵の 掃除: 透明の 背景・きっちり 64x64・色を へらす・外の ふち 1px。
使い方: python3 art/ICON-64/pixellab/clean.py <入力 dir> <出力 dir> [色の 数=16]"""
import os, sys
from PIL import Image
N, OUTLINE = 64, (0x2A, 0x1E, 0x14, 255)

def clean(img, colors=16):
    img = img.convert('RGBA')
    if img.size != (N, N):  # 中身の 箱を 切って 余白 2px で 64 に（ニアレスト）
        bb = img.getbbox() or (0, 0, *img.size); img = img.crop(bb)
        s = (N - 4) / max(img.size); img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.NEAREST)
        c = Image.new('RGBA', (N, N)); c.alpha_composite(img, ((N - img.width) // 2, (N - img.height) // 2)); img = c
    a = img.getchannel('A').point(lambda v: 255 if v >= 128 else 0)  # 半透明を なくす
    rgb = img.convert('RGB').quantize(colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    rgb.putalpha(a); out = rgb.copy()
    for y in range(N):
        for x in range(N):
            if a.getpixel((x, y)): continue
            if any(0 <= x + dx < N and 0 <= y + dy < N and a.getpixel((x + dx, y + dy)) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                out.putpixel((x, y), OUTLINE)
            else: out.putpixel((x, y), (0, 0, 0, 0))
    return out

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]; k = int(sys.argv[3]) if len(sys.argv) > 3 else 16
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if f.endswith('.png'): clean(Image.open(os.path.join(src, f)), k).save(os.path.join(dst, f)); print(f)
