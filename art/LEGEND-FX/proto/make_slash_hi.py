# 白い 斬撃 v3 を 192×132（1 点 = 1/32 ブロック）で 描き直す。形・コマは 今の 絵の まま、ふちを なめらかに・外に こい ふち 2 点・暗い 水色の 網 2 段（にじみ）
from PIL import Image, ImageFilter, ImageChops
import numpy as np
from scipy import ndimage as ndi
src = Image.open('slash3_white.png').convert('RGBA')   # 白化済み 64×44 ×(6×6)
FW, FH, K = 192, 132, 3
out = Image.new('RGBA', (FW * 6, FH * 6), (0, 0, 0, 0))
for row in range(6):
    for fr in range(6):
        t = src.crop((fr * 64, row * 44, fr * 64 + 64, row * 44 + 44))
        a = np.array(t).astype(float)
        al = a[..., 3] / 255
        # 内側の 色（段）= 最近傍で ×3。明るさは 4 段に まとめる
        nn = np.array(t.resize((FW, FH), Image.NEAREST)).astype(float)
        # なめらかな りんかく: 元の 暗いふち（紺）も ふくめた 形を ぼかして しきい値
        shape = np.array(Image.fromarray((al * 255).astype(np.uint8)).resize((FW, FH), Image.BICUBIC)).astype(float) / 255
        shape = ndi.gaussian_filter(shape, 1.6)
        S = shape > 0.45
        S = ndi.binary_opening(S, iterations=1)
        er = ndi.binary_erosion(S, iterations=2)          # こい ふち 2 点
        body = er
        # 内側の 色: 元の 色（暗いふちは 白に おきかえ）
        lum = (nn[..., 0] * .3 + nn[..., 1] * .59 + nn[..., 2] * .11) / 255
        dark = lum < 0.4
        col = np.zeros((FH, FW, 4))
        base = np.where(dark[..., None], np.array([250, 252, 255, 255.]), nn)
        # 4 段に まとめる（白・うすい 灰・うす水色）
        q = np.clip(np.round((base[..., 0] - 200) / 18), 0, 3) / 3
        tone = np.stack([200 + 55 * q, 214 + 41 * q, 235 + 20 * q, np.full_like(q, 255)], -1)
        col[body] = tone[body]
        # 刃先（板の 右はじ・さいごの 3 割）は うすい 水色へ
        ys, xs = np.nonzero(body)
        if len(xs):
            x0, x1 = xs.min(), xs.max()
            tipmask = body & (np.arange(FW)[None, :] > x0 + (x1 - x0) * 0.82)
            col[tipmask] = np.array([205, 232, 250, 255.])
        ring = S & ~er
        col[ring] = np.array([0x1B, 0x2A, 0x4A, 255.])
        # にじみ（暗い 水色の 網 2 段）
        d1 = ndi.binary_dilation(S, iterations=4) & ~S
        d2 = ndi.binary_dilation(S, iterations=8) & ~ndi.binary_dilation(S, iterations=4)
        yy, xx = np.mgrid[0:FH, 0:FW]
        chk = ((xx + yy) % 2 == 0)
        sparse = (xx % 2 == 0) & (yy % 2 == 0)
        col[d1 & chk] = np.array([0x4F, 0x86, 0xC8, 255.])
        col[d2 & sparse] = np.array([0x4F, 0x86, 0xC8, 255.])
        im = Image.fromarray(col.astype(np.uint8), 'RGBA')
        out.paste(im, (fr * FW, row * FH))
out.save('slash3_white_hi.png')
print(out.size)
