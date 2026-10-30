"""MINE-1B 16×16 の 絵の 見本シート・くらべの 絵・CRITERIA の 確かめ（docs/art/mine-1/ に 書く）。
先に 各 `art/MINE-1/<名前>/build.py` を 回して `*_1x.png` を 作る（`python3 art/MINE-1/build_all.py` が 全部 回す）。
書く もの:
  tiles-sheet.png                 見本シート（ぜんぶの 絵を 10 倍で ならべ、色の 数・もとに した 数）
  tiles-compare.png               くらべの 絵 = 確かめ ④「いまと ならべる」（mix.png §4 と 同じ ならびで いまの つち・すな・き と。いまの せきたん・てつ・ヒントの 「ひらく」とも）
  tiles-check-1-silhouette.png    確かめ ①（まっ黒の シルエット）
  tiles-check-2-gray.png          確かめ ②（白黒）
  tiles-check-3-blur.png          確かめ ③（ぼかし）
いまの ゲームの 絵は mine.py の `current_tiles()`（ゲームの getTilePixels と 同じと 確かめずみ）。ゆき・かまど・たんすの アイコンは `ref/*.png`（ゲームの 式を node で 書き出した もの）。
実行: python3 art/MINE-1/sheets/build.py
"""
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(ART, 'common'))
from mine import *  # noqa: E402,F401

OUT = OUT_DOCS
WD = 1800
PAD = 28
CARD = (255, 255, 255)
GREEN, GRAYTAG, REDTAG = hx('#3B8C5A'), hx('#6B7A99'), hx('#C0504D')
CAVE = hx('#1B1C24')
SKY = hx('#BFD9EA')


# ------------------------------------------------------------------ 絵の よみこみ
def load(path):
    return np.array(Image.open(path).convert('RGBA'))


def rgba(t):
    """(16,16,3) → (16,16,4)"""
    return to_rgba(t)


def tl(name, file=None):
    f = file or f'{name}_1x.png'
    return load(os.path.join(ART, name, f))


NEW = dict(
    nendo=tl('nendo'), sekkaiseki=tl('sekkaiseki'), shikkui=tl('shikkui'),
    waku_side=tl('kodo_waku', 'kodo_waku_side_1x.png'), waku_top=tl('kodo_waku', 'kodo_waku_top_1x.png'),
    tsurara=tl('tsurara'), chest=tl('chest_hint'),
    coal=tl('coal_ore'), iron=tl('iron_ore'), gold=tl('kin_ore'), crystal=tl('suisho_ore'), hotaru=tl('hotaruishi'), diamond=tl('diamond_ore'),
)
CUR = {k: rgba(v) for k, v in current_tiles().items()}
REF = dict(snow=load(os.path.join(HERE, 'ref', 'snow_1x.png')), furnace=load(os.path.join(HERE, 'ref', 'furnace_side_1x.png')), tansu=load(os.path.join(HERE, 'ref', 'tansu_icon_1x.png')))
STONE = CUR['stone']
SLATE_T = None  # ほたるいしの 地（マスクを とる 時の 基準）


def ground_of(name):
    """鉱石の 絵の 地（つぶを 取りのぞく 時の 基準）"""
    if name == 'hotaru':
        import ore
        return rgba(ore.slate_tile())
    return STONE


# ------------------------------------------------------------------ 描く 道具
def scaled(t, s, bg=None):
    im = Image.fromarray(np.asarray(t, np.uint8), 'RGBA').resize((16 * s, 16 * s), Image.NEAREST)
    if bg is not None:
        b = Image.new('RGBA', im.size, tuple(bg) + (255,))
        b.alpha_composite(im)
        return b
    return im


def gray_of(t):
    a = np.asarray(t, np.float64)
    l = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    o = np.stack([l, l, l, a[..., 3]], axis=-1)
    return np.clip(np.floor(o + 0.5), 0, 255).astype(np.uint8)


def luma_mean(t):
    a = np.asarray(t, np.float64)
    m = a[..., 3] > 0
    l = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return float(l[m].mean())


def mask_of(t, base):
    """つぶの シルエット: 地と ちがう 点を まっ黒、ほかは 白（つららと 宝箱は すける 所が 白）"""
    a = np.asarray(t)
    if base is None:
        m = a[..., 3] > 0
    else:
        m = (a[..., :3] != np.asarray(base)[..., :3]).any(axis=-1) & (a[..., 3] > 0)
    out = np.full(a.shape, 255, np.uint8)
    out[m, :3] = (20, 20, 24)
    out[..., 3] = 255
    return out


