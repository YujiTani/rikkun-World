"""伝説の 剣（雷神・風神・虹）: 手で きめた 英雄っぽい 形。
画面の 対角を いっぱいに つかう 大きな 刀身、明るい 刃と こい 芯の 強い 差、光る みぞ、大きな つば、属性の 光（オーラ）。
乱数なし（同じ 入力 → 同じ 画素）。"""
import math
from PIL import Image
from lib import N, OUT, CREAM, R, GOLD, SUMI, STEEL, CHALK, LACQ

S2 = math.sqrt(2)
O = (6.0, 26.0)  # つばの 中心

def _st(x, y):
    dx, dy = x - O[0], y - O[1]
    return (dx - dy) / S2, (dx + dy) / S2   # s: 切っ先 方向, t: 刃（右下）方向

class Hero:
    def __init__(self):
        self.px = {}; self.glow = {}
    def set(self, p, col):
        if 0 <= p[0] < N and 0 <= p[1] < N: self.px[p] = col
    def render(self):
        img = Image.new('RGBA', (N, N))
        for y in range(N):  # 地面の かげ
            for x in range(N):
                d = ((x + .5 - 17) / 14) ** 2 + ((y + .5 - 27) / 3) ** 2
                if d <= 1: img.putpixel((x, y), (24, 14, 34, 110 if d < .5 else 60))
        for p, c in self.glow.items():
            if p not in self.px: img.putpixel(p, c)
        solid = set(self.px)
        for y in range(N):
            for x in range(N):
                if (x, y) in solid: continue
                if any((x + dx, y + dy) in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    img.putpixel((x, y), OUT)
        for p, c in self.px.items(): img.putpixel(p, c)
        return img

def sword(core, edge, glow, W=2.2, curve=0.0, fuller=None, guard=GOLD, gem=None, wrap=SUMI, motif=None):
    h = Hero()
    L0, L1 = 2.6, 31.0           # 刀身の はじまり / 切っ先
    def bend(s): return curve * ((s - L0) / (L1 - L0)) ** 2 * 4.0
    def half(s):  # 刃の はば（切っ先で とがる）
        if s > L1 - 5: return max(0.0, W * (L1 - s) / 5)
        return W - 0.3 * (s - L0) / (L1 - L0)
    # オーラ（半とうめいの 光）
    for y in range(N):
        for x in range(N):
            s, t = _st(x + .5, y + .5); t += bend(s)
            if L0 < s < L1 + 1.5:
                d = abs(t) - half(s)
                if 0.4 < d < 2.4: h.glow[(x, y)] = glow[3][:3] + (120 if d < 1.4 else 60,)
    # 刀身
    for y in range(N):
        for x in range(N):
            s, t = _st(x + .5, y + .5); t += bend(s); w = half(s)
            if not (L0 <= s <= L1) or abs(t) > w: continue
            if t > w - 0.7: col = CREAM if s > 6 else edge[4]               # 刃の 白い 線
            elif t > w - 1.4: col = edge[3]                                # 明るい 刃
            elif t < -w + 0.8: col = core[3]                               # みね（光の 側）
            elif fuller and abs(t + 0.2) < 0.55 and 5 < s < L1 - 6: col = fuller[(int(s) % 2) + 3]  # 光る みぞ
            else: col = core[1] if t > -0.6 else core[2]                    # こい 芯
            h.set((x, y), col)
    # 切っ先の きらめき（十字）
    tx, ty = O[0] + (L1 - 4) / S2, O[1] - (L1 - 4) / S2
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)): h.glow[(round(tx + dx), round(ty + dy))] = CREAM
    h.glow[(round(tx + 2), round(ty))] = CREAM[:3] + (150,); h.glow[(round(tx), round(ty - 2))] = CREAM[:3] + (150,)
    if motif: motif(h, bend, half)
    # つば（大きく 横に はる 金の 十字。はしは 丸く ふくらむ）
    for y in range(N):
        for x in range(N):
            s, t = _st(x + .5, y + .5)
            bar = -0.4 <= s <= 2.0 and abs(t) <= 5.0
            knob = (s - 0.8) ** 2 + (abs(t) - 5.2) ** 2 <= 2.4
            if bar or knob:
                k = guard[4] if (s > 1.2 and t < -1) else guard[3] if s > 0.6 else guard[2] if t < 1.5 else guard[1]
                h.set((x, y), k)
    if gem:
        for x in range(N):
            for y in range(N):
                s, t = _st(x + .5, y + .5)
                if (s - 0.8) ** 2 + t ** 2 <= 2.2: h.set((x, y), gem[1] if t > 0.6 else gem[4] if (t < -0.3 and s > 0.8) else gem[2])
    # つか（ひし形の まき）
    for y in range(N):
        for x in range(N):
            s, t = _st(x + .5, y + .5)
            if -6.0 <= s < -0.6 and abs(t) <= 1.5:
                h.set((x, y), CHALK[2] if (round(s * 1.4) + (t > 0)) % 2 == 0 else wrap[1] if t > 0 else wrap[2])
            elif -8.0 <= s < -6.0 and abs(t) <= 1.9:
                h.set((x, y), guard[3] if t < 0 else guard[1])   # かしら
    return h

