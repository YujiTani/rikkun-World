"""WEAPON-9: 手に持つ 絵（虹・雷神剣・風神剣）。
art/char-sheets/girl/katana_*.png（6 まい。256 のコマ・たて 24 段 = 3 段 x 8 向き）の 刀の 刃の 点
（色見本 20・21 番の 色）を 消して、コマごとに 刃の 向きを はかり、その 武器の 形で 描きなおす。
ふくろ（手・体）は そのまま。つば・柄は 体の うしろに 回る ところは 描かない（とうめいな 所だけ）。
使い方: python3 art/WEAPON-9/held/build.py   → art/WEAPON-9/held/<武器>/katana_*.png と palette_extra.json
"""
import os, json, math
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = os.path.join(ROOT, "art", "char-sheets", "girl")
MOTIONS = ["katana_thrust", "katana_kesa", "katana_kiriage", "katana_walk_chudan", "katana_walk_jodan", "katana_walk_gedan"]
CELL = 256
pal = json.load(open(os.path.join(SRC, "palette.json")))["colors"]
C20 = tuple(round(x * 255) for x in pal[20])
C21 = tuple(round(x * 255) for x in pal[21])


def hx(s):
    return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))


# ---- 武器ごとの 色 ----
NIJI = dict(steel=C20, edge=C21, dark=hx("#8A92B0"), green=hx("#4FD68F"), blue=hx("#4AA3F0"), purple=hx("#C060E0"),
            magenta=hx("#B83A9A"), gold=hx("#F2C230"), goldd=hx("#B8862B"), goldl=hx("#E0A83C"), red=hx("#C8323C"))
RAIJIN = dict(d=hx("#33268A"), D=hx("#6A3FC8"), M=hx("#A57CFF"), L=hx("#F1E4FF"), Y=hx("#FFF0A8"), G=hx("#F2C230"),
              g=hx("#B8860B"), N=hx("#24336E"), n=hx("#3F56A8"))
FUJIN = dict(W=C21, L=hx("#E6F8FF"), C=hx("#A6E4F7"), c=hx("#62BDE6"), B=hx("#3A86B8"), G=hx("#F2C230"), g=hx("#B8860B"),
             T=hx("#2F8F9C"), t=hx("#1D5A6E"), X=hx("#2B2B3A"), x=hx("#8A8AA8"))


def lerp(a, b, k):
    return a + (b - a) * k


def put(out, sel, col):
    out[sel] = col


# 各 関数: (u, v, L) の 配列 → (刃の 点の 配列 mask, 色 (N,3))。v は 中心線から の ずれ
def niji(u, v, L, s):
    A = 0.075 * L
    c = A * np.sin(np.pi * np.clip(u / L, 0, 1))
    r = u / L
    h = np.where(r < 0.86, 2.4 - 0.5 * r, lerp(2.4 - 0.43, 0.5, (r - 0.86) / 0.14)) * s
    vv = v - c
    blade = (u >= 0) & (u <= L) & (np.abs(vv) <= h)
    t = vv / np.maximum(h, 0.5)
    col = np.zeros(u.shape + (3,), np.uint8)
    band = ((L - u) / 5.5).astype(int) % 4  # 刃先から 白 → 緑 → 青 → むらさき → 赤むらさき
    cyc = np.array([NIJI["green"], NIJI["blue"], NIJI["purple"], NIJI["magenta"]], np.uint8)
    wave = 0.22 * np.sin(u * 0.45)
    mid = (t + wave > -0.5) & (t + wave <= 0.5)
    col[:] = NIJI["steel"]
    col[t < -0.78] = NIJI["dark"]
    col[mid] = cyc[band][mid]
    col[t > 0.5] = NIJI["edge"]
    col[(u > L - 3.5)] = NIJI["edge"]
    return blade, col


def niji_hilt(u, v, L, s, free):
    out = np.zeros(u.shape + (3,), np.uint8)
    m = np.zeros(u.shape, bool)
    # つば: 金の ひし形 ぎみの 板（木瓜）
    tw = 5.0 * s
    ts = (u >= -1.5) & (u < 1.5 * s + 0.5) & (np.abs(v) <= tw)
    out[ts] = NIJI["gold"]
    out[ts & (np.abs(v) <= 1.6 * s)] = NIJI["goldd"]
    m |= ts
    G = max(6, 0.2 * L)
    gr = (u < -1.5) & (u >= -G) & (np.abs(v) <= 1.7 * s) & free
    k = (np.floor(-u / 3.2).astype(int) + (v > 0).astype(int)) % 2
    out[gr] = np.where(k[gr, None] == 0, NIJI["goldl"], NIJI["goldd"])
    dia = gr & ((np.floor(-u / 3.2).astype(int) % 3) == 1) & (np.abs(v) <= 0.9 * s)
    out[dia] = NIJI["red"]
    pm = (u < -G) & (u >= -G - 2.2) & (np.abs(v) <= 2.2 * s) & free
    out[pm] = NIJI["gold"]
    return m | gr | pm, out


