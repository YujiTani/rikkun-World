from lib import *

def grass(old):
    top, side = old['tile:grass_top'], old['tile:grass_side']
    c = Canvas(); cx, cy, w, h, H = 16, 3.0, 13.0, 6.5, 14.0
    def T(x, y):
        X, Y = x - cx, y - cy; u, v = (X / w + Y / h) / 2, (Y / h - X / w) / 2
        return (0, -1, 1) if 0 <= u < 1 and 0 <= v < 1 else None
    def Lf(x, y):
        if not (cx - w <= x < cx): return None
        y0 = cy + h + (x - cx + w) * h / w; return (-1, 0, .6) if 0 <= y - y0 < H else None
    def Rf(x, y):
        if not (cx <= x < cx + w): return None
        y0 = cy + 2 * h - (x - cx) * h / w; return (1, 0, .6) if 0 <= y - y0 < H else None
    ramp = R('1e3a2e', '2f6a3a', '4fa045', '8cd05a', 'd2f07a')
    st = c.shape(ramp, T, flat=2); sl = c.shape(ramp, Lf, flat=2); sr = c.shape(ramp, Rf, flat=2)
    for (x, y) in st:
        X, Y = x + .5 - cx, y + .5 - cy; u, v = (X / w + Y / h) / 2, (Y / h - X / w) / 2
        c.fix[(x, y)] = tuple(top[min(15, int(v * 16)) * 16 + min(15, int(u * 16))])
    for S, k, x0, sg in ((sl, .86, cx - w, 1), (sr, .68, cx, -1)):
        for (x, y) in S:
            uu = (x + .5 - x0) / w; y0 = cy + h + (x + .5 - x0) * h / w if sg > 0 else cy + 2 * h - (x + .5 - cx) * h / w
            col = side[min(15, int((y + .5 - y0) / H * 16)) * 16 + min(15, int(uu * 16))]
            c.fix[(x, y)] = tuple(int(col[q] * k) for q in range(3)) + (255,)
    edge = {(x, y) for (x, y) in st if (x, y + 1) not in st}
    for p in edge: c.fix[p] = ramp[3]
    return c

