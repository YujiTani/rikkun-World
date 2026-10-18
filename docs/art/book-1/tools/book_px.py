"""BOOK-1 案 C「まほうの ずかん」の 挿絵を 組む 道具（ドットの 部品）。

挿絵 1 まい = 100×75 ドット（4:3）。ゲームでは 整数倍（1024: ×3、1280・1440: ×4）で 拡大して 出す。
キャラは 棒人間（ポーズは 関節の 角度の データ。デザインが かわっても 作りなおしが 安い）。
アイテム・ブロックの絵は ゲームの 16×16 の 絵（src/ui/itemIcon.ts などを 書き出した PNG）を そのまま 1 倍で 使う。
"""
from __future__ import annotations

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


# ---- 字を ぜんぶ（キーの 割り当てが かわっても 描ける） ----
GLYPH.update({
    'B': ['XXXX.', 'X...X', 'XXXX.', 'X...X', 'XXXX.'], 'G': ['.XXXX', 'X....', 'X..XX', 'X...X', '.XXX.'],
    'J': ['..XXX', '...X.', '...X.', 'X..X.', '.XX..'], 'K': ['X...X', 'X..X.', 'XXX..', 'X..X.', 'X...X'],
    'M': ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'], 'N': ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X'],
    'O': ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'], 'U': ['X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
    'V': ['X...X', 'X...X', 'X...X', '.X.X.', '..X..'], 'X': ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X'],
    'Y': ['X...X', '.X.X.', '..X..', '..X..', '..X..'], 'Z': ['XXXXX', '...X.', '..X..', '.X...', 'XXXXX'],
    '0': ['.XXX.', 'X..XX', 'X.X.X', 'XX..X', '.XXX.'], '4': ['X..X.', 'X..X.', 'XXXXX', '...X.', '...X.'],
    '5': ['XXXXX', 'X....', 'XXXX.', '....X', 'XXXX.'], '6': ['.XXX.', 'X....', 'XXXX.', 'X...X', '.XXX.'],
    '7': ['XXXXX', '...X.', '..X..', '.X...', '.X...'], '8': ['.XXX.', 'X...X', '.XXX.', 'X...X', '.XXX.'],
})

CODE_LABEL = {'Space': 'SPACE', 'ShiftLeft': 'SHIFT', 'ShiftRight': 'SHIFT', 'ArrowUp': '^', 'ArrowDown': 'v', 'ArrowLeft': '<', 'ArrowRight': '>',
              'Escape': 'ESC', 'Tab': 'TAB', 'Enter': 'ENTER', 'ControlLeft': 'CTRL', 'AltLeft': 'ALT'}


def code_label(code: str) -> str:
    """KeyboardEvent.code → キーの 絵の 字"""
    if code in CODE_LABEL:
        return CODE_LABEL[code]
    if code.startswith('Key'):
        return code[3:]
    if code.startswith('Digit'):
        return code[5:]
    return code.upper()[:5]


# ---- 棒人間（ポーズ ＝ 関節の 角度。0° ＝ まっすぐ下、＋ ＝ 前へ） ----
POSES = {
    #          どう  うで前(上,下) うで後(上,下)  あし前(もも,すね) あし後(もも,すね)
    'stand':   (0, (10, 0), (-10, 0), (8, 0), (-8, 0)),
    'walk':    (4, (35, 20), (-35, 10), (30, -10), (-25, -30)),
    'run':     (18, (70, 80), (-50, 30), (60, -20), (-45, -70)),
    'jump':    (5, (150, 20), (140, -10), (70, -90), (20, -80)),
    'thrust':  (8, (90, 0), (60, 30), (30, 0), (-25, 0)),
    'raise':   (-4, (170, 10), (160, 10), (20, 0), (-20, 0)),
    'swing':   (14, (60, 10), (40, 30), (35, 0), (-25, 0)),
    'upswing': (-6, (140, 0), (120, 10), (15, 0), (-25, 0)),
    'reach':   (6, (75, 10), (-20, 10), (15, 0), (-10, 0)),
    'bow1':    (0, (90, 0), (85, 70), (15, 0), (-15, 0)),
    'bow2':    (0, (90, 0), (90, 150), (15, 0), (-15, 0)),
    'front':   (0, (25, 0), (-25, 0), (12, 0), (-12, 0)),
}


