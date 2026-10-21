"""WEAPON-8 v2: ふつうの 攻撃の 真空波を「小さな 風の 刃」に 作り直す 3 案。

どの 案も カメラに 正面の 板 1 まい（ビルボード）。絵は 画面の 上で 進む 向き（8 向きに まるめる）に 合わせて
**向きごとに 点で 描いた 絵** を えらぶ（0°・45°・90° を 描いて、のこりは 反転。板を 回して 点を ななめに しない）。
1 点 = 1/16 ブロック。色は らせんと 同じ 5 色（W1 W2 B1 B2 B3）。

K1 みかづきの 刃 / K2 さざなみ 3 まい / K3 つむじ 手裏剣
"""
import math

import numpy as np
from PIL import Image

import scene as SC

PAL = {"W1": "#F4FCFF", "W2": "#CDEFFC", "B1": "#8FD6F2", "B2": "#4FA8D8", "B3": "#2B6699"}
RGB = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in PAL.items()}


def _grid(n, theta):
    j, i = np.mgrid[0:n, 0:n]
    X = i + 0.5 - n / 2
    Y = n / 2 - (j + 0.5)
    c, s = math.cos(theta), math.sin(theta)
    lx = X * c + Y * s
    ly = -X * s + Y * c
    return lx, ly


def _img(lab, n, outline_of=None, outline="B3"):
    """lab: 0 = なし / 文字 = 色。outline_of: ふちを 付ける 形の マスク"""
    out = np.zeros((n, n, 4), np.uint8)
    for k, rgb in RGB.items():
        m = lab == k
        out[m, :3] = rgb
        out[m, 3] = 255
    if outline_of is not None:
        o = np.zeros_like(outline_of)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            o |= np.roll(np.roll(outline_of, dy, 0), dx, 1)
        o &= (out[..., 3] == 0)
        out[o, :3] = RGB[outline]
        out[o, 3] = 255
    return Image.fromarray(out, "RGBA")


def k1(theta, frame=0, n=22):
    lx, ly = _grid(n, theta)
    do = np.hypot(lx + 1.5, ly)
    di = np.hypot(lx + 5.0, ly)
    body = (do < 6.0) & (di > 6.2)
    lab = np.zeros((n, n), object)
    lab[:] = 0
    lab[body] = "W2"
    lab[body & ((6.0 - do) < 1.3)] = "W1"
    lab[body & (np.abs(ly) > 4.2)] = "B1"
    lines = (np.abs(np.abs(ly) - 2.6) < 0.5) & (lx > -9.5) & (lx < -5.0) & (((np.floor(lx) + frame) % 3) != 0)
    lines &= ~body
    out = _img(lab, n, body)
    arr = np.array(out)
    arr[lines & (arr[..., 3] == 0), :3] = RGB["B1"]
    arr[lines & (arr[..., 3] == 0), 3] = 255
    return Image.fromarray(arr, "RGBA")


def k2(theta, frame=0, n=24):
    lx, ly = _grid(n, theta)
    lab = np.zeros((n, n), object)
    lab[:] = 0
    shift = 0.6 * frame
    arcs = [(-3.0, 7.0, 0.95, "W1"), (-6.6 - shift, 6.4, 0.75, "W2"), (-10.0 - shift, 5.8, 0.6, "B1")]
    outl = np.zeros((n, n), bool)
    for idx, (cx, R, t, col) in enumerate(arcs):
        d = np.hypot(lx - cx, ly)
        ang = np.degrees(np.abs(np.arctan2(ly, lx - cx)))
        m = (np.abs(d - R) < t) & (ang < 58 - idx * 6)
        if idx == 2:
            m &= ((np.floor(lx) + np.floor(ly)) % 2) == 0
        lab[m & (lab == 0)] = col
        if idx == 0:
            outl |= m
    return _img(lab, n, outl)


def k3(theta, frame=0, n=20):
    lx, ly = _grid(n, theta)
    r = np.hypot(lx, ly)
    a = np.degrees(np.arctan2(ly, lx))
    phi0 = -frame * 30.0  # 時計回りに 回る
    beta = (a - phi0 - 16.0 * r) % 120.0
    blade = (r > 1.0) & (r < 6.2) & (beta < (62 - 8 * (r - 1.0)))
    core = r < 1.6
    lab = np.zeros((n, n), object)
    lab[:] = 0
    lab[blade] = "W2"
    lab[blade & (r < 3.2)] = "W1"
    lab[blade & (beta < 10)] = "B1"
    lab[core] = "W1"
    shape = blade | core
    out = np.array(_img(lab, n, shape))
    # うしろの すじ 2 本（進む 向きの 反対）
    lines = (np.abs(np.abs(ly) - 1.8) < 0.5) & (lx > -9.6) & (lx < -6.6) & (((np.floor(lx) + frame) % 3) != 0)
    m = lines & (out[..., 3] == 0)
    out[m, :3] = RGB["B1"]
    out[m, 3] = 255
    return Image.fromarray(out, "RGBA")


KINDS = {"K1": k1, "K2": k2, "K3": k3}
FRAMES = {"K1": 2, "K2": 2, "K3": 4}


def snap8(theta):
    return round(theta / (math.pi / 4)) * (math.pi / 4)


def screen_dir(cam, pos, d):
    s0, _ = cam.proj(pos)
    s1, _ = cam.proj(pos + d * 0.5)
    v = s1 - s0
    return math.atan2(-v[1], v[0])


VIS_SHIFT = 0.4


def facing(cam, pos, d):
    """絵の 向き: カメラから はなれる（うしろ から 見る）ときは アーチ（上向き 90°）、近づく ときは 下向き、
    それ 以外は 画面の 上の 進む 向きを 8 向きに まるめる。"""
    k = float(np.dot(d, cam.fwd))
    if k > 0.7:
        return math.pi / 2
    if k < -0.7:
        return -math.pi / 2
    return snap8(screen_dir(cam, pos, d))


def render(shot, kind, traveled=None, frame=0, scale=1.0):
    cam = SC.Cam(shot)
    w = cam.waves[0] if cam.waves else None
    if w:
        pos = np.array([w["position"]["x"], w["position"]["y"], w["position"]["z"]])
        d = np.array([w["dir"]["x"], w["dir"]["y"], w["dir"]["z"]])
        if traveled is not None:
            pos = pos + d * (traveled - w["traveled"])
    else:
        d = np.array([0, 0, -1.0])
        pos = cam.player + np.array([0, 1.4, 0]) + d * (traveled or 1.5)
    th = facing(cam, pos, d)
    # 見た目だけ 剣の 手の 側（右）へ 0.4 ずらす（頭で かくれない。当たりの 半径 0.5 の 中）
    side = np.array([-d[2], 0.0, d[0]])
    pos = pos + side * VIS_SHIFT
    spr = KINDS[kind](th, frame)
    lay = SC.Layer(cam)
    lay.sprite(pos, spr, dot_blocks=scale / 16)
    global LAST
    LAST = lay
    img = SC.composite(SC.bg(shot), lay, cam, SC.char_depth(cam), SC.char_mask(SC.bg(shot), cam))
    s, _ = cam.proj(pos)
    return img, s, math.degrees(th)