def raijin(u, v, L, s):
    A = 0.10 * L
    c = A * np.sin(np.pi * np.clip(u / L, 0, 1))
    r = np.clip(u / L, 0, 1)
    h = np.where(r < 0.8, 2.3 + 1.0 * np.sin(np.pi * r / 1.6 + 0.0), lerp(3.1 - 0.0, 0.5, (r - 0.8) / 0.2)) * s
    vv = v - c
    blade = (u >= 0) & (u <= L) & (np.abs(vv) <= h)
    t = vv / np.maximum(h, 0.5)
    col = np.zeros(u.shape + (3,), np.uint8)
    col[:] = RAIJIN["D"]
    col[t < -0.3] = RAIJIN["d"]
    col[t > 0.15] = RAIJIN["M"]
    col[t > 0.62] = RAIJIN["L"]
    tri = np.abs(((u / 3.5) % 2) - 1) - 0.5
    bolt = (np.abs(t - 0.45 * tri) < 0.2) & ((np.floor(u / 11).astype(int) % 3) == 1) & (t > -0.55) & (r > 0.12)
    col[bolt] = RAIJIN["Y"]
    return blade, col


def raijin_hilt(u, v, L, s, free):
    out = np.zeros(u.shape + (3,), np.uint8)
    ts = (u >= -1.5) & (u < 1.5 * s + 0.5) & (np.abs(v) <= 3.6 * s)
    out[ts] = RAIJIN["G"]
    out[ts & (np.abs(v) <= 1.2 * s)] = RAIJIN["g"]
    G = max(6, 0.17 * L)
    gr = (u < -1.5) & (u >= -G) & (np.abs(v) <= 1.6 * s) & free
    k = np.floor(-u / 3).astype(int) % 2
    out[gr] = np.where(k[gr, None] == 0, RAIJIN["N"], RAIJIN["n"])
    pm = (u < -G) & (u >= -G - 3) & (np.abs(v) <= 2.2 * s) & free
    out[pm] = RAIJIN["G"]
    return ts | gr | pm, out


def fujin(u, v, L, s):
    r = np.clip(u / L, 0, 1)
    h = np.where(r < 0.85, 1.9, lerp(1.9, 0.5, (r - 0.85) / 0.15)) * s
    blade = (u >= 0) & (u <= L) & (np.abs(v) <= h)
    t = v / np.maximum(h, 0.5)
    col = np.zeros(u.shape + (3,), np.uint8)
    col[:] = FUJIN["C"]
    col[t < -0.25] = FUJIN["c"]
    col[t < -0.8] = FUJIN["B"]
    col[t > 0.35] = FUJIN["L"]
    col[(t > 0.35) & (np.floor(u / 9).astype(int) % 4 == 0)] = FUJIN["W"]
    col[u > L - 3] = FUJIN["W"]
    return blade, col


def fujin_hilt(u, v, L, s, free):
    out = np.zeros(u.shape + (3,), np.uint8)
    # つば: よこに ながい 十字（はねの 形）
    ts = (u >= -1.5) & (u < 2 * s + 0.5) & (np.abs(v) <= 6.5 * s - np.clip(np.abs(v) - 3, 0, 9) * 0.0)
    out[ts] = FUJIN["x"]
    out[ts & (np.abs(v) <= 2 * s)] = FUJIN["X"]
    wing = (u >= 2 * s) & (u < 4 * s) & (np.abs(v) >= 3.5 * s) & (np.abs(v) <= 5.5 * s)
    out[wing] = FUJIN["x"]
    G = max(6, 0.17 * L)
    gr = (u < -1.5) & (u >= -G) & (np.abs(v) <= 1.6 * s) & free
    k = np.floor(-u / 3).astype(int) % 3
    out[gr] = np.array([FUJIN["T"], FUJIN["t"], FUJIN["X"]], np.uint8)[k[gr]]
    pm = (u < -G) & (u >= -G - 3) & (np.abs(v) <= 2.0 * s) & free
    out[pm] = FUJIN["G"]
    return ts | wing | gr | pm, out