def figure(im, pose, x, y_bottom, h=36, face=1, held=None):
    """棒人間を 足もと y_bottom、からだの まんなか x に。face: 1 右向き・-1 左向き。
    held: 前の 手に 持つ 物 {'katana': 角度°（0 ＝ 前、＋ ＝ 下）, 'len': ドット} か {'icon': 名前}。
    返す: 前の 手の 位置、刀の 先（あれば）"""
    lean, af, ab, lf, lb = POSES[pose]
    u = h / 36
    head_r = round(4 * u)
    seg_leg, seg_body, seg_arm = 8 * u, 12 * u, 6.5 * u
    d = ImageDraw.Draw(im)

    def to(p, ang, length):
        t = math.radians(ang)
        return (p[0] + face * math.sin(t) * length, p[1] + math.cos(t) * length)

    # 足もとから 組む: こし の 高さ ＝ あしの 長さ（まげると 下がる）
    hip = (x, y_bottom - 2 * seg_leg * max(0.6, math.cos(math.radians(max(abs(lf[0]), abs(lb[0])) * 0.5))))
    neck = to(hip, 180 + lean, seg_body)
    head = to(hip, 180 + lean, seg_body + head_r + 1)
    limbs = []
    for (a1, a2), base in ((lb, hip), (ab, neck), (lf, hip), (af, neck)):
        l = seg_leg if base is hip else seg_arm
        k = to(base, a1, l)
        e = to(k, a1 + a2 if base is hip else a1 - a2, l)
        limbs.append((base, k, e))
    # ふち（こい むらさき）→ 中（パーカーの ピンク・あしは こい）
    body_c, leg_c = hx('#e0127f'), hx('#4a3f5c')
    for w, col in ((4, P['line']), (2, None)):
        for n, (a, b, c) in enumerate(limbs):
            cc = col or (leg_c if n in (0, 2) else body_c)
            d.line([a, b, c], fill=cc, width=w, joint=None)
        d.line([hip, neck], fill=col or body_c, width=w + 1)
    d.ellipse((head[0] - head_r - 1, head[1] - head_r - 1, head[0] + head_r + 1, head[1] + head_r + 1), fill=P['line'])
    d.ellipse((head[0] - head_r, head[1] - head_r, head[0] + head_r, head[1] + head_r), fill=P['white'])
    if pose != 'front':
        px(im, head[0] + face * (head_r - 2), head[1] - 1, P['line'])  # 目（向きが 分かる）
    else:
        px(im, head[0] - 2, head[1] - 1, P['line']); px(im, head[0] + 2, head[1] - 1, P['line'])
    handp = limbs[3][2]
    tip = None
    if held and 'katana' in held:
        t = math.radians(held['katana'])
        tip = (handp[0] + face * math.cos(t) * held.get('len', 14), handp[1] + math.sin(t) * held.get('len', 14))
        katana_line(im, round(handp[0]), round(handp[1]), round(tip[0]), round(tip[1]))
    if held and 'icon' in held:
        icon(im, held['icon'], handp[0] - 9 + face * 6, handp[1] - 14, rot=held.get('rot', 0))
    if held and 'bow' in held:
        # 弓: 前の 手に 弧、つるは 後ろの 手へ（引くほど 後ろ）
        back = limbs[1][2]
        r = 9
        d.arc((handp[0] - r - face * 2, handp[1] - r, handp[0] + r - face * 2, handp[1] + r), -70 if face > 0 else 110, 70 if face > 0 else 250, fill=P['line'], width=3)
        d.arc((handp[0] - r - face * 2, handp[1] - r, handp[0] + r - face * 2, handp[1] + r), -70 if face > 0 else 110, 70 if face > 0 else 250, fill=hx('#a8743f'), width=1)
        top = (handp[0] - face * 2 + r * math.cos(math.radians(-70)) * face, handp[1] - r * math.sin(math.radians(70)))
        bot = (top[0], handp[1] + r * math.sin(math.radians(70)))
        d.line([top, back, bot], fill=P['white'], width=1)
    return handp, tip


# ---- 大きめの 部品 ----
def house(im, x, gy=GY):
    d = ImageDraw.Draw(im)
    d.polygon([(x - 4, 30), (x + 18, 16), (x + 40, 30)], fill=hx('#5a6378'))
    rect(im, x, 30, 36, gy - 30, hx('#c9a27a'))
    rect(im, x + 10, 40, 10, gy - 40, hx('#6e4428'))
    rect(im, x + 24, 36, 8, 7, P['yel'])