def new_canvas(h, title, sub=None):
    cv = Image.new('RGB', (WD, 4000), PAPER)   # 高さは 大きめに とって、さいごに 切る
    dr = ImageDraw.Draw(cv)
    text(dr, (PAD, 22), title, 34)
    if sub:
        yy = 70
        for line in sub:
            text(dr, (PAD, yy), line, 18, SUB)
            yy += 26
    return cv, dr


def card(dr, y, h, title, tag=None, tagc=GREEN):
    dr.rounded_rectangle([PAD, y, WD - PAD, y + h], radius=14, fill=CARD, outline=LINE, width=2)
    text(dr, (PAD + 20, y + 14), title, 24)
    if tag:
        w = dr.textlength(tag, font=font(16)) + 28
        dr.rounded_rectangle([WD - PAD - 16 - w, y + 14, WD - PAD - 16, y + 44], radius=15, fill=tagc)
        text(dr, (WD - PAD - 16 - w + 14, y + 18), tag, 16, (255, 255, 255))


def put_label(dr, cx, y, s, size=16, fill=INK, bgfill=None):
    f = font(size)
    w = dr.textlength(s, font=f)
    if bgfill:
        dr.rounded_rectangle([cx - w / 2 - 8, y - 2, cx + w / 2 + 8, y + size + 6], radius=10, fill=bgfill, outline=LINE)
    dr.text((cx - w / 2, y), s, font=f, fill=fill)


def wrap_text(dr, s, f, width):
    lines, cur = [], ''
    for ch in s:
        if ch == '\n':
            lines.append(cur)
            cur = ''
            continue
        if dr.textlength(cur + ch, font=f) > width:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def note(dr, x, y, s, width, size=16, fill=SUB, gap=4):
    f = font(size)
    for ln in wrap_text(dr, s, f, width):
        dr.text((x, y), ln, font=f, fill=fill)
        y += size + gap
    return y


