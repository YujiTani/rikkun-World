"""ICON-32 v3 の 道具: 素材の 色の 段（5 段・色相を ずらす）と 法線で かげを つける 形。
光は 左上 手前。形ごとに 法線 → 明るさ → 5 段。うしろの 部品の さかいは こい 段（sel-out）。
外の ふち: 上・左は その 部品の いちばん こい 色、下・右だけ こい ふち色。"""
import math
from PIL import Image

N = 32
OUT = (0x2A, 0x1A, 0x24, 255)

def hx(s): s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
def R(*c): return [hx(x) for x in c]

# 色の 段（こい → 明るい）。暗い ほど 青むらさき、明るい ほど 黄みに 寄せて 手で えらんだ
WOOD = R('4a2a2a', '7a4630', 'a8683f', 'cf9455', 'f0c27f')
IRON = R('2f3346', '545c74', '8590a6', 'bcc6d4', 'eef2f4')
STEEL = R('34405a', '5f7290', '98acc4', 'd2e0ec', 'fbfdff')
GOLD = R('5a2e1e', '9a5a1e', 'd9932a', 'f5c74a', 'fff0a8')
LACQ = R('3e1a26', '7a2632', 'b8403a', 'e2704f', 'f7a77a')   # 赤い うるし・革
NAVY = R('1f1d3a', '33356a', '4b56a0', '7084c8', 'a8bfe8')
FRUIT = R('4a1428', '8f1f30', 'd93a3a', 'f2684a', 'ffb08a')
LEAF = R('1e3a2e', '2f6a3a', '4fa045', '8cd05a', 'd2f07a')
WATER = R('1c2a5a', '2a5aa0', '3d93d8', '70c8f0', 'c8f4ff')
ROPE = R('4a3020', '7a5634', 'b08850', 'dcb878', 'f6e2a8')
GEM = R('243068', '3a62b0', '5cb4e8', 'a0e6f8', 'f4ffff')
MEAT = R('4a2018', '8a3e1e', 'c8702e', 'e8a04a', 'fad48a')
BONE = R('5e4c58', '9a8c90', 'd2c8c0', 'f2eadc', 'fffaf0')
CREAM = (0xFF, 0xF8, 0xE6, 255)

L = (-0.55, -0.65, 0.52)
_l = math.sqrt(sum(v * v for v in L)); L = tuple(v / _l for v in L)
TH = (0.22, 0.42, 0.64, 0.86)

def tone_of(n, bias=0.0):
    d = max(0.0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) * 0.85 + 0.22 + bias
    return sum(d > t for t in TH)

class Canvas:
    def __init__(self):
        self.c = {}      # (x,y) -> [ramp, tone, part]
        self.parts = 0
        self.fix = {}    # 手で おく 点（さいごに 上書き）

    def shape(self, ramp, f, bias=0.0, spec=0.0, flat=None, sub=3):
        """f(x,y) -> 法線 or None（マスの 中の 3x3 点で しらべ、半分 以上で 入れる）"""
        p = self.parts; self.parts += 1; got = {}
        for y in range(N):
            for x in range(N):
                hits = []
                for sy in range(sub):
                    for sx in range(sub):
                        n = f(x + (sx + .5) / sub, y + (sy + .5) / sub)
                        if n is not None: hits.append(n)
                if len(hits) * 2 >= sub * sub:
                    n = [sum(h[i] for h in hits) / len(hits) for i in range(3)]
                    m = math.sqrt(sum(v * v for v in n)) or 1; n = [v / m for v in n]
                    t = flat if flat is not None else tone_of(n, bias)
                    if spec and n[0] * L[0] + n[1] * L[1] + n[2] * L[2] > 1 - spec: t = 5
                    got[(x, y)] = [ramp, t, p]
        self.c.update(got); return set(got)

    def put(self, pts, tone, ramp=None):
        for p in pts:
            if p in self.c:
                if ramp: self.c[p][0] = ramp
                self.c[p][1] = tone

    def render(self):
        img = Image.new('RGBA', (N, N))
        px = {}
        for (x, y), (r, t, p) in self.c.items():
            col = CREAM if t >= 5 else r[max(0, t)]
            # うしろの 部品の さかい: 前の 部品と となりなら こい 段
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = self.c.get((x + dx, y + dy))
                if q and q[2] > p and q[0] is not r:
                    col = r[0] if t <= 2 else r[1]; break
            px[(x, y)] = col
        for (x, y) in [(x, y) for y in range(N) for x in range(N) if (x, y) not in self.c]:
            nb = [(dx, dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if (x + dx, y + dy) in self.c]
            if not nb: continue
            # 下・右の ふち（中身が 上か 左に ある）→ こい ふち色
            if any(d in ((-1, 0), (0, -1)) for d in nb): px[(x, y)] = OUT
            else:
                r = self.c[(x + nb[0][0], y + nb[0][1])][0]; px[(x, y)] = r[0]
        px.update(self.fix)
        for (x, y), c in px.items():
            if 0 <= x < N and 0 <= y < N: img.putpixel((x, y), c)
        return img

# ---------- 形（法線を かえす） ----------
def sphere(cx, cy, rx, ry=None, rz=1.0):
    ry = ry or rx
    def f(x, y):
        u, v = (x - cx) / rx, (y - cy) / ry; d = u * u + v * v
        return (u, v, math.sqrt(1 - d) * rz) if d <= 1 else None
    return f

def tube(pts, r0, r1=None):
    """折れ線に そった 円柱（太さ r0→r1）"""
    r1 = r0 if r1 is None else r1
    segs = list(zip(pts, pts[1:])); total = sum(math.dist(a, b) for a, b in segs)
    def f(x, y):
        best = None; acc = 0
        for (ax, ay), (bx, by) in segs:
            dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
            t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
            px, py = ax + t * dx, ay + t * dy; d = math.dist((x, y), (px, py))
            r = r0 + (r1 - r0) * (acc + t * math.sqrt(L2)) / total
            if d <= r and (best is None or d / r < best[0]): best = (d / r, (x - px) / r, (y - py) / r)
            acc += math.sqrt(L2)
        if not best: return None
        _, u, v = best; return (u, v, math.sqrt(max(0, 1 - u * u - v * v)))
    return f

def poly_f(pts, n=(0, 0, 1)):
    def f(x, y):
        c = False; j = len(pts) - 1
        for i in range(len(pts)):
            (xi, yi), (xj, yj) = pts[i], pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: c = not c
            j = i
        return n if c else None
    return f

def arc_pts(cx, cy, r, a0, a1, k=16, ry=None):
    ry = ry or r
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / k)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / k))) for i in range(k + 1)]

def line_px(x0, y0, x1, y1):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    return {(round(x0 + (x1 - x0) * i / max(1, n - 1)), round(y0 + (y1 - y0) * i / max(1, n - 1))) for i in range(n)}