def tansu_big(im, x, y, gy=GY):
    rect(im, x, y, 40, gy - y, hx('#9c6a3c'))
    rect(im, x, y, 40, 2, hx('#b98a55'))
    for k in range(3):
        rect(im, x + 3, y + 5 + k * 13, 34, 10, hx('#b98a55'))
        rect(im, x + 17, y + 9 + k * 13, 6, 2, P['gold'])
    rect(im, x - 4, y + 5, 38, 11, hx('#c9a06a'))
    rect(im, x - 4, y + 5, 38, 2, hx('#6e4428'))


def scroll_open(im, x, y, items):
    rect(im, x + 2, y + 2, 58, 44, hx('#f6e7c1'))
    rect(im, x, y, 4, 48, hx('#9c6a3c')); rect(im, x + 58, y, 4, 48, hx('#9c6a3c'))
    for k, it in enumerate(items):
        yy = y + 5 + k * 13
        im.alpha_composite(asset('icon_' + it).resize((8, 8), Image.NEAREST), (x + 7, yy))
        rect(im, x + 19, yy + 3, 34 - k * 6, 2, hx('#b9a27a'))


def mini_block(im, x, y):
    rect(im, x - 1, y - 1, 10, 10, P['ink'])
    rect(im, x, y, 8, 8, P['d2']); rect(im, x, y, 8, 2, P['g2'])


def seed(im, x, y):
    for j, row in enumerate(['.XXX.', 'XYYYX', 'XYYZX', 'XYZZX', '.XXX.']):
        for i, v in enumerate(row):
            c = {'X': P['ink'], 'Y': hx('#f2e2a8'), 'Z': hx('#c9a46a')}.get(v)
            if c:
                px(im, x + i, y + j, c)


def smile(im, x, y):
    px(im, x, y, P['line']); px(im, x + 5, y, P['line'])
    rect(im, x + 1, y + 3, 4, 1, P['line'])


def hotbar(im, x, y, items, lit):
    for i in range(9):
        slot(im, x + i * 10, y, 10, lit=(i == lit))
    for i, it in enumerate(items):
        im.alpha_composite(asset('icon_' + it).resize((8, 8), Image.NEAREST), (x + 1 + i * 10, y + 1))