WEAPONS = {"niji": (niji, niji_hilt), "raijin": (raijin, raijin_hilt), "fujin": (fujin, fujin_hilt)}
YY, XX = np.mgrid[0:CELL, 0:CELL].astype(np.float32)


def dilate(m):
    o = m.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            o |= np.roll(np.roll(m, dy, 0), dx, 1)
    return o


def do_cell(c, shape):
    """c: (256,256,4) → 新しい コマ"""
    rgb = c[..., :3]
    opaque = c[..., 3] > 0
    m = opaque & ((rgb == C20).all(-1) | (rgb == C21).all(-1))
    n = int(m.sum())
    if n < 4:
        return c
    out = c.copy()
    out[m] = 0
    ys, xs = np.nonzero(m)
    P = np.stack([xs, ys], 1).astype(np.float32)
    mean = P.mean(0)
    w, vec = np.linalg.eigh((P - mean).T @ (P - mean))
    a = vec[:, 1]
    pr = (P - mean) @ a
    body = opaque & ~m
    if body.any():
        by, bx = np.nonzero(body)
        bc = np.array([bx.mean(), by.mean()], np.float32)
    else:
        bc = mean
    e0 = mean + a * pr.min()
    e1 = mean + a * pr.max()
    base, tip = (e0, e1) if np.linalg.norm(e0 - bc) <= np.linalg.norm(e1 - bc) else (e1, e0)
    d = tip - base
    L = float(np.linalg.norm(d))
    if L < 1:
        return c
    a = d / L
    nrm = np.array([-a[1], a[0]], np.float32)
    if nrm @ np.array([-1, -1], np.float32) < 0:
        nrm = -nrm
    blade_f, hilt_f = WEAPONS[shape]
    if L < 14:  # 刃が 点みたいに みじかい（正面向き）→ 同じ 場所を その 武器の 主の 色で
        mainc = {"niji": NIJI["blue"], "raijin": RAIJIN["D"], "fujin": FUJIN["C"]}[shape]
        out[m, :3] = mainc
        out[m, 3] = 255
        return out
    s = float(np.clip(L / 45.0, 0.62, 1.15))
    dx = XX - base[0]
    dy = YY - base[1]
    u = dx * a[0] + dy * a[1]
    v = dx * nrm[0] + dy * nrm[1]
    allowed = (~opaque) | m | dilate(m) & m  # とうめい か 元の 刃の 点
    allowed = (~opaque) | m | (dilate(m) & ~body)
    bm, bcol = blade_f(u, v, L, s)
    hm, hcol = hilt_f(u, v, L, s, ~opaque)
    sel = bm & allowed
    out[sel, :3] = bcol[sel]
    out[sel, 3] = 255
    sel2 = hm & ~bm & (allowed)
    out[sel2, :3] = hcol[sel2]
    out[sel2, 3] = 255
    return out


def main(only=None):
    for shape in WEAPONS:
        if only and shape not in only:
            continue
        od = os.path.join(HERE, shape)
        os.makedirs(od, exist_ok=True)
        for mo in MOTIONS:
            im = np.array(Image.open(os.path.join(SRC, mo + ".png")))
            H, W = im.shape[:2]
            res = im.copy()
            for r in range(H // CELL):
                for f in range(W // CELL):
                    res[r * CELL:(r + 1) * CELL, f * CELL:(f + 1) * CELL] = do_cell(im[r * CELL:(r + 1) * CELL, f * CELL:(f + 1) * CELL], shape)
            Image.fromarray(res).save(os.path.join(od, mo + ".png"), optimize=True)
            print(shape, mo, "ok")
    extra = {"niji": [k for k in NIJI if k not in ("steel", "edge")], "raijin": list(RAIJIN), "fujin": [k for k in FUJIN if k != "W"]}
    cols = {"niji": NIJI, "raijin": RAIJIN, "fujin": FUJIN}
    json.dump({s: {k: "#%02X%02X%02X" % cols[s][k] for k in extra[s]} for s in extra},
              open(os.path.join(HERE, "palette_extra.json"), "w"), indent=1)


if __name__ == "__main__":
    import sys
    main(sys.argv[1:] or None)