def strip(cv, dr, x, y, items, s, gap=26, tag_new=True, lab_size=16):
    """items = [(ラベル, タイル, 下じき|None, 'now'|'new'|None)] を よこに ならべる。戻り値 = (つぎの x, 下の y)"""
    for (lab, t, bg, kind) in items:
        im = scaled(t, s, bg)
        if bg is None and (np.asarray(t)[..., 3] < 255).any():
            ck = checker(im.size, max(4, s // 2))
            ck.alpha_composite(im)
            im = ck
        cv.paste(im.convert('RGB'), (x, y))
        if kind:
            put_label(dr, x + 16 * s / 2, y + 16 * s + 8, lab, lab_size, (255, 255, 255), GRAYTAG if kind == 'now' else GREEN)
        else:
            put_label(dr, x + 16 * s / 2, y + 16 * s + 8, lab, lab_size)
        x += 16 * s + gap
    return x, y + 16 * s + 8 + lab_size + 10


def hint_pill(cv, x, y, icon, word, scale=2, alpha=0.8):
    """ゲームの ヒント（照準の 下）を まねた 絵: 暗い 紺の 下じき ＋ マウス（右が 光る）＋ すること の 絵 ＋ 1 語"""
    f = font(20)
    d0 = ImageDraw.Draw(cv)
    tw = d0.textlength(word, font=f)
    w, h = int(8 + 20 + 6 + 16 * scale + 6 + tw + 14), 16 * scale + 14
    ov = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    od.rounded_rectangle([0, 0, w - 1, h - 1], radius=h // 2, fill=PILL + (int(255 * alpha),))
    mx, my = 10, (h - 28) // 2
    od.rounded_rectangle([mx, my, mx + 19, my + 27], radius=8, outline=(255, 255, 255, 255), width=2)
    od.rectangle([mx + 10, my + 2, mx + 17, my + 12], fill=hx('#FFD23F') + (255,))
    od.line([mx + 10, my + 2, mx + 10, my + 12], fill=(255, 255, 255, 255))
    ic = scaled(icon, scale)
    ov.alpha_composite(ic, (8 + 20 + 6 + 4, 7))
    od.text((8 + 20 + 6 + 16 * scale + 10, (h - 24) // 2), word, font=f, fill=(255, 255, 255, 255))
    cv_rgba = cv.convert('RGBA')
    cv_rgba.alpha_composite(ov, (int(x), int(y)))
    cv.paste(cv_rgba.convert('RGB'))
    return w, h


def wall(seed=5, cols=22, rows=6):
    """ならべた かべの もよう（平らな 絵。まぜた かべ）: いしの 中に 鉱石、ところどころに ねんど・せっかいせき・しっくい・わくの そう"""
    rnd = random.Random(seed)
    g = [[STONE for _ in range(cols)] for _ in range(rows)]
    bands = {5: 'nendo', 6: 'nendo', 11: 'sekkaiseki', 12: 'sekkaiseki', 16: 'shikkui', 19: 'waku_side'}
    for x, k in bands.items():
        for y in range(rows):
            g[y][x] = NEW[k]
    ores = ['coal', 'iron', 'gold', 'crystal', 'hotaru', 'diamond']
    weights = dict(coal=5, iron=4, gold=3, crystal=3, hotaru=3, diamond=2)
    pool = [k for k in ores for _ in range(weights[k])]
    cells = [(x, y) for y in range(rows) for x in range(cols) if x not in bands]
    rnd.shuffle(cells)
    for (x, y), k in zip(cells, pool):
        g[y][x] = NEW[k]
    return np.concatenate([np.concatenate(r, axis=1) for r in g], axis=0)


# ------------------------------------------------------------------ 見本シート
def sheet():
    H = 0
    cv, dr = new_canvas(H, 'MINE-1B 16×16 の 絵 — 見本シート（炭鉱の ブロック・鉱石の 遠く用・つらら・ヒントの たからばこ）',
                        ['pixel-artist 2026-10-30。1 倍・Nearest・ふち線 なし・影を 描きこまない（面の 明るさで 出る）・1 まい 8 色まで・シード つき。色は DESIGN §20 の 表の まま。',
                         'もとの 数: `docs/art/mine-1/proto/designs.py.txt`（opt_a・opt_b の つぶの ならび）・`chest2.py.txt`（PAL[1]）。各 絵の 作り方は `art/MINE-1/<名前>/build.py`。'])
    y = 128
    # §1 ブロック A
    card(dr, y, 340, '§1 ブロック A（ねんど・せっかいせき・しっくい・坑道の わく）', '決まり')
    x = PAD + 40
    items = [('nendo ねんど', NEW['nendo'], None, None), ('sekkaiseki せっかいせき', NEW['sekkaiseki'], None, None), ('shikkui しっくい', NEW['shikkui'], None, None),
             ('kodo_waku 横', NEW['waku_side'], None, None), ('kodo_waku 上・下', NEW['waku_top'], None, None)]
    x2, yb = strip(cv, dr, x, y + 60, items, 10, 52, lab_size=17)
    specs = ['地 #B07048・よこの すじ 4 本・calm。3 色', '地 #D3CCBE・なみの しま 2 本・かいがら 2 つ・calm。4 色', '地 #E8E2D1・上と 左の はしが 目地。calm なし。4 色',
             '木 #B58650・鉄の おび・びょう・ふち。calm なし。8 色', '木口（四角の 年輪）・ふち。calm なし。5 色']
    for i, sp in enumerate(specs):
        note(dr, x + i * (160 + 52), yb + 2, sp, 170, 14)
    note(dr, x2 + 10, y + 70, 'ねんど・せっかいせきは 地形なので calm（いまの つち・いしと 同じ）。しっくい・わくは 人が 作った 平らな 箱（calm しない）。形は ゲームの ごつごつ（ねんど 4・2・5、せっかいせき 6・3・7）と 開発の わく。', 1744 - (x2 - PAD) - 40, 16)
    y += 340 + 22
    # §2 鉱石
    card(dr, y, 400, '§2 鉱石 6 つの 遠く用（16 ブロックより 遠くで 使う 平らな 絵 ＝ 持ち物の アイコンにも 使う）', '決まり（PO）')
    x = PAD + 30
    items = [('いまの せきたん', CUR['coal_ore'], None, 'now'), ('いまの てつ', CUR['iron_ore'], None, 'now'), ('coal_ore せきたん', NEW['coal'], None, 'new'), ('iron_ore てつ', NEW['iron'], None, 'new'),
             ('kin_ore きん', NEW['gold'], None, 'new'), ('suisho_ore すいしょう', NEW['crystal'], None, 'new'), ('hotaruishi ほたるいし', NEW['hotaru'], None, 'new'), ('diamond_ore ダイヤ', NEW['diamond'], None, 'new')]
    x2, yb = strip(cv, dr, x, y + 60, items, 10, 20, lab_size=15)
    specs = ['', '', '黒い 板 3 まい（3×1 → 5×2 点）', 'さびいろの こぶ 2 つ（3×3 → 5×5 点）', '金の 粒（4×4 点 2 つ ＋ 2×2 点）', '水色の はしら（4×4 点 ＋ 2×2 点 3 つ）', 'こい 青灰の 地 ＋ ほたるの むれ 5 つ', '白と むらさきの ひし形（10×10 点）']
    for i, sp in enumerate(specs):
        if sp:
            note(dr, x + i * 180, yb + 2, sp, 170, 13)
    note(dr, x, yb + 58, '1 小ブロック ≒ 1.8 点。つぶごとに 大きさを 四捨五入（1 → 2 点・2 → 4 点・3 → 5 点）、位置は 中心を 合わせた。石の 地は ゲームの いまの stone（ほたるいしだけ こい 青灰）。'
         'つぶの 色は おさえない（calm しない）。左の 2 つは いまの ゲームの 絵（これと 置きかえる）。', 1650, 16)
    y += 400 + 22
    # §3 つらら・宝箱ヒント
    card(dr, y, 540, '§3 つらら（十字の 板）・ヒントの たからばこ', '決まり')
    x = PAD + 40
    ys = y + 60
    items = [('市松（すける）', NEW['tsurara'], None, None), ('ほらあなの 暗い 所', NEW['tsurara'], CAVE, None), ('そとの 明るい 所', NEW['tsurara'], SKY, None)]
    x2, yb = strip(cv, dr, x, ys, items, 10, 24, lab_size=16)
    note(dr, x, yb + 2, 'tsurara 細い 3 本。根もと #C9C1B2・からだ #D9E3E6・左 #E9EEEE・右 #AEBFC8・先の 2 行 #F4F9FA（白く まるい）。5 色。', 540, 14)
    xc = x2 + 40
    items = [('ヒントの 下じき', NEW['chest'], PILL, None), ('市松', NEW['chest'], None, None)]
    x3, yb2 = strip(cv, dr, xc, ys, items, 10, 24, lab_size=16)
    note(dr, xc, yb2 + 2, 'chest_hint 段階 1 の 色・前から 少し 上。6 色（木 2・おび・かけがね・かぎあな・さかいの 線）。', 440, 14)
    # 実際の ヒントの 見え方（1 倍の 2 倍）
    yy = ys + 16 * 10 + 130
    bgw = 1400
    wl = wall(5, 22, 3)
    wim = Image.fromarray(wl.astype(np.uint8), 'RGBA').resize((wl.shape[1] * 4, wl.shape[0] * 4), Image.NEAREST).convert('RGB')
    cv.paste(wim.crop((0, 0, bgw, 48 * 3 + 0)), (x, yy))
    text(dr, (x, yy - 24), 'ゲームの ヒント（照準の 下）の まね。ひらく（たんす・かまど）と あける（宝箱）', 16, SUB)
    px = x + 20
    for (ic, wd) in ((REF['tansu'], 'ひらく'), (REF['furnace'], 'ひらく'), (NEW['chest'], 'あける')):
        w, h = hint_pill(cv, px, yy + 40, ic, wd, 2)
        px += w + 40
    y += 540 + 22
    # §4 数
    card(dr, y, 450, '§4 数（ぜんぶ 16×16・1 倍・Nearest。ゲームの 絵と おなじ 大きさ）')
    cols = ['名前', '色の 数', '三角形・形', '中身の もと']
    rows = [
        ('nendo', '3 色', '形 = いまの つち（ごつごつ 4・2・5）', 'designs.py opt_a clay・seed 121'),
        ('sekkaiseki', '4 色', '形 = いまの いし（6・3・7）', 'opt_a lime・seed 131'),
        ('shikkui', '4 色', '平らな 箱', 'opt_a plaster・seed 141'),
        ('kodo_waku 横／上下', '8 色／5 色', '平らな 箱（開発が 柱 2 本 ＋ はりに）', 'opt_a frame・seed 151'),
        ('tsurara', '5 色', '十字の 板（三角形 8）', 'opt_a icicle_plate'),
        ('coal_ore', '5 色', '形 = いまの いし（遠く）', 'opt_b coal_layout の 1 つめ'),
        ('iron_ore', '6 色', '同上', 'opt_b iron_layout の 3 つめ'),
        ('kin_ore', '5 色', '同上', 'opt_b gold_layout の 1 つめ'),
        ('suisho_ore', '5 色', '同上', 'opt_b cry_layout の 2 つめ'),
        ('hotaruishi', '6 色', '同上（地は こい 青灰・seed 161）', 'opt_b hot_layout の 2 つめ'),
        ('diamond_ore', '8 色', '同上', 'opt_b dia_layout の 3 つめ'),
        ('chest_hint', '6 色', '絵だけ（ヒントの 1 まい）', 'chest2.py PAL[1]・形は v2'),
    ]
    xs = [PAD + 40, PAD + 330, PAD + 520, PAD + 980]
    yy = y + 64
    for i, c in enumerate(cols):
        text(dr, (xs[i], yy), c, 17, SUB)
    yy += 30
    for r in rows:
        for i, c in enumerate(r):
            text(dr, (xs[i], yy), c, 17)
        yy += 28
    cv.crop((0, 0, WD, y + 450 + 28)).save(os.path.join(OUT, 'tiles-sheet.png'))


# ------------------------------------------------------------------ くらべ（確かめ ④）
def compare():
    cv, dr = new_canvas(0, 'MINE-1B 新しい 絵と いまの 絵の くらべ（確かめ ④「いまと ならべる」）',
                        ['mix.png §4 と 同じ ならび: つち → すな → ねんど → せっかいせき → しっくい → 坑道の わく → き。灰色の ふだ = いまの ゲームの 絵、緑の ふだ = あたらしい 絵。',
                         '平らな 絵だけ くらべて いる（形・影は ゲームの 面の 明るさと ごつごつで 出る）。浮いて いないか（色・ドットの 大きさ・明るさ）を 見る。'])
    y = 128
    card(dr, y, 420, '§1 ブロック A を いまの つち・すな・き と ならべる（mix.png §4 の ならび）', 'CRITERIA 10')
    x = PAD + 30
    items = [('つち', CUR['dirt'], None, 'now'), ('すな', CUR['sand'], None, 'now'), ('ねんど', NEW['nendo'], None, 'new'), ('せっかいせき', NEW['sekkaiseki'], None, 'new'),
             ('しっくい', NEW['shikkui'], None, 'new'), ('わく 横', NEW['waku_side'], None, 'new'), ('わく 上・下', NEW['waku_top'], None, 'new'), ('き 横', CUR['log_side'], None, 'now'), ('き 上', CUR['log_top'], None, 'now')]
    x2, yb = strip(cv, dr, x, y + 60, items, 10, 16, lab_size=15)
    # いしの かべの 中に おいた ところ（いし・ブロック・いし・ブロック … と ならべる。mix.png §4 の かべと 同じ 考え）
    seq = [CUR['dirt'], CUR['sand'], NEW['nendo'], NEW['sekkaiseki'], NEW['shikkui'], NEW['waku_side'], CUR['log_side']]
    yy = yb + 34
    text(dr, (x, yy - 24), 'いしの かべの 中に おいた ところ（つち・すな・ねんど・せっかいせき・しっくい・わく・き）', 15, SUB)
    xx = x
    for t in seq:
        for tt in (STONE, t):
            cv.paste(scaled(tt, 6).convert('RGB'), (xx, yy))
            xx += 96
    cv.paste(scaled(STONE, 6).convert('RGB'), (xx, yy))
    y += 420 + 22
    # §2 鉱石
    card(dr, y, 330, '§2 鉱石の 遠く用を いまの 石・せきたん・てつ と ならべる', 'CRITERIA 10')
    items = [('いし', STONE, None, 'now'), ('いまの せきたん', CUR['coal_ore'], None, 'now'), ('いまの てつ', CUR['iron_ore'], None, 'now'), ('せきたん', NEW['coal'], None, 'new'), ('てつ', NEW['iron'], None, 'new'),
             ('きん', NEW['gold'], None, 'new'), ('すいしょう', NEW['crystal'], None, 'new'), ('ほたるいし', NEW['hotaru'], None, 'new'), ('ダイヤ', NEW['diamond'], None, 'new')]
    x2, yb = strip(cv, dr, PAD + 30, y + 60, items, 10, 16, lab_size=15)
    y += 330 + 22
    # §3 まぜた かべ（平ら）
    wl = wall(5, 22, 6)
    wim = Image.fromarray(wl.astype(np.uint8), 'RGBA').resize((wl.shape[1] * 4, wl.shape[0] * 4), Image.NEAREST).convert('RGB')
    card(dr, y, 60 + wim.size[1] + 50, '§3 まぜた かべ（平らな 絵だけ。いしの 中に 鉱石・ねんど・せっかいせき・しっくい・わく）', '見え方')
    cv.paste(wim, (PAD + 30, y + 60))
    note(dr, PAD + 30, y + 60 + wim.size[1] + 8, 'ねんど（左から 6・7 列め）・せっかいせき（12・13）・しっくい（17）・わく（20）。鉱石は 色と かたちで 見つかる（きん ≠ てつ・ダイヤ ≠ すいしょう）。', 1650, 15)
    y += 60 + wim.size[1] + 50 + 22
    # §4 ヒント
    wl3 = wall(5, 22, 3)
    wim3 = Image.fromarray(wl3.astype(np.uint8), 'RGBA').resize((wl3.shape[1] * 4, wl3.shape[0] * 4), Image.NEAREST).convert('RGB')
    card(dr, y, 60 + 150 + 56, '§4 ヒントの 絵を いまの「ひらく」と ならべる（照準の 下。ゲームの 2 倍）', 'CRITERIA 10')
    cv.paste(wim3.crop((0, 0, wim3.size[0], 150)), (PAD + 30, y + 60))
    px = PAD + 70
    for (ic, wd) in ((REF['tansu'], 'ひらく'), (REF['furnace'], 'ひらく'), (NEW['chest'], 'あける')):
        w, h = hint_pill(cv, px, y + 90, ic, wd, 2)
        px += w + 60
    note(dr, PAD + 30, y + 60 + 150 + 6, 'たんす・かまどは 1 マスの 四角（16×16 いっぱい）、たからばこは ひくく ひろい かまぼこ。てつの おびと かけがねで 宝箱と 分かる。', 1650, 15)
    y += 60 + 150 + 56
    cv.crop((0, 0, WD, y + 28)).save(os.path.join(OUT, 'tiles-compare.png'))


# ------------------------------------------------------------------ 確かめ ① シルエット
def check_silhouette():
    H = 0
    cv, dr = new_canvas(H, '確かめ ① まっ黒の シルエット（CRITERIA #1: かたちで 分かるか）',
                        ['鉱石は「つぶの 形」（地と ちがう 点を まっ黒）。つらら・宝箱は すける 背景の 形。ブロックは 四角の まま なので「しま・おびの 形」。',
                         '合格の 目安: 黒い 影だけで 何か 言える。にた 物どうしで 形が ちがう（きん = 四角の 粒 ／ てつ = まるい こぶ ／ すいしょう = 大きな はしら ／ ダイヤ = 星の ひし形 ／ ほたるいし = 丸い むれ）。'])
    y = 128
    card(dr, y, 392, '§1 鉱石 6 つ（色の 絵 ↔ つぶの シルエット）', '○')
    items = []
    x = PAD + 30
    ores = [('せきたん', 'coal'), ('てつ', 'iron'), ('きん', 'gold'), ('すいしょう', 'crystal'), ('ほたるいし', 'hotaru'), ('ダイヤ', 'diamond')]
    for lab, k in ores:
        t = NEW[k]
        cv.paste(scaled(t, 8).convert('RGB'), (x, y + 60))
        cv.paste(Image.fromarray(mask_of(t, ground_of(k)), 'RGBA').resize((128, 128), Image.NEAREST).convert('RGB'), (x, y + 60 + 136))
        put_label(dr, x + 64, y + 60 + 136 + 136, lab, 16)
        x += 128 + 40
    # いまの
    for lab, k in (('いまの せきたん', 'coal_ore'), ('いまの てつ', 'iron_ore')):
        t = CUR[k]
        cv.paste(scaled(t, 8).convert('RGB'), (x, y + 60))
        cv.paste(Image.fromarray(mask_of(t, STONE), 'RGBA').resize((128, 128), Image.NEAREST).convert('RGB'), (x, y + 60 + 136))
        put_label(dr, x + 64, y + 60 + 136 + 136, lab, 15, (255, 255, 255), GRAYTAG)
        x += 128 + 40
    y += 392 + 22
    card(dr, y, 500, '§2 つらら・宝箱（すける 背景の かたち）。宝箱は たんす・かまどの 四角と くらべる', '○')
    x = PAD + 30
    pairs = [('つらら', NEW['tsurara']), ('たからばこ', NEW['chest']), ('たんす', REF['tansu']), ('かまど', REF['furnace'])]
    for lab, t in pairs:
        cv.paste(scaled(t, 12, CAVE if lab == 'つらら' else PILL).convert('RGB'), (x, y + 60))
        sm = mask_of(t, None if lab in ('つらら', 'たからばこ') else None)
        if lab in ('たんす', 'かまど'):
            sm = np.full(t.shape, 20, np.uint8)
            sm[..., 3] = 255
            sm[..., :3] = (20, 20, 24)
        cv.paste(Image.fromarray(sm, 'RGBA').resize((192, 192), Image.NEAREST).convert('RGB'), (x + 220 * 0, y + 60 + 200))
        put_label(dr, x + 96, y + 60 + 200 + 196, lab, 16, (255, 255, 255), GRAYTAG if lab in ('たんす', 'かまど') else GREEN)
        x += 192 + 60
    note(dr, x + 20, y + 80, '宝箱 = ひくく ひろい（はば 16 × 高さ 10）・上の かどが まるい。たんす・かまど = 16×16 いっぱいの 四角。つらら = 上から 3 本 たれる（先は まるく 白い）。', 520, 16)
    y += 500 + 22
    card(dr, y, 340, '§3 ブロックの しま・おびの 形（地と ちがう 点。形は 四角の まま）', '△')
    x = PAD + 30
    blocks = [('ねんど', NEW['nendo']), ('せっかいせき', NEW['sekkaiseki']), ('しっくい', NEW['shikkui']), ('わく 横', NEW['waku_side']), ('わく 上・下', NEW['waku_top'])]
    for lab, t in blocks:
        a = np.asarray(t)
        flat = a[..., :3].reshape(-1, 3)
        vals, cnt = np.unique(flat, axis=0, return_counts=True)
        mode = vals[cnt.argmax()]
        cv.paste(scaled(t, 8).convert('RGB'), (x, y + 60))
        m = np.full(a.shape, 255, np.uint8)
        diff = (a[..., :3] != mode).any(axis=-1)
        m[diff, :3] = (20, 20, 24)
        cv.paste(Image.fromarray(m, 'RGBA').resize((128, 128), Image.NEAREST).convert('RGB'), (x, y + 60 + 136))
        put_label(dr, x + 64, y + 60 + 136 + 136, lab, 16)
        x += 128 + 40
    note(dr, x + 10, y + 80, 'ブロックは 平らな 四角（人が 作った 物は 平らな 箱。TEX-A）。見分けは 色と 明るさ（白黒 ②）と、わくの 鉄の おび・びょう・年輪の 形。わくの おびは まっすぐ よこ いっぱい。', 480, 16)
    cv.crop((0, 0, WD, y + 340 + 28)).save(os.path.join(OUT, 'tiles-check-1-silhouette.png'))


# ------------------------------------------------------------------ 確かめ ② 白黒
def check_gray():
    H = 0
    cv, dr = new_canvas(H, '確かめ ② 白黒（CRITERIA #2・#13: 明るさの 差で 分かるか。色覚 2 型でも）',
                        ['上の 段 = 色、下の 段 = 白黒（明るさだけ）。数は 絵ぜんたいの 明るさの 平均（0〜255）。',
                         '見る 所: きん ≠ てつ ／ ダイヤ ≠ きん・すいしょう・ほたるいし ／ しっくい ≠ ゆき ≠ いし ／ せっかいせき ≠ すな ／ すいしょう ≠ みず。'])
    y = 128
    card(dr, y, 492, '§1 鉱石（いしの 地の 上）', '○')
    x = PAD + 30
    items = [('いし', STONE), ('せきたん', NEW['coal']), ('てつ', NEW['iron']), ('きん', NEW['gold']), ('すいしょう', NEW['crystal']), ('ほたるいし', NEW['hotaru']), ('ダイヤ', NEW['diamond'])]
    for lab, t in items:
        cv.paste(scaled(t, 10).convert('RGB'), (x, y + 60))
        g = gray_of(t)
        cv.paste(scaled(g, 10).convert('RGB'), (x, y + 60 + 170))
        put_label(dr, x + 80, y + 60 + 340, f'{lab}  {luma_mean(t):.0f}', 16)
        x += 160 + 30
    note(dr, PAD + 30, y + 60 + 340 + 34, 'つぶの 明るさ: せきたんは 地より 暗い（黒い 板）、てつは さびの 中くらい、きんは 地より 明るい 黄、すいしょうは 白に 近い 水色、ダイヤは 白、ほたるいしは 地が 暗く つぶが 明るい。'
         'きんと てつは 形（四角の 粒 ／ まるい こぶ）と 明るさ（きん の 方が 明るい）で 分かれる。', 1650, 15)
    y += 492 + 22
    card(dr, y, 400, '§2 ブロック（しっくい・ゆき・いし・せっかいせき・すなの 白さくらべ ほか）', '○')
    x = PAD + 30
    items = [('つち', CUR['dirt']), ('すな', CUR['sand']), ('ねんど', NEW['nendo']), ('せっかいせき', NEW['sekkaiseki']), ('しっくい', NEW['shikkui']), ('ゆき', REF['snow']), ('いし', STONE), ('わく 横', NEW['waku_side']), ('わく 上', NEW['waku_top']), ('き 横', CUR['log_side'])]
    for lab, t in items:
        cv.paste(scaled(t, 8).convert('RGB'), (x, y + 60))
        g = gray_of(t)
        cv.paste(scaled(g, 8).convert('RGB'), (x, y + 60 + 138))
        put_label(dr, x + 64, y + 60 + 276, f'{lab}  {luma_mean(t):.0f}', 14)
        x += 128 + 22
    note(dr, PAD + 30, y + 60 + 276 + 30, 'しっくい（あたたかい 白）・ゆき（青い 白）・いし（灰色）・せっかいせき（灰みの 白）は 明るさの 平均が 十分 ちがう。ねんどは つちより 明るい 赤茶。', 1650, 15)
    y += 400 + 22
    card(dr, y, 490, '§3 まぜた かべ（色 ↔ 白黒）', '○')
    wl = wall(5, 22, 3)
    wim = Image.fromarray(wl.astype(np.uint8), 'RGBA').resize((wl.shape[1] * 4, wl.shape[0] * 4), Image.NEAREST)
    cv.paste(wim.convert('RGB'), (PAD + 30, y + 60))
    cv.paste(Image.fromarray(gray_of(wl), 'RGBA').resize((wl.shape[1] * 4, wl.shape[0] * 4), Image.NEAREST).convert('RGB'), (PAD + 30, y + 60 + 208))
    cv.crop((0, 0, WD, y + 490 + 28)).save(os.path.join(OUT, 'tiles-check-2-gray.png'))


# ------------------------------------------------------------------ 確かめ ③ ぼかし
def blur_img(im, r):
    return im.filter(ImageFilter.GaussianBlur(r))


def check_blur():
    H = 0
    cv, dr = new_canvas(H, '確かめ ③ ぼかし（CRITERIA #3: 見てほしい 物が 最初に 目に 入るか）',
                        ['まぜた かべを 目を 細めて 見た ように ぼかす（上 = そのまま、中 = 弱く、下 = 強く）。最初に 目に 入る 物が 鉱石（つぶ）で、ねんど・せっかいせき・しっくいは 背景に なじむか を 見る。'])
    y = 112
    wl = wall(5, 22, 6)
    base = Image.fromarray(wl.astype(np.uint8), 'RGBA').resize((wl.shape[1] * 4, wl.shape[0] * 4), Image.NEAREST).convert('RGB')
    card(dr, y, 3 * 420 + 40, '§1 まぜた かべ（そのまま ／ ぼかし 弱 ／ ぼかし 強）', '○')
    yy = y + 56
    for r, lab in ((0, 'そのまま'), (5, 'ぼかし 弱（半径 5）'), (12, 'ぼかし 強（半径 12）')):
        im = base if r == 0 else blur_img(base, r)
        cv.paste(im, (PAD + 30, yy))
        put_label(dr, PAD + 30 + 12 + dr.textlength(lab, font=font(16)) / 2 + 8, yy + 10, lab, 16, (255, 255, 255), GRAYTAG)
        yy += base.size[1] + 24
    y += 3 * 420 + 40 + 22
    card(dr, y, 240, '§2 鉱石 6 つを 1 まいずつ ぼかす（半径 8。ぼかしても 色と 明るさで 分かるか）', '○')
    x = PAD + 30
    for lab, k in (('せきたん', 'coal'), ('てつ', 'iron'), ('きん', 'gold'), ('すいしょう', 'crystal'), ('ほたるいし', 'hotaru'), ('ダイヤ', 'diamond')):
        t = NEW[k]
        im = scaled(t, 8).convert('RGB')
        cv.paste(blur_img(im, 8), (x, y + 60))
        put_label(dr, x + 64, y + 60 + 136, lab, 16)
        x += 128 + 40
    cv.crop((0, 0, WD, y + 240 + 28)).save(os.path.join(OUT, 'tiles-check-3-blur.png'))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sheet()
    compare()
    check_silhouette()
    check_gray()
    check_blur()
    print('書いた:', OUT)
    for f in sorted(os.listdir(OUT)):
        if f.startswith('tiles-'):
            print('  ', f)