def grid(im, x, y, items, cols=3, s=17, lit=None, frame=True):
    rows = (len(items) + cols - 1) // cols
    if frame:
        panel(im, x, y, cols * (s + 1) + 5, rows * (s + 1) + 5)
    for i, it in enumerate(items):
        cx, cy = x + 3 + (i % cols) * (s + 1), y + 3 + (i // cols) * (s + 1)
        slot(im, cx, cy, s, lit=(it == lit))
        im.alpha_composite(asset('icon_' + it), (cx + (s - 16) // 2, cy + (s - 16) // 2))


def wear_slot(im, x, y, frac, col):
    slot(im, x, y, 26)
    im.alpha_composite(outline(asset('icon_wood_pickaxe')), (x + 4, y + 2))
    rect(im, x + 2, y + 24, 22, 4, P['panel2'])
    rect(im, x + 3, y + 25, max(2, round(20 * frac)), 2, P[col])


def target_frame(im, x, y):
    for i in range(0, 18, 3):
        rect(im, x + i, y, 2, 1, P['yel']); rect(im, x + i, y + 17, 2, 1, P['yel'])
        rect(im, x, y + i, 1, 2, P['yel']); rect(im, x + 17, y + i, 1, 2, P['yel'])


def grass_tuft(im, x, y):
    for gx in range(x, x + 16, 3):
        h = (gx % 5) + 6
        rect(im, gx, y - h, 2, h, P['g2'] if gx % 2 else P['g3'])


def fragments(im, pts):
    for dx, dy, s in pts:
        rect(im, dx, dy, s, s, P['d2']); rect(im, dx, dy, s, 1, P['d1'])


# ---- 部品の ならびを 描く（scenes.py の データ → 絵） ----
BINDINGS: dict = {'keys': {}, 'mouse': {}}


def key_for(action, n=0):
    codes = BINDINGS['keys'].get(action, [])
    if not codes:
        raise KeyError(f'キーの 割り当てが ない: {action}')
    return code_label(codes[min(n, len(codes) - 1)])


def draw(im, parts):
    ctx = {}
    for p in parts:
        p = dict(p)
        t = p.pop('t')
        if t == 'bg':
            k = p['kind']
            if k == 'day':
                BG_day(im, hills=p.get('hills', True))
            else:
                globals()['BG_' + k](im)
        elif t == 'block':
            block(im, p['x'], p.get('y', GY - 18), p.get('kind', 'grass'), crack=p.get('crack', 0), clip=p.get('clip'))
        elif t == 'ground':
            ground(im, GY, p.get('x0', 0), p.get('x1', W))
        elif t == 'fig':
            hand_, tip = figure(im, p['pose'], p['x'], p.get('y', GY), p.get('h', 36), p.get('face', 1), p.get('held'))
            if tip and 'arc' in p:
                r, a0, a1 = p['arc']
                cx = tip[0] - r * math.cos(math.radians(a0))
                cy = tip[1] - r * math.sin(math.radians(a0))
                arc_arrow(im, cx, cy, r, a0, a1, w=p.get('w', 4))
            ctx['hand'], ctx['tip'] = hand_, tip
        elif t == 'icon':
            icon(im, p['name'], p['x'], p['y'], ol=p.get('ol', True), flip=p.get('flip', False), rot=p.get('rot', 0))
        elif t == 'tile':
            tile(im, p['name'], p['x'], p['y'])
        elif t == 'key':
            key(im, p['x'], p['y'], key_for(p['action'], p.get('n', 0)), lit=p.get('lit', False))
        elif t == 'move4':
            n = p.get('n', 0)
            x, y = p['x'], p['y']
            key(im, x + 12, y, key_for('moveForward', n)); key(im, x, y + 12, key_for('moveLeft', n))
            key(im, x + 12, y + 12, key_for('moveBack', n)); key(im, x + 24, y + 12, key_for('moveRight', n))
        elif t == 'keyrange':  # 1〜9 の ような はばの ある キー
            a = key_for(p['first']); b = key_for(p['last'])
            w = key(im, p['x'], p['y'], a)
            text(im, p['x'] + w + 3, p['y'] + 3, '~')
            key(im, p['x'] + w + 11, p['y'], b)
        elif t == 'mouse':
            btn = None
            if 'action' in p:
                btn = {0: 'L', 2: 'R'}.get(BINDINGS['mouse'].get(p['action']))
            mouse(im, p['x'], p['y'], btn, rings=p.get('rings', 0))
            if p.get('wheel'):
                rect(im, p['x'] + 4, p['y'] + 1, 4, 5, P['yel']); rect(im, p['x'] + 5, p['y'] + 2, 2, 3, P['yel2'])
        elif t == 'arrow':
            arrow(im, p['x0'], p['y0'], p['x1'], p['y1'], w=p.get('w', 3), head=p.get('head', 5))
        elif t == 'arc':
            arc_arrow(im, p['cx'], p['cy'], p['r'], p['a0'], p['a1'], w=p.get('w', 3))
        elif t == 'yokai':
            sp = yokai(p['name'], p['h'])
            im.alpha_composite(sp, (int(p['x']), int(p.get('y', GY) - sp.height)))
        elif t == 'cell':  # 小さな コマ（別の 絵を 切りぬいて はる）
            sub = new()
            if p.get('bg'):
                draw(sub, [{'t': 'bg', **p['bg']}] if isinstance(p['bg'], dict) else [{'t': 'bg', 'kind': p['bg']}])
            draw(sub, p.get('parts', []))
            sx, sy = p.get('src', (0, 0))
            im.alpha_composite(sub.crop((sx, sy, sx + p['w'], sy + p['h'])), (p['x'], p['y']))
            if p.get('border'):
                bx, by = p['x'] - 1, p['y'] - 1
                d = ImageDraw.Draw(im)
                d.rectangle((bx, by, bx + p['w'] + 1, by + p['h'] + 1), outline=P[p['border']])
        else:
            if isinstance(p.get('c'), str):
                p['c'] = P.get(p['c']) or hx(p['c'])
            globals()[t](im, **p)
    return ctx


def circle(im, x, y, w, h, c=None):
    ImageDraw.Draw(im).ellipse((x, y, x + w, y + h), outline=c or P['gold2'])


def spray(im, cx, cy):
    d = ImageDraw.Draw(im)
    for r in (14, 22):
        d.arc((cx - r, cy - r, cx + r, cy + r), 200, 340, fill=P['water'], width=2)
