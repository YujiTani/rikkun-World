"""BOOK-1 案 C「まほうの ずかん」の 挿絵を 組む 道具（ドットの 部品）。

挿絵 1 まい = 100×75 ドット（4:3）。ゲームでは 整数倍（1024: ×3、1280・1440: ×4）で 拡大して 出す。
キャラは 3D の コマの絵（public/models/char/*.png）を ドットに落として パレットに 合わせ、ふちを つける。
アイテム・ブロックの絵は ゲームの 16×16 の 絵（src/ui/itemIcon.ts などを 書き出した PNG）を そのまま 1 倍で 使う。
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

W, H = 100, 75
GY = 59  # 地面の 上の 線（キャラの 足もと）


def hx(c: str, a: int = 255) -> tuple[int, int, int, int]:
    c = c.lstrip('#')
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


# ---- パレット（STYLE.md と 同じ） ----
P = {
    'line': hx('#3b1f3a'),  # キャラ・道具の ふち（こい むらさき。黒は 使わない）
    'ink': hx('#3a2614'),  # 木・金の ふち
    'sky': hx('#a9d8ef'), 'sky2': hx('#98cfea'), 'hill': hx('#9fd0ad'), 'hill2': hx('#86c399'),
    'g1': hx('#93d867'), 'g2': hx('#6fbf4a'), 'g3': hx('#4f9a37'),
    'd1': hx('#a8743f'), 'd2': hx('#8b5a33'), 'd3': hx('#6e4428'), 'd4': hx('#563420'),
    'wall': hx('#f3e7cf'), 'wall2': hx('#e4d3b0'), 'floor': hx('#b98a55'), 'floor2': hx('#a47442'),
    'night': hx('#24305a'), 'night2': hx('#1b2447'), 'nground': hx('#3d6b4a'), 'ndirt': hx('#4a3a3a'),
    'star': hx('#fff1a8'),
    'gold': hx('#e0b545'), 'gold2': hx('#b8862a'), 'gold3': hx('#fff0b0'),
    'yel': hx('#ffd23f'), 'yel2': hx('#7a4a12'),
    'key': hx('#fbf7ee'), 'key2': hx('#c9c0d6'), 'keyl': hx('#4a3f5c'),
    'panel': hx('#2c3654'), 'panel2': hx('#1b2236'), 'slot': hx('#46557d'), 'slot2': hx('#3a466a'),
    'red': hx('#e5484d'), 'red2': hx('#a3262c'), 'grn': hx('#4cc46a'), 'grn2': hx('#2b8a45'),
    'water': hx('#5aa9e6'), 'water2': hx('#3b7fc4'), 'water3': hx('#a9dcff'),
    'white': hx('#fffdf6'), 'fire': hx('#ff8a2a'), 'fire2': hx('#ffd23f'), 'fire3': hx('#e5484d'),
    'skin': hx('#ffd9c7'), 'skin2': hx('#e8b3a3'),
    'dust': hx('#eadfc8'), 'dust2': hx('#d6c6a6'),
    'clear': (0, 0, 0, 0),
}
# キャラを 落とす 色（この色の どれかに よせる）
CHAR_PAL = ['#e0127f', '#b00d66', '#ff5aa8', '#fbf4f6', '#d9cfe0', '#a99bb8', '#2a2333', '#4a3f5c', '#ffd9c7', '#e8b3a3', '#7a2e5a']

ROOT = Path(__file__).resolve().parents[4]
CHAR_DIR = ROOT / 'public' / 'models' / 'char'
ASSETS: Path | None = None  # 書き出した アイコン・タイル の 場所（compose が 入れる）


def new(bg: str | None = None) -> Image.Image:
    im = Image.new('RGBA', (W, H), P['clear'])
    if bg:
        globals()['BG_' + bg](im)
    return im


def rect(im, x, y, w, h, c):
    ImageDraw.Draw(im).rectangle((x, y, x + w - 1, y + h - 1), fill=c)


def px(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((int(x), int(y)), c)


# ---- 背景 ----
def BG_day(im, gy=GY, hills=True):
    rect(im, 0, 0, W, gy, P['sky'])
    rect(im, 0, 0, W, 10, P['sky2'])
    if hills:
        for x in range(W):
            t = gy - 7 - round(4 + 3 * math.sin(x * 0.11) + 2 * math.sin(x * 0.31))
            rect(im, x, t, 1, gy - t, P['hill'])
            rect(im, x, t + 5, 1, max(0, gy - t - 5), P['hill2'])
    ground(im, gy)


def BG_in(im, gy=GY):
    rect(im, 0, 0, W, gy, P['wall'])
    for y in range(4, gy, 7):
        rect(im, 0, y, W, 1, P['wall2'])
    rect(im, 0, gy, W, H - gy, P['floor'])
    for x in range(0, W, 14):
        rect(im, x, gy, 1, H - gy, P['floor2'])
    rect(im, 0, gy, W, 1, P['floor2'])


def BG_night(im, gy=GY):
    rect(im, 0, 0, W, gy, P['night'])
    rect(im, 0, 0, W, 12, P['night2'])
    r = random.Random(4)
    for _ in range(14):
        px(im, r.randrange(W), r.randrange(gy - 12), P['star'])
    rect(im, 0, gy, W, 3, P['nground'])
    rect(im, 0, gy + 3, W, H - gy - 3, P['ndirt'])


def BG_paper(im):
    rect(im, 0, 0, W, H, hx('#f6efdd'))


def ground(im, gy=GY, x0=0, x1=W):
    """地面 = 1 ブロック 18 ドット（小ブロック 9 こ × 2 ドット。9×9×9 の ゲームと 同じ 考え）"""
    for bx in range(x0 - (x0 % 18), x1, 18):
        block(im, bx, gy, 'grass', clip=(x0, x1))


def block(im, x, y, kind='grass', clip=None, crack=0):
    """18×18 の ブロック（小ブロック 2 ドット × 9）。kind: grass / dirt / farm / farmwet / stone / water / sand"""
    r = random.Random(x * 31 + y * 7 + hash(kind) % 97)
    tones = {
        'dirt': [P['d1'], P['d2'], P['d2'], P['d3']],
        'stone': [hx('#b9b9c2'), hx('#a3a3ad'), hx('#a3a3ad'), hx('#8a8a96')],
        'sand': [hx('#f2e2a8'), hx('#e6d08e'), hx('#e6d08e'), hx('#d4bb76')],
        'water': [P['water3'], P['water'], P['water'], P['water2']],
    }
    for j in range(9):
        for i in range(9):
            xx, yy = x + i * 2, y + j * 2
            if clip and not (clip[0] <= xx < clip[1]):
                continue
            if kind == 'grass':
                c = [P['g1'], P['g2']][r.random() < 0.4] if j < 2 else (P['g3'] if j == 2 and r.random() < 0.5 else r.choice([P['d1'], P['d2'], P['d2'], P['d3']]))
            elif kind in ('farm', 'farmwet'):
                wet = kind == 'farmwet'
                top = [hx('#6b4428'), hx('#4e3020')] if wet else [hx('#9a6a40'), hx('#7d5232')]
                side = [hx('#5e3a22'), hx('#4a2c1a'), hx('#553420')] if wet else [P['d1'], P['d2'], P['d3']]
                c = (top[(i % 3 == 0)] if j < 2 else r.choice(side))
            else:
                c = r.choice(tones[kind])
            rect(im, xx, yy, 2, 2, c)
    if kind == 'water':
        rect(im, x, y, 18, 1, P['water3'])
    if crack:
        crack_lines(im, x, y, crack)


def crack_lines(im, x, y, n):
    """ひび（1〜3 だん）。こい 線"""
    c = hx('#2b1a10')
    paths = [[(9, 2), (8, 5), (10, 8), (9, 11)], [(3, 6), (6, 8), (5, 12), (8, 15)], [(14, 4), (12, 9), (15, 12), (13, 16)]]
    d = ImageDraw.Draw(im)
    for k in range(min(n, 3)):
        pts = [(x + a, y + b) for a, b in paths[k]]
        d.line(pts, fill=c, width=1)


# ---- 素材 ----
_icon_cache: dict[str, Image.Image] = {}


def asset(name: str) -> Image.Image:
    if name not in _icon_cache:
        _icon_cache[name] = Image.open(ASSETS / f'{name}.png').convert('RGBA')
    return _icon_cache[name]


def outline(src: Image.Image, color=None, thick=1) -> Image.Image:
    """まわりに 1 ドットの ふち（4 方向）"""
    color = color or P['ink']
    w, h = src.size
    out = Image.new('RGBA', (w + 2 * thick, h + 2 * thick), P['clear'])
    a = src.split()[3].point(lambda v: 255 if v > 0 else 0)
    for dx, dy in ((0, thick), (2 * thick, thick), (thick, 0), (thick, 2 * thick)):
        out.paste(Image.new('RGBA', src.size, color), (dx, dy), a)
    out.alpha_composite(src, (thick, thick))
    return out


def icon(im, name, x, y, ol=True, flip=False, rot=0):
    """ゲームの 16×16 の 絵を 1 倍で 置く（ふち つき）。x, y は ふちを ふくむ 左上"""
    s = asset(('icon_' if not name.startswith(('tile_', 'mouse_', 'scroll', 'yokai_')) else '') + name)
    if flip:
        s = s.transpose(Image.FLIP_LEFT_RIGHT)
    if rot:
        s = s.rotate(rot, resample=Image.NEAREST, expand=True)
    if ol:
        s = outline(s)
    im.alpha_composite(s, (int(x), int(y)))
    return s.size


def tile(im, name, x, y, ol=False):
    s = asset('tile_' + name)
    if ol:
        s = outline(s)
    im.alpha_composite(s, (int(x), int(y)))


# ---- キャラ（3D の コマ → ドット） ----
_atlas = None
_sheets: dict[str, Image.Image] = {}


def _cell(motion: str, d: int, f: int) -> Image.Image:
    global _atlas
    if _atlas is None:
        _atlas = json.loads((CHAR_DIR / 'atlas.json').read_text())
    m = _atlas['motions'][motion]
    fr = m['frames']
    x, y, w, h, ox, oy = m['packed']['cells'][d * fr + f]
    if motion not in _sheets:
        _sheets[motion] = Image.open(CHAR_DIR / f'{motion}.png').convert('RGBA')
    c = Image.new('RGBA', (256, 256), P['clear'])
    c.paste(_sheets[motion].crop((x, y, x + w, y + h)), (ox, oy))
    return c


def _nearest(rgb, pal):
    return min(pal, key=lambda p: (p[0] - rgb[0]) ** 2 * 3 + (p[1] - rgb[1]) ** 2 * 4 + (p[2] - rgb[2]) ** 2 * 2)


_char_cache: dict = {}


def char(motion='idle', d=0, f=0, h=40, flip=False) -> Image.Image:
    """キャラ 1 コマを 高さ h（ふちを ふくむ）の ドット絵に。向き d: 0 前・1 ななめ前（右）・2 右向き・4 うしろ"""
    key = (motion, d, f, h, flip)
    if key in _char_cache:
        return _char_cache[key]
    src = _cell(motion, d, f)
    src = src.crop(src.getbbox())
    hh = h - 2
    ww = max(1, round(src.width * hh / src.height))
    # 高さの 1/4 まで ちぢめてから、もう 1 回 ちぢめる（細い線が 消えにくい）
    mid = src.resize((ww * 4, hh * 4), Image.LANCZOS)
    s = mid.resize((ww, hh), Image.BOX)
    pal = [hx(c)[:3] for c in CHAR_PAL]
    out = Image.new('RGBA', s.size, P['clear'])
    for j in range(s.height):
        for i in range(s.width):
            r, g, b, a = s.getpixel((i, j))
            if a < 100:
                continue
            k = a / 255
            rgb = (int(r / k) if k else r, int(g / k) if k else g, int(b / k) if k else b)
            out.putpixel((i, j), (*_nearest(rgb, pal), 255))
    if flip:
        out = out.transpose(Image.FLIP_LEFT_RIGHT)
    out = outline(out, P['line'])
    _char_cache[key] = out
    return out


def put(im, sprite: Image.Image, x, y_bottom):
    """足もと（下の はし）を y_bottom に そろえて 置く"""
    im.alpha_composite(sprite, (int(x), int(y_bottom - sprite.height)))
    return sprite.size


def front_point(sprite: Image.Image, x, y_bottom, f0=0.3, f1=0.6):
    """キャラの 手の あたり: 高さ f0〜f1 の 帯で いちばん 右の ドット（刀を 描きたす 起点）"""
    a = sprite.split()[3]
    best = (0, 0)
    for j in range(int(sprite.height * f0), int(sprite.height * f1)):
        for i in range(sprite.width - 1, -1, -1):
            if a.getpixel((i, j)):
                if i > best[0]:
                    best = (i, j)
                break
    return x + best[0], y_bottom - sprite.height + best[1]


def yokai(name: str, h: int) -> Image.Image:
    src = asset('yokai_' + name)
    src = src.crop(src.getbbox())
    ww = max(1, round(src.width * (h - 2) / src.height))
    s = src.resize((ww * 4, (h - 2) * 4), Image.LANCZOS).resize((ww, h - 2), Image.BOX)
    a = s.split()[3].point(lambda v: 255 if v > 110 else 0)
    s.putalpha(a)
    return outline(s, P['line'])


# ---- 字（5×5 ドット） ----
GLYPH = {
    'W': ['X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'], 'A': ['.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X'],
    'S': ['.XXXX', 'X....', '.XXX.', '....X', 'XXXX.'], 'D': ['XXXX.', 'X...X', 'X...X', 'X...X', 'XXXX.'],
    'E': ['XXXXX', 'X....', 'XXXX.', 'X....', 'XXXXX'], 'R': ['XXXX.', 'X...X', 'XXXX.', 'X..X.', 'X...X'],
    'Q': ['.XXX.', 'X...X', 'X.X.X', 'X..X.', '.XX.X'], 'L': ['X....', 'X....', 'X....', 'X....', 'XXXXX'],
    'P': ['XXXX.', 'X...X', 'XXXX.', 'X....', 'X....'], 'C': ['.XXXX', 'X....', 'X....', 'X....', '.XXXX'],
    'H': ['X...X', 'X...X', 'XXXXX', 'X...X', 'X...X'], 'I': ['XXXXX', '..X..', '..X..', '..X..', 'XXXXX'],
    'F': ['XXXXX', 'X....', 'XXXX.', 'X....', 'X....'], 'T': ['XXXXX', '..X..', '..X..', '..X..', '..X..'],
    '1': ['..X..', '.XX..', '..X..', '..X..', '.XXX.'], '9': ['.XXX.', 'X...X', '.XXXX', '....X', '.XXX.'],
    '2': ['.XXX.', '....X', '..XX.', '.X...', 'XXXXX'], '3': ['XXXX.', '....X', '.XXX.', '....X', 'XXXX.'],
    '^': ['..X..', '.XXX.', 'X.X.X', '..X..', '..X..'], '<': ['..X..', '.X...', 'XXXXX', '.X...', '..X..'],
    'v': ['..X..', '..X..', 'X.X.X', '.XXX.', '..X..'], '>': ['..X..', '...X.', 'XXXXX', '...X.', '..X..'],
    '?': ['.XXX.', 'X...X', '..XX.', '.....', '..X..'], '~': ['.....', '.X...', 'X.X.X', '...X.', '.....'],
    'x': ['.....', 'X...X', '.X.X.', '..X..', '.X.X.'],
}


def text(im, x, y, s, c=None):
    c = c or P['keyl']
    for n, ch in enumerate(s):
        for j, row in enumerate(GLYPH.get(ch, ['.....'] * 5)):
            for i, v in enumerate(row):
                if v == 'X':
                    px(im, x + n * 6 + i, y + j, c)


def key(im, x, y, label, lit=False):
    """キー 1 つ。1 文字は 11×12、長い字（SPACE・SHIFT）は 字数に 合わせて 広い"""
    w = 11 if len(label) == 1 else len(label) * 6 + 5
    rect(im, x, y, w, 12, P['keyl'])
    rect(im, x + 1, y + 1, w - 2, 10, P['key2'])
    rect(im, x + 1, y + 1, w - 2, 8, P['yel'] if lit else P['key'])
    text(im, x + 3, y + 2, label, P['keyl'])
    return w


def wasd(im, x, y):
    key(im, x + 12, y, 'W'); key(im, x, y + 12, 'A'); key(im, x + 12, y + 12, 'S'); key(im, x + 24, y + 12, 'D')


def arrows4(im, x, y):
    key(im, x + 12, y, '^'); key(im, x, y + 12, '<'); key(im, x + 12, y + 12, 'v'); key(im, x + 24, y + 12, '>')


def mouse(im, x, y, btn='L', rings=0):
    """マウス 12×16。押す ボタンだけ 黄色。rings: クリックの わ の 数（ダブルクリック = 2）"""
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x, y, x + 11, y + 15), radius=4, fill=P['key'], outline=P['keyl'])
    if btn == 'L':
        d.rounded_rectangle((x, y, x + 6, y + 7), radius=3, fill=P['yel'], outline=P['keyl'])
    elif btn == 'R':
        d.rounded_rectangle((x + 5, y, x + 11, y + 7), radius=3, fill=P['yel'], outline=P['keyl'])
    d.line((x + 5, y + 1, x + 5, y + 7), fill=P['keyl']) if btn != 'R' else d.line((x + 5, y + 1, x + 5, y + 7), fill=P['keyl'])
    d.line((x + 1, y + 8, x + 10, y + 8), fill=P['keyl'])
    bx = x + (2 if btn == 'L' else 9)
    for k in range(rings):
        r = 4 + k * 3
        d.arc((bx - r, y - 1 - r, bx + r, y - 1 + r), 200 if btn == 'L' else 270, 340 if btn == 'L' else 20, fill=P['yel2'])


def arrow(im, x0, y0, x1, y1, c=None, w=3, head=5):
    """太い 矢印（ふち つき）。c: 黄色が きほん"""
    c = c or P['yel']
    d = ImageDraw.Draw(im)
    ang = math.atan2(y1 - y0, x1 - x0)
    bx, by = x1 - math.cos(ang) * head, y1 - math.sin(ang) * head
    nx, ny = -math.sin(ang), math.cos(ang)
    tri = [(x1 + math.cos(ang) * 1, y1 + math.sin(ang) * 1), (bx + nx * (head + 1), by + ny * (head + 1)), (bx - nx * (head + 1), by - ny * (head + 1))]
    d.line((x0, y0, bx, by), fill=P['yel2'], width=w + 2)
    d.polygon([(x1 + math.cos(ang) * 2, y1 + math.sin(ang) * 2), (bx + nx * (head + 2), by + ny * (head + 2)), (bx - nx * (head + 2), by - ny * (head + 2))], fill=P['yel2'])
    d.line((x0, y0, bx, by), fill=c, width=w)
    d.polygon(tri, fill=c)


def arc_arrow(im, cx, cy, r, a0, a1, c=None, w=3):
    """弧の 矢印（a0 → a1 度、時計まわり 正）"""
    c = c or P['yel']
    d = ImageDraw.Draw(im)
    lo, hi = (a0, a1) if a1 > a0 else (a1, a0)
    d.arc((cx - r, cy - r, cx + r, cy + r), lo, hi, fill=P['yel2'], width=w + 2)
    d.arc((cx - r, cy - r, cx + r, cy + r), lo, hi, fill=c, width=w)
    t = math.radians(a1)
    ex, ey = cx + r * math.cos(t), cy + r * math.sin(t)
    s = 1 if a1 > a0 else -1
    tx, ty = -math.sin(t) * s, math.cos(t) * s
    arrow(im, ex - tx * 3, ey - ty * 3, ex + tx * 3, ey + ty * 3, c, w=1, head=5)


def dotted(im, x0, y0, x1, y1, c=None, step=3):
    c = c or P['gold2']
    n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
    for k in range(n + 1):
        t = k / n
        rect(im, round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), 2, 2, c)


def star(im, x, y, big=False):
    s = ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'] if not big else ['...X...', '...X...', '..XXX..', 'XXXXXXX', '..XXX..', '..X.X..', '.X...X.']
    for j, row in enumerate(s):
        for i, v in enumerate(row):
            if v == 'X':
                px(im, x + i, y + j, P['yel'])
    px(im, x + len(s[0]) // 2, y + len(s) // 2, P['white'])


def sparkle(im, x, y):
    for dx, dy in ((0, -2), (0, -1), (0, 1), (0, 2), (-2, 0), (-1, 0), (1, 0), (2, 0)):
        px(im, x + dx, y + dy, P['yel'])
    px(im, x, y, P['white'])


def heart(im, x, y, full=True):
    s = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
    for j, row in enumerate(s):
        for i, v in enumerate(row):
            if v == 'X':
                edge = j == 0 or i == 0 or i == 6 or (j > 2 and (i == j - 2 or i == 8 - j))
                px(im, x + i, y + j, (P['red2'] if edge else P['red']) if full else (P['keyl'] if edge else hx('#d9cfe0')))
    if full:
        px(im, x + 1, y + 1, P['white'])


def drop(im, x, y):
    s = ['..X..', '.XXX.', 'XXXXX', 'XXXXX', '.XXX.']
    for j, row in enumerate(s):
        for i, v in enumerate(row):
            if v == 'X':
                px(im, x + i, y + j, P['water'])
    px(im, x + 1, y + 2, P['water3'])


def sun(im, x, y):
    d = ImageDraw.Draw(im)
    for a in range(0, 360, 45):
        t = math.radians(a)
        d.line((x + 6 * math.cos(t), y + 6 * math.sin(t), x + 8 * math.cos(t), y + 8 * math.sin(t)), fill=P['yel'])
    d.ellipse((x - 4, y - 4, x + 4, y + 4), fill=P['yel'], outline=P['yel2'])


def moon(im, x, y, r=5):
    """三日月（中の 円から ずらした 円を ぬく）"""
    for j in range(-r, r + 1):
        for i in range(-r, r + 1):
            if i * i + j * j <= r * r and (i - 3) ** 2 + (j + 1) ** 2 > (r - 1) ** 2:
                px(im, x + i, y + j, P['star'])


def hand(im, x, y, point=True):
    """ゆび（指さし）8×9"""
    s = ['..X.....', '.XYX....', '.XYX....', '.XYXXX..', 'XXYYYYX.', 'XYYYYYYX', 'XYYYYYYX', '.XYYYYX.', '..XXXX..'] if point else \
        ['.XXXX...', 'XYYYYXX.', 'XYYYYYYX', 'XYYYYYYX', 'XYYYYYYX', '.XYYYYX.', '..XXXX..']
    for j, row in enumerate(s):
        for i, v in enumerate(row):
            if v == 'X':
                px(im, x + i, y + j, P['line'])
            elif v == 'Y':
                px(im, x + i, y + j, P['skin'])


def big_hand(im, x, y):
    """なでる 手（12×11、てのひらを 下に）"""
    rows = ['..XXXXXXX...', '.XYYYYYYYXX.', 'XYYYYYYYYYYX', 'XYYYYYYYYYYX', 'XYYYYYYYYYYX', 'XYZYZYZYZYYX', 'XYZYZYZYZYX.', '.XZXZXZXZX..', '..X.X.X.X...']
    for j, row in enumerate(rows):
        for i, v in enumerate(row):
            if v == 'X':
                px(im, x + i, y + j, P['line'])
            elif v == 'Y':
                px(im, x + i, y + j, P['skin'])
            elif v == 'Z':
                px(im, x + i, y + j, P['skin2'])


def rings(im, x, y, n):
    """「n かい」を 小さな わ の ならびで"""
    d = ImageDraw.Draw(im)
    for k in range(n):
        d.ellipse((x + k * 6, y, x + k * 6 + 4, y + 4), outline=P['yel2'], fill=P['yel'])


def panel(im, x, y, w, h):
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((x, y, x + w - 1, y + h - 1), radius=2, fill=P['panel'], outline=P['panel2'])


def slot(im, x, y, s=18, lit=False):
    rect(im, x, y, s, s, P['yel'] if lit else P['slot'])
    rect(im, x + 1, y + 1, s - 2, s - 2, P['slot2'] if not lit else hx('#fff3c4'))


def fire(im, x, y):
    s = ['...R....', '..RR..R.', '.RRYR.RR', '.RYYRRYR', 'RRYWYRYR', 'RYYWWYYR', '.RYYYYR.']
    cm = {'R': P['fire'], 'Y': P['fire2'], 'W': P['white']}
    for j, row in enumerate(s):
        for i, v in enumerate(row):
            if v in cm:
                px(im, x + i, y + j, cm[v])


def speed_lines(im, x, y, n=3, length=6, c=None):
    c = c or P['white']
    for k in range(n):
        rect(im, x - (k % 2) * 2, y + k * 3, length, 1, c)


def dust(im, x, y, n=3):
    r = random.Random(x * 3 + y)
    for k in range(n):
        s = 2 + r.randrange(2)
        rect(im, x + k * 4 + r.randrange(2), y - r.randrange(3), s, s, P['dust'] if k % 2 else P['dust2'])


def katana_line(im, x0, y0, x1, y1):
    """刀（細い絵が ドットで 消えるので 描きたす）: 白い 刃 ＋ こい ふち ＋ 金の つば"""
    d = ImageDraw.Draw(im)
    d.line((x0, y0, x1, y1), fill=P['line'], width=4)
    d.line((x0, y0, x1, y1), fill=hx('#dfe6f0'), width=2)
    px(im, x0, y0, P['gold'])
    px(im, x0 + (1 if x1 > x0 else -1), y0, P['gold'])


def finish(im: Image.Image) -> Image.Image:
    """とうめいを なくす（紙の上に そのまま 出すので、四角の 絵にする）"""
    bg = Image.new('RGBA', im.size, hx('#f6efdd'))
    bg.alpha_composite(im)
    return bg
