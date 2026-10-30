"""MINE-1B（炭鉱）の 16×16 の 絵の 共通 道具。pixel-artist 用。ゲームの src/ は 読むだけ。
もと: `docs/art/mine-1/proto/base.py.txt`（art-director の 試作。ゲームの `src/world/blocks/textures.ts` と 同じ 式の lcg・speckle・calm・blobs・stamp）と
`designs.py.txt` の 色の 表。ゲームの 今の 絵（つち・すな・き・いし・せきたん・てつ）は `current_tiles()` で ゲームの 式を 写して 作り、
`tests`（各 build.py の 確かめ）で ゲームが 出した 絵（getTilePixels）と 同じか 見る。
実行は 各 build.py から（`python3 art/MINE-1/<名前>/build.py`。pillow と numpy が いる）。
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

T = 16
M32 = 0xFFFFFFFF
_COMMON = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(_COMMON, '..', '..', '..'))   # リポジトリの 根
OUT_DOCS = os.path.join(ROOT, 'docs', 'art', 'mine-1')           # くらべの 絵・確かめの 絵の 置き場
FONTP = '/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf'


# ------------------------------------------------------------------ 色
def hx(c):
    c = c.lstrip('#')
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))


def hexs(rgb):
    return '#%02X%02X%02X' % tuple(int(v) for v in rgb[:3])


def lum(c):
    r, g, b = hx(c) if isinstance(c, str) else c[:3]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# 色の 表（DESIGN §20。新しい 色を 足さない）
GOLD = dict(hi='#FFF0B4', main='#EBB840', lo='#C98A1E', dk='#8C5A16')
CRY = dict(hi='#E0F7FC', main='#8CDAF2', lo='#55A6D2')
HOT = dict(core='#EEF8B2', main='#C9E56E', lo='#93BD52')
COAL = dict(hi='#5E5869', main='#3A3442', lo='#2B2632')
IRON = dict(hi='#CC8452', main='#A85E38', lo='#82462A')
CLAY = dict(base='#B07048', lt='#C4845A', dk='#975F3D')
LIME = dict(base='#D3CCBE', lt='#DED8CC', dk='#BAB1A0', sh='#A59B89')
PLASTER = dict(base='#E8E2D1', lt='#EFEADD', dk='#D4CBB7', line='#C9BFA9')
ICE = dict(main='#D9E3E6', lt='#E9EEEE', sh='#AEBFC8', root='#C9C1B2')
ICE_TIP = '#F4F9FA'
WOOD = dict(beam='#B58650', lt='#C79A62', dk='#7A5230', post='#6B4421', bolt='#4A4650', panel='#8E6238')
SLATE = '#5E6672'
DIA = dict(hi='#FBFDFF', main='#E3E8F8', lo='#AEB6DE', dk='#7880B8', pink='#FFD3EA', yel='#FFF1B0')
CHEST1 = dict(wood='#9A5E32', lid='#A8693A', strap='#4A4650', plate='#5E5A66', hole='#1E1C22', inside='#5E3A1E')  # 段階 1（chest2.py の PAL[1]）


# ------------------------------------------------------------------ 16×16 の 絵（textures.ts と 同じ 式）
def lcg(seed):
    s = [seed & M32]

    def r():
        s[0] = (s[0] * 1664525 + 1013904223) & M32
        return s[0] / 4294967296
    return r


def solid(c):
    return np.tile(np.array(hx(c), np.int32), (T, T, 1))


def speckle(base, dots, seed, count=40):
    t = solid(base)
    r = lcg(seed)
    for i in range(count):
        x = int(r() * T)
        y = int(r() * T)
        t[y, x] = hx(dots[i % len(dots)])
    return t


def calm(t, base, contrast=0.5, saturation=0.8):
    """ゲームの calmColor と 同じ（TILE_CALM = 0.5・0.8）。四捨五入は Math.round（.5 は 上へ）"""
    b = np.array(hx(base), np.float64)
    v = b + (t.astype(np.float64) - b) * contrast
    l = 0.2126 * v[..., 0] + 0.7152 * v[..., 1] + 0.0722 * v[..., 2]
    o = l[..., None] + (v - l[..., None]) * saturation
    return np.clip(np.floor(o + 0.5), 0, 255).astype(np.int32)


def blobs(t, color, seed, n):
    t = t.copy()
    r = lcg(seed)
    c = hx(color)
    for i in range(n):
        x = 1 + int(r() * (T - 3))
        y = 1 + int(r() * (T - 3))
        t[y, x] = c
        t[y, x + 1] = c
        t[y + 1, x] = c
        if i % 2 == 0:
            t[y + 1, x + 1] = c
    return t


def stamp(t, x0, y0, rows, cmap):
    """rows の 文字を cmap の 色で おく（cmap に ない 文字は そのまま）"""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in cmap:
                t[(y0 + j) % T, (x0 + i) % T] = hx(cmap[ch])
    return t


# ------------------------------------------------------------------ ゲームの 今の 絵（textures.ts の paintTile と 同じ）
def cur_stone():
    return calm(speckle('#8E8E8E', ['#757575', '#A5A5A5'], 33), '#8E8E8E')


def cur_dirt():
    return calm(speckle('#8B5A2B', ['#6F4520', '#A06A38'], 22), '#8B5A2B')


def cur_sand():
    return calm(speckle('#E8D9A0', ['#D6C487'], 44, 30), '#E8D9A0')


def cur_coal():
    return blobs(cur_stone(), '#222222', 66, 5)


def cur_iron():
    return blobs(cur_stone(), '#E0A872', 77, 5)


def cur_log_side():
    t = solid('#8A5A2E')
    for x in range(T):
        if x % 4 == 1:
            t[:, x] = hx('#6B4421')
    return calm(t, '#8A5A2E')


def cur_log_top():
    t = solid('#8A5A2E')
    for y in range(T):
        for x in range(T):
            d = max(abs(x - 7.5), abs(y - 7.5))
            if d >= 7:
                t[y, x] = hx('#6B4421')
            elif int(d) % 2 == 0:
                t[y, x] = hx('#B88A55')
    return calm(t, '#8A5A2E')


def current_tiles():
    return dict(stone=cur_stone(), dirt=cur_dirt(), sand=cur_sand(), coal_ore=cur_coal(), iron_ore=cur_iron(),
                log_side=cur_log_side(), log_top=cur_log_top())


# ------------------------------------------------------------------ 出し方（PNG・文字の ならび）
def to_rgba(t, alpha=None):
    """(16,16,3) か (16,16,4) → (16,16,4) uint8。alpha（16,16 の 0〜255）が あれば それを 使う"""
    a = np.asarray(t)
    if a.shape[-1] == 3:
        al = np.full(a.shape[:2] + (1,), 255) if alpha is None else np.asarray(alpha)[..., None]
        a = np.concatenate([a, al], axis=-1)
    return np.clip(a, 0, 255).astype(np.uint8)


def save_tile(t, path, alpha=None):
    """1 倍の PNG（16×16・RGBA・ぼかしなし）"""
    Image.fromarray(to_rgba(t, alpha), 'RGBA').save(path)


def big(t, scale, alpha=None, bg=None):
    """Nearest で 拡大（ぼかさない）。bg が あれば 透明を その 色で 下じきに する"""
    im = Image.fromarray(to_rgba(t, alpha), 'RGBA').resize((t.shape[1] * scale, t.shape[0] * scale), Image.NEAREST)
    if bg is not None:
        b = Image.new('RGBA', im.size, bg + (255,))
        b.alpha_composite(im)
        return b
    return im


def tiled(t, n=3, alpha=None):
    a = to_rgba(t, alpha)
    return np.tile(a, (n, n, 1))


def checker(size, cell=8, c1=(205, 205, 205), c2=(236, 236, 236)):
    w, h = size
    a = np.zeros((h, w, 3), np.uint8)
    for y in range(h):
        for x in range(w):
            a[y, x] = c1 if ((x // cell) + (y // cell)) % 2 == 0 else c2
    return Image.fromarray(a, 'RGB').convert('RGBA')


def font(n):
    return ImageFont.truetype(FONTP, n)


def colors_of(t, alpha=None):
    """絵の 中の ちがう 色（透明は 数えない）。{hex: 点の 数}"""
    a = to_rgba(t, alpha).reshape(-1, 4)
    out = {}
    for r, g, b, al in a:
        if al == 0:
            continue
        k = '#%02X%02X%02X' % (r, g, b)
        out[k] = out.get(k, 0) + 1
    return out


def rows_text(t, alpha=None, name=''):
    """文字の ならび（itemArt の fromRows と 同じ 形: 行 16 本 ＋ パレット）。色は 点の 多い 順に A, B, C ...。透明は '.'"""
    a = to_rgba(t, alpha)
    cols = colors_of(t, alpha)
    letters = {}
    order = sorted(cols.items(), key=lambda kv: (-kv[1], kv[0]))
    for i, (k, _) in enumerate(order):
        letters[k] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i] if i < 26 else chr(ord('a') + i - 26)
    lines = []
    for y in range(a.shape[0]):
        row = ''
        for x in range(a.shape[1]):
            r, g, b, al = a[y, x]
            row += '.' if al == 0 else letters['#%02X%02X%02X' % (r, g, b)]
        lines.append(row)
    pal = '  '.join(f"{ch}={k}" for k, ch in letters.items())
    head = f'# {name}  {len(cols)} 色' if name else f'# {len(cols)} 色'
    return head + '\n' + '\n'.join(lines) + '\n# パレット（点の 多い 順）: ' + pal + '\n'


def check_game_tiles(dump_path):
    """ゲームの getTilePixels を 書き出した JSON（scratchpad の cur_tiles.json 形式）と、この ファイルの 今の 絵が 同じか 見る"""
    d = json.load(open(dump_path))
    ok = True
    for k, t in current_tiles().items():
        g = np.array([c[:3] for c in d[k]], np.int32).reshape(T, T, 3)
        same = bool((g == t).all())
        ok &= same
        print(('OK  ' if same else 'NG  ') + k)
    return ok


# ------------------------------------------------------------------ 見本の 絵（preview.png・見本シート）
PAPER, INK, SUB, LINE = hx('#F4F1E8'), hx('#2B2B3A'), hx('#4A4A5A'), hx('#D8D2C2')
PILL = hx('#10141F')   # ゲームの ヒントの 下じき（--rk-hud-bg の 色）


def text(dr, xy, s, size, fill=INK):
    dr.text(xy, s, font=font(size), fill=fill)


def paste_tile(canvas, t, xy, scale, alpha=None, bg=None, cell=None):
    """タイルを Nearest で 拡大して はる。alpha が あれば 市松 か bg の 上に"""
    im = big(t, scale, alpha)
    if alpha is not None or (np.asarray(t).shape[-1] == 4):
        if bg is None:
            ck = checker(im.size, cell or max(4, scale // 2))
        else:
            ck = Image.new('RGBA', im.size, bg + (255,))
        ck.alpha_composite(im)
        im = ck
    canvas.paste(im.convert('RGB'), xy)
    return im.size


def swatch_list(dr, x, y, t, alpha=None, f=14, max_rows=12):
    cols = sorted(colors_of(t, alpha).items(), key=lambda kv: (-kv[1], kv[0]))
    for i, (c, n) in enumerate(cols[:max_rows]):
        dr.rectangle([x, y + i * 20, x + 14, y + i * 20 + 14], fill=hx(c), outline=LINE)
        text(dr, (x + 22, y + i * 20 - 1), f'{c}  {n}点', f, SUB)
    return len(cols)


def preview(path, title, items, note=None, repeat=True):
    """preview.png: items = [(ラベル, タイル(16,16,3|4), alpha|None)]。
    1 つ ごとに 左から 16 倍・3×3 ならべ（つなぎめ）・1 倍／2 倍／3 倍・色の 表。透明は 市松（1・2・3 倍は ヒントの 下じき 色）"""
    rowh = 304
    W, H = 1120, 66 + rowh * len(items) + (30 if note else 0) + 6
    cv = Image.new('RGB', (W, H), PAPER)
    dr = ImageDraw.Draw(cv)
    text(dr, (20, 14), title, 22)
    y = 54
    for (label, t, alpha) in items:
        a = np.asarray(t)
        has_alpha = alpha is not None or a.shape[-1] == 4
        text(dr, (20, y), label, 16, SUB)
        paste_tile(cv, t, (20, y + 24), 16, alpha)
        if repeat:   # 3×3 ならべ（つなぎめ）
            rep = np.tile(to_rgba(t, alpha), (3, 3, 1))
            im = Image.fromarray(rep, 'RGBA').resize((48 * 5, 48 * 5), Image.NEAREST)
            base = checker(im.size, 10) if has_alpha else Image.new('RGBA', im.size, (255, 255, 255, 255))
            base.alpha_composite(im)
            cv.paste(base.convert('RGB'), (300, y + 24))
            text(dr, (300, y), '3×3 ならべ（つなぎめ）', 14, SUB)
        else:        # ヒントの 下じき（暗い 紺）の 上 ×12
            im = big(t, 12, alpha)
            base = Image.new('RGBA', (16 * 12 + 24, 16 * 12 + 24), PILL + (255,))
            base.alpha_composite(im, (12, 12))
            cv.paste(base.convert('RGB'), (300, y + 24))
            text(dr, (300, y), 'ヒントの 下じき（#10141F）の 上', 14, SUB)
        # 1 倍・2 倍・3 倍
        x = 570
        text(dr, (x, y), '1 倍・2 倍・3 倍（ゲームの 大きさ）', 14, SUB)
        xx = x
        for sc in (1, 2, 3):
            im2 = big(t, sc, alpha)
            ck = Image.new('RGBA', im2.size, (PILL if has_alpha else (255, 255, 255)) + (255,))
            ck.alpha_composite(im2)
            cv.paste(ck.convert('RGB'), (xx, y + 24))
            xx += 16 * sc + 14
        # 色の 表
        n = len(colors_of(t, alpha))
        text(dr, (x, y + 80), f'ぜんぶで {n} 色（8 色まで）', 14, SUB)
        swatch_list(dr, x, y + 104, t, alpha, 14, 9)
        y += rowh
    if note:
        text(dr, (20, y - 6), note, 14, SUB)
    cv.save(path)
    return cv


def write_rows(path, items):
    """文字の ならび（開発が うつす 用）。items = [(名前, タイル, alpha|None)]"""
    out = []
    for (name, t, alpha) in items:
        out.append(rows_text(t, alpha, name))
    open(path, 'w', encoding='utf-8').write('\n'.join(out))


def report(name, t, alpha=None, limit=8):
    n = len(colors_of(t, alpha))
    ok = 'OK' if n <= limit else 'NG(色が 多い)'
    print(f'{name}: 16×16・{n} 色 {ok}')
    return n