def _zig(h, pts, col, hi):
    from lib import line_px
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for q in line_px(x0 + 1, y0, x1 + 1, y1): h.set(q, THUNDER[2])
        for q in line_px(x0, y0, x1, y1): h.set(q, col)
    for q in pts[1:-1]: h.set((round(q[0]), round(q[1])), hi)

THUNDER = R('3a2a10', '8a6a10', 'e8c020', 'fff060', 'fffff0')
GALE = R('143010', '2e6a18', '8ad040', 'd8f890', 'fbffe8')   # 草の 背景でも 見えるよう 明るめ
RAIN = [R('3a1038', '7a1c6a', 'd040a8', 'f080d0', 'ffd0f0'), R('3a1a10', '8a3a10', 'f07a20', 'ffb050', 'ffe8c0'),
        R('3a3010', '8a7010', 'f0d030', 'fff070', 'fffff0'), R('103a20', '1e7a3a', '40c860', '90f090', 'e0ffe0'),
        R('102a5a', '1a5aa0', '38a0f0', '80d8ff', 'e0f8ff'), R('2a1848', '4a2a80', '8a58e0', 'b890ff', 'e8d8ff')]
INK = R('121018', '1e1a2a', '2e2a40', '6a6888', 'c8c8e0')

def raijin_ken():
    """雷神剣: 黒い 刀身＋銀の 刃、金に 光る みぞ、黄色い いなずまが 2 本 刀身を はしる、太鼓の 輪の かわりに 巴の 玉"""
    def motif(h, bend, half):
        _zig(h, [(9, 14), (12, 13), (10, 10), (14, 9), (12, 5), (16, 3)], THUNDER[3], CREAM)
        _zig(h, [(17, 22), (20, 19), (19, 17), (23, 16), (22, 13), (27, 11)], THUNDER[3], CREAM)
    return sword(INK, STEEL, THUNDER, fuller=THUNDER, gem=R('3a1010', '8a1a1a', 'e03030', 'ff7060', 'ffd0c0'), motif=motif)

def fujin_ken():
    """風神剣: 雷神剣の 兄弟。銀の 刀身、みどりに 光る みぞ、刀身に まきつく 風の リボン 2 本"""
    def motif(h, bend, half):  # 刀身を つつむ 2 本の 風の 帯（はしが 細く なる 三日月。外が 白、内が みどり）
        for (cx, cy, r, a0, a1, tk, front) in ((16, 15, 10.5, 160, 330, 2.6, False), (18, 13, 10.0, -20, 150, 2.6, True), (21, 10, 5.5, 200, 330, 1.6, False)):
            for y in range(N):
                for x in range(N):
                    dx, dy = x + .5 - cx, y + .5 - cy; d = math.hypot(dx, dy)
                    ang = math.degrees(math.atan2(dy, dx)) % 360; rel = (ang - a0) % 360
                    if rel > (a1 - a0): continue
                    th = tk * math.sin(math.pi * rel / (a1 - a0))
                    if r - th <= d <= r and th > 0.5:
                        if front or (x, y) not in h.px:
                            h.set((x, y), GALE[4] if d > r - 0.9 else GALE[3] if d > r - th + 0.8 else GALE[2])
    return sword(STEEL, CHALK, GALE, fuller=GALE, guard=GOLD, gem=GALE, wrap=INK, motif=motif)

def niji():
    """虹（天浮橋）: 大きく そった 刀身、みねから 刃へ 虹の 帯（玉虫色）、白い 刃、黒い つばに 金、ピンクの 光"""
    h = sword(INK, CHALK, RAIN[0], W=1.9, curve=1.6, guard=INK, gem=RAIN[0], wrap=INK)
    for (x, y), col in list(h.px.items()):  # 刀身の 芯を 虹の 帯に（対角の すじで 色を かえる）
        s, t = _st(x + .5, y + .5)
        if 2.6 < s < 31 and col in (INK[1], INK[2], INK[3]):
            k = int((s * 0.55 + t * 0.9 + 6) // 1.6) % 6
            h.px[(x, y)] = RAIN[k][3 if col == INK[3] else 2]
    for p, c in list(h.px.items()):  # つばの ふちに 金
        s, t = _st(p[0] + .5, p[1] + .5)
        if -0.6 <= s <= 2.6 and abs(t) > 4.2 and c in INK: h.px[p] = GOLD[3]
    return h

IDS = {'raijin_ken': raijin_ken, 'fujin_ken': fujin_ken, 'niji': niji}
